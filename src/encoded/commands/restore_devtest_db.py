"""restore-devtest-db: restore the smaht-devtest RDS database from a snapshot of smaht-production.

An operator-facing workflow for a single trusted operator. It performs an in-place
database swap: a new devtest instance is restored from a fresh production snapshot,
the devtest IDENTITY secret is pointed at it, and the environment's existing one-shot
deployment task recreates search mappings and reindexes. No ECS service is created,
described, mutated, scaled, or force-redeployed.

Steps (see also `restore-devtest-db plan`):

  Production account:
    1. Create a snapshot of the production database (confirmation required; the same
       confirmation covers the re-encrypted copy in step 2) and wait for it.
    2. Copy the snapshot, re-encrypting with a customer-managed KMS key (verified to
       be customer-managed and owned by the production account), and wait for it.
    3. Ensure a temporary, role-bound KMS grant (DescribeKey/CreateGrant only) lets
       the devtest restore role ask RDS to use that key. Creating one requires both
       --allow-kms-grant and a confirmation; it is revoked in step 6.
    4. Share the encrypted copy with the devtest account (typed confirmation).

  Devtest account:
    5. Copy the shared snapshot under the devtest KMS key and wait for it.
    6. (production) Remove the share and revoke a grant this operation created.
    7. Restore the new instance from the copy, with network placement copied from
       the protected devtest database, and wait for its endpoint.
    8. Update the devtest IDENTITY secret with the new endpoint and the production
       database credentials (typed confirmation; values are never printed or
       persisted -- after this step devtest holds production credentials).
    9. Run the environment's deployment task (cluster ARN, task definition family,
       and indexing queues all resolved from the environment name; the destructive
       initial-deployment task definition is always excluded), require a successful
       exit, then wait for the indexing queues to fully drain.
   10. Optionally stop -- never delete -- a previous replaceable restored database
       (--allow-stop-old-db plus typing its identifier). The protected original
       devtest database is never stopped: it is the rollback safety net.

Each run has a stable operation id and a JSON checkpoint (never containing secrets),
so a failed or interrupted run resumes with `resume`, skipping completed steps.
Resource names are deterministic per operation and every step describes before it
creates, so retries are idempotent. The tool refuses to delete anything, to stop the
protected database, or to proceed on an account/region/role mismatch, and there is
no --yes bypass. See docs/operations/restore_devtest_db.md.
"""

import argparse
import json
import os
import re
import time
import uuid
from dataclasses import dataclass, fields
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

PRODUCTION = "production"
DEVTEST = "devtest"

DEFAULT_STATE_DIR = "~/.smaht/restore-devtest-db"
DEFAULT_SOURCE_DB = "rds-smaht-production"
DEFAULT_PROTECTED_DB = "rds-smaht-devtest"
DEFAULT_INSTANCE_CLASS = "db.t4g.medium"  # a reasonable size for ~16 indexers
DEFAULT_DEVTEST_KMS_KEY = "alias/aws/rds"

# What RDS needs the cross-account caller to hold on the source key; gives the role
# no direct Encrypt/Decrypt permission.
KMS_GRANT_OPERATIONS = ["DescribeKey", "CreateGrant"]

# Identity-secret keys copied from the production identity into the devtest identity,
# because the restored database keeps production's users and passwords.
RDS_SECRET_KEYS = ("RDS_USERNAME", "RDS_PASSWORD", "RDS_DB_NAME")

# Key-name substrings whose values must never be printed or persisted.
SECRET_KEY_MARKERS = ("PASSWORD", "SECRET", "KEY", "TOKEN", "CREDENTIAL")

CREDENTIAL_CONFIRMATION_PHRASE = "replace-devtest-credentials"

POLL_INTERVAL_SECONDS = 30
POLL_TIMEOUT_SECONDS = 2 * 60 * 60  # snapshots/restores of a large database are slow
REINDEX_TIMEOUT_SECONDS = 12 * 60 * 60
EMPTY_QUEUE_CONFIRMATIONS = 2  # SQS counts are approximate; require consecutive empties

# Snovault names an environment's indexing queues from the environment name.
INDEXER_QUEUE_SUFFIXES = ("-indexer-queue", "-secondary-indexer-queue")

ACCOUNT_ID_PATTERN = re.compile(r"^[0-9]{12}$")
IAM_ROLE_ARN_PATTERN = re.compile(r"^arn:aws[a-z0-9-]*:iam::(?P<account>[0-9]{12}):role/\S+$")
OPERATION_ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]{0,39}$")
SQS_QUEUE_URL_PATTERN = re.compile(
    r"^https://sqs\.(?P<region>[a-z0-9-]+)\.amazonaws\.com/(?P<account>[0-9]{12})/\S+$"
)

OPERATION_TAG_KEY = "smaht:restore-operation"  # audit tag on created resources


class RestoreError(Exception):
    """Base error for the restore workflow; message is safe to print."""


class SafetyViolation(RestoreError):
    """A safety rail failed closed (mismatched account, refused mutation, ...)."""


class ConfirmationDeclined(RestoreError):
    """The operator declined an interactive confirmation."""


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_secret_key(key: str) -> bool:
    upper = key.upper()
    return any(marker in upper for marker in SECRET_KEY_MARKERS)


def redacted(mapping: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of ``mapping`` safe to print: secret-like values replaced."""
    return {key: "<redacted>" if is_secret_key(key) else value
            for key, value in mapping.items()}


def safe_message(exception: Exception) -> str:
    """A printable message that cannot leak secret material from SDK exception text."""
    if isinstance(exception, RestoreError):
        return str(exception)
    code = _error_code(exception)
    return f"{type(exception).__name__}" + (f" ({code})" if code else "")


@dataclass
class RestoreConfig:
    """Non-secret configuration for one restore operation. Account ids, regions, and
    profiles are explicit inputs -- never inferred from ambient AWS defaults."""

    production_account_id: str = ""
    devtest_account_id: str = ""
    region: str = ""
    production_profile: str = ""
    devtest_profile: str = ""
    production_kms_key_id: str = ""
    devtest_restore_role_arn: str = ""
    production_identity_secret: str = ""
    devtest_identity_secret: str = ""
    devtest_env_name: str = ""
    deployment_subnet: str = ""
    deployment_security_group: str = ""
    source_db_identifier: str = DEFAULT_SOURCE_DB
    protected_db_identifier: str = DEFAULT_PROTECTED_DB
    new_db_identifier: str = ""
    old_db_identifier: str = ""
    devtest_kms_key_id: str = DEFAULT_DEVTEST_KMS_KEY
    instance_class: str = DEFAULT_INSTANCE_CLASS
    production_role_name: str = ""
    devtest_role_name: str = ""
    poll_interval: int = POLL_INTERVAL_SECONDS
    poll_timeout: int = POLL_TIMEOUT_SECONDS
    reindex_timeout: int = REINDEX_TIMEOUT_SECONDS
    # Opt-ins are never persisted; they must be re-supplied on every invocation.
    allow_kms_grant: bool = False
    allow_stop_old_db: bool = False

    OPT_IN_FIELDS = ("allow_kms_grant", "allow_stop_old_db")

    def validate(self) -> None:
        required = (
            "production_account_id", "devtest_account_id", "region",
            "production_profile", "devtest_profile", "production_kms_key_id",
            "devtest_restore_role_arn", "production_identity_secret",
            "devtest_identity_secret", "devtest_env_name", "deployment_subnet",
            "deployment_security_group", "new_db_identifier",
        )
        missing = [name for name in required if not getattr(self, name)]
        if missing:
            raise SafetyViolation(
                f"Missing required configuration: {', '.join(sorted(missing))}."
                f" All account-sensitive values must be explicit."
            )
        for name in ("production_account_id", "devtest_account_id"):
            if not ACCOUNT_ID_PATTERN.match(getattr(self, name)):
                raise SafetyViolation(f"{name} must be a 12-digit AWS account id.")
        if self.production_account_id == self.devtest_account_id:
            raise SafetyViolation("production and devtest account ids must differ.")
        if self.production_profile == self.devtest_profile:
            raise SafetyViolation(
                "production and devtest AWS profiles are identical; refusing to run"
                " with one credential context for both accounts."
            )
        role = IAM_ROLE_ARN_PATTERN.match(self.devtest_restore_role_arn)
        if not role or role.group("account") != self.devtest_account_id:
            raise SafetyViolation(
                f"devtest_restore_role_arn must be an IAM role ARN in the devtest"
                f" account {self.devtest_account_id}."
            )
        if self.new_db_identifier in (self.protected_db_identifier, self.source_db_identifier):
            raise SafetyViolation(
                f"new_db_identifier {self.new_db_identifier!r} collides with the"
                f" protected or production database; it must name a brand-new instance."
            )
        if self.old_db_identifier:
            if self.old_db_identifier == self.protected_db_identifier:
                raise SafetyViolation(
                    f"old_db_identifier {self.old_db_identifier!r} is the protected"
                    f" original devtest database; this tool never stops it."
                )
            if self.old_db_identifier in (self.source_db_identifier, self.new_db_identifier):
                raise SafetyViolation(
                    f"old_db_identifier {self.old_db_identifier!r} collides with the"
                    f" production source or the new database identifier."
                )

    def to_persisted_dict(self) -> Dict[str, Any]:
        return {f.name: getattr(self, f.name) for f in fields(self)
                if f.name not in self.OPT_IN_FIELDS}

    @classmethod
    def from_persisted_dict(cls, data: Dict[str, Any], *, allow_kms_grant: bool = False,
                            allow_stop_old_db: bool = False) -> "RestoreConfig":
        known = {f.name for f in fields(cls)} - set(cls.OPT_IN_FIELDS)
        kwargs = {k: v for k, v in data.items() if k in known}
        return cls(**kwargs, allow_kms_grant=allow_kms_grant,
                   allow_stop_old_db=allow_stop_old_db)


class Manifest:
    """JSON checkpoint for one operation. Never contains secret values."""

    # These names contain "KEY"/"SECRET" but hold identifiers and names, not values.
    NON_SECRET_KEYLIKE_FIELDS = frozenset({
        "production_kms_key_id", "devtest_kms_key_id", "production_kms_key_arn",
        "production_identity_secret", "devtest_identity_secret",
    })

    def __init__(self, path: Path, data: Dict[str, Any]):
        self.path = path
        self.data = data

    @classmethod
    def create(cls, state_dir: Path, operation_id: str, config: RestoreConfig) -> "Manifest":
        if not OPERATION_ID_PATTERN.fullmatch(operation_id):
            raise SafetyViolation(
                "operation_id must start with a lowercase letter and contain only"
                " lowercase letters, digits, and hyphens (max 40 characters)."
            )
        state_dir.mkdir(parents=True, exist_ok=True)
        path = state_dir / f"{operation_id}.json"
        if path.exists():
            raise RestoreError(f"Operation {operation_id} already exists at {path};"
                               f" use resume or status instead.")
        manifest = cls(path, {
            "operation_id": operation_id,
            "created_at": utcnow_iso(),
            "status": "in_progress",
            "config": config.to_persisted_dict(),
            "done": [],
            "resources": {},
        })
        manifest.save()
        return manifest

    @classmethod
    def load(cls, state_dir: Path, operation_id: str) -> "Manifest":
        path = state_dir / f"{operation_id}.json"
        try:
            with open(path) as f:
                data = json.load(f)
        except FileNotFoundError:
            raise RestoreError(f"No manifest found for operation {operation_id} in {state_dir}.")
        except (OSError, json.JSONDecodeError) as e:
            raise RestoreError(f"Manifest for operation {operation_id} cannot be read safely.") from e
        if not isinstance(data, dict) or data.get("operation_id") != operation_id:
            raise RestoreError(f"Manifest for operation {operation_id} is not usable.")
        return cls(path, data)

    @classmethod
    def list_operations(cls, state_dir: Path) -> List[str]:
        if not state_dir.exists():
            return []
        return sorted(p.stem for p in state_dir.glob("*.json"))

    def save(self) -> None:
        self.data["updated_at"] = utcnow_iso()
        tmp_path = self.path.with_suffix(".json.tmp")
        tmp_path.write_text(json.dumps(self.data, indent=2, sort_keys=True))
        os.replace(tmp_path, self.path)  # never leave a torn checkpoint

    def is_done(self, step: str) -> bool:
        return step in self.data["done"]

    def mark_done(self, step: str) -> None:
        if step not in self.data["done"]:
            self.data["done"].append(step)
        self.save()

    def set_resource(self, key: str, value: Any) -> None:
        if is_secret_key(key) and key not in self.NON_SECRET_KEYLIKE_FIELDS:
            raise SafetyViolation(f"Refusing to persist secret-like resource key {key!r}.")
        self.data["resources"][key] = value
        self.save()

    def get_resource(self, key: str, default: Any = None) -> Any:
        return self.data["resources"].get(key, default)

    def record_outcome(self, status: str, error: str = "") -> None:
        self.data["status"] = status
        if error:
            self.data["error"] = error
        else:
            self.data.pop("error", None)
        self.save()


class Prompter:
    """Interactive confirmations. Tests inject a scripted replacement."""

    def __init__(self, input_fn: Callable[[str], str] = input, emit: Callable[[str], None] = print):
        self.input_fn = input_fn
        self.emit = emit

    def confirm(self, message: str) -> bool:
        self.emit(message)
        return self.input_fn("Proceed? [y/N]: ").strip().lower() in ("y", "yes")

    def confirm_typed(self, message: str, required: str) -> bool:
        self.emit(message)
        answer = self.input_fn(f"Type '{required}' to proceed (anything else aborts): ")
        return answer.strip() == required


# Ordered workflow. Before the first step in each account scope, the STS caller
# identity is verified against the configured account/region/role.
STEPS = [
    ("snapshot_production", PRODUCTION),
    ("encrypt_snapshot_copy", PRODUCTION),
    ("ensure_kms_grant", PRODUCTION),
    ("share_snapshot_with_devtest", PRODUCTION),
    ("copy_shared_snapshot", DEVTEST),
    ("remove_temporary_source_access", PRODUCTION),
    ("restore_database", DEVTEST),
    ("update_identity_secret", DEVTEST),
    ("run_deployment_and_reindex", DEVTEST),
    ("stop_old_database", DEVTEST),
]

STEP_NAMES = [name for name, _scope in STEPS]

PLAN_TEXT = """\
Steps (confirmations in brackets; opt-in flags are never persisted):
   1. [production] snapshot_production -- create a snapshot of the production
      database and wait for it. [y/n confirmation, covering step 2's copy as well]
   2. [production] encrypt_snapshot_copy -- copy it under the customer-managed KMS
      key (verified customer-managed, owned by the production account) and wait.
   3. [production] ensure_kms_grant -- reuse or create a temporary DescribeKey/
      CreateGrant grant for the devtest restore role. [y/n confirmation AND
      --allow-kms-grant to create one; the grant is revoked at step 6]
   4. [production] share_snapshot_with_devtest -- share the encrypted copy.
      [typed confirmation: the devtest account id]
   5. [devtest]    copy_shared_snapshot -- copy it under the devtest KMS key; wait.
   6. [production] remove_temporary_source_access -- unshare the snapshot and revoke
      a grant created by this operation.
   7. [devtest]    restore_database -- restore the new instance ({instance_class},
      not public, network placement copied from the protected database) and wait
      for its endpoint.
   8. [devtest]    update_identity_secret -- point the devtest IDENTITY at the new
      endpoint with production credentials. [typed confirmation:
      '{credential_phrase}'; values are never shown or persisted]
   9. [devtest]    run_deployment_and_reindex -- run the environment's one-shot
      deployment task (cluster/task definition/queues resolved from the environment
      name; initial-deployment excluded), require exit 0, wait for the indexing
      queues to drain. No ECS service is mutated, scaled, or redeployed.
      [y/n confirmation]
  10. [devtest]    stop_old_database -- optionally STOP (never delete) the old
      replaceable database. [typed confirmation AND --allow-stop-old-db; skipped
      when no --old-db-identifier is given]
This tool never deletes a database or snapshot and never stops the protected
database {protected_db}."""


class RestoreOrchestrator:
    """Runs the steps against injected AWS client and prompt boundaries.

    ``client_factory(service_name, scope)`` returns a boto3-compatible client bound
    to the named account scope; the default factory builds sessions lazily from the
    configured named profiles, so constructing the orchestrator never touches AWS."""

    def __init__(self, config: RestoreConfig, manifest: Manifest,
                 client_factory: Callable[[str, str], Any],
                 prompter: Prompter,
                 emit: Callable[[str], None] = print,
                 sleep_fn: Callable[[float], None] = time.sleep):
        self.config = config
        self.manifest = manifest
        self.client_factory = client_factory
        self.prompter = prompter
        self.emit = emit
        self.sleep_fn = sleep_fn
        self._verified_scopes: set = set()

    # -- shared helpers ----------------------------------------------------------------

    @property
    def operation_id(self) -> str:
        return self.manifest.data["operation_id"]

    def _client(self, service: str, scope: str) -> Any:
        return self.client_factory(service, scope)

    def verify_account(self, scope: str) -> None:
        """Fail closed unless the STS caller identity matches the expected account,
        region, and (if configured) exact assumed-role name for ``scope``."""
        if scope in self._verified_scopes:
            return
        expected_account = (self.config.production_account_id if scope == PRODUCTION
                            else self.config.devtest_account_id)
        expected_role = (self.config.production_role_name if scope == PRODUCTION
                         else self.config.devtest_role_name)
        sts = self._client("sts", scope)
        identity = sts.get_caller_identity()
        if identity.get("Account") != expected_account:
            raise SafetyViolation(
                f"STS caller identity for the {scope} profile is account"
                f" {identity.get('Account')}, expected {expected_account}."
            )
        region = getattr(getattr(sts, "meta", None), "region_name", None)
        if region is not None and region != self.config.region:
            raise SafetyViolation(
                f"The {scope} client is bound to region {region}, expected {self.config.region}.")
        if expected_role:
            arn = identity.get("Arn", "")
            marker = ":assumed-role/"
            actual_role = arn.split(marker, 1)[1].rsplit("/", 1)[0] if marker in arn else ""
            if actual_role != expected_role:
                raise SafetyViolation(
                    f"STS caller for the {scope} profile uses role {actual_role!r},"
                    f" expected {expected_role!r}.")
        self._verified_scopes.add(scope)
        self.emit(f"Verified {scope} account {expected_account} in {self.config.region}.")

    def _wait_for(self, describe: Callable[[], str], *, ready: str, waiting_on: str,
                  timeout: Optional[int] = None) -> None:
        """Bounded polling; elapsed time accumulates sleep intervals so tests can
        inject a no-op sleep."""
        waited = 0
        timeout = self.config.poll_timeout if timeout is None else timeout
        while True:
            status = describe()
            if status == ready:
                return
            if status in ("failed", "error", "deleted", "deleting"):
                raise RestoreError(f"{waiting_on} entered status {status!r}; investigate"
                                   f" in the AWS console, then resume this operation.")
            if waited >= timeout:
                raise RestoreError(
                    f"Timed out after {waited}s waiting for {waiting_on} (last status"
                    f" {status!r}). Resume once it settles: restore-devtest-db resume"
                    f" --operation-id {self.operation_id}")
            self.emit(f"... {waiting_on}: {status} (waited {waited}s)")
            self.sleep_fn(self.config.poll_interval)
            waited += self.config.poll_interval

    def _require_confirmation(self, ok: bool, action: str) -> None:
        if not ok:
            raise ConfirmationDeclined(
                f"Operator declined: {action}. Nothing was changed by this step. Resume"
                f" later with: restore-devtest-db resume --operation-id {self.operation_id}")

    def _list_all(self, fetch: Callable[[Optional[str]], Dict[str, Any]], result_key: str) -> List[Any]:
        items: List[Any] = []
        token = None
        while True:
            page = fetch(token)
            items.extend(page.get(result_key, []))
            token = page.get("nextToken")
            if not token:
                return items

    def _snapshot_status(self, rds: Any, snapshot_id: str) -> Optional[str]:
        try:
            result = rds.describe_db_snapshots(DBSnapshotIdentifier=snapshot_id)
        except Exception as e:
            if _is_not_found(e):
                return None
            raise
        snapshots = result.get("DBSnapshots", [])
        return snapshots[0].get("Status") if snapshots else None

    def _instance(self, rds: Any, db_id: str) -> Optional[Dict[str, Any]]:
        try:
            result = rds.describe_db_instances(DBInstanceIdentifier=db_id)
        except Exception as e:
            if _is_not_found(e):
                return None
            raise
        instances = result.get("DBInstances", [])
        return instances[0] if instances else None

    def _create_if_missing(self, exists: Callable[[], bool], create: Callable[[], None],
                           label: str) -> None:
        """Describe-before-create idempotency: resource names are deterministic per
        operation, so an existing resource is this operation's earlier attempt."""
        if exists():
            self.emit(f"{label} already exists; continuing.")
            return
        try:
            create()
        except Exception as e:
            if _is_already_exists(e):
                self.emit(f"{label} already exists; continuing.")
                return
            raise

    # -- deterministic per-operation names ---------------------------------------------

    @property
    def production_snapshot_id(self) -> str:
        return f"{self.config.source_db_identifier}-devtest-restore-{self.operation_id}"

    @property
    def encrypted_snapshot_id(self) -> str:
        return f"{self.production_snapshot_id}-cmk"

    @property
    def encrypted_snapshot_arn(self) -> str:
        return (f"arn:aws:rds:{self.config.region}:{self.config.production_account_id}"
                f":snapshot:{self.encrypted_snapshot_id}")

    @property
    def devtest_snapshot_id(self) -> str:
        return f"{self.config.protected_db_identifier}-restore-{self.operation_id}"

    @property
    def audit_tags(self) -> List[Dict[str, str]]:
        return [{"Key": OPERATION_TAG_KEY, "Value": self.operation_id}]

    # -- steps -------------------------------------------------------------------------

    def step_snapshot_production(self) -> None:
        rds = self._client("rds", PRODUCTION)
        snapshot_id = self.production_snapshot_id

        def create() -> None:
            self._require_confirmation(
                self.prompter.confirm(
                    f"About to create snapshot {snapshot_id} of the PRODUCTION database"
                    f" {self.config.source_db_identifier} in account"
                    f" {self.config.production_account_id}, then copy it re-encrypted"
                    f" with KMS key {self.config.production_kms_key_id}. This reads"
                    f" production; it does not modify the database."),
                "create production snapshot")
            rds.create_db_snapshot(
                DBSnapshotIdentifier=snapshot_id,
                DBInstanceIdentifier=self.config.source_db_identifier,
                Tags=self.audit_tags)

        self._create_if_missing(
            lambda: self._snapshot_status(rds, snapshot_id) is not None,
            create, f"Snapshot {snapshot_id}")
        self.manifest.set_resource("production_snapshot_id", snapshot_id)
        self._wait_for(lambda: self._snapshot_status(rds, snapshot_id) or "not-found",
                       ready="available", waiting_on=f"production snapshot {snapshot_id}")

    def step_encrypt_snapshot_copy(self) -> None:
        rds = self._client("rds", PRODUCTION)
        kms = self._client("kms", PRODUCTION)
        target_id = self.encrypted_snapshot_id
        key = kms.describe_key(KeyId=self.config.production_kms_key_id)["KeyMetadata"]
        if (key.get("AWSAccountId") != self.config.production_account_id
                or key.get("KeyManager") != "CUSTOMER" or key.get("KeyState") != "Enabled"):
            raise SafetyViolation(
                "The production KMS key must be an enabled customer-managed key owned"
                f" by account {self.config.production_account_id};"
                f" refusing to use {key.get('Arn')!r}.")
        key_arn = key["Arn"]
        self.manifest.set_resource("production_kms_key_arn", key_arn)
        self._create_if_missing(
            lambda: self._snapshot_status(rds, target_id) is not None,
            lambda: rds.copy_db_snapshot(
                SourceDBSnapshotIdentifier=self.production_snapshot_id,
                TargetDBSnapshotIdentifier=target_id,
                KmsKeyId=key_arn,
                Tags=self.audit_tags),
            f"Encrypted copy {target_id}")
        self.manifest.set_resource("encrypted_snapshot_id", target_id)
        self.manifest.set_resource("encrypted_snapshot_arn", self.encrypted_snapshot_arn)
        self._wait_for(lambda: self._snapshot_status(rds, target_id) or "not-found",
                       ready="available", waiting_on=f"encrypted snapshot copy {target_id}")

    def step_ensure_kms_grant(self) -> None:
        kms = self._client("kms", PRODUCTION)
        grantee = self.config.devtest_restore_role_arn
        key_arn = self.manifest.get_resource("production_kms_key_arn",
                                             self.config.production_kms_key_id)
        grants = kms.list_grants(KeyId=key_arn, GranteePrincipal=grantee).get("Grants", [])
        # A constrained grant cannot be evaluated from here and might still block the
        # copy, so only an unconstrained grant with the required operations counts.
        usable = [g for g in grants
                  if g.get("GranteePrincipal") == grantee
                  and set(KMS_GRANT_OPERATIONS) <= set(g.get("Operations", []))
                  and not g.get("Constraints")]
        if usable:
            self.emit(f"KMS grant already in place for {grantee}"
                      f" (grant id {usable[0].get('GrantId')}); no security-policy"
                      f" change needed.")
            self.manifest.set_resource("kms_grant_id", usable[0].get("GrantId", ""))
            self.manifest.set_resource("kms_grant_created_by_this_tool", False)
            return
        if not self.config.allow_kms_grant:
            raise SafetyViolation(
                f"No usable grant exists on KMS key {key_arn} for {grantee}. Creating"
                f" one is a security-policy change and requires --allow-kms-grant"
                f" (needed on most runs: this tool revokes its temporary grant after"
                f" the devtest copy). Re-run resume with --allow-kms-grant.")
        self._require_confirmation(
            self.prompter.confirm(
                f"SECURITY-POLICY CHANGE: about to create a KMS grant on {key_arn}"
                f" allowing role {grantee} the operations"
                f" {', '.join(KMS_GRANT_OPERATIONS)}. These let the devtest role ask"
                f" RDS to use the key for the shared snapshot copy; they give no direct"
                f" Encrypt/Decrypt permission. The grant is revoked automatically after"
                f" the devtest-local copy is available."),
            "create KMS grant")
        response = kms.create_grant(
            KeyId=key_arn, GranteePrincipal=grantee, Operations=KMS_GRANT_OPERATIONS,
            Name=f"smaht-devtest-restore-{self.operation_id}", RetiringPrincipal=grantee)
        self.manifest.set_resource("kms_grant_id", response.get("GrantId", ""))
        self.manifest.set_resource("kms_grant_created_by_this_tool", True)
        self.emit("KMS grant created. Record the grant id above for audit.")

    def _shared_accounts(self, rds: Any, snapshot_id: str) -> List[str]:
        attributes = rds.describe_db_snapshot_attributes(
            DBSnapshotIdentifier=snapshot_id,
        )["DBSnapshotAttributesResult"]["DBSnapshotAttributes"]
        return next((a.get("AttributeValues", []) for a in attributes
                     if a.get("AttributeName") == "restore"), [])

    def step_share_snapshot_with_devtest(self) -> None:
        rds = self._client("rds", PRODUCTION)
        snapshot_id = self.encrypted_snapshot_id
        if self.config.devtest_account_id in self._shared_accounts(rds, snapshot_id):
            self.emit(f"Snapshot {snapshot_id} is already shared with"
                      f" {self.config.devtest_account_id}.")
            return
        self._require_confirmation(
            self.prompter.confirm_typed(
                f"CROSS-ACCOUNT SHARE: about to share snapshot {snapshot_id} (production"
                f" data) with AWS account {self.config.devtest_account_id}.",
                required=self.config.devtest_account_id),
            "share snapshot with devtest account")
        rds.modify_db_snapshot_attribute(
            DBSnapshotIdentifier=snapshot_id, AttributeName="restore",
            ValuesToAdd=[self.config.devtest_account_id])
        self.emit(f"Snapshot {snapshot_id} shared with {self.config.devtest_account_id}.")

    def step_copy_shared_snapshot(self) -> None:
        rds = self._client("rds", DEVTEST)
        target_id = self.devtest_snapshot_id
        self._create_if_missing(
            lambda: self._snapshot_status(rds, target_id) is not None,
            lambda: rds.copy_db_snapshot(
                SourceDBSnapshotIdentifier=self.encrypted_snapshot_arn,
                TargetDBSnapshotIdentifier=target_id,
                KmsKeyId=self.config.devtest_kms_key_id,
                Tags=self.audit_tags),
            f"Devtest snapshot copy {target_id}")
        self.manifest.set_resource("devtest_snapshot_id", target_id)
        self._wait_for(lambda: self._snapshot_status(rds, target_id) or "not-found",
                       ready="available", waiting_on=f"devtest snapshot copy {target_id}")

    def step_remove_temporary_source_access(self) -> None:
        rds = self._client("rds", PRODUCTION)
        snapshot_id = self.encrypted_snapshot_id
        if self.config.devtest_account_id in self._shared_accounts(rds, snapshot_id):
            rds.modify_db_snapshot_attribute(
                DBSnapshotIdentifier=snapshot_id, AttributeName="restore",
                ValuesToRemove=[self.config.devtest_account_id])
            self.emit(f"Removed the devtest share from production snapshot {snapshot_id}.")
        if self.manifest.get_resource("kms_grant_created_by_this_tool"):
            grant_id = self.manifest.get_resource("kms_grant_id")
            if grant_id:
                try:
                    self._client("kms", PRODUCTION).revoke_grant(
                        KeyId=self.manifest.get_resource("production_kms_key_arn"),
                        GrantId=grant_id)
                except Exception as e:
                    if not _is_not_found(e):
                        raise
                self.emit(f"Revoked temporary KMS grant {grant_id}.")

    def step_restore_database(self) -> None:
        rds = self._client("rds", DEVTEST)
        db_id = self.config.new_db_identifier
        # Network placement is copied from the protected devtest database -- a
        # verified in-account resource -- so the new instance lands exactly where
        # the environment already runs.
        protected = self._instance(rds, self.config.protected_db_identifier)
        if protected is None:
            raise SafetyViolation(
                f"Protected devtest database {self.config.protected_db_identifier} was"
                f" not found; refusing to infer network placement.")
        subnet_group = protected.get("DBSubnetGroup", {}).get("DBSubnetGroupName")
        security_groups = sorted(
            g.get("VpcSecurityGroupId") for g in protected.get("VpcSecurityGroups", [])
            if g.get("VpcSecurityGroupId"))
        if not subnet_group or not security_groups:
            raise SafetyViolation(
                f"Protected database {self.config.protected_db_identifier} reports no"
                f" subnet group or security groups; refusing to guess placement.")

        def create() -> None:
            self.emit(f"Restoring {db_id} with placement copied from"
                      f" {self.config.protected_db_identifier}: subnet group"
                      f" {subnet_group}, security groups {', '.join(security_groups)}.")
            rds.restore_db_instance_from_db_snapshot(
                DBInstanceIdentifier=db_id,
                DBSnapshotIdentifier=self.devtest_snapshot_id,
                DBInstanceClass=self.config.instance_class,
                PubliclyAccessible=False,
                DBSubnetGroupName=subnet_group,
                VpcSecurityGroupIds=security_groups,
                Tags=self.audit_tags)

        self._create_if_missing(lambda: self._instance(rds, db_id) is not None,
                                create, f"Database instance {db_id}")
        self.manifest.set_resource("new_db_identifier", db_id)
        self._wait_for(
            lambda: (self._instance(rds, db_id) or {}).get("DBInstanceStatus", "not-found"),
            ready="available", waiting_on=f"database instance {db_id}")
        endpoint = (self._instance(rds, db_id) or {}).get("Endpoint", {})
        if not endpoint.get("Address"):
            raise RestoreError(f"Database {db_id} is available but reports no endpoint.")
        self.manifest.set_resource("new_db_endpoint", endpoint["Address"])
        self.manifest.set_resource("new_db_port", endpoint.get("Port", 5432))
        self.emit(f"Database {db_id} is available at"
                  f" {endpoint['Address']}:{endpoint.get('Port', 5432)}.")

    def step_update_identity_secret(self) -> None:
        endpoint = self.manifest.get_resource("new_db_endpoint")
        port = self.manifest.get_resource("new_db_port", 5432)
        if not endpoint:
            raise RestoreError("No restored endpoint recorded; run the restore steps first.")
        production_secrets = self._client("secretsmanager", PRODUCTION)
        devtest_secrets = self._client("secretsmanager", DEVTEST)
        try:
            production_identity = json.loads(production_secrets.get_secret_value(
                SecretId=self.config.production_identity_secret)["SecretString"])
            devtest_identity = json.loads(devtest_secrets.get_secret_value(
                SecretId=self.config.devtest_identity_secret)["SecretString"])
        except (KeyError, TypeError, json.JSONDecodeError) as e:
            raise RestoreError("An identity secret is not a valid JSON object.") from e
        missing = [key for key in RDS_SECRET_KEYS if key not in production_identity]
        if missing:
            raise RestoreError(
                f"Production identity secret is missing expected keys:"
                f" {', '.join(missing)}; refusing a partial credential update.")
        updated = dict(devtest_identity)
        updated["RDS_HOSTNAME"] = endpoint
        updated["RDS_PORT"] = str(port)
        for key in RDS_SECRET_KEYS:
            updated[key] = production_identity[key]
        changed_keys = sorted(k for k in updated if devtest_identity.get(k) != updated[k])
        self._require_confirmation(
            self.prompter.confirm_typed(
                f"CREDENTIAL REPLACEMENT: about to update devtest identity secret"
                f" {self.config.devtest_identity_secret} (keys changing:"
                f" {', '.join(changed_keys)}; values not shown).\n"
                f"WARNING: the restored database keeps PRODUCTION credentials, so after"
                f" this step the devtest database password matches production. Treat"
                f" devtest as containing production secrets until the password is"
                f" rotated.",
                required=CREDENTIAL_CONFIRMATION_PHRASE),
            "replace devtest identity credentials")
        devtest_secrets.put_secret_value(
            SecretId=self.config.devtest_identity_secret,
            SecretString=json.dumps(updated))
        self.manifest.set_resource("identity_updated_fields", changed_keys)
        self.emit(f"Devtest identity secret updated ({len(changed_keys)} keys changed;"
                  f" values not shown).")

    # -- deployment / reindex: cluster, task definition, and queues are resolved from
    # the environment name (DCIC convention). This is an in-place database swap: no
    # ECS service is described, mutated, scaled, or force-redeployed.

    @staticmethod
    def _normalized(value: str) -> str:
        return re.sub(r"[^a-z0-9]", "", value.lower())

    def _resolve_unique(self, candidates: List[str], what: str) -> str:
        env = self.config.devtest_env_name
        matches = sorted(c for c in candidates
                         if self._normalized(env) in self._normalized(c.rsplit("/", 1)[-1]))
        if len(matches) != 1:
            raise RestoreError(
                f"Expected exactly one {what} matching environment {env!r}, found"
                f" {len(matches)}: {matches or sorted(candidates)}. Refusing to guess.")
        return matches[0]

    def _resolve_indexer_queue_urls(self, sqs: Any) -> List[str]:
        urls = []
        for suffix in INDEXER_QUEUE_SUFFIXES:
            name = f"{self.config.devtest_env_name}{suffix}"
            try:
                url = sqs.get_queue_url(QueueName=name)["QueueUrl"]
            except Exception as e:
                if "NonExistentQueue" in _error_code(e) or _is_not_found(e):
                    raise RestoreError(
                        f"Indexing queue {name} was not found in the devtest account;"
                        f" check --devtest-env-name.") from e
                raise
            match = SQS_QUEUE_URL_PATTERN.fullmatch(url)
            if (not match or match.group("region") != self.config.region
                    or match.group("account") != self.config.devtest_account_id):
                raise SafetyViolation(
                    f"Resolved queue URL for {name} is not in the configured devtest"
                    f" account and region; refusing to poll it.")
            urls.append(url)
        self.manifest.set_resource("indexer_queue_urls", urls)
        return urls

    def _queue_totals(self, sqs: Any, queue_urls: List[str]) -> int:
        total = 0
        for queue_url in queue_urls:
            attrs = sqs.get_queue_attributes(
                QueueUrl=queue_url,
                AttributeNames=["ApproximateNumberOfMessages",
                                "ApproximateNumberOfMessagesNotVisible"],
            ).get("Attributes", {})
            total += int(attrs.get("ApproximateNumberOfMessages", 0))
            total += int(attrs.get("ApproximateNumberOfMessagesNotVisible", 0))
        return total

    def _describe_task(self, ecs: Any, cluster_arn: str, task_arn: str) -> Optional[Dict[str, Any]]:
        response = ecs.describe_tasks(cluster=cluster_arn, tasks=[task_arn])
        tasks = response.get("tasks", [])
        return tasks[0] if tasks and not response.get("failures") else None

    def step_run_deployment_and_reindex(self) -> None:
        ecs = self._client("ecs", DEVTEST)
        sqs = self._client("sqs", DEVTEST)
        clusters = self._list_all(
            lambda token: ecs.list_clusters(**({"nextToken": token} if token else {})),
            "clusterArns")
        cluster_arn = self._resolve_unique(clusters, "ECS cluster")
        families = self._list_all(
            lambda token: ecs.list_task_definition_families(
                status="ACTIVE", **({"nextToken": token} if token else {})),
            "families")
        # The initial-deployment task definition wipes database and search contents;
        # it must never be matched here.
        family = self._resolve_unique(
            [f for f in families if "deployment" in f.lower() and "initial" not in f.lower()],
            "deployment task definition family")
        queue_urls = self._resolve_indexer_queue_urls(sqs)
        self.manifest.set_resource("devtest_cluster_arn", cluster_arn)
        self.manifest.set_resource("deployment_task_family", family)

        if not self.manifest.get_resource("deployment_succeeded"):
            task_arn = self.manifest.get_resource("deployment_task_arn")
            if task_arn and self._describe_task(ecs, cluster_arn, task_arn) is None:
                # ECS retains stopped tasks only briefly; an undescribable task cannot
                # be verified, so run a new one rather than assume it succeeded.
                self.emit(f"Previously started deployment task {task_arn} can no longer"
                          f" be described; a new deployment task is required.")
                task_arn = ""
            if not task_arn:
                self._require_confirmation(
                    self.prompter.confirm(
                        f"IN-PLACE DEPLOYMENT: about to run one {family} task in ECS"
                        f" cluster {cluster_arn} (subnet {self.config.deployment_subnet},"
                        f" security group {self.config.deployment_security_group}). The"
                        f" task recreates search mappings and enqueues a full reindex"
                        f" against the restored database. No ECS service is mutated,"
                        f" scaled, or force-redeployed."),
                    "run the environment deployment task")
                response = ecs.run_task(
                    cluster=cluster_arn,
                    taskDefinition=family,
                    count=1,
                    startedBy=f"restore-{self.operation_id}"[:36],
                    networkConfiguration={"awsvpcConfiguration": {
                        "subnets": [self.config.deployment_subnet],
                        "securityGroups": [self.config.deployment_security_group],
                    }})
                if response.get("failures") or len(response.get("tasks", [])) != 1:
                    raise RestoreError("ECS failed to start exactly one deployment task.")
                task_arn = response["tasks"][0]["taskArn"]
                self.manifest.set_resource("deployment_task_arn", task_arn)

            def task_status() -> str:
                task = self._describe_task(ecs, cluster_arn, task_arn)
                if task is None:
                    raise RestoreError(
                        f"Deployment task {task_arn} disappeared before it could be"
                        f" verified; resume to run a new deployment task.")
                return task.get("lastStatus", "UNKNOWN")

            self._wait_for(task_status, ready="STOPPED",
                           waiting_on=f"deployment task {task_arn}")
            task = self._describe_task(ecs, cluster_arn, task_arn)
            containers = (task or {}).get("containers", [])
            if not containers or any(c.get("exitCode") != 0 for c in containers):
                # Clear the checkpointed pointer so resume runs a fresh task (with a
                # fresh confirmation) instead of re-verifying a failed one forever.
                self.manifest.set_resource("deployment_task_arn", "")
                raise RestoreError(
                    "The deployment task stopped without successful container exit"
                    " codes; investigate its logs, then resume to run it again.")
            self.manifest.set_resource("deployment_succeeded", True)
            self.emit(f"Deployment task {task_arn} succeeded: search mappings recreated"
                      f" and reindex enqueued.")

        # Reindex health: wait for the indexing queues to fully drain. The check is
        # absolute -- never "did we observe the enqueue spike" -- so a resume after
        # the queues already drained passes immediately.
        consecutive_empty = 0

        def queue_status() -> str:
            nonlocal consecutive_empty
            total = self._queue_totals(sqs, queue_urls)
            if total == 0:
                consecutive_empty += 1
                return ("empty" if consecutive_empty >= EMPTY_QUEUE_CONFIRMATIONS
                        else f"empty confirmation {consecutive_empty}/{EMPTY_QUEUE_CONFIRMATIONS}")
            consecutive_empty = 0
            return f"{total} messages"

        self._wait_for(queue_status, ready="empty", waiting_on="devtest indexing queues",
                       timeout=self.config.reindex_timeout)
        self.manifest.set_resource("reindex_completed", True)
        self.emit("Deployment task succeeded and all indexing queues drained; the"
                  " restored database is serving the reindexed environment.")

    def step_stop_old_database(self) -> None:
        old_db = self.config.old_db_identifier
        if not old_db:
            self.emit(
                "No --old-db-identifier supplied: nothing to stop. The original devtest"
                f" database {self.config.protected_db_identifier} is protected and stays"
                " alive as the rollback safety net.")
            return
        # Config validation already refuses these; this step is the last line of
        # defense before a stop call.
        if old_db == self.config.protected_db_identifier:
            raise SafetyViolation(
                f"Refusing to stop {old_db}: it is the protected original devtest"
                f" database (rollback safety net). This tool never stops it.")
        if not self.manifest.get_resource("reindex_completed"):
            raise SafetyViolation(
                "Refusing to stop an old database before the deployment and reindex"
                " gates have passed.")
        if not self.config.allow_stop_old_db:
            raise SafetyViolation(
                f"Stopping old database {old_db} requires the explicit"
                f" --allow-stop-old-db flag. The database is left running."
                f" This tool never deletes databases.")
        rds = self._client("rds", DEVTEST)
        instance = self._instance(rds, old_db)
        if instance is None:
            raise RestoreError(f"Old database {old_db} not found in the devtest account;"
                               f" not stopping anything.")
        if instance.get("DBInstanceStatus") == "stopped":
            self.emit(f"Old database {old_db} is already stopped.")
            return
        self._require_confirmation(
            self.prompter.confirm_typed(
                f"FINAL STEP: about to STOP (not delete) old devtest database {old_db}."
                f" It remains restorable by starting it again. This tool never deletes"
                f" databases.",
                required=old_db),
            "stop old devtest database")
        rds.stop_db_instance(DBInstanceIdentifier=old_db)
        self.manifest.set_resource("stopped_old_db_identifier", old_db)
        self.emit(f"Old database {old_db} stopping. Start it again if rollback is needed.")

    # -- runner ------------------------------------------------------------------------

    def run(self) -> None:
        self.manifest.record_outcome("in_progress")
        for name, scope in STEPS:
            if self.manifest.is_done(name):
                self.emit(f"[{name}] already done; skipping.")
                continue
            self.emit(f"[{name}]")
            try:
                self.verify_account(scope)
                getattr(self, f"step_{name}")()
            except ConfirmationDeclined as e:
                self.manifest.record_outcome("declined", safe_message(e))
                raise
            except Exception as e:
                self.manifest.record_outcome("failed", f"{name}: {safe_message(e)}")
                if isinstance(e, RestoreError):
                    raise
                raise RestoreError(
                    f"Step {name} failed: {safe_message(e)}. State is checkpointed; fix"
                    f" the cause and run: restore-devtest-db resume --operation-id"
                    f" {self.operation_id}") from e
            self.manifest.mark_done(name)
        self.manifest.record_outcome("completed")
        self.emit(f"Operation {self.operation_id} completed. The protected database"
                  f" {self.config.protected_db_identifier} was not modified.")


def _error_code(exception: Exception) -> str:
    response = getattr(exception, "response", None)
    if isinstance(response, dict):
        code = response.get("Error", {}).get("Code", "")
        if isinstance(code, str):
            return code[:128]
    return ""


def _is_not_found(exception: Exception) -> bool:
    return "NotFound" in _error_code(exception)


def _is_already_exists(exception: Exception) -> bool:
    return "AlreadyExists" in _error_code(exception)


def build_client_factory(config: RestoreConfig) -> Callable[[str, str], Any]:
    """Default boto3-backed factory. Imports boto3 lazily and creates sessions
    lazily, so nothing here contacts AWS until a step asks for a client."""
    import boto3  # deferred so tests and plan mode never import/touch AWS
    sessions: Dict[str, Any] = {}

    def factory(service: str, scope: str) -> Any:
        if scope not in (PRODUCTION, DEVTEST):
            raise SafetyViolation(f"Unknown account scope {scope!r}.")
        if scope not in sessions:
            profile = (config.production_profile if scope == PRODUCTION
                       else config.devtest_profile)
            sessions[scope] = boto3.Session(profile_name=profile, region_name=config.region)
        return sessions[scope].client(service)

    return factory


# ---------------------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------------------

def print_plan(config: RestoreConfig, operation_id: str,
               emit: Callable[[str], None] = print) -> None:
    """Print the step plan. Makes no AWS calls of any kind."""
    emit("restore-devtest-db plan (no AWS calls were made):")
    emit(f"  operation id: {operation_id} (pass this exact id to run for the planned names)")
    emit(f"  production account: {config.production_account_id}"
         f" (profile {config.production_profile})   devtest account:"
         f" {config.devtest_account_id} (profile {config.devtest_profile})"
         f"   region: {config.region}")
    emit(f"  source db: {config.source_db_identifier}   protected db (never stopped):"
         f" {config.protected_db_identifier}")
    emit(f"  new db: {config.new_db_identifier}   old db to stop:"
         f" {config.old_db_identifier or '<none: nothing will be stopped>'}")
    emit(f"  production KMS key: {config.production_kms_key_id}   devtest KMS key:"
         f" {config.devtest_kms_key_id}   grantee: {config.devtest_restore_role_arn}")
    emit(f"  identity secrets: production={config.production_identity_secret}"
         f" devtest={config.devtest_identity_secret}")
    emit(f"  environment name: {config.devtest_env_name} (resolves the ECS cluster, the"
         f" deployment task definition, and the indexing queues)")
    emit(f"  deployment task network: subnet={config.deployment_subnet}"
         f" security-group={config.deployment_security_group}")
    for flag, enabled in (("--allow-kms-grant", config.allow_kms_grant),
                          ("--allow-stop-old-db", config.allow_stop_old_db)):
        emit(f"  opt-in {flag}: {'supplied' if enabled else 'NOT supplied; the gated step will refuse to mutate'}")
    emit(PLAN_TEXT.format(instance_class=config.instance_class,
                          credential_phrase=CREDENTIAL_CONFIRMATION_PHRASE,
                          protected_db=config.protected_db_identifier))


def print_status(manifest: Manifest, emit: Callable[[str], None] = print) -> None:
    data = manifest.data
    emit(f"operation: {data['operation_id']}   status: {data['status']}")
    emit(f"created: {data.get('created_at')}   updated: {data.get('updated_at')}")
    if data.get("error"):
        emit(f"last error: {data['error']}")
    for name in STEP_NAMES:
        emit(f"  {'done' if name in data['done'] else 'pending':8s} {name}")
    if data.get("resources"):
        emit("resources:")
        for key, value in sorted(redacted(data["resources"]).items()):
            emit(f"  {key}: {value}")


def _add_config_arguments(parser: argparse.ArgumentParser) -> None:
    aws = parser.add_argument_group("account context (all explicit; verified via STS)")
    aws.add_argument("--production-account-id", default="", help="12-digit production AWS account id")
    aws.add_argument("--devtest-account-id", default="", help="12-digit devtest AWS account id")
    aws.add_argument("--region", default="", help="AWS region for both accounts, e.g. us-east-1")
    aws.add_argument("--production-profile", default="",
                     help="named AWS profile for the production account")
    aws.add_argument("--devtest-profile", default="",
                     help="named AWS profile for the devtest account")
    aws.add_argument("--production-role-name", default="",
                     help="optional exact assumed-role name required in the production caller ARN")
    aws.add_argument("--devtest-role-name", default="",
                     help="optional exact assumed-role name required in the devtest caller ARN")
    resources = parser.add_argument_group("resources")
    resources.add_argument("--source-db-identifier", default=DEFAULT_SOURCE_DB,
                           help=f"production database to snapshot (default {DEFAULT_SOURCE_DB})")
    resources.add_argument("--protected-db-identifier", default=DEFAULT_PROTECTED_DB,
                           help=f"original devtest database; NEVER stopped or deleted"
                                f" (default {DEFAULT_PROTECTED_DB})")
    resources.add_argument("--new-db-identifier", default="",
                           help="identifier for the newly restored devtest database")
    resources.add_argument("--old-db-identifier", default="",
                           help="previous replaceable restored database that may be stopped"
                                " (with --allow-stop-old-db); leave unset on first use")
    resources.add_argument("--production-kms-key-id", default="",
                           help="customer-managed KMS key (id/arn/alias) in production used to"
                                " re-encrypt the snapshot for sharing")
    resources.add_argument("--devtest-kms-key-id", default=DEFAULT_DEVTEST_KMS_KEY,
                           help=f"KMS key in devtest for the local snapshot copy"
                                f" (default {DEFAULT_DEVTEST_KMS_KEY})")
    resources.add_argument("--devtest-restore-role-arn", default="",
                           help="devtest IAM role ARN that must be able to use the production KMS key")
    resources.add_argument("--production-identity-secret", default="",
                           help="production IDENTITY secret name (read-only source of RDS credentials)")
    resources.add_argument("--devtest-identity-secret", default="",
                           help="devtest IDENTITY secret name to update with the new endpoint")
    resources.add_argument("--devtest-env-name", default="",
                           help="devtest environment name (e.g. smaht-devtest); resolves the"
                                " ECS cluster, deployment task definition, and indexing queues")
    resources.add_argument("--deployment-subnet", default="",
                           help="subnet id (subnet-...) the one-shot deployment task runs in")
    resources.add_argument("--deployment-security-group", default="",
                           help="security group id (sg-...) for the one-shot deployment task")
    resources.add_argument("--instance-class", default=DEFAULT_INSTANCE_CLASS,
                           help=f"instance class for the restored database"
                                f" (default {DEFAULT_INSTANCE_CLASS}, sized for ~16 indexers)")
    polling = parser.add_argument_group("polling")
    polling.add_argument("--poll-interval", type=int, default=POLL_INTERVAL_SECONDS,
                         help="seconds between status polls")
    polling.add_argument("--poll-timeout", type=int, default=POLL_TIMEOUT_SECONDS,
                         help="maximum seconds to wait for any one resource")
    polling.add_argument("--reindex-timeout", type=int, default=REINDEX_TIMEOUT_SECONDS,
                         help="maximum seconds to wait for indexing queues to drain")
    _add_opt_in_arguments(parser)


def _add_opt_in_arguments(parser: argparse.ArgumentParser) -> None:
    opt_in = parser.add_argument_group(
        "explicit opt-ins (never persisted; must be re-supplied on resume)")
    opt_in.add_argument("--allow-kms-grant", action="store_true",
                        help="permit creating the temporary KMS grant for the devtest"
                             " restore role (a security-policy change)")
    opt_in.add_argument("--allow-stop-old-db", action="store_true",
                        help="permit stopping (never deleting) the --old-db-identifier database")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="restore-devtest-db",
        description="Restore the smaht-devtest RDS database from a snapshot of"
                    " smaht-production (in-place swap). Checkpointed and resumable;"
                    " never deletes a database, never stops the protected devtest"
                    " database, and fails closed on account/region/role mismatch."
                    " There is no --yes bypass.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    def subparser(name: str, help_text: str) -> argparse.ArgumentParser:
        sub = subparsers.add_parser(name, help=help_text)
        sub.add_argument("--state-dir", default=DEFAULT_STATE_DIR,
                         help=f"directory for operation manifests (default {DEFAULT_STATE_DIR})")
        return sub

    plan = subparser("plan", "print the step plan; makes no AWS calls")
    _add_config_arguments(plan)
    plan.add_argument("--operation-id", default="",
                      help="stable operation id to preview (default: generated; reuse for run)")

    run = subparser("run", "start a new restore operation")
    _add_config_arguments(run)
    run.add_argument("--operation-id", default="",
                     help="optional explicit operation id (default: generated)")
    run.add_argument("--dry-run", action="store_true",
                     help="alias for plan: print the step plan and exit")

    resume = subparser("resume", "resume an operation from its checkpoint")
    resume.add_argument("--operation-id", required=True)
    _add_opt_in_arguments(resume)

    status = subparser("status", "show an operation's checkpointed progress")
    status.add_argument("--operation-id", default="",
                        help="operation to show (default: list all operations)")
    return parser


def config_from_args(args: argparse.Namespace) -> RestoreConfig:
    values = {f.name: getattr(args, f.name)
              for f in fields(RestoreConfig) if hasattr(args, f.name)}
    return RestoreConfig(**values)


def generate_operation_id() -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return f"restore-{stamp}-{uuid.uuid4().hex[:6]}"


def _run_operation(orchestrator: RestoreOrchestrator, emit: Callable[[str], None]) -> int:
    try:
        orchestrator.run()
        return 0
    except ConfirmationDeclined as e:
        emit(str(e))
        return 3
    except SafetyViolation as e:
        emit(f"SAFETY: {e}")
        return 2
    except RestoreError as e:
        emit(str(e))
        return 1


def main(argv: Optional[List[str]] = None,
         client_factory_builder: Callable[[RestoreConfig], Callable[[str, str], Any]] = build_client_factory,
         prompter: Optional[Prompter] = None,
         emit: Callable[[str], None] = print,
         sleep_fn: Callable[[float], None] = time.sleep) -> int:
    args = build_parser().parse_args(argv)
    state_dir = Path(os.path.expanduser(args.state_dir))
    prompter = prompter or Prompter(emit=emit)
    try:
        if args.command == "status":
            if args.operation_id:
                print_status(Manifest.load(state_dir, args.operation_id), emit)
            else:
                operations = Manifest.list_operations(state_dir)
                if not operations:
                    emit(f"No operations found in {state_dir}.")
                for operation_id in operations:
                    emit(f"{operation_id}: {Manifest.load(state_dir, operation_id).data['status']}")
            return 0

        if args.command in ("plan", "run"):
            config = config_from_args(args)
            config.validate()
            operation_id = args.operation_id or generate_operation_id()
            if args.command == "plan" or args.dry_run:
                print_plan(config, operation_id, emit)
                return 0
            manifest = Manifest.create(state_dir, operation_id, config)
            emit(f"Started operation {operation_id} (manifest: {manifest.path}).")
        else:  # resume
            manifest = Manifest.load(state_dir, args.operation_id)
            if manifest.data["status"] == "completed":
                emit(f"Operation {args.operation_id} is already completed.")
                return 0
            config = RestoreConfig.from_persisted_dict(
                manifest.data["config"],
                allow_kms_grant=args.allow_kms_grant,
                allow_stop_old_db=args.allow_stop_old_db)
            config.validate()
            emit(f"Resuming operation {args.operation_id}; completed steps will be skipped.")

        orchestrator = RestoreOrchestrator(
            config, manifest, client_factory_builder(config), prompter,
            emit=emit, sleep_fn=sleep_fn)
        return _run_operation(orchestrator, emit)
    except KeyboardInterrupt:
        emit("Interrupted. State is checkpointed; continue with: restore-devtest-db"
             " resume --operation-id <id>")
        return 130
    except SafetyViolation as e:
        emit(f"SAFETY: {e}")
        return 2
    except RestoreError as e:
        emit(str(e))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
