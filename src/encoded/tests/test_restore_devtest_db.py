"""Tests for the restore-devtest-db command.

Every external boundary is mocked: AWS (STS/RDS/KMS/Secrets Manager/ECS) is an
in-memory fake injected through the command's client-factory seam, prompts are
scripted, sleeps are no-ops, and manifests live in pytest tmp dirs. No test here
contacts AWS or any deployed environment, and one test actively booby-traps boto3
to prove it.
"""

import json
import sys
import types
from collections import deque

import pytest

from ..commands import restore_devtest_db as rdd
from ..commands.restore_devtest_db import (
    CREDENTIAL_CONFIRMATION_PHRASE,
    DEVTEST,
    PRODUCTION,
    Manifest,
    Prompter,
    RestoreConfig,
    RestoreOrchestrator,
    SafetyViolation,
    build_client_factory,
    main,
)

pytestmark = [pytest.mark.unit, pytest.mark.working]


PROD_ACCOUNT = "111111111111"
DEVTEST_ACCOUNT = "222222222222"
REGION = "us-east-1"
SOURCE_DB = "rds-smaht-production"
PROTECTED_DB = "rds-smaht-devtest"
NEW_DB = "rds-smaht-devtest-restored-1"
OLD_DB = "rds-smaht-devtest-restored-0"
PROD_KMS_KEY = f"arn:aws:kms:{REGION}:{PROD_ACCOUNT}:key/1234"
RESTORE_ROLE = f"arn:aws:iam::{DEVTEST_ACCOUNT}:role/devtest-restore"
CLUSTER = "smaht-devtest-cluster"
SENTINEL_PASSWORD = "Sentinel-ProdPassword-9x7!"  # must never appear in output/manifest
DEVTEST_OLD_PASSWORD = "Sentinel-DevtestPassword-3q2!"


# ---------------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------------

class AwsStubError(Exception):
    """Mimics botocore ClientError shape (only .response is consulted)."""

    def __init__(self, code):
        super().__init__(code)
        self.response = {"Error": {"Code": code}}


class FakeAWS:
    """Shared in-memory AWS state. Fake clients record every call they receive.

    The fakes enforce real cross-account ordering: a devtest snapshot copy fails
    unless the snapshot was shared AND a KMS grant exists for the restore role.
    No fake implements delete_db_instance, so any delete attempt is an
    AttributeError test failure.
    """

    def __init__(self, polls_until_available=1):
        self.calls = []  # (scope, service, method, kwargs)
        self.fail_next = {}  # (scope, service, method) -> exception to raise once
        self.polls_until_available = polls_until_available
        self.identities = {
            PRODUCTION: {"Account": PROD_ACCOUNT,
                         "Arn": f"arn:aws:sts::{PROD_ACCOUNT}:assumed-role/prod-admin/op"},
            DEVTEST: {"Account": DEVTEST_ACCOUNT,
                      "Arn": f"arn:aws:sts::{DEVTEST_ACCOUNT}:assumed-role/devtest-admin/op"},
        }
        self.regions = {PRODUCTION: REGION, DEVTEST: REGION}
        self.snapshots = {PRODUCTION: {}, DEVTEST: {}}
        self.instances = {
            PRODUCTION: {SOURCE_DB: self._instance("available")},
            DEVTEST: {PROTECTED_DB: self._instance("available")},
        }
        self.grants = []
        self.secrets = {
            PRODUCTION: {
                "SmahtProductionIdentity": {
                    "RDS_USERNAME": "postgres",
                    "RDS_PASSWORD": SENTINEL_PASSWORD,
                    "RDS_DB_NAME": "smaht",
                },
            },
            DEVTEST: {
                "SmahtDevtestIdentity": {
                    "RDS_HOSTNAME": "old-devtest-host.example.internal",
                    "RDS_PORT": "5432",
                    "RDS_USERNAME": "postgres",
                    "RDS_PASSWORD": DEVTEST_OLD_PASSWORD,
                    "RDS_DB_NAME": "smaht",
                    "ENCODED_VERSION": "1.2.3",
                },
            },
        }
        self.services = {CLUSTER: [
            f"arn:aws:ecs:{REGION}:{DEVTEST_ACCOUNT}:service/{CLUSTER}/portal",
            f"arn:aws:ecs:{REGION}:{DEVTEST_ACCOUNT}:service/{CLUSTER}/Indexer",
            f"arn:aws:ecs:{REGION}:{DEVTEST_ACCOUNT}:service/{CLUSTER}/ingester",
        ]}

    def _instance(self, status, polls_left=0):
        return {"DBInstanceStatus": status, "polls_left": polls_left,
                "Endpoint": {"Address": "new-db.example.internal", "Port": 5432}}

    def add_grant(self, operations=None):
        self.grants.append({
            "GrantId": f"grant-{len(self.grants) + 1}",
            "GranteePrincipal": RESTORE_ROLE,
            "Operations": operations or list(rdd.KMS_GRANT_OPERATIONS),
        })

    def factory(self, service, scope):
        classes = {"sts": FakeSTS, "rds": FakeRDS, "kms": FakeKMS,
                   "secretsmanager": FakeSecrets, "ecs": FakeECS}
        return classes[service](self, scope, service)

    def factory_builder(self, config):
        return self.factory

    def calls_named(self, method):
        return [c for c in self.calls if c[2] == method]


class FakeMeta:
    def __init__(self, region):
        self.region_name = region


class FakeService:
    def __init__(self, aws, scope, service):
        self.aws = aws
        self.scope = scope
        self.service = service
        self.meta = FakeMeta(aws.regions[scope])

    def _record(self, method, **kwargs):
        self.aws.calls.append((self.scope, self.service, method, kwargs))
        key = (self.scope, self.service, method)
        if key in self.aws.fail_next:
            raise self.aws.fail_next.pop(key)


class FakeSTS(FakeService):
    def get_caller_identity(self):
        self._record("get_caller_identity")
        return dict(self.aws.identities[self.scope])


class FakeRDS(FakeService):
    def _snapshots(self):
        return self.aws.snapshots[self.scope]

    def describe_db_snapshots(self, DBSnapshotIdentifier):
        self._record("describe_db_snapshots", DBSnapshotIdentifier=DBSnapshotIdentifier)
        snapshot = self._snapshots().get(DBSnapshotIdentifier)
        if snapshot is None:
            raise AwsStubError("DBSnapshotNotFound")
        if snapshot["polls_left"] > 0:
            snapshot["polls_left"] -= 1
        else:
            snapshot["Status"] = "available"
        return {"DBSnapshots": [{"Status": snapshot["Status"]}]}

    def create_db_snapshot(self, DBSnapshotIdentifier, DBInstanceIdentifier):
        self._record("create_db_snapshot", DBSnapshotIdentifier=DBSnapshotIdentifier,
                     DBInstanceIdentifier=DBInstanceIdentifier)
        if DBSnapshotIdentifier in self._snapshots():
            raise AwsStubError("DBSnapshotAlreadyExists")
        assert DBInstanceIdentifier in self.aws.instances[self.scope]
        self._snapshots()[DBSnapshotIdentifier] = {
            "Status": "creating", "polls_left": self.aws.polls_until_available,
            "shared": set(),
        }

    def copy_db_snapshot(self, SourceDBSnapshotIdentifier, TargetDBSnapshotIdentifier,
                         KmsKeyId):
        self._record("copy_db_snapshot", SourceDBSnapshotIdentifier=SourceDBSnapshotIdentifier,
                     TargetDBSnapshotIdentifier=TargetDBSnapshotIdentifier, KmsKeyId=KmsKeyId)
        if TargetDBSnapshotIdentifier in self._snapshots():
            raise AwsStubError("DBSnapshotAlreadyExists")
        if ":snapshot:" in SourceDBSnapshotIdentifier:  # cross-account copy by ARN
            source_id = SourceDBSnapshotIdentifier.split(":snapshot:")[1]
            source = self.aws.snapshots[PRODUCTION].get(source_id)
            assert source is not None, f"source snapshot {source_id} does not exist"
            if DEVTEST_ACCOUNT not in source["shared"]:
                raise AwsStubError("DBSnapshotNotFound")  # unshared snapshots are invisible
            if not any(g["GranteePrincipal"] == RESTORE_ROLE for g in self.aws.grants):
                raise AwsStubError("KMSKeyNotAccessibleFault")
        else:
            assert SourceDBSnapshotIdentifier in self._snapshots()
        self._snapshots()[TargetDBSnapshotIdentifier] = {
            "Status": "creating", "polls_left": self.aws.polls_until_available,
            "shared": set(),
        }

    def describe_db_snapshot_attributes(self, DBSnapshotIdentifier):
        self._record("describe_db_snapshot_attributes",
                     DBSnapshotIdentifier=DBSnapshotIdentifier)
        snapshot = self._snapshots()[DBSnapshotIdentifier]
        return {"DBSnapshotAttributesResult": {"DBSnapshotAttributes": [
            {"AttributeName": "restore", "AttributeValues": sorted(snapshot["shared"])},
        ]}}

    def modify_db_snapshot_attribute(self, DBSnapshotIdentifier, AttributeName, ValuesToAdd):
        self._record("modify_db_snapshot_attribute", DBSnapshotIdentifier=DBSnapshotIdentifier,
                     AttributeName=AttributeName, ValuesToAdd=ValuesToAdd)
        assert AttributeName == "restore"
        self._snapshots()[DBSnapshotIdentifier]["shared"].update(ValuesToAdd)

    def describe_db_instances(self, DBInstanceIdentifier):
        self._record("describe_db_instances", DBInstanceIdentifier=DBInstanceIdentifier)
        instance = self.aws.instances[self.scope].get(DBInstanceIdentifier)
        if instance is None:
            raise AwsStubError("DBInstanceNotFound")
        if instance["polls_left"] > 0:
            instance["polls_left"] -= 1
        elif instance["DBInstanceStatus"] == "creating":
            instance["DBInstanceStatus"] = "available"
        return {"DBInstances": [dict(instance)]}

    def restore_db_instance_from_db_snapshot(self, **kwargs):
        self._record("restore_db_instance_from_db_snapshot", **kwargs)
        db_id = kwargs["DBInstanceIdentifier"]
        if db_id in self.aws.instances[self.scope]:
            raise AwsStubError("DBInstanceAlreadyExists")
        snapshot = self._snapshots().get(kwargs["DBSnapshotIdentifier"])
        assert snapshot is not None and snapshot["Status"] == "available"
        self.aws.instances[self.scope][db_id] = self.aws._instance(
            "creating", polls_left=self.aws.polls_until_available)

    def stop_db_instance(self, DBInstanceIdentifier):
        self._record("stop_db_instance", DBInstanceIdentifier=DBInstanceIdentifier)
        self.aws.instances[self.scope][DBInstanceIdentifier]["DBInstanceStatus"] = "stopped"

    # NOTE: deliberately no delete_db_instance / delete_db_snapshot: the command
    # must never call them, and an attempt would fail loudly with AttributeError.


class FakeKMS(FakeService):
    def list_grants(self, KeyId):
        self._record("list_grants", KeyId=KeyId)
        return {"Grants": [dict(g) for g in self.aws.grants]}

    def create_grant(self, KeyId, GranteePrincipal, Operations, Name):
        self._record("create_grant", KeyId=KeyId, GranteePrincipal=GranteePrincipal,
                     Operations=Operations, Name=Name)
        self.aws.add_grant(operations=list(Operations))
        return {"GrantId": self.aws.grants[-1]["GrantId"]}


class FakeSecrets(FakeService):
    def get_secret_value(self, SecretId):
        self._record("get_secret_value", SecretId=SecretId)
        return {"SecretString": json.dumps(self.aws.secrets[self.scope][SecretId])}

    def put_secret_value(self, SecretId, SecretString):
        # Never record the SecretString payload: the calls list is assertable output.
        self._record("put_secret_value", SecretId=SecretId)
        self.aws.secrets[self.scope][SecretId] = json.loads(SecretString)


class FakeECS(FakeService):
    def list_services(self, cluster):
        self._record("list_services", cluster=cluster)
        return {"serviceArns": list(self.aws.services.get(cluster, []))}

    def update_service(self, **kwargs):
        self._record("update_service", **kwargs)


class ScriptedPrompter(Prompter):
    """Real Prompter logic fed by a scripted input queue."""

    def __init__(self, answers, emit):
        self.answers = deque(answers)
        self.prompts = []
        super().__init__(input_fn=self._next, emit=emit)

    def _next(self, prompt):
        self.prompts.append(prompt)
        if not self.answers:
            raise AssertionError(f"Unexpected extra prompt: {prompt}")
        return self.answers.popleft()


# ---------------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------------

# Confirmation order on a first-use run (no old DB): create snapshot, copy-to-CMK,
# KMS grant, share (typed account id), credentials (typed phrase), reindex.
HAPPY_ANSWERS_FIRST_USE = ["y", "y", "y", DEVTEST_ACCOUNT,
                           CREDENTIAL_CONFIRMATION_PHRASE, "y"]
# Subsequent use: the grant already exists, so no grant prompt.
HAPPY_ANSWERS_SUBSEQUENT = ["y", "y", DEVTEST_ACCOUNT,
                            CREDENTIAL_CONFIRMATION_PHRASE, "y"]


def base_argv(tmp_path, command="run", operation_id="op-1", **overrides):
    options = {
        "--state-dir": str(tmp_path / "state"),
        "--production-account-id": PROD_ACCOUNT,
        "--devtest-account-id": DEVTEST_ACCOUNT,
        "--region": REGION,
        "--production-profile": "smaht-prod",
        "--devtest-profile": "smaht-devtest",
        "--production-kms-key-id": PROD_KMS_KEY,
        "--devtest-restore-role-arn": RESTORE_ROLE,
        "--production-identity-secret": "SmahtProductionIdentity",
        "--devtest-identity-secret": "SmahtDevtestIdentity",
        "--devtest-ecs-cluster": CLUSTER,
        "--new-db-identifier": NEW_DB,
        "--poll-interval": "1",
        "--poll-timeout": "10",
    }
    flags = []
    for key, value in overrides.items():
        option = "--" + key.replace("_", "-")
        if value is True:
            flags.append(option)
        elif value is None:
            options.pop(option, None)
        else:
            options[option] = str(value)
    argv = [command]
    if command in ("run",):
        argv += ["--operation-id", operation_id]
    for key, value in options.items():
        argv += [key, value]
    return argv + flags


class Runner:
    """Drives main() with all boundaries injected; collects output."""

    def __init__(self, tmp_path, aws=None):
        self.tmp_path = tmp_path
        self.aws = aws or FakeAWS()
        self.output = []
        self.sleeps = []
        self.sleep_hook = None

    def emit(self, message):
        self.output.append(str(message))

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        if self.sleep_hook:
            self.sleep_hook()

    def main(self, argv, answers=()):
        prompter = ScriptedPrompter(list(answers), emit=self.emit)
        code = main(argv, client_factory_builder=self.aws.factory_builder,
                    prompter=prompter, emit=self.emit, sleep_fn=self.sleep)
        return code, prompter

    def text(self):
        return "\n".join(self.output)

    def manifest(self, operation_id="op-1"):
        return Manifest.load(self.tmp_path / "state", operation_id)

    def manifest_text(self, operation_id="op-1"):
        return (self.tmp_path / "state" / f"{operation_id}.json").read_text()


def make_config(**overrides):
    defaults = dict(
        production_account_id=PROD_ACCOUNT,
        devtest_account_id=DEVTEST_ACCOUNT,
        region=REGION,
        production_profile="smaht-prod",
        devtest_profile="smaht-devtest",
        production_kms_key_id=PROD_KMS_KEY,
        devtest_restore_role_arn=RESTORE_ROLE,
        production_identity_secret="SmahtProductionIdentity",
        devtest_identity_secret="SmahtDevtestIdentity",
        devtest_ecs_cluster=CLUSTER,
        new_db_identifier=NEW_DB,
        poll_interval=1,
        poll_timeout=10,
    )
    defaults.update(overrides)
    return RestoreConfig(**defaults)


# ---------------------------------------------------------------------------------
# Plan / dry-run mode
# ---------------------------------------------------------------------------------

def explosive_factory_builder(config):
    raise AssertionError("plan mode must not construct AWS clients")


def test_plan_mode_makes_no_aws_calls(tmp_path):
    output = []
    code = main(base_argv(tmp_path, command="plan"),
                client_factory_builder=explosive_factory_builder,
                prompter=Prompter(input_fn=lambda _: "n"), emit=output.append)
    assert code == 0
    text = "\n".join(output)
    assert "no AWS calls were made" in text
    for step in rdd.STEP_NAMES:
        assert step in text
    assert "never deletes a database" in text
    assert "--allow-kms-grant" in text and "NOT supplied" in text


def test_run_dry_run_is_plan(tmp_path):
    output = []
    code = main(base_argv(tmp_path) + ["--dry-run"],
                client_factory_builder=explosive_factory_builder,
                prompter=Prompter(input_fn=lambda _: "n"), emit=output.append)
    assert code == 0
    assert not (tmp_path / "state").exists()  # plan creates no manifest


# ---------------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------------

def test_happy_path_first_use(tmp_path):
    runner = Runner(tmp_path)
    code, prompter = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                                 answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 0, runner.text()
    manifest = runner.manifest()
    assert manifest.data["status"] == "completed"
    for step in rdd.STEP_NAMES:
        assert manifest.step_status(step) in ("completed", "skipped")

    # Production snapshot created once from the right database.
    (create,) = runner.aws.calls_named("create_db_snapshot")
    assert create[0] == PRODUCTION
    assert create[3]["DBInstanceIdentifier"] == SOURCE_DB

    # Two copies: prod re-encryption with the CMK, devtest copy under devtest key.
    copies = runner.aws.calls_named("copy_db_snapshot")
    assert [c[0] for c in copies] == [PRODUCTION, DEVTEST]
    assert copies[0][3]["KmsKeyId"] == PROD_KMS_KEY
    assert copies[1][3]["KmsKeyId"] == rdd.DEFAULT_DEVTEST_KMS_KEY

    # First use: exactly one grant created for the restore role.
    (grant,) = runner.aws.calls_named("create_grant")
    assert grant[3]["GranteePrincipal"] == RESTORE_ROLE

    # Shared with the devtest account only.
    (share,) = runner.aws.calls_named("modify_db_snapshot_attribute")
    assert share[3]["ValuesToAdd"] == [DEVTEST_ACCOUNT]

    # Restore lands in devtest at the documented starting size, not public.
    (restore,) = runner.aws.calls_named("restore_db_instance_from_db_snapshot")
    assert restore[0] == DEVTEST
    assert restore[3]["DBInstanceClass"] == "db.t4g.medium"
    assert restore[3]["PubliclyAccessible"] is False

    # Identity secret now points at the new endpoint with production credentials.
    devtest_identity = runner.aws.secrets[DEVTEST]["SmahtDevtestIdentity"]
    assert devtest_identity["RDS_HOSTNAME"] == "new-db.example.internal"
    assert devtest_identity["RDS_PASSWORD"] == SENTINEL_PASSWORD
    assert devtest_identity["ENCODED_VERSION"] == "1.2.3"  # unrelated keys preserved

    # Indexer scaled to the default 16; every service redeployed.
    updates = runner.aws.calls_named("update_service")
    indexer_updates = [u for u in updates if "desiredCount" in u[3]]
    assert len(indexer_updates) == 1
    assert indexer_updates[0][3]["desiredCount"] == 16
    assert len(updates) == len(runner.aws.services[CLUSTER])

    # Nothing stopped (no old DB named), nothing ever deleted, protected untouched.
    assert runner.aws.calls_named("stop_db_instance") == []
    assert not any("delete" in call[2].lower() for call in runner.aws.calls)
    assert runner.aws.instances[DEVTEST][PROTECTED_DB]["DBInstanceStatus"] == "available"
    assert manifest.step_status("stop_old_database") == "skipped"

    # STS identity verified before every step.
    assert len(runner.aws.calls_named("get_caller_identity")) == len(rdd.STEP_NAMES)


def test_happy_path_subsequent_use_reuses_existing_grant(tmp_path):
    aws = FakeAWS()
    aws.add_grant()  # grant already in place from a previous operation
    runner = Runner(tmp_path, aws)
    # No --allow-kms-grant: reusing an existing grant needs no opt-in.
    code, _ = runner.main(base_argv(tmp_path), answers=HAPPY_ANSWERS_SUBSEQUENT)
    assert code == 0, runner.text()
    assert runner.aws.calls_named("create_grant") == []
    assert runner.manifest().get_resource("kms_grant_created_by_this_tool") is False
    assert "subsequent use" in runner.text()


# ---------------------------------------------------------------------------------
# KMS first-use opt-in
# ---------------------------------------------------------------------------------

def test_kms_first_use_without_opt_in_fails_closed_then_resumes(tmp_path):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path), answers=["y", "y"])
    assert code == 2
    assert "--allow-kms-grant" in runner.text()
    assert runner.aws.calls_named("create_grant") == []
    manifest = runner.manifest()
    assert manifest.step_status("ensure_kms_grant") == "failed"
    assert manifest.step_status("wait_encrypted_copy") == "completed"

    # Resume with the opt-in flag: prior steps skip, grant is created, run finishes.
    code, _ = runner.main(
        ["resume", "--operation-id", "op-1", "--state-dir", str(tmp_path / "state"),
         "--allow-kms-grant"],
        answers=["y", DEVTEST_ACCOUNT, CREDENTIAL_CONFIRMATION_PHRASE, "y"])
    assert code == 0, runner.text()
    assert len(runner.aws.calls_named("create_db_snapshot")) == 1  # not re-created
    assert len(runner.aws.calls_named("create_grant")) == 1
    assert runner.manifest().data["status"] == "completed"


# ---------------------------------------------------------------------------------
# Confirmation boundaries: declining any of them halts without the mutation
# ---------------------------------------------------------------------------------

@pytest.mark.parametrize("answers,step,missing_call", [
    (["n"], "create_production_snapshot", "create_db_snapshot"),
    (["y", "n"], "copy_snapshot_to_cmk", "copy_db_snapshot"),
    (["y", "y", "n"], "ensure_kms_grant", "create_grant"),
    (["y", "y", "y", "999999999999"], "share_snapshot_with_devtest",
     "modify_db_snapshot_attribute"),
    (["y", "y", "y", DEVTEST_ACCOUNT, "wrong-phrase"], "update_identity_secret",
     "put_secret_value"),
    (["y", "y", "y", DEVTEST_ACCOUNT, CREDENTIAL_CONFIRMATION_PHRASE, "n"],
     "update_application_and_reindex", "update_service"),
])
def test_declining_a_confirmation_halts_without_mutating(tmp_path, answers, step, missing_call):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True), answers=answers)
    assert code == 3, runner.text()
    assert runner.aws.calls_named(missing_call) == []
    manifest = runner.manifest()
    assert manifest.step_status(step) == "declined"
    assert manifest.data["status"] == "paused"
    assert "resume --operation-id op-1" in runner.text()


def test_declining_stop_old_db_leaves_it_running(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.instances[DEVTEST][OLD_DB] = runner.aws._instance("available")
    code, _ = runner.main(
        base_argv(tmp_path, allow_kms_grant=True, allow_stop_old_db=True,
                  old_db_identifier=OLD_DB),
        answers=HAPPY_ANSWERS_FIRST_USE + ["not-the-identifier"])
    assert code == 3
    assert runner.aws.calls_named("stop_db_instance") == []
    assert runner.aws.instances[DEVTEST][OLD_DB]["DBInstanceStatus"] == "available"
    assert runner.manifest().step_status("stop_old_database") == "declined"


# ---------------------------------------------------------------------------------
# Account / region / role verification failures
# ---------------------------------------------------------------------------------

def test_production_account_mismatch_fails_before_any_rds_call(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.identities[PRODUCTION]["Account"] = "333333333333"
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 2
    assert "expected 111111111111" in runner.text()
    assert not [c for c in runner.aws.calls if c[1] == "rds"]
    assert runner.manifest().data["status"] == "failed"


def test_devtest_account_mismatch_fails_before_devtest_mutations(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.identities[DEVTEST]["Account"] = "444444444444"
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 2
    assert not [c for c in runner.aws.calls if c[0] == DEVTEST and c[1] != "sts"]
    # Production-side work is checkpointed and reusable after the operator fixes creds.
    assert runner.manifest().step_status("share_snapshot_with_devtest") == "completed"


def test_region_mismatch_fails_closed(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.regions[PRODUCTION] = "us-west-2"
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True), answers=[])
    assert code == 2
    assert "us-west-2" in runner.text()
    assert not [c for c in runner.aws.calls if c[1] == "rds"]


def test_role_mismatch_fails_closed(tmp_path):
    runner = Runner(tmp_path)
    code, _ = runner.main(
        base_argv(tmp_path, allow_kms_grant=True, production_role_name="expected-role"),
        answers=[])
    assert code == 2
    assert "expected role name" in runner.text()
    assert not [c for c in runner.aws.calls if c[1] == "rds"]


# ---------------------------------------------------------------------------------
# Polling
# ---------------------------------------------------------------------------------

def test_snapshot_polling_progresses_through_creating(tmp_path):
    runner = Runner(tmp_path, FakeAWS(polls_until_available=3))
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 0, runner.text()
    assert len(runner.sleeps) > 0  # sleeps happened only through the injected fake
    assert "creating" in runner.text()


def test_polling_timeout_is_bounded_and_resumable(tmp_path):
    aws = FakeAWS(polls_until_available=10_000)
    runner = Runner(tmp_path, aws)
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True, poll_timeout=3),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 1
    assert "Timed out" in runner.text() and "resume" in runner.text()
    manifest = runner.manifest()
    assert manifest.step_status("wait_production_snapshot") == "failed"
    assert manifest.data["status"] == "failed"
    # Bounded: ~poll_timeout/poll_interval sleeps, not unbounded.
    assert len(runner.sleeps) <= 4


# ---------------------------------------------------------------------------------
# Resume / idempotency / partial failure
# ---------------------------------------------------------------------------------

def test_partial_failure_then_resume_skips_completed_steps(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.fail_next[(PRODUCTION, "rds", "modify_db_snapshot_attribute")] = (
        AwsStubError("InternalFailure"))
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 1
    manifest = runner.manifest()
    assert manifest.step_status("share_snapshot_with_devtest") == "failed"
    assert "InternalFailure" in manifest.step("share_snapshot_with_devtest")["error"]
    assert "resume" in runner.text()

    code, _ = runner.main(
        ["resume", "--operation-id", "op-1", "--state-dir", str(tmp_path / "state")],
        answers=[DEVTEST_ACCOUNT, CREDENTIAL_CONFIRMATION_PHRASE, "y"])
    assert code == 0, runner.text()
    assert runner.manifest().data["status"] == "completed"
    # Idempotency: production snapshot and encrypted copy were made exactly once.
    assert len(runner.aws.calls_named("create_db_snapshot")) == 1
    prod_copies = [c for c in runner.aws.calls_named("copy_db_snapshot")
                   if c[0] == PRODUCTION]
    assert len(prod_copies) == 1


def test_create_snapshot_already_exists_is_adopted(tmp_path):
    runner = Runner(tmp_path)
    # Simulate a prior attempt that created the snapshot but died before checkpointing:
    # describe says not-found once (fail_next), create says already-exists.
    aws = runner.aws
    snapshot_id = f"{SOURCE_DB}-devtest-restore-op-1"
    aws.snapshots[PRODUCTION][snapshot_id] = {"Status": "available", "polls_left": 0,
                                              "shared": set()}
    aws.fail_next[(PRODUCTION, "rds", "describe_db_snapshots")] = (
        AwsStubError("DBSnapshotNotFound"))
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 0, runner.text()
    assert "adopting it" in runner.text()


def test_resume_with_tampered_manifest_config_refuses(tmp_path):
    runner = Runner(tmp_path)
    runner.main(base_argv(tmp_path), answers=["n"])  # creates manifest, declines step 2
    manifest = runner.manifest()
    manifest.data["config"]["source_db_identifier"] = "rds-some-other-db"
    manifest.save()
    code, _ = runner.main(
        ["resume", "--operation-id", "op-1", "--state-dir", str(tmp_path / "state")],
        answers=[])
    assert code == 2
    assert "fingerprint mismatch" in runner.text()


def test_resume_of_completed_operation_is_a_noop(tmp_path):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 0
    calls_before = len(runner.aws.calls)
    code, _ = runner.main(
        ["resume", "--operation-id", "op-1", "--state-dir", str(tmp_path / "state")],
        answers=[])
    assert code == 0
    assert "already completed" in runner.text()
    assert len(runner.aws.calls) == calls_before


# ---------------------------------------------------------------------------------
# Cancellation
# ---------------------------------------------------------------------------------

def test_cancel_takes_effect_at_next_poll_boundary(tmp_path):
    runner = Runner(tmp_path, FakeAWS(polls_until_available=50))
    state_dir = str(tmp_path / "state")

    def cancel_via_cli():
        # Another terminal issues cancel while the run is polling.
        assert main(["cancel", "--operation-id", "op-1", "--state-dir", state_dir],
                    emit=runner.emit) == 0
        runner.sleep_hook = None

    runner.sleep_hook = cancel_via_cli
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 4
    manifest = runner.manifest()
    assert manifest.data["status"] == "cancelled"
    # The interrupted wait step is left pending so resume re-runs it.
    assert manifest.step_status("wait_production_snapshot") == "pending"


def test_resume_after_cancel_requires_confirmation_and_completes(tmp_path):
    runner = Runner(tmp_path)
    runner.main(base_argv(tmp_path), answers=["n"])  # halt early with a manifest
    state_dir = str(tmp_path / "state")
    main(["cancel", "--operation-id", "op-1", "--state-dir", state_dir], emit=runner.emit)

    # Declining the clear-cancellation prompt leaves the request in place.
    code, _ = runner.main(["resume", "--operation-id", "op-1", "--state-dir", state_dir],
                          answers=["n"])
    assert code == 4
    assert runner.manifest().data["cancel_requested"] is True

    code, _ = runner.main(
        ["resume", "--operation-id", "op-1", "--state-dir", state_dir,
         "--allow-kms-grant"],
        answers=["y"] + HAPPY_ANSWERS_FIRST_USE)
    assert code == 0, runner.text()
    assert runner.manifest().data["cancel_requested"] is False
    assert runner.manifest().data["status"] == "completed"


# ---------------------------------------------------------------------------------
# Secrets: redaction and refusal to persist
# ---------------------------------------------------------------------------------

def test_secret_values_never_in_output_or_manifest(tmp_path):
    runner = Runner(tmp_path)
    code, prompter = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                                 answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 0
    everything_shown = runner.text() + "\n".join(prompter.prompts)
    assert SENTINEL_PASSWORD not in everything_shown
    assert DEVTEST_OLD_PASSWORD not in everything_shown
    manifest_text = runner.manifest_text()
    assert SENTINEL_PASSWORD not in manifest_text
    assert DEVTEST_OLD_PASSWORD not in manifest_text
    # The credential confirmation names the changed keys without their values.
    credential_prompt = next(p for p in runner.output if "CREDENTIAL REPLACEMENT" in p)
    assert "RDS_PASSWORD" in credential_prompt and "values not shown" in credential_prompt

    # status output is redaction-filtered too
    runner.output.clear()
    main(["status", "--operation-id", "op-1", "--state-dir", str(tmp_path / "state")],
         emit=runner.emit)
    assert SENTINEL_PASSWORD not in runner.text()


def test_manifest_refuses_secret_like_keys():
    manifest = Manifest.__new__(Manifest)
    manifest.data = {"resources": {}}
    manifest.path = None
    with pytest.raises(SafetyViolation):
        manifest.set_resource("db_password", "boom")


def test_missing_production_credential_key_fails_without_partial_write(tmp_path):
    runner = Runner(tmp_path)
    del runner.aws.secrets[PRODUCTION]["SmahtProductionIdentity"]["RDS_PASSWORD"]
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 1
    assert runner.aws.calls_named("put_secret_value") == []
    assert runner.aws.secrets[DEVTEST]["SmahtDevtestIdentity"]["RDS_PASSWORD"] == (
        DEVTEST_OLD_PASSWORD)


# ---------------------------------------------------------------------------------
# Reindex / indexer scaling
# ---------------------------------------------------------------------------------

def test_indexer_scaling_uses_configured_count(tmp_path):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True, indexer_count=32),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 0
    (indexer_update,) = [u for u in runner.aws.calls_named("update_service")
                         if "desiredCount" in u[3]]
    assert indexer_update[3]["desiredCount"] == 32


@pytest.mark.parametrize("count", [0, -1, 65])
def test_indexer_count_out_of_bounds_is_rejected_before_any_call(tmp_path, count):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path, indexer_count=count), answers=[])
    assert code == 2
    assert "indexer_count" in runner.text()
    assert runner.aws.calls == []


def test_ambiguous_indexer_service_fails_without_updates(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.services[CLUSTER].append(
        f"arn:aws:ecs:{REGION}:{DEVTEST_ACCOUNT}:service/{CLUSTER}/indexer-2")
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 1
    assert "Refusing to guess" in runner.text()
    assert runner.aws.calls_named("update_service") == []


# ---------------------------------------------------------------------------------
# Protected original vs replaceable old database
# ---------------------------------------------------------------------------------

def test_old_db_stopped_only_with_opt_in_and_typed_confirmation(tmp_path):
    aws = FakeAWS()
    aws.instances[DEVTEST][OLD_DB] = aws._instance("available")
    runner = Runner(tmp_path, aws)
    # Without the opt-in flag the final step fails closed and the DB keeps running.
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True,
                                    old_db_identifier=OLD_DB),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 2
    assert "--allow-stop-old-db" in runner.text()
    assert aws.instances[DEVTEST][OLD_DB]["DBInstanceStatus"] == "available"

    # Resume with the opt-in and the typed identifier: stopped, never deleted.
    code, _ = runner.main(
        ["resume", "--operation-id", "op-1", "--state-dir", str(tmp_path / "state"),
         "--allow-stop-old-db"],
        answers=[OLD_DB])
    assert code == 0, runner.text()
    assert aws.instances[DEVTEST][OLD_DB]["DBInstanceStatus"] == "stopped"
    assert not any("delete" in call[2].lower() for call in aws.calls)
    assert aws.instances[DEVTEST][PROTECTED_DB]["DBInstanceStatus"] == "available"


def test_protected_db_as_old_db_is_rejected_at_validation(tmp_path):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True,
                                    allow_stop_old_db=True,
                                    old_db_identifier=PROTECTED_DB),
                          answers=[])
    assert code == 2
    assert "protected" in runner.text()
    assert runner.aws.calls == []


def test_stop_step_itself_refuses_protected_db_even_if_validation_is_bypassed(tmp_path):
    # Last line of defense: drive the step directly with a config that validation
    # would have rejected.
    aws = FakeAWS()
    config = make_config(old_db_identifier=PROTECTED_DB, allow_stop_old_db=True)
    manifest = Manifest.create(tmp_path / "state", "op-x", config)
    orchestrator = RestoreOrchestrator(
        config, manifest, aws.factory, Prompter(input_fn=lambda _: PROTECTED_DB),
        emit=lambda _: None, sleep_fn=lambda _: None)
    with pytest.raises(SafetyViolation, match="never stops"):
        orchestrator.step_stop_old_database()
    assert aws.calls_named("stop_db_instance") == []


def test_already_stopped_old_db_is_left_alone(tmp_path):
    aws = FakeAWS()
    aws.instances[DEVTEST][OLD_DB] = {"DBInstanceStatus": "stopped", "polls_left": 0,
                                      "Endpoint": {}}
    runner = Runner(tmp_path, aws)
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True,
                                    allow_stop_old_db=True, old_db_identifier=OLD_DB),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 0, runner.text()
    assert aws.calls_named("stop_db_instance") == []
    assert "already stopped" in runner.text()


# ---------------------------------------------------------------------------------
# status / cancel CLI
# ---------------------------------------------------------------------------------

def test_status_lists_operations_and_step_detail(tmp_path):
    runner = Runner(tmp_path)
    runner.main(base_argv(tmp_path), answers=["n"])
    runner.output.clear()
    state_dir = str(tmp_path / "state")
    assert main(["status", "--state-dir", state_dir], emit=runner.emit) == 0
    assert "op-1: paused" in runner.text()
    runner.output.clear()
    assert main(["status", "--operation-id", "op-1", "--state-dir", state_dir],
                emit=runner.emit) == 0
    text = runner.text()
    assert "declined" in text and "create_production_snapshot" in text


def test_status_with_no_operations(tmp_path):
    output = []
    assert main(["status", "--state-dir", str(tmp_path / "state")],
                emit=output.append) == 0
    assert "No operations" in output[0]


# ---------------------------------------------------------------------------------
# No live services
# ---------------------------------------------------------------------------------

@pytest.fixture
def booby_trapped_boto3(monkeypatch):
    """Any attribute access on boto3 fails the test."""
    module = types.ModuleType("boto3")

    def explode(name):
        raise AssertionError(f"boto3.{name} was touched: a test contacted a live"
                             f" AWS boundary")

    module.__getattr__ = explode
    monkeypatch.setitem(sys.modules, "boto3", module)
    return module


def test_full_run_never_touches_boto3(tmp_path, booby_trapped_boto3):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 0, runner.text()


def test_default_factory_is_lazy_and_scoped(monkeypatch):
    """build_client_factory must not create sessions until a client is requested,
    and must refuse unknown scopes."""
    created = []

    class FakeSession:
        def __init__(self, profile_name=None, region_name=None):
            created.append((profile_name, region_name))

        def client(self, service):
            return f"client:{service}"

    module = types.ModuleType("boto3")
    module.Session = FakeSession
    monkeypatch.setitem(sys.modules, "boto3", module)

    factory = build_client_factory(make_config())
    assert created == []  # nothing until first use
    factory("sts", PRODUCTION)
    assert created == [("smaht-prod", REGION)]
    factory("rds", PRODUCTION)
    assert created == [("smaht-prod", REGION)]  # session reused per scope
    factory("rds", DEVTEST)
    assert created[-1] == ("smaht-devtest", REGION)
    with pytest.raises(SafetyViolation):
        factory("rds", "staging")


# ---------------------------------------------------------------------------------
# Config validation details
# ---------------------------------------------------------------------------------

def test_identical_accounts_or_profiles_rejected():
    with pytest.raises(SafetyViolation, match="distinct accounts"):
        make_config(devtest_account_id=PROD_ACCOUNT).validate()
    with pytest.raises(SafetyViolation, match="single ambient credential"):
        make_config(devtest_profile="smaht-prod").validate()


def test_new_db_identifier_may_not_collide():
    with pytest.raises(SafetyViolation, match="brand-new"):
        make_config(new_db_identifier=PROTECTED_DB).validate()
    with pytest.raises(SafetyViolation, match="brand-new"):
        make_config(new_db_identifier=SOURCE_DB).validate()


def test_missing_required_config_is_listed():
    with pytest.raises(SafetyViolation, match="devtest_ecs_cluster"):
        make_config(devtest_ecs_cluster="").validate()


def test_run_requires_all_config_before_creating_anything(tmp_path):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path, new_db_identifier=None), answers=[])
    assert code == 2
    assert "new_db_identifier" in runner.text()
    assert runner.aws.calls == []
    assert not (tmp_path / "state").exists()  # no manifest for an invalid run
