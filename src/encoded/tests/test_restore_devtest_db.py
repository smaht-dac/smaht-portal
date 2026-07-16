"""Tests for the restore-devtest-db command.

Every external boundary is mocked: AWS (STS/RDS/KMS/Secrets Manager/ECS/SQS) is an
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
    OperationLock,
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
DEPLOYMENT_SERVICE = "deployment"
PORTAL_SERVICE = "portal"
INDEXER_SERVICE = "indexer"
INGESTER_SERVICE = "ingester"
DB_SUBNET_GROUP = "smaht-devtest-db-subnet"
DB_SECURITY_GROUPS = ["sg-devtest-db"]
INDEXER_QUEUE_URLS = ["https://sqs.us-east-1.amazonaws.com/222222222222/index-primary",
                      "https://sqs.us-east-1.amazonaws.com/222222222222/index-secondary"]
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
            PRODUCTION: {SOURCE_DB: self._instance("available", db_id=SOURCE_DB)},
            DEVTEST: {PROTECTED_DB: self._instance("available", db_id=PROTECTED_DB)},
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
        self.secret_versions = {
            PRODUCTION: {"SmahtProductionIdentity": "prod-v1"},
            DEVTEST: {"SmahtDevtestIdentity": "dev-v1"},
        }
        self.services = {CLUSTER: {
            name: self._service(name, 1 if name != DEPLOYMENT_SERVICE else 0)
            for name in (DEPLOYMENT_SERVICE, PORTAL_SERVICE, INDEXER_SERVICE, INGESTER_SERVICE)
        }}
        self.tasks = {}
        self.queue_counts = {url: {"waiting": 0, "inflight": 0}
                             for url in INDEXER_QUEUE_URLS}
        self.indexer_running = True
        self.drain_queues = True
        self.deployment_enqueues = True
        self.deployment_exit_code = 0
        self.grant_page_size = 0
        self.kms_account_override = {}
        self.fail_after_secret_put = None
        self.concurrent_devtest_secret_read = False
        self.devtest_secret_reads = 0

    def _instance(self, status, polls_left=0, db_id=NEW_DB, tags=None):
        return {
            "DBInstanceIdentifier": db_id,
            "DBInstanceStatus": status,
            "polls_left": polls_left,
            "Endpoint": {"Address": "new-db.example.internal", "Port": 5432},
            "DbiResourceId": f"db-resource-{db_id}",
            "DBInstanceClass": "db.t4g.medium",
            "PubliclyAccessible": False,
            "DBSubnetGroup": {"DBSubnetGroupName": DB_SUBNET_GROUP},
            "VpcSecurityGroups": [
                {"VpcSecurityGroupId": group} for group in DB_SECURITY_GROUPS
            ],
            "TagList": list(tags or []),
        }

    def _service(self, name, desired):
        return {
            "serviceName": name,
            "serviceArn": f"arn:aws:ecs:{REGION}:{DEVTEST_ACCOUNT}:service/{CLUSTER}/{name}",
            "taskDefinition": f"arn:aws:ecs:{REGION}:{DEVTEST_ACCOUNT}:task-definition/{name}:1",
            "desiredCount": desired,
            "runningCount": desired,
            "pendingCount": 0,
            "launchType": "FARGATE",
            "platformVersion": "1.4.0",
            "networkConfiguration": {"awsvpcConfiguration": {
                "subnets": ["subnet-devtest"],
                "securityGroups": ["sg-ecs"],
                "assignPublicIp": "DISABLED",
            }},
            "deployments": [{"status": "PRIMARY", "rolloutState": "COMPLETED"}],
        }

    def add_grant(self, operations=None):
        self.grants.append({
            "GrantId": f"grant-{len(self.grants) + 1}",
            "GranteePrincipal": RESTORE_ROLE,
            "Operations": operations or list(rdd.KMS_GRANT_OPERATIONS),
            "Constraints": {"EncryptionContextSubset": {
                "aws:rds:db-id": f"db-resource-{SOURCE_DB}",
            }},
        })

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
            "DBInstanceIdentifier": DBInstanceIdentifier,
            "Status": "creating", "polls_left": self.aws.polls_until_available,
            "shared": set(),
            "TagList": list(Tags),
            "Encrypted": True,
            "KmsKeyId": f"arn:aws:kms:{REGION}:{PROD_ACCOUNT}:key/aws-rds",
            "DbiResourceId": self.aws.instances[self.scope][DBInstanceIdentifier]["DbiResourceId"],
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
            source = self._snapshots()[SourceDBSnapshotIdentifier]
        self._snapshots()[TargetDBSnapshotIdentifier] = {
            "DBSnapshotIdentifier": TargetDBSnapshotIdentifier,
            "DBInstanceIdentifier": source["DBInstanceIdentifier"],
            "Status": "creating", "polls_left": self.aws.polls_until_available,
            "shared": set(),
            "TagList": list(Tags),
            "Encrypted": True,
            "KmsKeyId": KmsKeyId,
            "SourceDBSnapshotIdentifier": SourceDBSnapshotIdentifier,
            "DbiResourceId": source["DbiResourceId"],
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
            "creating", polls_left=self.aws.polls_until_available, db_id=db_id,
            tags=kwargs["Tags"])
        instance = self.aws.instances[self.scope][db_id]
        instance["DBInstanceClass"] = kwargs["DBInstanceClass"]
        instance["PubliclyAccessible"] = kwargs["PubliclyAccessible"]
        instance["DBSubnetGroup"] = {"DBSubnetGroupName": kwargs["DBSubnetGroupName"]}
        instance["VpcSecurityGroups"] = [
            {"VpcSecurityGroupId": group} for group in kwargs["VpcSecurityGroupIds"]
        ]

    def stop_db_instance(self, DBInstanceIdentifier):
        self._record("stop_db_instance", DBInstanceIdentifier=DBInstanceIdentifier)
        self.aws.instances[self.scope][DBInstanceIdentifier]["DBInstanceStatus"] = "stopped"

    # NOTE: deliberately no delete_db_instance / delete_db_snapshot: the command
    # must never call them, and an attempt would fail loudly with AttributeError.


class FakeKMS(FakeService):
    def describe_key(self, KeyId):
        self._record("describe_key", KeyId=KeyId)
        account = self.aws.kms_account_override.get(
            self.scope, PROD_ACCOUNT if self.scope == PRODUCTION else DEVTEST_ACCOUNT)
        manager = "CUSTOMER" if self.scope == PRODUCTION else "AWS"
        suffix = "1234" if self.scope == PRODUCTION else "aws-rds"
        return {"KeyMetadata": {
            "AWSAccountId": account,
            "Arn": f"arn:aws:kms:{REGION}:{account}:key/{suffix}",
            "KeyState": "Enabled",
            "KeyUsage": "ENCRYPT_DECRYPT",
            "KeySpec": "SYMMETRIC_DEFAULT",
            "KeyManager": manager,
        }}

    def list_grants(self, KeyId, GranteePrincipal=None, Marker=None):
        self._record("list_grants", KeyId=KeyId, GranteePrincipal=GranteePrincipal,
                     Marker=Marker)
        grants = [dict(g) for g in self.aws.grants
                  if GranteePrincipal is None or g["GranteePrincipal"] == GranteePrincipal]
        if self.aws.grant_page_size:
            start = int(Marker or 0)
            stop = start + self.aws.grant_page_size
            return {
                "Grants": grants[start:stop],
                "Truncated": stop < len(grants),
                "NextMarker": str(stop) if stop < len(grants) else None,
            }
        return {"Grants": grants, "Truncated": False}

    def create_grant(self, KeyId, GranteePrincipal, Operations, Name,
                     Constraints, RetiringPrincipal):
        self._record("create_grant", KeyId=KeyId, GranteePrincipal=GranteePrincipal,
                     Operations=Operations, Name=Name, Constraints=Constraints,
                     RetiringPrincipal=RetiringPrincipal)
        self.aws.add_grant(operations=list(Operations))
        self.aws.grants[-1]["Constraints"] = Constraints
        self.aws.grants[-1]["Name"] = Name
        return {"GrantId": self.aws.grants[-1]["GrantId"]}

    def revoke_grant(self, KeyId, GrantId):
        self._record("revoke_grant", KeyId=KeyId, GrantId=GrantId)
        self.aws.grants = [grant for grant in self.aws.grants
                           if grant.get("GrantId") != GrantId]


class FakeSecrets(FakeService):
    def get_secret_value(self, SecretId, VersionId=None):
        self._record("get_secret_value", SecretId=SecretId, VersionId=VersionId)
        if self.scope == DEVTEST and VersionId is None:
            self.aws.devtest_secret_reads += 1
            if (self.aws.concurrent_devtest_secret_read
                    and self.aws.devtest_secret_reads == 2):
                self.aws.secret_versions[DEVTEST][SecretId] = "concurrent-version"
                self.aws.secrets[DEVTEST][SecretId]["ENCODED_VERSION"] = "concurrent"
        current = self.aws.secret_versions[self.scope][SecretId]
        if VersionId is not None:
            assert VersionId == current
        return {"SecretString": json.dumps(self.aws.secrets[self.scope][SecretId]),
                "VersionId": current}

    def put_secret_value(self, SecretId, SecretString, ClientRequestToken):
        # Never record the SecretString payload: the calls list is assertable output.
        self._record("put_secret_value", SecretId=SecretId,
                     ClientRequestToken=ClientRequestToken)
        self.aws.secrets[self.scope][SecretId] = json.loads(SecretString)
        self.aws.secret_versions[self.scope][SecretId] = ClientRequestToken
        if self.aws.fail_after_secret_put:
            raise self.aws.fail_after_secret_put
        return {"VersionId": ClientRequestToken}


class FakeECS(FakeService):
    def describe_services(self, cluster, services):
        self._record("describe_services", cluster=cluster, services=services)
        known = self.aws.services.get(cluster, {})
        return {
            "services": [dict(known[name]) for name in services if name in known],
            "failures": [{"arn": name} for name in services if name not in known],
        }

    def update_service(self, **kwargs):
        self._record("update_service", **kwargs)
        service = self.aws.services[kwargs["cluster"]][kwargs["service"]]
        if "desiredCount" in kwargs:
            service["desiredCount"] = kwargs["desiredCount"]
            service["runningCount"] = kwargs["desiredCount"]
        service["pendingCount"] = 0
        service["deployments"] = [{"status": "PRIMARY", "rolloutState": "COMPLETED"}]
        if kwargs["service"] == INDEXER_SERVICE:
            self.aws.indexer_running = service["desiredCount"] > 0
        return {"service": dict(service)}

    def list_tasks(self, cluster, startedBy, desiredStatus, nextToken=None):
        self._record("list_tasks", cluster=cluster, startedBy=startedBy,
                     desiredStatus=desiredStatus, nextToken=nextToken)
        tasks = [arn for arn, task in self.aws.tasks.items()
                 if task["startedBy"] == startedBy and task["lastStatus"] == desiredStatus]
        return {"taskArns": tasks}

    def run_task(self, **kwargs):
        self._record("run_task", **kwargs)
        arn = f"arn:aws:ecs:{REGION}:{DEVTEST_ACCOUNT}:task/{CLUSTER}/deployment-1"
        self.aws.tasks[arn] = {
            "taskArn": arn,
            "startedBy": kwargs["startedBy"],
            "lastStatus": "STOPPED",
            "containers": [{"name": "deployment", "exitCode": self.aws.deployment_exit_code}],
        }
        if self.aws.deployment_enqueues:
            for counts in self.aws.queue_counts.values():
                counts["waiting"] = 2
        return {"tasks": [dict(self.aws.tasks[arn])], "failures": []}

    def describe_tasks(self, cluster, tasks):
        self._record("describe_tasks", cluster=cluster, tasks=tasks)
        return {"tasks": [dict(self.aws.tasks[arn]) for arn in tasks if arn in self.aws.tasks],
                "failures": []}


class FakeSQS(FakeService):
    def get_queue_attributes(self, QueueUrl, AttributeNames):
        self._record("get_queue_attributes", QueueUrl=QueueUrl,
                     AttributeNames=AttributeNames)
        counts = self.aws.queue_counts[QueueUrl]
        result = dict(counts)
        if self.aws.indexer_running and self.aws.drain_queues and counts["waiting"]:
            counts["waiting"] -= 1
        return {"Attributes": {
            "ApproximateNumberOfMessages": str(result["waiting"]),
            "ApproximateNumberOfMessagesNotVisible": str(result["inflight"]),
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
        "--deployment-service-name": DEPLOYMENT_SERVICE,
        "--portal-service-name": PORTAL_SERVICE,
        "--ingester-service-name": INGESTER_SERVICE,
        "--indexer-service-name": INDEXER_SERVICE,
        "--db-subnet-group": DB_SUBNET_GROUP,
        "--vpc-security-group-id": DB_SECURITY_GROUPS[0],
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
    for queue_url in INDEXER_QUEUE_URLS:
        argv += ["--indexer-queue-url", queue_url]
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
        deployment_service_name=DEPLOYMENT_SERVICE,
        portal_service_name=PORTAL_SERVICE,
        ingester_service_name=INGESTER_SERVICE,
        indexer_service_name=INDEXER_SERVICE,
        indexer_queue_urls=list(INDEXER_QUEUE_URLS),
        new_db_identifier=NEW_DB,
        db_subnet_group=DB_SUBNET_GROUP,
        vpc_security_group_ids=list(DB_SECURITY_GROUPS),
        poll_interval=1,
        poll_timeout=10,
    )
    defaults.update(overrides)
    return RestoreConfig(**defaults)


def prior_restore_tags():
    return [
        {"Key": rdd.OPERATION_TAG_KEY, "Value": "prior-restore"},
        {"Key": rdd.CONFIG_TAG_KEY, "Value": "a" * 64},
    ]


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
    assert copies[1][3]["KmsKeyId"] == (
        f"arn:aws:kms:{REGION}:{DEVTEST_ACCOUNT}:key/aws-rds")

    # First use: exactly one grant created for the restore role.
    (grant,) = runner.aws.calls_named("create_grant")
    assert grant[3]["GranteePrincipal"] == RESTORE_ROLE
    assert grant[3]["KeyId"] == PROD_KMS_KEY
    assert grant[3]["RetiringPrincipal"] == RESTORE_ROLE
    assert grant[3]["Constraints"] == {"EncryptionContextSubset": {
        "aws:rds:db-id": f"db-resource-{SOURCE_DB}",
    }}

    # Shared with the devtest account only.
    (share,) = [call for call in runner.aws.calls_named("modify_db_snapshot_attribute")
                if call[3]["ValuesToAdd"]]
    assert share[3]["ValuesToAdd"] == [DEVTEST_ACCOUNT]

    # Restore lands in devtest at the documented starting size, not public.
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

    # Indexer scaled to the default 16; every service redeployed.
    updates = runner.aws.calls_named("update_service")
    indexer_updates = [u for u in updates if u[3]["service"] == INDEXER_SERVICE]
    assert [update[3]["desiredCount"] for update in indexer_updates] == [0, 16]
    assert len(updates) == 4
    assert [update[3]["service"] for update in updates] == [
        INDEXER_SERVICE, PORTAL_SERVICE, INGESTER_SERVICE, INDEXER_SERVICE,
    ]
    assert len(runner.aws.calls_named("run_task")) == 1
    assert manifest.get_resource("reindex_completed") is True
    assert len(runner.aws.calls_named("revoke_grant")) == 1
    (unshare,) = [call for call in runner.aws.calls_named("modify_db_snapshot_attribute")
                  if call[3]["ValuesToRemove"]]
    assert unshare[3]["ValuesToRemove"] == [DEVTEST_ACCOUNT]

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
    runner.aws.instances[DEVTEST][OLD_DB] = runner.aws._instance(
        "available", db_id=OLD_DB, tags=prior_restore_tags())
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
    assert "expected exact role" in runner.text()
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


def test_cross_account_copy_retries_bounded_kms_propagation_error(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.fail_next[(DEVTEST, "rds", "copy_db_snapshot")] = (
        AwsStubError("KMSKeyNotAccessibleFault"))
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 0, runner.text()
    devtest_copies = [call for call in runner.aws.calls_named("copy_db_snapshot")
                      if call[0] == DEVTEST]
    assert len(devtest_copies) == 2
    assert runner.sleeps


def test_create_snapshot_concurrent_name_collision_is_not_adopted(tmp_path):
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
    assert code == 2
    assert "refusing unverified adoption" in runner.text()


def test_resume_adopts_only_snapshot_owned_by_operation(tmp_path):
    runner = Runner(tmp_path)
    config = make_config()
    manifest = Manifest.create(tmp_path / "state", "op-1", config)
    manifest.mark_step("create_production_snapshot", "failed", "interrupted")
    snapshot_id = f"{SOURCE_DB}-devtest-restore-op-1"
    runner.aws.snapshots[PRODUCTION][snapshot_id] = {
        "DBSnapshotIdentifier": snapshot_id,
        "DBInstanceIdentifier": SOURCE_DB,
        "Status": "available",
        "polls_left": 0,
        "shared": set(),
        "Encrypted": True,
        "KmsKeyId": f"arn:aws:kms:{REGION}:{PROD_ACCOUNT}:key/aws-rds",
        "DbiResourceId": runner.aws.instances[PRODUCTION][SOURCE_DB]["DbiResourceId"],
        "TagList": [
            {"Key": rdd.OPERATION_TAG_KEY, "Value": "op-1"},
            {"Key": rdd.CONFIG_TAG_KEY, "Value": config.fingerprint()},
        ],
    }
    code, _ = runner.main(
        ["resume", "--operation-id", "op-1", "--state-dir", str(tmp_path / "state"),
         "--allow-kms-grant"],
        answers=HAPPY_ANSWERS_FIRST_USE[1:],
    )
    assert code == 0, runner.text()
    assert "verified provenance; adopting" in runner.text()


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
    assert runner.manifest().cancel_requested_on_disk() is True

    code, _ = runner.main(
        ["resume", "--operation-id", "op-1", "--state-dir", state_dir,
         "--allow-kms-grant"],
        answers=["y"] + HAPPY_ANSWERS_FIRST_USE)
    assert code == 0, runner.text()
    assert runner.manifest().data["cancel_requested"] is False
    assert runner.manifest().data["status"] == "completed"


def test_cancel_marker_survives_stale_manifest_save(tmp_path):
    config = make_config()
    active = Manifest.create(tmp_path / "state", "op-1", config)
    stale = Manifest.load(tmp_path / "state", "op-1")
    active.request_cancel()
    stale.set_status("in_progress")
    assert stale.cancel_requested_on_disk() is True


def test_keyboard_interrupt_is_checkpointed_for_provenance_safe_resume(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.fail_next[(PRODUCTION, "rds", "create_db_snapshot")] = KeyboardInterrupt()
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True), answers=["y"])
    assert code == 130
    assert runner.manifest().data["status"] == "interrupted"
    assert runner.manifest().step_status("create_production_snapshot") == "interrupted"
    assert "resume --operation-id op-1" in runner.text()


def test_state_directory_lock_refuses_a_different_concurrent_operation(tmp_path):
    state_dir = tmp_path / "state"
    first = Manifest.create(state_dir, "op-1", make_config())
    runner = Runner(tmp_path)
    with OperationLock(first):
        code, _ = runner.main(
            base_argv(tmp_path, operation_id="op-2", allow_kms_grant=True), answers=[])
    assert code == 2
    assert "concurrent mutation" in runner.text()
    assert runner.aws.calls == []


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


def test_secret_read_exception_text_is_never_exposed(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.fail_next[(PRODUCTION, "secretsmanager", "get_secret_value")] = (
        RuntimeError(f"provider echoed {SENTINEL_PASSWORD}"))
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True), answers=[])
    assert code == 1
    assert SENTINEL_PASSWORD not in runner.text()
    assert SENTINEL_PASSWORD not in runner.manifest_text()


def test_secret_write_failure_is_redacted_and_resume_adopts_owned_version(tmp_path):
    aws = FakeAWS()
    aws.fail_after_secret_put = RuntimeError(f"transport included {SENTINEL_PASSWORD}")
    runner = Runner(tmp_path, aws)
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 1
    assert SENTINEL_PASSWORD not in runner.text()
    assert SENTINEL_PASSWORD not in runner.manifest_text()
    assert runner.manifest().step_status("update_identity_secret") == "failed"

    runner.output.clear()
    code, _ = runner.main(
        ["resume", "--operation-id", "op-1", "--state-dir", str(tmp_path / "state")],
        answers=["y"],
    )
    assert code == 0, runner.text()
    assert "verified version" in runner.text()
    assert len(aws.calls_named("put_secret_value")) == 1


def test_concurrent_devtest_secret_change_is_not_overwritten(tmp_path):
    aws = FakeAWS()
    aws.concurrent_devtest_secret_read = True
    runner = Runner(tmp_path, aws)
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 2
    assert "concurrent update" in runner.text()
    assert aws.calls_named("put_secret_value") == []


# ---------------------------------------------------------------------------------
# Reindex / indexer scaling
# ---------------------------------------------------------------------------------

def test_indexer_scaling_uses_configured_count(tmp_path):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True, indexer_count=32),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 0
    indexer_updates = [u for u in runner.aws.calls_named("update_service")
                       if u[3].get("service") == INDEXER_SERVICE]
    assert [update[3]["desiredCount"] for update in indexer_updates] == [0, 32]


@pytest.mark.parametrize("count", [0, -1, 65])
def test_indexer_count_out_of_bounds_is_rejected_before_any_call(tmp_path, count):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path, indexer_count=count), answers=[])
    assert code == 2
    assert "indexer_count" in runner.text()
    assert runner.aws.calls == []


def test_missing_configured_service_fails_without_updates(tmp_path):
    runner = Runner(tmp_path)
    del runner.aws.services[CLUSTER][INDEXER_SERVICE]
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 1
    assert "could not describe every configured" in runner.text()
    assert runner.aws.calls_named("update_service") == []


def test_deployment_task_failure_prevents_reindex_and_old_db_stop(tmp_path):
    aws = FakeAWS()
    aws.deployment_exit_code = 17
    aws.instances[DEVTEST][OLD_DB] = aws._instance("available", db_id=OLD_DB)
    runner = Runner(tmp_path, aws)
    code, _ = runner.main(
        base_argv(tmp_path, allow_kms_grant=True, allow_stop_old_db=True,
                  old_db_identifier=OLD_DB),
        answers=HAPPY_ANSWERS_FIRST_USE,
    )
    assert code == 1
    assert runner.manifest().get_resource("reindex_completed") is None
    assert aws.calls_named("stop_db_instance") == []
    assert [call[3]["service"] for call in aws.calls_named("update_service")] == [
        INDEXER_SERVICE,
    ]


def test_missing_reindex_work_times_out_before_old_db_stop(tmp_path):
    aws = FakeAWS()
    aws.deployment_enqueues = False
    aws.instances[DEVTEST][OLD_DB] = aws._instance("available", db_id=OLD_DB)
    runner = Runner(tmp_path, aws)
    code, _ = runner.main(
        base_argv(tmp_path, allow_kms_grant=True, allow_stop_old_db=True,
                  old_db_identifier=OLD_DB, poll_timeout=2),
        answers=HAPPY_ANSWERS_FIRST_USE,
    )
    assert code == 1
    assert "deployment-generated indexing work" in runner.text()
    assert aws.calls_named("stop_db_instance") == []


def test_indexing_queues_must_drain_before_old_db_stop(tmp_path):
    aws = FakeAWS()
    aws.drain_queues = False
    aws.instances[DEVTEST][OLD_DB] = aws._instance("available", db_id=OLD_DB)
    runner = Runner(tmp_path, aws)
    code, _ = runner.main(
        base_argv(tmp_path, allow_kms_grant=True, allow_stop_old_db=True,
                  old_db_identifier=OLD_DB, reindex_timeout=2),
        answers=HAPPY_ANSWERS_FIRST_USE,
    )
    assert code == 1
    assert "devtest indexing queues" in runner.text()
    assert aws.calls_named("stop_db_instance") == []


# ---------------------------------------------------------------------------------
# Protected original vs replaceable old database
# ---------------------------------------------------------------------------------

def test_old_db_stopped_only_with_opt_in_and_typed_confirmation(tmp_path):
    aws = FakeAWS()
    aws.instances[DEVTEST][OLD_DB] = aws._instance(
        "available", db_id=OLD_DB, tags=prior_restore_tags())
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


def test_unowned_old_database_is_never_stopped(tmp_path):
    aws = FakeAWS()
    aws.instances[DEVTEST][OLD_DB] = aws._instance("available", db_id=OLD_DB)
    runner = Runner(tmp_path, aws)
    code, _ = runner.main(
        base_argv(tmp_path, allow_kms_grant=True, allow_stop_old_db=True,
                  old_db_identifier=OLD_DB),
        answers=HAPPY_ANSWERS_FIRST_USE + [OLD_DB],
    )
    assert code == 2
    assert "not tagged as a database created" in runner.text()
    assert aws.calls_named("stop_db_instance") == []


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


def test_restore_refuses_network_different_from_protected_database(tmp_path):
    runner = Runner(tmp_path)
    runner.aws.instances[DEVTEST][PROTECTED_DB]["VpcSecurityGroups"] = [
        {"VpcSecurityGroupId": "sg-unexpected"},
    ]
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=HAPPY_ANSWERS_FIRST_USE)
    assert code == 2
    assert "unsafe network placement" in runner.text()
    assert runner.aws.calls_named("restore_db_instance_from_db_snapshot") == []


def test_retry_refuses_unowned_existing_database(tmp_path):
    aws = FakeAWS()
    aws.instances[DEVTEST][NEW_DB] = aws._instance("available", db_id=NEW_DB)
    config = make_config()
    manifest = Manifest.create(tmp_path / "state", "op-x", config)
    orchestrator = RestoreOrchestrator(
        config, manifest, aws.factory, Prompter(input_fn=lambda _: "y"),
        emit=lambda _: None, sleep_fn=lambda _: None)
    orchestrator.retrying_step = True
    with pytest.raises(SafetyViolation, match="refusing to adopt"):
        orchestrator.step_restore_database()
    assert aws.calls_named("restore_db_instance_from_db_snapshot") == []


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


def test_kms_grant_pagination_finds_exact_constrained_grant(tmp_path):
    aws = FakeAWS()
    aws.add_grant(operations=["Decrypt"])
    aws.add_grant()
    aws.grant_page_size = 1
    runner = Runner(tmp_path, aws)
    code, _ = runner.main(base_argv(tmp_path), answers=HAPPY_ANSWERS_SUBSEQUENT)
    assert code == 0, runner.text()
    assert len(aws.calls_named("list_grants")) >= 2
    assert aws.calls_named("create_grant") == []


def test_kms_key_must_resolve_to_configured_account(tmp_path):
    aws = FakeAWS()
    aws.kms_account_override[PRODUCTION] = DEVTEST_ACCOUNT
    runner = Runner(tmp_path, aws)
    code, _ = runner.main(base_argv(tmp_path, allow_kms_grant=True),
                          answers=["y"])
    assert code == 2
    assert "not owned by account" in runner.text()
    assert aws.calls_named("create_grant") == []


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


def test_every_persisted_config_field_affects_fingerprint():
    original = make_config()
    baseline = original.fingerprint()
    for name in RestoreConfig.PERSISTED_FIELDS:
        value = getattr(original, name)
        if isinstance(value, list):
            changed = list(value) + ["fingerprint-change"]
        elif isinstance(value, int):
            changed = value + 1
        else:
            changed = f"{value}-fingerprint-change"
        assert make_config(**{name: changed}).fingerprint() != baseline, name


@pytest.mark.parametrize("overrides, message", [
    ({"indexer_queue_urls": [
        "https://sqs.us-east-1.amazonaws.com/111111111111/wrong-account",
    ]}, "indexer_queue_url"),
    ({"production_identity_secret":
      f"arn:aws:secretsmanager:{REGION}:{DEVTEST_ACCOUNT}:secret:wrong"},
     "production_identity_secret"),
    ({"devtest_restore_role_arn":
      f"arn:aws:iam::{PROD_ACCOUNT}:role/wrong-account"},
     "devtest_restore_role_arn"),
])
def test_cross_account_resource_configuration_is_rejected(overrides, message):
    with pytest.raises(SafetyViolation, match=message):
        make_config(**overrides).validate()


@pytest.mark.parametrize("overrides, message", [
    ({"poll_interval": 0}, "poll_interval"),
    ({"poll_timeout": 0}, "poll_timeout"),
    ({"reindex_timeout": 0}, "reindex_timeout"),
])
def test_polling_bounds_are_positive(overrides, message):
    with pytest.raises(SafetyViolation, match=message):
        make_config(**overrides).validate()


def test_invalid_operation_id_fails_without_traceback_or_manifest(tmp_path):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path, operation_id="../escape"), answers=[])
    assert code == 2
    assert "operation_id" in runner.text()
    assert runner.aws.calls == []
    assert not (tmp_path / "escape.json").exists()


def test_corrupt_manifest_status_fails_cleanly(tmp_path):
    state_dir = tmp_path / "state"
    state_dir.mkdir()
    (state_dir / "op-1.json").write_text("{not json")
    output = []
    code = main(["status", "--operation-id", "op-1", "--state-dir", str(state_dir)],
                emit=output.append)
    assert code == 2
    assert "cannot be read safely" in output[0]


def test_run_requires_all_config_before_creating_anything(tmp_path):
    runner = Runner(tmp_path)
    code, _ = runner.main(base_argv(tmp_path, new_db_identifier=None), answers=[])
    assert code == 2
    assert "new_db_identifier" in runner.text()
    assert runner.aws.calls == []
    assert not (tmp_path / "state").exists()  # no manifest for an invalid run
