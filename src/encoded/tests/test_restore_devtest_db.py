"""Tests for the restore-devtest-db command.

Every external boundary is mocked: AWS (STS/RDS/KMS/Secrets Manager) is an in-memory
fake injected through the command's client-factory seam, prompts are scripted, sleeps
are no-ops, and manifests live in pytest tmp dirs. No test here contacts AWS or any
deployed environment, and one test actively booby-traps boto3 to prove it.

The fake factory provides no ECS or SQS clients at all (post-restore reindexing is a
manual step outside this command), and the fake RDS client implements no delete or
stop APIs, so any attempted deployment orchestration, service mutation, stop, or
deletion fails loudly.
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
PROD_KMS_KEY = f"arn:aws:kms:{REGION}:{PROD_ACCOUNT}:key/1234"
DEVTEST_KMS_KEY = f"arn:aws:kms:{REGION}:{DEVTEST_ACCOUNT}:key/5678"
PROD_IDENTITY_NAME = "SmahtProductionIdentity"
DEVTEST_IDENTITY_NAME = "SmahtDevtestIdentity"
DB_SUBNET_GROUP = "smaht-devtest-db-subnet"
DB_SECURITY_GROUPS = ["sg-devtest-db"]
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
    unless the snapshot was shared. The existing devtest role is assumed to have
    the required database and KMS access.
    """

    def __init__(self, polls_until_available=1):
        self.calls = []  # (scope, service, method, kwargs)
        self.fail_next = {}  # (scope, service, method) -> exception raised once
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
            PRODUCTION: {SOURCE_DB: self._instance("available", db_id=SOURCE_DB)},
            DEVTEST: {PROTECTED_DB: self._instance("available", db_id=PROTECTED_DB)},
        }
        self.kms_account_override = {}
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
        self.fail_after_secret_put = None

    def _instance(self, status, polls_left=0, db_id=NEW_DB):
        return {
            "DBInstanceIdentifier": db_id,
            "DBInstanceStatus": status,
            "polls_left": polls_left,
            "Endpoint": {"Address": "new-db.example.internal", "Port": 5432},
            "DBSubnetGroup": {"DBSubnetGroupName": DB_SUBNET_GROUP},
            "VpcSecurityGroups": [
                {"VpcSecurityGroupId": group} for group in DB_SECURITY_GROUPS
            ],
        }

    def factory(self, service, scope):
        # Deliberately no "ecs" or "sqs" here: the command must never ask for them.
        classes = {"sts": FakeSTS, "rds": FakeRDS, "kms": FakeKMS,
                   "secretsmanager": FakeSecrets}
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
    # Deliberately NO delete_db_instance / delete_db_snapshot / stop_db_instance:
    # the command must never call them, and an attempt would fail loudly with
    # AttributeError.

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
        return {"DBSnapshots": [dict(snapshot)]}

    def create_db_snapshot(self, DBSnapshotIdentifier, DBInstanceIdentifier, Tags):
        self._record("create_db_snapshot", DBSnapshotIdentifier=DBSnapshotIdentifier,
                     DBInstanceIdentifier=DBInstanceIdentifier, Tags=Tags)
        if DBSnapshotIdentifier in self._snapshots():
            raise AwsStubError("DBSnapshotAlreadyExists")
        assert DBInstanceIdentifier in self.aws.instances[self.scope]
        self._snapshots()[DBSnapshotIdentifier] = {
            "DBSnapshotIdentifier": DBSnapshotIdentifier,
            "Status": "creating", "polls_left": self.aws.polls_until_available,
            "shared": set(), "TagList": list(Tags),
        }

    def copy_db_snapshot(self, SourceDBSnapshotIdentifier, TargetDBSnapshotIdentifier,
                         KmsKeyId, Tags):
        self._record("copy_db_snapshot", SourceDBSnapshotIdentifier=SourceDBSnapshotIdentifier,
                     TargetDBSnapshotIdentifier=TargetDBSnapshotIdentifier, KmsKeyId=KmsKeyId,
                     Tags=Tags)
        if TargetDBSnapshotIdentifier in self._snapshots():
            raise AwsStubError("DBSnapshotAlreadyExists")
        if ":snapshot:" in SourceDBSnapshotIdentifier:  # cross-account copy by ARN
            source_id = SourceDBSnapshotIdentifier.split(":snapshot:")[1]
            source = self.aws.snapshots[PRODUCTION].get(source_id)
            assert source is not None, f"source snapshot {source_id} does not exist"
            if DEVTEST_ACCOUNT not in source["shared"]:
                raise AwsStubError("DBSnapshotNotFound")  # unshared snapshots are invisible
        else:
            assert SourceDBSnapshotIdentifier in self._snapshots()
        self._snapshots()[TargetDBSnapshotIdentifier] = {
            "DBSnapshotIdentifier": TargetDBSnapshotIdentifier,
            "Status": "creating", "polls_left": self.aws.polls_until_available,
            "shared": set(), "TagList": list(Tags),
        }

    def describe_db_snapshot_attributes(self, DBSnapshotIdentifier):
        self._record("describe_db_snapshot_attributes",
                     DBSnapshotIdentifier=DBSnapshotIdentifier)
        snapshot = self._snapshots()[DBSnapshotIdentifier]
        return {"DBSnapshotAttributesResult": {"DBSnapshotAttributes": [
            {"AttributeName": "restore", "AttributeValues": sorted(snapshot["shared"])},
        ]}}

    def modify_db_snapshot_attribute(self, DBSnapshotIdentifier, AttributeName,
                                     ValuesToAdd=None, ValuesToRemove=None):
        self._record("modify_db_snapshot_attribute", DBSnapshotIdentifier=DBSnapshotIdentifier,
                     AttributeName=AttributeName, ValuesToAdd=ValuesToAdd,
                     ValuesToRemove=ValuesToRemove)
        assert AttributeName == "restore"
        self._snapshots()[DBSnapshotIdentifier]["shared"].update(ValuesToAdd or [])
        self._snapshots()[DBSnapshotIdentifier]["shared"].difference_update(ValuesToRemove or [])

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
            "creating", polls_left=self.aws.polls_until_available, db_id=db_id)

class FakeKMS(FakeService):
    def describe_key(self, KeyId):
        self._record("describe_key", KeyId=KeyId)
        account = self.aws.kms_account_override.get(self.scope, PROD_ACCOUNT)
        return {"KeyMetadata": {
            "AWSAccountId": account,
            "Arn": f"arn:aws:kms:{REGION}:{account}:key/1234",
            "KeyState": "Enabled",
            "KeyManager": "CUSTOMER",
        }}


class FakeSecrets(FakeService):
    def get_secret_value(self, SecretId):
        self._record("get_secret_value", SecretId=SecretId)
        return {"SecretString": json.dumps(self.aws.secrets[self.scope][SecretId])}

    def put_secret_value(self, SecretId, SecretString):
        # Never record the SecretString payload: the calls list is assertable output.
        self._record("put_secret_value", SecretId=SecretId)
        self.aws.secrets[self.scope][SecretId] = json.loads(SecretString)
        if self.aws.fail_after_secret_put:
            raise self.aws.fail_after_secret_put
        return {}


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

# Confirmation order: production snapshot (also covers the encrypted copy), share
# (typed account id), credentials (typed phrase).
HAPPY_ANSWERS = ["y", DEVTEST_ACCOUNT, CREDENTIAL_CONFIRMATION_PHRASE]


def base_argv(tmp_path, command="run", operation_id="op-1", **overrides):
    options = {
        "--state-dir": str(tmp_path / "state"),
        "--production-account-id": PROD_ACCOUNT,
        "--devtest-account-id": DEVTEST_ACCOUNT,
        "--region": REGION,
        "--production-profile": "smaht-prod",
        "--devtest-profile": "smaht-devtest",
        "--production-kms-key-id": PROD_KMS_KEY,
        "--devtest-kms-key-id": DEVTEST_KMS_KEY,
        "--production-identity-secret": "SmahtProductionIdentity",
        "--devtest-identity-secret": "SmahtDevtestIdentity",
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
    if command in ("run", "plan"):
        argv += ["--operation-id", operation_id]
    for key, value in options.items():
        argv += [key, value]
    return argv + flags


def resume_argv(tmp_path, *flags, operation_id="op-1"):
    return (["resume", "--operation-id", operation_id,
             "--state-dir", str(tmp_path / "state")] + list(flags))


class Runner:
    """Drives main() with all boundaries injected; collects output."""

    def __init__(self, tmp_path, aws=None):
        self.tmp_path = tmp_path
        self.aws = aws or FakeAWS()
        self.output = []
        self.sleeps = []
        self.health_calls = []

        def health_discoverer(url):
            self.health_calls.append(url)
            production = "data.smaht.org" in url
            return {
                "s3_encrypt_key_id": PROD_KMS_KEY if production else DEVTEST_KMS_KEY,
                "identity": PROD_IDENTITY_NAME if production else DEVTEST_IDENTITY_NAME,
            }

        self.health_discoverer = health_discoverer

    def emit(self, message):
        self.output.append(str(message))

    def sleep(self, seconds):
        self.sleeps.append(seconds)

    def main(self, argv, answers=()):
        prompter = ScriptedPrompter(list(answers), emit=self.emit)
        code = main(argv, client_factory_builder=self.aws.factory_builder,
                    prompter=prompter, emit=self.emit, sleep_fn=self.sleep,
                    health_discoverer=self.health_discoverer)
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
        devtest_kms_key_id=DEVTEST_KMS_KEY,
        production_identity_secret=PROD_IDENTITY_NAME,
        devtest_identity_secret=DEVTEST_IDENTITY_NAME,
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
    assert "s3_encrypt_key_id" in text
    assert "IDENTITY names use 'identity'" in text
    assert "never deletes or" in text and "stops any database" in text
    assert "performed" in text and "manually" in text
    manifest = Manifest.load(tmp_path / "state", "op-1")
    assert manifest.data["status"] == "planned"
    assert manifest.data["done"] == []
    assert manifest.data["resources"] == {}
    assert manifest.data["config"]["production_kms_key_id"] == PROD_KMS_KEY
    assert manifest.data["config"]["production_identity_secret"] == PROD_IDENTITY_NAME
    assert "Plan saved (not started)" in text
    assert "run --operation-id op-1" in text


def test_run_dry_run_is_plan(tmp_path):
    output = []
    code = main(base_argv(tmp_path) + ["--dry-run"],
                client_factory_builder=explosive_factory_builder,
                prompter=Prompter(input_fn=lambda _: "n"), emit=output.append)
    assert code == 0
    manifest = Manifest.load(tmp_path / "state", "op-1")
    assert manifest.data["status"] == "planned"
    assert manifest.data["done"] == []
    assert manifest.data["resources"] == {}


def test_plan_then_run_uses_only_the_saved_operation_id(tmp_path):
    output = []
    assert main(base_argv(tmp_path, command="plan"),
                client_factory_builder=explosive_factory_builder,
                emit=output.append) == 0

    runner = Runner(tmp_path)
    code, _ = runner.main(
        ["run", "--operation-id", "op-1", "--state-dir", str(tmp_path / "state")],
        answers=HAPPY_ANSWERS)
    assert code == 0, runner.text()
    assert runner.manifest().data["status"] == "completed"
    assert runner.aws.calls_named("create_db_snapshot")
    assert runner.health_calls == []


def test_run_only_operation_id_without_plan_reports_missing_manifest(tmp_path):
    output = []
    code = main(["run", "--operation-id", "op-missing", "--state-dir",
                 str(tmp_path / "state")], emit=output.append)
    assert code == 1
    assert "No manifest found for operation op-missing" in output[0]


def test_run_from_plan_applies_only_explicit_config_overrides(tmp_path):
    output = []
    assert main(base_argv(tmp_path, command="plan"), emit=output.append) == 0
    override_db = "rds-smaht-devtest-restored-override"
    runner = Runner(tmp_path)
    code, _ = runner.main(
        ["run", "--operation-id", "op-1", "--state-dir", str(tmp_path / "state"),
         "--new-db-identifier", override_db],
        answers=HAPPY_ANSWERS)
    assert code == 0, runner.text()
    config = runner.manifest().data["config"]
    assert config["new_db_identifier"] == override_db
    assert config["source_db_identifier"] == SOURCE_DB
    assert config["production_profile"] == "smaht-prod"
    restore = runner.aws.calls_named("restore_db_instance_from_db_snapshot")
    assert restore[0][3]["DBInstanceIdentifier"] == override_db


def test_plan_id_collision_does_not_overwrite_existing_manifest(tmp_path):
    first_output = []
    assert main(base_argv(tmp_path, command="plan"), emit=first_output.append) == 0
    before = Manifest.load(tmp_path / "state", "op-1").data.copy()
    second_output = []
    code = main(base_argv(tmp_path, command="plan"), emit=second_output.append)
    assert code == 1
    assert "already exists" in second_output[0]
    after = Manifest.load(tmp_path / "state", "op-1").data
    assert after["created_at"] == before["created_at"]
    assert after["config"] == before["config"]


def test_status_and_resume_handle_saved_plan(tmp_path):
    output = []
    assert main(base_argv(tmp_path, command="plan"), emit=output.append) == 0
    output.clear()
    assert main(["status", "--operation-id", "op-1", "--state-dir",
                 str(tmp_path / "state")], emit=output.append) == 0
    assert "planned (not started)" in output[0]

    runner = Runner(tmp_path)
    code, _ = runner.main(resume_argv(tmp_path), answers=HAPPY_ANSWERS)
    assert code == 0, runner.text()
    assert runner.manifest().data["status"] == "completed"


# ---------------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------------

def test_happy_path_first_use(tmp_path):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path), answers=HAPPY_ANSWERS)
    assert code == 0, runner.text()
    manifest = runner.manifest()
    assert manifest.data["status"] == "completed"
    assert manifest.data["done"] == rdd.STEP_NAMES

    # Production snapshot created once, from the right database, with the audit tag.
    (create,) = runner.aws.calls_named("create_db_snapshot")
    assert create[0] == PRODUCTION
    assert create[3]["DBInstanceIdentifier"] == SOURCE_DB
    assert create[3]["Tags"] == [{"Key": rdd.OPERATION_TAG_KEY, "Value": "op-1"}]

    # Two copies: prod re-encryption with the resolved CMK ARN, devtest copy under
    # the existing devtest role's KMS key.
    copies = runner.aws.calls_named("copy_db_snapshot")
    assert [c[0] for c in copies] == [PRODUCTION, DEVTEST]
    assert copies[0][3]["KmsKeyId"] == PROD_KMS_KEY
    assert copies[1][3]["KmsKeyId"] == DEVTEST_KMS_KEY

    # KMS is read-only: key ownership is described and no other KMS API is used.
    assert len(runner.aws.calls_named("describe_key")) == 1
    assert [c[2] for c in runner.aws.calls if c[1] == "kms"] == ["describe_key"]
    (unshare,) = [c for c in runner.aws.calls_named("modify_db_snapshot_attribute")
                  if c[3]["ValuesToRemove"]]
    assert unshare[3]["ValuesToRemove"] == [DEVTEST_ACCOUNT]

    # Shared with the devtest account only.
    (share,) = [c for c in runner.aws.calls_named("modify_db_snapshot_attribute")
                if c[3]["ValuesToAdd"]]
    assert share[3]["ValuesToAdd"] == [DEVTEST_ACCOUNT]

    # Restore lands in devtest, not public, with placement copied from the protected
    # database rather than supplied by flags.
    (restore,) = runner.aws.calls_named("restore_db_instance_from_db_snapshot")
    assert restore[0] == DEVTEST
    assert restore[3]["DBInstanceClass"] == "db.m7g.xlarge"
    assert restore[3]["PubliclyAccessible"] is False
    assert restore[3]["DBSubnetGroupName"] == DB_SUBNET_GROUP
    assert restore[3]["VpcSecurityGroupIds"] == DB_SECURITY_GROUPS

    # Identity secret now points at the new endpoint with production credentials.
    devtest_identity = runner.aws.secrets[DEVTEST]["SmahtDevtestIdentity"]
    assert devtest_identity["RDS_HOSTNAME"] == "new-db.example.internal"
    assert devtest_identity["RDS_PASSWORD"] == SENTINEL_PASSWORD
    assert devtest_identity["ENCODED_VERSION"] == "1.2.3"  # unrelated keys preserved

    # The workflow ends at the secret update: no ECS/SQS client was ever requested
    # (the fake factory would KeyError), nothing was deleted or stopped, and the
    # protected database is untouched. Reindexing is explicitly a manual follow-up.
    assert {c[1] for c in runner.aws.calls} == {"sts", "rds", "kms", "secretsmanager"}
    assert not any("delete" in c[2].lower() or "stop" in c[2].lower()
                   for c in runner.aws.calls)
    assert runner.aws.instances[DEVTEST][PROTECTED_DB]["DBInstanceStatus"] == "available"
    assert "performed manually" in runner.text()

    # STS verified exactly once per account scope.
    assert len(runner.aws.calls_named("get_caller_identity")) == 2


# ---------------------------------------------------------------------------------
# Confirmation boundaries: declining any of them halts without the mutation
# ---------------------------------------------------------------------------------

@pytest.mark.parametrize("answers,step,missing_call", [
    (["n"], "snapshot_production", "create_db_snapshot"),
    (["y", "999999999999"], "share_snapshot_with_devtest",
     "modify_db_snapshot_attribute"),
    (["y", DEVTEST_ACCOUNT, "wrong-phrase"], "update_identity_secret",
     "put_secret_value"),
])
def test_declining_a_confirmation_halts_without_mutating(tmp_path, answers, step, missing_call):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path), answers=answers)
    assert code == 3, runner.text()
    assert runner.aws.calls_named(missing_call) == []
    manifest = runner.manifest()
    assert manifest.data["status"] == "declined"
    assert step not in manifest.data["done"]
    assert "resume --operation-id op-1" in runner.text()


# ---------------------------------------------------------------------------------
# Account / region / role verification failures
# ---------------------------------------------------------------------------------

def test_production_account_mismatch_fails_before_any_rds_call(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.identities[PRODUCTION]["Account"] = "333333333333"
    code, _ = runner.main(base_argv(tmp_path), answers=HAPPY_ANSWERS)
    assert code == 2
    assert "expected 111111111111" in runner.text()
    assert not [c for c in runner.aws.calls if c[1] == "rds"]
    assert runner.manifest().data["status"] == "failed"


def test_devtest_account_mismatch_fails_before_devtest_mutations(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.identities[DEVTEST]["Account"] = "444444444444"
    code, _ = runner.main(base_argv(tmp_path), answers=HAPPY_ANSWERS)
    assert code == 2
    assert not [c for c in runner.aws.calls if c[0] == DEVTEST and c[1] != "sts"]
    # Production-side work is checkpointed and reusable after the operator fixes creds.
    assert "share_snapshot_with_devtest" in runner.manifest().data["done"]


def test_region_mismatch_fails_closed(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.regions[PRODUCTION] = "us-west-2"
    code, _ = runner.main(base_argv(tmp_path), answers=[])
    assert code == 2
    assert "us-west-2" in runner.text()
    assert not [c for c in runner.aws.calls if c[1] == "rds"]


def test_role_mismatch_fails_closed(tmp_path):
    runner = Runner(tmp_path)
    code, _ = runner.main(
        base_argv(tmp_path, production_role_name="expected-role"),
        answers=[])
    assert code == 2
    assert "expected 'expected-role'" in runner.text()
    assert not [c for c in runner.aws.calls if c[1] == "rds"]


def test_kms_key_must_be_customer_managed_in_production_account(tmp_path):
    aws = FakeAWS()
    aws.kms_account_override[PRODUCTION] = DEVTEST_ACCOUNT
    runner = Runner(tmp_path, aws)
    code, _ = runner.main(base_argv(tmp_path), answers=["y"])
    assert code == 2
    assert "customer-managed" in runner.text()
    assert aws.calls_named("copy_db_snapshot") == []


# ---------------------------------------------------------------------------------
# Polling
# ---------------------------------------------------------------------------------

def test_snapshot_polling_progresses_through_creating(tmp_path):
    runner = Runner(tmp_path, FakeAWS(polls_until_available=3))
    code, _ = runner.main(base_argv(tmp_path), answers=HAPPY_ANSWERS)
    assert code == 0, runner.text()
    assert len(runner.sleeps) > 0  # sleeps happened only through the injected fake
    assert "creating" in runner.text()


def test_polling_timeout_is_bounded_and_resumable(tmp_path):
    runner = Runner(tmp_path, FakeAWS(polls_until_available=10_000))
    code, _ = runner.main(base_argv(tmp_path, poll_timeout=3), answers=HAPPY_ANSWERS)
    assert code == 1
    assert "Timed out" in runner.text() and "resume" in runner.text()
    manifest = runner.manifest()
    assert manifest.data["status"] == "failed"
    assert "snapshot_production" not in manifest.data["done"]
    assert len(runner.sleeps) <= 4  # bounded by poll_timeout/poll_interval


# ---------------------------------------------------------------------------------
# Resume / idempotency / partial failure
# ---------------------------------------------------------------------------------

def test_partial_failure_then_resume_skips_completed_steps(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.fail_next[(PRODUCTION, "rds", "modify_db_snapshot_attribute")] = (
        AwsStubError("InternalFailure"))
    code, _ = runner.main(base_argv(tmp_path), answers=HAPPY_ANSWERS)
    assert code == 1
    manifest = runner.manifest()
    assert manifest.data["status"] == "failed"
    assert "InternalFailure" in manifest.data["error"]
    assert "resume" in runner.text()

    code, _ = runner.main(
        resume_argv(tmp_path),
        answers=[DEVTEST_ACCOUNT, CREDENTIAL_CONFIRMATION_PHRASE])
    assert code == 0, runner.text()
    assert runner.manifest().data["status"] == "completed"
    # Idempotency: the snapshot and its encrypted copy were made exactly once.
    assert len(runner.aws.calls_named("create_db_snapshot")) == 1
    assert len([c for c in runner.aws.calls_named("copy_db_snapshot")
                if c[0] == PRODUCTION]) == 1


def test_already_exists_race_continues_instead_of_failing(tmp_path):
    """A resource this operation created but could not observe (describe missed it,
    create answered AlreadyExists) is treated as ours: names are deterministic per
    operation."""
    runner = Runner(tmp_path)
    snapshot_id = f"{SOURCE_DB}-devtest-restore-op-1"
    runner.aws.snapshots[PRODUCTION][snapshot_id] = {
        "DBSnapshotIdentifier": snapshot_id, "Status": "available", "polls_left": 0,
        "shared": set(), "TagList": [],
    }
    runner.aws.fail_next[(PRODUCTION, "rds", "describe_db_snapshots")] = (
        AwsStubError("DBSnapshotNotFound"))
    code, _ = runner.main(base_argv(tmp_path), answers=HAPPY_ANSWERS)
    assert code == 0, runner.text()
    assert "already exists; continuing" in runner.text()
    assert len(runner.aws.calls_named("create_db_snapshot")) == 1


def test_resume_of_completed_operation_is_a_noop(tmp_path):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path), answers=HAPPY_ANSWERS)
    assert code == 0
    calls_before = len(runner.aws.calls)
    code, _ = runner.main(resume_argv(tmp_path), answers=[])
    assert code == 0
    assert "already completed" in runner.text()
    assert len(runner.aws.calls) == calls_before


def test_keyboard_interrupt_leaves_checkpoint_and_resume_hint(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.fail_next[(PRODUCTION, "rds", "create_db_snapshot")] = KeyboardInterrupt()
    code, _ = runner.main(base_argv(tmp_path), answers=["y"])
    assert code == 130
    assert "resume" in runner.text()
    assert runner.manifest().data["done"] == []  # nothing falsely marked done


def test_corrupt_manifest_fails_cleanly(tmp_path):
    state_dir = tmp_path / "state"
    state_dir.mkdir()
    (state_dir / "op-1.json").write_text("{not json")
    output = []
    code = main(["status", "--operation-id", "op-1", "--state-dir", str(state_dir)],
                emit=output.append)
    assert code == 1
    assert "cannot be read safely" in output[0]


# ---------------------------------------------------------------------------------
# Secrets: redaction and refusal to persist
# ---------------------------------------------------------------------------------

def test_secret_values_never_in_output_or_manifest(tmp_path):
    runner = Runner(tmp_path)
    code, prompter = runner.main(base_argv(tmp_path), answers=HAPPY_ANSWERS)
    assert code == 0
    everything_shown = runner.text() + "\n".join(prompter.prompts)
    assert SENTINEL_PASSWORD not in everything_shown
    assert DEVTEST_OLD_PASSWORD not in everything_shown
    assert SENTINEL_PASSWORD not in runner.manifest_text()
    assert DEVTEST_OLD_PASSWORD not in runner.manifest_text()
    # The credential confirmation names the changed keys without their values.
    credential_prompt = next(p for p in runner.output if "CREDENTIAL REPLACEMENT" in p)
    assert "RDS_PASSWORD" in credential_prompt and "values not shown" in credential_prompt

    runner.output.clear()
    main(["status", "--operation-id", "op-1", "--state-dir", str(tmp_path / "state")],
         emit=runner.emit)
    assert SENTINEL_PASSWORD not in runner.text()


def test_secret_bearing_exception_text_is_never_exposed(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.fail_after_secret_put = RuntimeError(f"transport echoed {SENTINEL_PASSWORD}")
    code, _ = runner.main(base_argv(tmp_path), answers=HAPPY_ANSWERS)
    assert code == 1
    assert SENTINEL_PASSWORD not in runner.text()
    assert SENTINEL_PASSWORD not in runner.manifest_text()


def test_missing_production_credential_key_fails_without_partial_write(tmp_path):
    runner = Runner(tmp_path)
    del runner.aws.secrets[PRODUCTION]["SmahtProductionIdentity"]["RDS_PASSWORD"]
    code, _ = runner.main(base_argv(tmp_path), answers=HAPPY_ANSWERS)
    assert code == 1
    assert runner.aws.calls_named("put_secret_value") == []
    assert runner.aws.secrets[DEVTEST]["SmahtDevtestIdentity"]["RDS_PASSWORD"] == (
        DEVTEST_OLD_PASSWORD)


def test_manifest_refuses_secret_like_resource_keys(tmp_path):
    manifest = Manifest.create(tmp_path / "state", "op-x", make_config())
    with pytest.raises(SafetyViolation):
        manifest.set_resource("db_password", "boom")


# ---------------------------------------------------------------------------------
# Protected database safeguards
# ---------------------------------------------------------------------------------

def test_missing_protected_db_refuses_placement_inference(tmp_path):
    aws = FakeAWS()
    del aws.instances[DEVTEST][PROTECTED_DB]
    runner = Runner(tmp_path, aws)
    code, _ = runner.main(base_argv(tmp_path), answers=HAPPY_ANSWERS)
    assert code == 2
    assert "refusing to infer network placement" in runner.text()
    assert aws.calls_named("restore_db_instance_from_db_snapshot") == []


# ---------------------------------------------------------------------------------
# status CLI
# ---------------------------------------------------------------------------------

def test_status_lists_operations_and_step_detail(tmp_path):
    runner = Runner(tmp_path)
    runner.main(base_argv(tmp_path), answers=["n"])
    runner.output.clear()
    state_dir = str(tmp_path / "state")
    assert main(["status", "--state-dir", state_dir], emit=runner.emit) == 0
    assert "op-1: declined" in runner.text()
    runner.output.clear()
    assert main(["status", "--operation-id", "op-1", "--state-dir", state_dir],
                emit=runner.emit) == 0
    text = runner.text()
    assert "pending  snapshot_production" in text
    assert "last error" in text


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
    code, _ = runner.main(base_argv(tmp_path), answers=HAPPY_ANSWERS)
    assert code == 0, runner.text()


def test_default_factory_is_lazy_and_scoped(monkeypatch):
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
# Interactive configuration (--interactive)
# ---------------------------------------------------------------------------------

# Credential values planted in the fake ~/.aws/credentials file: the interactive
# resolver must never read, print, or persist them.
CRED_SENTINEL_ID = "AKIASENTINELEXAMPLE1"
CRED_SENTINEL_SECRET = "CredFileSecretSentinel+123"
PROD_PROFILE_ROLE = f"arn:aws:iam::{PROD_ACCOUNT}:role/prod-admin"
DEVTEST_PROFILE_ROLE = f"arn:aws:iam::{DEVTEST_ACCOUNT}:role/devtest-admin"


@pytest.fixture
def aws_local_config(tmp_path, monkeypatch):
    """Point the standard AWS config env vars at fake local files."""
    aws_dir = tmp_path / "aws"
    aws_dir.mkdir()
    (aws_dir / "config").write_text(
        "[profile smaht-prod]\n"
        f"region = {REGION}\n"
        f"role_arn = {PROD_PROFILE_ROLE}\n"
        "\n"
        "[profile smaht-devtest]\n"
        f"region = {REGION}\n"
        f"role_arn = {DEVTEST_PROFILE_ROLE}\n")
    (aws_dir / "credentials").write_text(
        "[smaht-prod]\n"
        f"aws_access_key_id = {CRED_SENTINEL_ID}\n"
        f"aws_secret_access_key = {CRED_SENTINEL_SECRET}\n"
        "\n"
        "[smaht-devtest]\n"
        f"aws_access_key_id = {CRED_SENTINEL_ID}\n"
        f"aws_secret_access_key = {CRED_SENTINEL_SECRET}\n")
    monkeypatch.setenv("AWS_CONFIG_FILE", str(aws_dir / "config"))
    monkeypatch.setenv("AWS_SHARED_CREDENTIALS_FILE", str(aws_dir / "credentials"))
    monkeypatch.delenv("AWS_REGION", raising=False)
    monkeypatch.delenv("AWS_DEFAULT_REGION", raising=False)
    return aws_dir


def interactive_argv(tmp_path, command="run", *flags, operation_id="op-1"):
    argv = [command, "--interactive", "--state-dir", str(tmp_path / "state")]
    if command == "run":
        argv += ["--operation-id", operation_id]
    return argv + list(flags)


# Empty answers accept the discovered defaults: profiles, region, and account ids;
# health supplies both KMS key IDs and IDENTITY names, then the remaining value is typed.
INTERACTIVE_ANSWERS = ["", "", "", "", "", NEW_DB]


def test_interactive_run_discovers_defaults_and_completes(tmp_path, aws_local_config):
    runner = Runner(tmp_path)
    code, prompter = runner.main(
        interactive_argv(tmp_path, "run"), answers=INTERACTIVE_ANSWERS + HAPPY_ANSWERS)
    assert code == 0, runner.text()
    saved = runner.manifest().data["config"]
    assert saved["production_profile"] == "smaht-prod"
    assert saved["devtest_profile"] == "smaht-devtest"
    assert saved["region"] == REGION
    assert saved["production_account_id"] == PROD_ACCOUNT
    assert saved["devtest_account_id"] == DEVTEST_ACCOUNT
    assert saved["production_kms_key_id"] == PROD_KMS_KEY
    assert saved["devtest_kms_key_id"] == DEVTEST_KMS_KEY
    assert saved["production_identity_secret"] == PROD_IDENTITY_NAME
    assert saved["devtest_identity_secret"] == DEVTEST_IDENTITY_NAME
    assert saved["new_db_identifier"] == NEW_DB
    assert runner.health_calls == [rdd.PRODUCTION_HEALTH_URL, rdd.DEVTEST_HEALTH_URL]
    assert "Discovered production IDENTITY secret name from health" in runner.text()
    assert "Discovered devtest IDENTITY secret name from health" in runner.text()
    assert "Explicit production IDENTITY secret name override" not in runner.text()
    assert "Explicit devtest IDENTITY secret name override" not in runner.text()
    # Credential values from the local files never appear anywhere.
    shown = runner.text() + "\n".join(prompter.prompts) + runner.manifest_text()
    assert CRED_SENTINEL_ID not in shown
    assert CRED_SENTINEL_SECRET not in shown


def test_interactive_explicit_arguments_always_win(tmp_path, aws_local_config):
    runner = Runner(tmp_path)
    code, prompter = runner.main(
        base_argv(tmp_path, interactive=True), answers=HAPPY_ANSWERS)
    assert code == 0, runner.text()
    # Everything was explicit, so no value prompt was ever shown.
    assert not any(p.startswith("Value") for p in prompter.prompts)
    assert runner.health_calls == []
    assert runner.manifest().data["config"]["production_profile"] == "smaht-prod"


def test_interactive_plan_mode_keeps_zero_aws_guarantee(tmp_path, aws_local_config):
    output = []
    prompter = ScriptedPrompter(list(INTERACTIVE_ANSWERS), emit=output.append)
    health_calls = []

    def health_discoverer(url):
        health_calls.append(url)
        production = "data.smaht.org" in url
        return {"s3_encrypt_key_id": PROD_KMS_KEY if production else DEVTEST_KMS_KEY,
                "identity": PROD_IDENTITY_NAME if production else DEVTEST_IDENTITY_NAME}

    code = main(interactive_argv(tmp_path, "plan"),
                client_factory_builder=explosive_factory_builder,
                prompter=prompter, emit=output.append,
                health_discoverer=health_discoverer)
    assert code == 0, "\n".join(output)
    text = "\n".join(output)
    assert "no AWS calls were made" in text
    assert "snapshot_production" in text
    assert health_calls == [rdd.PRODUCTION_HEALTH_URL, rdd.DEVTEST_HEALTH_URL]


def test_interactive_health_failure_prompts_for_explicit_override(tmp_path, aws_local_config):
    runner = Runner(tmp_path)

    def health_discoverer(url):
        runner.health_calls.append(url)
        if url == rdd.PRODUCTION_HEALTH_URL:
            raise OSError("temporary DNS failure")
        return {"s3_encrypt_key_id": DEVTEST_KMS_KEY, "identity": DEVTEST_IDENTITY_NAME}

    runner.health_discoverer = health_discoverer
    answers = ["", "", "", "", "", PROD_KMS_KEY, PROD_IDENTITY_NAME, NEW_DB]
    code, _ = runner.main(interactive_argv(tmp_path, "run"), answers=answers + HAPPY_ANSWERS)
    assert code == 0, runner.text()
    assert "temporary DNS failure" in runner.text()
    assert runner.manifest().data["config"]["production_kms_key_id"] == PROD_KMS_KEY
    assert runner.manifest().data["config"]["devtest_kms_key_id"] == DEVTEST_KMS_KEY


def test_interactive_health_missing_field_prompts_for_explicit_override(tmp_path,
                                                                         aws_local_config):
    runner = Runner(tmp_path)

    def health_discoverer(url):
        runner.health_calls.append(url)
        return {} if url == rdd.PRODUCTION_HEALTH_URL else {
            "s3_encrypt_key_id": DEVTEST_KMS_KEY,
            "identity": DEVTEST_IDENTITY_NAME,
            "RDS_HOSTNAME": "must-not-be-used-as-a-key",
        }

    runner.health_discoverer = health_discoverer
    answers = ["", "", "", "", "", PROD_KMS_KEY, PROD_IDENTITY_NAME, NEW_DB]
    code, _ = runner.main(interactive_argv(tmp_path, "run"), answers=answers + HAPPY_ANSWERS)
    assert code == 0, runner.text()
    assert f"lacks a non-empty '{rdd.HEALTH_KMS_KEY_FIELD}' field" in runner.text()
    assert f"lacks a non-empty '{rdd.HEALTH_IDENTITY_FIELD}' field" in runner.text()
    assert runner.manifest().data["config"]["production_identity_secret"] == PROD_IDENTITY_NAME
    assert runner.manifest().data["config"]["devtest_kms_key_id"] == DEVTEST_KMS_KEY


def test_interactive_health_invalid_identity_prompts_for_override(tmp_path, aws_local_config):
    runner = Runner(tmp_path)

    def health_discoverer(url):
        runner.health_calls.append(url)
        if url == rdd.DEVTEST_HEALTH_URL:
            return {"s3_encrypt_key_id": DEVTEST_KMS_KEY, "identity": 123}
        return {"s3_encrypt_key_id": PROD_KMS_KEY, "identity": PROD_IDENTITY_NAME}

    runner.health_discoverer = health_discoverer
    answers = ["", "", "", "", "", DEVTEST_IDENTITY_NAME, NEW_DB]
    code, _ = runner.main(interactive_argv(tmp_path, "run"), answers=answers + HAPPY_ANSWERS)
    assert code == 0, runner.text()
    assert f"lacks a non-empty '{rdd.HEALTH_IDENTITY_FIELD}' field" in runner.text()
    assert "Discovered production IDENTITY secret name from health" in runner.text()
    assert "Discovered devtest IDENTITY secret name from health" not in runner.text()
    assert runner.manifest().data["config"]["devtest_identity_secret"] == DEVTEST_IDENTITY_NAME


def test_interactive_invalid_input_reprompts_then_fails_closed(tmp_path, aws_local_config):
    (aws_local_config / "config").write_text(
        f"[profile smaht-prod]\nregion = {REGION}\n\n"
        f"[profile smaht-devtest]\nregion = {REGION}\nrole_arn = {DEVTEST_PROFILE_ROLE}\n")
    runner = Runner(tmp_path)
    # Production account id has no discovered default here and gets three bad answers.
    answers = ["", "", "", "", "not-an-account", "12345", "also-bad"]
    code, _ = runner.main(interactive_argv(tmp_path, "run"), answers=answers)
    assert code == 1
    assert "aborting interactive setup" in runner.text()
    assert runner.aws.calls == []
    assert not (tmp_path / "state").exists()  # nothing was created


def test_interactive_region_falls_back_to_environment(tmp_path, aws_local_config, monkeypatch):
    (aws_local_config / "config").write_text(
        "[profile smaht-prod]\n"
        f"role_arn = {PROD_PROFILE_ROLE}\n\n"
        "[profile smaht-devtest]\n"
        f"role_arn = {DEVTEST_PROFILE_ROLE}\n")
    monkeypatch.setenv("AWS_DEFAULT_REGION", REGION)
    runner = Runner(tmp_path)
    code, _ = runner.main(
        interactive_argv(tmp_path, "run"),
        answers=INTERACTIVE_ANSWERS + HAPPY_ANSWERS)
    assert code == 0, runner.text()
    assert runner.manifest().data["config"]["region"] == REGION


def test_interactive_on_resume_resolves_nothing(tmp_path):
    runner = Runner(tmp_path)
    runner.main(base_argv(tmp_path), answers=["n"])  # halt at the first confirmation
    code, prompter = runner.main(
        ["resume", "--operation-id", "op-1", "--state-dir", str(tmp_path / "state"),
         "--interactive"], answers=HAPPY_ANSWERS)
    assert code == 0, runner.text()
    assert "nothing for --interactive to resolve" in runner.text()
    assert not any(p.startswith("Value") for p in prompter.prompts)


# ---------------------------------------------------------------------------------
# Config validation
# ---------------------------------------------------------------------------------

def test_identical_accounts_or_profiles_rejected():
    with pytest.raises(SafetyViolation, match="must differ"):
        make_config(devtest_account_id=PROD_ACCOUNT).validate()
    with pytest.raises(SafetyViolation, match="one credential context"):
        make_config(devtest_profile="smaht-prod").validate()


def test_new_db_identifier_may_not_collide():
    with pytest.raises(SafetyViolation, match="brand-new"):
        make_config(new_db_identifier=PROTECTED_DB).validate()
    with pytest.raises(SafetyViolation, match="brand-new"):
        make_config(new_db_identifier=SOURCE_DB).validate()


def test_missing_required_config_is_listed():
    with pytest.raises(SafetyViolation, match="devtest_identity_secret"):
        make_config(devtest_identity_secret="").validate()


def test_both_kms_keys_are_required_without_interactive_discovery():
    with pytest.raises(SafetyViolation, match="devtest_kms_key_id"):
        make_config(devtest_kms_key_id="").validate()
    with pytest.raises(SafetyViolation, match="production_kms_key_id"):
        make_config(production_kms_key_id="").validate()


def test_run_requires_all_config_before_creating_anything(tmp_path):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path, new_db_identifier=None), answers=[])
    assert code == 2
    assert "new_db_identifier" in runner.text()
    assert runner.aws.calls == []
    assert not (tmp_path / "state").exists()  # no manifest for an invalid run


def test_noninteractive_requires_explicit_kms_keys_without_health_calls(tmp_path):
    output = []
    health_calls = []

    def health_discoverer(url):
        health_calls.append(url)
        raise AssertionError("non-interactive mode must not discover health")

    code = main(base_argv(tmp_path, production_kms_key_id=None, devtest_kms_key_id=None),
                client_factory_builder=explosive_factory_builder,
                health_discoverer=health_discoverer, emit=output.append)
    assert code == 2
    assert "production_kms_key_id" in output[0]
    assert "devtest_kms_key_id" in output[0]
    assert health_calls == []


def test_invalid_operation_id_fails_without_manifest(tmp_path):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path, operation_id="../escape"), answers=[])
    assert code == 2
    assert "operation_id" in runner.text()
    assert runner.aws.calls == []
    assert not (tmp_path / "escape.json").exists()
