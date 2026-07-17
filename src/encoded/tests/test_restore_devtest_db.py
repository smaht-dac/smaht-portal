"""Tests for the restore-devtest-db command.

Every external boundary is mocked: AWS (STS/RDS/KMS/Secrets Manager/ECS/SQS) is an
in-memory fake injected through the command's client-factory seam, prompts are
scripted, sleeps are no-ops, and manifests live in pytest tmp dirs. No test here
contacts AWS or any deployed environment, and one test actively booby-traps boto3
to prove it.

The fake ECS client implements no service APIs at all (in-place database swap), and
the fake RDS client implements no delete APIs, so any attempted service mutation or
deletion fails loudly with AttributeError.
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
ENV_NAME = "smaht-devtest"
CLUSTER_ARN = (f"arn:aws:ecs:{REGION}:{DEVTEST_ACCOUNT}:cluster/"
               f"c4-ecs-smaht-devtest-stack-SmahtDevtestCluster-A1B2")
OTHER_CLUSTER_ARN = (f"arn:aws:ecs:{REGION}:{DEVTEST_ACCOUNT}:cluster/"
                     f"c4-ecs-smaht-wolf-stack-SmahtWolfCluster-C3D4")
DEPLOYMENT_TASK_FAMILY = "c4-ecs-smaht-devtest-stack-DeploymentTaskDefinition"
INITIAL_DEPLOYMENT_TASK_FAMILY = "c4-ecs-smaht-devtest-stack-InitialDeploymentTaskDefinition"
OTHER_ENV_TASK_FAMILY = "c4-ecs-smaht-wolf-stack-DeploymentTaskDefinition"
DEPLOYMENT_SUBNET = "subnet-0123456789abcdef0"
DEPLOYMENT_SECURITY_GROUP = "sg-0123456789abcdef0"
DB_SUBNET_GROUP = "smaht-devtest-db-subnet"
DB_SECURITY_GROUPS = ["sg-devtest-db"]
INDEXER_QUEUE_URLS = [
    f"https://sqs.{REGION}.amazonaws.com/{DEVTEST_ACCOUNT}/{ENV_NAME}{suffix}"
    for suffix in rdd.INDEXER_QUEUE_SUFFIXES
]
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
        self.grants = []
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
        self.clusters = [CLUSTER_ARN, OTHER_CLUSTER_ARN]
        self.task_families = [DEPLOYMENT_TASK_FAMILY, INITIAL_DEPLOYMENT_TASK_FAMILY,
                              OTHER_ENV_TASK_FAMILY]
        self.tasks = {}
        self.task_polls_until_stopped = 0
        self.forget_deployment_tasks = False
        self.deployment_enqueues = True
        self.deployment_exit_code = 0
        self.queue_names = {
            f"{ENV_NAME}{suffix}": url
            for suffix, url in zip(rdd.INDEXER_QUEUE_SUFFIXES, INDEXER_QUEUE_URLS)
        }
        self.queue_counts = {url: 0 for url in INDEXER_QUEUE_URLS}
        self.drain_queues = True

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

    def add_grant(self, operations=None, constraints=None):
        grant = {
            "GrantId": f"grant-{len(self.grants) + 1}",
            "GranteePrincipal": RESTORE_ROLE,
            "Operations": operations or list(rdd.KMS_GRANT_OPERATIONS),
        }
        if constraints:
            grant["Constraints"] = constraints
        self.grants.append(grant)

    def factory(self, service, scope):
        classes = {"sts": FakeSTS, "rds": FakeRDS, "kms": FakeKMS,
                   "secretsmanager": FakeSecrets, "ecs": FakeECS, "sqs": FakeSQS}
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
    # Deliberately NO delete_db_instance / delete_db_snapshot: the command must never
    # call them, and an attempt would fail loudly with AttributeError.

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
            if not any(g["GranteePrincipal"] == RESTORE_ROLE for g in self.aws.grants):
                raise AwsStubError("KMSKeyNotAccessibleFault")
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

    def stop_db_instance(self, DBInstanceIdentifier):
        self._record("stop_db_instance", DBInstanceIdentifier=DBInstanceIdentifier)
        self.aws.instances[self.scope][DBInstanceIdentifier]["DBInstanceStatus"] = "stopped"


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

    def list_grants(self, KeyId, GranteePrincipal=None):
        self._record("list_grants", KeyId=KeyId, GranteePrincipal=GranteePrincipal)
        grants = [dict(g) for g in self.aws.grants
                  if GranteePrincipal is None or g["GranteePrincipal"] == GranteePrincipal]
        return {"Grants": grants}

    def create_grant(self, KeyId, GranteePrincipal, Operations, Name, RetiringPrincipal):
        self._record("create_grant", KeyId=KeyId, GranteePrincipal=GranteePrincipal,
                     Operations=Operations, Name=Name, RetiringPrincipal=RetiringPrincipal)
        self.aws.add_grant(operations=list(Operations))
        return {"GrantId": self.aws.grants[-1]["GrantId"]}

    def revoke_grant(self, KeyId, GrantId):
        self._record("revoke_grant", KeyId=KeyId, GrantId=GrantId)
        self.aws.grants = [g for g in self.aws.grants if g.get("GrantId") != GrantId]


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


class FakeECS(FakeService):
    # Deliberately NO describe_services / update_service / list_services: this is an
    # in-place database swap, so any attempted ECS service inspection or mutation
    # fails loudly with AttributeError.

    def list_clusters(self, nextToken=None):
        self._record("list_clusters", nextToken=nextToken)
        return {"clusterArns": list(self.aws.clusters)}

    def list_task_definition_families(self, status, nextToken=None):
        self._record("list_task_definition_families", status=status, nextToken=nextToken)
        assert status == "ACTIVE"
        return {"families": list(self.aws.task_families)}

    def run_task(self, **kwargs):
        self._record("run_task", **kwargs)
        arn = (f"arn:aws:ecs:{REGION}:{DEVTEST_ACCOUNT}:task/{ENV_NAME}/"
               f"deployment-{len(self.aws.tasks) + 1}")
        self.aws.tasks[arn] = {
            "taskArn": arn,
            "lastStatus": ("RUNNING" if self.aws.task_polls_until_stopped else "STOPPED"),
            "polls_left": self.aws.task_polls_until_stopped,
            "containers": [{"name": "deployment", "exitCode": self.aws.deployment_exit_code}],
        }
        if self.aws.deployment_enqueues:
            for url in self.aws.queue_counts:
                self.aws.queue_counts[url] = 2
        return {"tasks": [dict(self.aws.tasks[arn])], "failures": []}

    def describe_tasks(self, cluster, tasks):
        self._record("describe_tasks", cluster=cluster, tasks=tasks)
        found = []
        for arn in tasks:
            task = self.aws.tasks.get(arn)
            if task is None or self.aws.forget_deployment_tasks:
                continue
            if task["polls_left"] > 0:
                task["polls_left"] -= 1
            else:
                task["lastStatus"] = "STOPPED"
            found.append(dict(task))
        failures = [{"arn": arn, "reason": "MISSING"} for arn in tasks
                    if not any(task["taskArn"] == arn for task in found)]
        return {"tasks": found, "failures": failures}


class FakeSQS(FakeService):
    def get_queue_url(self, QueueName):
        self._record("get_queue_url", QueueName=QueueName)
        url = self.aws.queue_names.get(QueueName)
        if url is None:
            raise AwsStubError("AWS.SimpleQueueService.NonExistentQueue")
        return {"QueueUrl": url}

    def get_queue_attributes(self, QueueUrl, AttributeNames):
        self._record("get_queue_attributes", QueueUrl=QueueUrl, AttributeNames=AttributeNames)
        count = self.aws.queue_counts[QueueUrl]
        if self.aws.drain_queues and count:
            self.aws.queue_counts[QueueUrl] = count - 1
        return {"Attributes": {
            "ApproximateNumberOfMessages": str(count),
            "ApproximateNumberOfMessagesNotVisible": "0",
        }}


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

# Confirmation order on a first-use run (no old DB): production snapshot (also covers
# the encrypted copy), KMS grant, share (typed account id), credentials (typed
# phrase), deployment.
HAPPY_ANSWERS_FIRST_USE = ["y", "y", DEVTEST_ACCOUNT, CREDENTIAL_CONFIRMATION_PHRASE, "y"]
# With a pre-existing grant there is no grant prompt.
HAPPY_ANSWERS_WITH_GRANT = ["y", DEVTEST_ACCOUNT, CREDENTIAL_CONFIRMATION_PHRASE, "y"]


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
        "--devtest-env-name": ENV_NAME,
        "--deployment-subnet": DEPLOYMENT_SUBNET,
        "--deployment-security-group": DEPLOYMENT_SECURITY_GROUP,
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
    if command == "run":
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

    def emit(self, message):
        self.output.append(str(message))

    def sleep(self, seconds):
        self.sleeps.append(seconds)

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
        devtest_env_name=ENV_NAME,
        deployment_subnet=DEPLOYMENT_SUBNET,
        deployment_security_group=DEPLOYMENT_SECURITY_GROUP,
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
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
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
    # the devtest default key.
    copies = runner.aws.calls_named("copy_db_snapshot")
    assert [c[0] for c in copies] == [PRODUCTION, DEVTEST]
    assert copies[0][3]["KmsKeyId"] == PROD_KMS_KEY
    assert copies[1][3]["KmsKeyId"] == rdd.DEFAULT_DEVTEST_KMS_KEY

    # First use: one narrow, unconstrained grant created, later revoked.
    (grant,) = runner.aws.calls_named("create_grant")
    assert grant[3]["GranteePrincipal"] == RESTORE_ROLE
    assert sorted(grant[3]["Operations"]) == sorted(rdd.KMS_GRANT_OPERATIONS)
    assert "Constraints" not in grant[3]
    assert len(runner.aws.calls_named("revoke_grant")) == 1
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
    assert restore[3]["DBInstanceClass"] == "db.t4g.medium"
    assert restore[3]["PubliclyAccessible"] is False
    assert restore[3]["DBSubnetGroupName"] == DB_SUBNET_GROUP
    assert restore[3]["VpcSecurityGroupIds"] == DB_SECURITY_GROUPS

    # Identity secret now points at the new endpoint with production credentials.
    devtest_identity = runner.aws.secrets[DEVTEST]["SmahtDevtestIdentity"]
    assert devtest_identity["RDS_HOSTNAME"] == "new-db.example.internal"
    assert devtest_identity["RDS_PASSWORD"] == SENTINEL_PASSWORD
    assert devtest_identity["ENCODED_VERSION"] == "1.2.3"  # unrelated keys preserved

    # In-place swap: the only ECS actions are read-only resolution plus one run_task.
    (run,) = runner.aws.calls_named("run_task")
    assert run[3]["cluster"] == CLUSTER_ARN
    assert run[3]["taskDefinition"] == DEPLOYMENT_TASK_FAMILY
    assert run[3]["networkConfiguration"] == {"awsvpcConfiguration": {
        "subnets": [DEPLOYMENT_SUBNET], "securityGroups": [DEPLOYMENT_SECURITY_GROUP]}}
    ecs_methods = {c[2] for c in runner.aws.calls if c[1] == "ecs"}
    assert ecs_methods == {"list_clusters", "list_task_definition_families",
                           "run_task", "describe_tasks"}
    assert manifest.get_resource("deployment_succeeded") is True
    assert manifest.get_resource("reindex_completed") is True

    # Nothing stopped (no old DB named), nothing deleted, protected untouched.
    assert runner.aws.calls_named("stop_db_instance") == []
    assert not any("delete" in c[2].lower() for c in runner.aws.calls)
    assert runner.aws.instances[DEVTEST][PROTECTED_DB]["DBInstanceStatus"] == "available"

    # STS verified exactly once per account scope.
    assert len(runner.aws.calls_named("get_caller_identity")) == 2


def test_existing_grant_is_reused_without_opt_in(tmp_path):
    aws = FakeAWS()
    aws.add_grant()  # pre-existing unconstrained grant (e.g. permanent, or unrevoked)
    runner = Runner(tmp_path, aws)
    code, _ = runner.main(base_argv(tmp_path), answers=HAPPY_ANSWERS_WITH_GRANT)
    assert code == 0, runner.text()
    assert aws.calls_named("create_grant") == []
    assert aws.calls_named("revoke_grant") == []  # not created by this tool: not revoked
    assert "no security-policy change needed" in runner.text()


def test_constrained_grant_is_not_treated_as_reusable(tmp_path):
    aws = FakeAWS()
    aws.add_grant(constraints={"EncryptionContextSubset": {"aws:rds:db-id": "db-x"}})
    runner = Runner(tmp_path, aws)
    code, _ = runner.main(base_argv(tmp_path), answers=["y"])
    assert code == 2
    assert "--allow-kms-grant" in runner.text()
    assert aws.calls_named("create_grant") == []


def test_kms_first_use_without_opt_in_fails_closed_then_resumes(tmp_path):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path), answers=["y"])
    assert code == 2
    assert "--allow-kms-grant" in runner.text()
    manifest = runner.manifest()
    assert manifest.data["status"] == "failed"
    assert "ensure_kms_grant" not in manifest.data["done"]
    assert "encrypt_snapshot_copy" in manifest.data["done"]

    code, _ = runner.main(
        resume_argv(tmp_path, "--allow-kms-grant"),
        answers=["y", DEVTEST_ACCOUNT, CREDENTIAL_CONFIRMATION_PHRASE, "y"])
    assert code == 0, runner.text()
    assert len(runner.aws.calls_named("create_db_snapshot")) == 1  # not re-created
    assert len(runner.aws.calls_named("create_grant")) == 1
    assert runner.manifest().data["status"] == "completed"


# ---------------------------------------------------------------------------------
# Confirmation boundaries: declining any of them halts without the mutation
# ---------------------------------------------------------------------------------

@pytest.mark.parametrize("answers,step,missing_call", [
    (["n"], "snapshot_production", "create_db_snapshot"),
    (["y", "n"], "ensure_kms_grant", "create_grant"),
    (["y", "y", "999999999999"], "share_snapshot_with_devtest",
     "modify_db_snapshot_attribute"),
    (["y", "y", DEVTEST_ACCOUNT, "wrong-phrase"], "update_identity_secret",
     "put_secret_value"),
    (["y", "y", DEVTEST_ACCOUNT, CREDENTIAL_CONFIRMATION_PHRASE, "n"],
     "run_deployment_and_reindex", "run_task"),
])
def test_declining_a_confirmation_halts_without_mutating(tmp_path, answers, step, missing_call):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True), answers=answers)
    assert code == 3, runner.text()
    assert runner.aws.calls_named(missing_call) == []
    manifest = runner.manifest()
    assert manifest.data["status"] == "declined"
    assert step not in manifest.data["done"]
    assert "resume --operation-id op-1" in runner.text()


def test_declining_stop_old_db_leaves_it_running(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.instances[DEVTEST][OLD_DB] = runner.aws._instance("available", db_id=OLD_DB)
    code, _ = runner.main(
        base_argv(tmp_path, allow_kms_grant=True, allow_stop_old_db=True,
                  old_db_identifier=OLD_DB),
        answers=HAPPY_ANSWERS_FIRST_USE + ["not-the-identifier"])
    assert code == 3
    assert runner.aws.calls_named("stop_db_instance") == []
    assert runner.aws.instances[DEVTEST][OLD_DB]["DBInstanceStatus"] == "available"


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
    assert "share_snapshot_with_devtest" in runner.manifest().data["done"]


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
    assert "expected 'expected-role'" in runner.text()
    assert not [c for c in runner.aws.calls if c[1] == "rds"]


def test_kms_key_must_be_customer_managed_in_production_account(tmp_path):
    aws = FakeAWS()
    aws.kms_account_override[PRODUCTION] = DEVTEST_ACCOUNT
    runner = Runner(tmp_path, aws)
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True), answers=["y"])
    assert code == 2
    assert "customer-managed" in runner.text()
    assert aws.calls_named("copy_db_snapshot") == []


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
    runner = Runner(tmp_path, FakeAWS(polls_until_available=10_000))
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True, poll_timeout=3),
                          answers=HAPPY_ANSWERS_FIRST_USE)
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
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 1
    manifest = runner.manifest()
    assert manifest.data["status"] == "failed"
    assert "InternalFailure" in manifest.data["error"]
    assert "resume" in runner.text()

    code, _ = runner.main(
        resume_argv(tmp_path),
        answers=[DEVTEST_ACCOUNT, CREDENTIAL_CONFIRMATION_PHRASE, "y"])
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
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 0, runner.text()
    assert "already exists; continuing" in runner.text()
    assert len(runner.aws.calls_named("create_db_snapshot")) == 1


def test_resume_of_completed_operation_is_a_noop(tmp_path):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 0
    calls_before = len(runner.aws.calls)
    code, _ = runner.main(resume_argv(tmp_path), answers=[])
    assert code == 0
    assert "already completed" in runner.text()
    assert len(runner.aws.calls) == calls_before


def test_keyboard_interrupt_leaves_checkpoint_and_resume_hint(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.fail_next[(PRODUCTION, "rds", "create_db_snapshot")] = KeyboardInterrupt()
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True), answers=["y"])
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
    code, prompter = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                                 answers=HAPPY_ANSWERS_FIRST_USE)
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
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 1
    assert SENTINEL_PASSWORD not in runner.text()
    assert SENTINEL_PASSWORD not in runner.manifest_text()


def test_missing_production_credential_key_fails_without_partial_write(tmp_path):
    runner = Runner(tmp_path)
    del runner.aws.secrets[PRODUCTION]["SmahtProductionIdentity"]["RDS_PASSWORD"]
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 1
    assert runner.aws.calls_named("put_secret_value") == []
    assert runner.aws.secrets[DEVTEST]["SmahtDevtestIdentity"]["RDS_PASSWORD"] == (
        DEVTEST_OLD_PASSWORD)


def test_manifest_refuses_secret_like_resource_keys(tmp_path):
    manifest = Manifest.create(tmp_path / "state", "op-x", make_config())
    with pytest.raises(SafetyViolation):
        manifest.set_resource("db_password", "boom")


# ---------------------------------------------------------------------------------
# Deployment / reindex (in-place database swap)
# ---------------------------------------------------------------------------------

def test_no_ecs_service_is_ever_touched(tmp_path):
    """The fakes implement no ECS service APIs, so a full run proves the command
    never describes, mutates, scales, or redeploys any ECS service."""
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 0, runner.text()
    assert not any("service" in c[2].lower() for c in runner.aws.calls)


def test_ambiguous_cluster_resolution_refuses_to_guess(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.clusters.append(
        f"arn:aws:ecs:{REGION}:{DEVTEST_ACCOUNT}:cluster/smaht-devtest-second")
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 1
    assert "Refusing to guess" in runner.text()
    assert runner.aws.calls_named("run_task") == []


def test_no_matching_cluster_fails_closed(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.clusters = [OTHER_CLUSTER_ARN]
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 1
    assert "ECS cluster" in runner.text()
    assert runner.aws.calls_named("run_task") == []


def test_initial_deployment_task_definition_is_never_selected(tmp_path):
    """The initial-deployment task definition wipes database/search contents; it must
    never satisfy deployment resolution, even as the only candidate."""
    runner = Runner(tmp_path)
    runner.aws.task_families = [INITIAL_DEPLOYMENT_TASK_FAMILY, OTHER_ENV_TASK_FAMILY]
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 1
    assert "deployment task definition family" in runner.text()
    assert runner.aws.calls_named("run_task") == []


def test_missing_indexing_queue_fails_with_guidance(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.queue_names.pop(f"{ENV_NAME}-secondary-indexer-queue")
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 1
    assert "was not found in the devtest account" in runner.text()
    assert runner.aws.calls_named("run_task") == []


def test_resolved_queue_url_in_wrong_account_is_refused(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.queue_names[f"{ENV_NAME}-indexer-queue"] = (
        f"https://sqs.{REGION}.amazonaws.com/{PROD_ACCOUNT}/{ENV_NAME}-indexer-queue")
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 2
    assert "refusing to poll" in runner.text()
    assert runner.aws.calls_named("run_task") == []


def test_deployment_task_failure_blocks_old_db_stop_and_reruns_on_resume(tmp_path):
    aws = FakeAWS()
    aws.deployment_exit_code = 17
    aws.instances[DEVTEST][OLD_DB] = aws._instance("available", db_id=OLD_DB)
    runner = Runner(tmp_path, aws)
    code, _ = runner.main(
        base_argv(tmp_path, allow_kms_grant=True, allow_stop_old_db=True,
                  old_db_identifier=OLD_DB),
        answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 1
    manifest = runner.manifest()
    assert manifest.get_resource("deployment_succeeded") is None
    # The failed task pointer is cleared so resume runs a fresh confirmed task.
    assert manifest.get_resource("deployment_task_arn") == ""
    assert aws.calls_named("stop_db_instance") == []
    assert "investigate its logs" in runner.text()

    aws.deployment_exit_code = 0
    code, _ = runner.main(resume_argv(tmp_path, "--allow-stop-old-db"),
                          answers=["y", OLD_DB])
    assert code == 0, runner.text()
    assert len(aws.calls_named("run_task")) == 2
    assert runner.manifest().get_resource("reindex_completed") is True


def test_completion_does_not_require_observing_reindex_enqueue(tmp_path):
    """Regression: completion must never depend on catching the reindex enqueue
    spike. With queues that never show work, the drain gate passes instead of
    deadlocking on an observation that will never happen."""
    aws = FakeAWS()
    aws.deployment_enqueues = False
    runner = Runner(tmp_path, aws)
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 0, runner.text()
    assert runner.manifest().get_resource("reindex_completed") is True


def test_resume_after_deployment_success_verifies_without_second_run(tmp_path):
    """Regression: a resume arriving after the deployment succeeded and the queues
    already drained completes from the durable checkpoint without a second task."""
    aws = FakeAWS()
    runner = Runner(tmp_path, aws)
    aws.fail_next[(DEVTEST, "sqs", "get_queue_attributes")] = AwsStubError("InternalError")
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 1
    manifest = runner.manifest()
    assert manifest.get_resource("deployment_succeeded") is True
    assert manifest.get_resource("reindex_completed") is None

    for url in aws.queue_counts:  # queues drained while the operator was away
        aws.queue_counts[url] = 0
    code, _ = runner.main(resume_argv(tmp_path), answers=[])
    assert code == 0, runner.text()
    assert len(aws.calls_named("run_task")) == 1  # never re-run
    assert runner.manifest().get_resource("reindex_completed") is True


def test_vanished_deployment_task_requires_confirmed_rerun(tmp_path):
    """A recorded task that can no longer be described cannot be verified, so resume
    runs a fresh task after a fresh confirmation instead of assuming success."""
    aws = FakeAWS()
    runner = Runner(tmp_path, aws)
    aws.fail_next[(DEVTEST, "ecs", "describe_tasks")] = AwsStubError("InternalError")
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 1
    assert runner.manifest().get_resource("deployment_task_arn")
    assert runner.manifest().get_resource("deployment_succeeded") is None

    # ECS forgot the first task; the second (new) one is remembered.
    aws.tasks.clear()
    code, _ = runner.main(resume_argv(tmp_path), answers=["y"])
    assert code == 0, runner.text()
    assert "can no longer be described" in runner.text()
    assert len(aws.calls_named("run_task")) == 2


def test_indexing_queues_must_drain_before_old_db_stop(tmp_path):
    """The absolute drain gate blocks the old-DB stop while work remains, is bounded
    by --reindex-timeout, and passes on resume once the queues drain -- without a
    second deployment task. The manifest timeout may be edited before resuming."""
    aws = FakeAWS()
    aws.drain_queues = False
    aws.instances[DEVTEST][OLD_DB] = aws._instance("available", db_id=OLD_DB)
    runner = Runner(tmp_path, aws)
    code, _ = runner.main(
        base_argv(tmp_path, allow_kms_grant=True, allow_stop_old_db=True,
                  old_db_identifier=OLD_DB, reindex_timeout=2),
        answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 1
    assert "devtest indexing queues" in runner.text()
    assert aws.calls_named("stop_db_instance") == []
    assert runner.manifest().get_resource("deployment_succeeded") is True

    manifest = runner.manifest()
    manifest.data["config"]["reindex_timeout"] = 600  # operator extends the bound
    manifest.save()
    aws.drain_queues = True
    code, _ = runner.main(resume_argv(tmp_path, "--allow-stop-old-db"),
                          answers=[OLD_DB])
    assert code == 0, runner.text()
    assert len(aws.calls_named("run_task")) == 1
    assert aws.instances[DEVTEST][OLD_DB]["DBInstanceStatus"] == "stopped"


# ---------------------------------------------------------------------------------
# Protected original vs replaceable old database
# ---------------------------------------------------------------------------------

def test_old_db_stopped_only_with_opt_in_and_typed_confirmation(tmp_path):
    aws = FakeAWS()
    aws.instances[DEVTEST][OLD_DB] = aws._instance("available", db_id=OLD_DB)
    runner = Runner(tmp_path, aws)
    # Without the opt-in flag the final step fails closed and the DB keeps running.
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True,
                                    old_db_identifier=OLD_DB),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 2
    assert "--allow-stop-old-db" in runner.text()
    assert aws.instances[DEVTEST][OLD_DB]["DBInstanceStatus"] == "available"

    # Resume with the opt-in and the typed identifier: stopped, never deleted.
    code, _ = runner.main(resume_argv(tmp_path, "--allow-stop-old-db"), answers=[OLD_DB])
    assert code == 0, runner.text()
    assert aws.instances[DEVTEST][OLD_DB]["DBInstanceStatus"] == "stopped"
    assert not any("delete" in c[2].lower() for c in aws.calls)
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
    aws = FakeAWS()
    config = make_config(old_db_identifier=PROTECTED_DB, allow_stop_old_db=True)
    manifest = Manifest.create(tmp_path / "state", "op-x", config)
    manifest.set_resource("reindex_completed", True)
    orchestrator = RestoreOrchestrator(
        config, manifest, aws.factory, Prompter(input_fn=lambda _: PROTECTED_DB),
        emit=lambda _: None, sleep_fn=lambda _: None)
    with pytest.raises(SafetyViolation, match="never stops"):
        orchestrator.step_stop_old_database()
    assert aws.calls_named("stop_db_instance") == []


def test_already_stopped_old_db_is_left_alone(tmp_path):
    aws = FakeAWS()
    aws.instances[DEVTEST][OLD_DB] = aws._instance("stopped", db_id=OLD_DB)
    runner = Runner(tmp_path, aws)
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True,
                                    allow_stop_old_db=True, old_db_identifier=OLD_DB),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 0, runner.text()
    assert aws.calls_named("stop_db_instance") == []
    assert "already stopped" in runner.text()


def test_missing_protected_db_refuses_placement_inference(tmp_path):
    aws = FakeAWS()
    del aws.instances[DEVTEST][PROTECTED_DB]
    runner = Runner(tmp_path, aws)
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
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
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
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
    with pytest.raises(SafetyViolation, match="devtest_env_name"):
        make_config(devtest_env_name="").validate()


def test_restore_role_must_be_in_devtest_account():
    with pytest.raises(SafetyViolation, match="devtest_restore_role_arn"):
        make_config(devtest_restore_role_arn=(
            f"arn:aws:iam::{PROD_ACCOUNT}:role/wrong-account")).validate()


def test_run_requires_all_config_before_creating_anything(tmp_path):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path, new_db_identifier=None), answers=[])
    assert code == 2
    assert "new_db_identifier" in runner.text()
    assert runner.aws.calls == []
    assert not (tmp_path / "state").exists()  # no manifest for an invalid run


def test_invalid_operation_id_fails_without_manifest(tmp_path):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path, operation_id="../escape"), answers=[])
    assert code == 2
    assert "operation_id" in runner.text()
    assert runner.aws.calls == []
    assert not (tmp_path / "escape.json").exists()
