"""restore-devtest-db: restore the smaht-devtest RDS database from a snapshot of smaht-production.

This is an operator-facing, production-adjacent workflow. The command walks a fixed,
resumable sequence of steps:

  Production account:
    1. Verify the production STS caller identity (account/region/role).
    2. Create a snapshot of the production database (confirmation required).
    3. Copy the snapshot, re-encrypting from the default aws/rds key to a
       customer-managed KMS key (confirmation required).
    4. Ensure a temporary, role-bound KMS grant (DescribeKey/CreateGrant only) lets
       the exact devtest restore role ask RDS to use that key. Creating the grant
       requires both --allow-kms-grant and an interactive confirmation; the grant is
       revoked once the devtest-local copy is safe.
    5. Share the encrypted snapshot copy with the devtest account (confirmation
       requires typing the devtest account id).

  Devtest account:
    6. Verify the devtest STS caller identity.
    7. Copy the shared snapshot into the devtest account under the devtest KMS key,
       then remove the source share and any temporary grant created by this run.
    8. Restore a new database instance into the explicitly configured subnet/security
       groups after proving they match the protected devtest database.
    9. Update the devtest IDENTITY secret with the new endpoint and the production
       database credentials (confirmation requires typing a fixed phrase; secret
       values are never printed or persisted).
   10. Trigger the environment's existing one-shot deployment task: resolve the ECS
       cluster ARN and deployment task definition family from the environment name
       (DCIC convention), run the task, require a successful exit, then wait for the
       environment's indexing queues (also resolved from the environment name) to
       drain. This is an in-place database swap: no ECS service is created, mutated,
       scaled, or force-redeployed.
   11. Optionally stop -- never delete -- a previous replaceable restored database.
       Requires both --allow-stop-old-db and typing the database identifier. The
       original protected devtest database is never stopped by this tool; it stays
       alive as the rollback safety net.

Every run has a stable operation id and a mode-0600 JSON manifest checkpoint (no
secrets) so `resume`, `status`, and `cancel` work across invocations. Run/resume holds
an exclusive state-directory lock; cancel writes an independent atomic marker. An
already-existing resource is adopted only after ownership tags and immutable
configuration prove this operation created it. The tool deliberately refuses to delete
any database, stop the protected database, or proceed on account/region/role/resource
mismatch.

See docs/operations/restore_devtest_db.md for the full operator guide.
"""

import argparse
import fcntl
import hashlib
import json
import os
import re
import time
import uuid
from dataclasses import dataclass, field, fields
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

PRODUCTION = "production"
DEVTEST = "devtest"

DEFAULT_STATE_DIR = "~/.smaht/restore-devtest-db"
DEFAULT_SOURCE_DB = "rds-smaht-production"
DEFAULT_PROTECTED_DB = "rds-smaht-devtest"
DEFAULT_INSTANCE_CLASS = "db.t4g.medium"
DEFAULT_DEVTEST_KMS_KEY = "alias/aws/rds"

# RDS requires callers creating a CMK-backed resource to DescribeKey and CreateGrant.
# It performs cryptographic operations through a child service grant; this temporary
# parent grant does not give the cross-account role direct Encrypt/Decrypt permission.
KMS_GRANT_OPERATIONS = ["DescribeKey", "CreateGrant"]

# Identity-secret keys copied from the production identity into the devtest identity,
# because the restored database keeps production's users and passwords.
RDS_SECRET_KEYS = ("RDS_USERNAME", "RDS_PASSWORD", "RDS_DB_NAME")

# Substrings that mark a secret key name whose value must never be printed or persisted.
SECRET_KEY_MARKERS = ("PASSWORD", "SECRET", "KEY", "TOKEN", "CREDENTIAL")

CREDENTIAL_CONFIRMATION_PHRASE = "replace-devtest-credentials"

POLL_INTERVAL_SECONDS = 30
POLL_TIMEOUT_SECONDS = 2 * 60 * 60  # snapshots/restores of a large database are slow
REINDEX_TIMEOUT_SECONDS = 12 * 60 * 60
# Cross-account share/grant propagation settles in seconds-to-minutes. Retrying KMS
# access errors any longer than this masks a genuine misconfiguration.
PROPAGATION_TIMEOUT_SECONDS = 15 * 60
MAX_API_PAGES = 100
EMPTY_QUEUE_CONFIRMATIONS = 3

# Snovault names an environment's indexing queues from the environment name
# (see snovault.elasticsearch.indexer_queue.QueueManager).
INDEXER_QUEUE_SUFFIXES = ("-indexer-queue", "-secondary-indexer-queue")

ACCOUNT_ID_PATTERN = re.compile(r"^[0-9]{12}$")
IAM_ROLE_ARN_PATTERN = re.compile(
    r"^arn:(?P<partition>aws(?:-[a-z0-9-]+)?):iam::(?P<account>[0-9]{12}):role/(?P<role>[^\s]+)$"
)
OPERATION_ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]{0,39}$")
DB_IDENTIFIER_PATTERN = re.compile(r"^[a-z][a-z0-9-]{0,62}$")
ENV_NAME_PATTERN = re.compile(r"^[a-z][a-z0-9-]{0,62}$")
SUBNET_ID_PATTERN = re.compile(r"^subnet-[0-9a-f]{8,17}$")
SECURITY_GROUP_ID_PATTERN = re.compile(r"^sg-[0-9a-f]{8,17}$")
SQS_QUEUE_URL_PATTERN = re.compile(
    r"^https://sqs\.(?P<region>[a-z0-9-]+)\.amazonaws\.com/"
    r"(?P<account>[0-9]{12})/(?P<name>[A-Za-z0-9_-]{1,80}(?:\.fifo)?)$"
)
SECRET_ARN_PATTERN = re.compile(
    r"^arn:[^:]+:secretsmanager:(?P<region>[^:]+):(?P<account>[0-9]{12}):secret:.+$"
)
SAFE_AWS_ERROR_CODE_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{1,128}$")

OPERATION_TAG_KEY = "smaht:restore-operation"
CONFIG_TAG_KEY = "smaht:restore-config"


class RestoreError(Exception):
    """Base error for the restore workflow; message is safe to print."""


class SafetyViolation(RestoreError):
    """A safety rail failed closed (mismatched account, refused mutation, ...)."""


class ConfirmationDeclined(RestoreError):
    """The operator declined an interactive confirmation."""


class OperationCancelled(RestoreError):
    """Cancellation was requested for this operation."""


class OperationInterrupted(RestoreError):
    """The local process was interrupted; state is checkpointed for resume."""


class PollTimeout(RestoreError):
    """A bounded wait on an AWS resource expired; the operation is resumable."""


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_secret_key(key: str) -> bool:
    upper = key.upper()
    return any(marker in upper for marker in SECRET_KEY_MARKERS)


def redacted(mapping: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of ``mapping`` safe to print: secret-like values replaced."""
    return {
        key: "<redacted>" if is_secret_key(key) else value
        for key, value in mapping.items()
    }


@dataclass
class RestoreConfig:
    """Non-secret configuration for one restore operation.

    Everything here is safe to persist in the manifest. Account ids, regions, and
    role names are explicit inputs -- never inferred from ambient AWS defaults --
    and are re-verified against STS before every account-touching step.
    """

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
    db_subnet_group: str = ""
    vpc_security_group_ids: List[str] = field(default_factory=list)
    production_role_name: str = ""
    devtest_role_name: str = ""
    poll_interval: int = POLL_INTERVAL_SECONDS
    poll_timeout: int = POLL_TIMEOUT_SECONDS
    reindex_timeout: int = REINDEX_TIMEOUT_SECONDS
    # Opt-in flags are deliberately NOT persisted to the manifest: they must be
    # re-supplied on every invocation that needs them.
    allow_kms_grant: bool = False
    allow_stop_old_db: bool = False

    PERSISTED_FIELDS = (
        "production_account_id", "devtest_account_id", "region",
        "production_profile", "devtest_profile", "production_kms_key_id",
        "devtest_restore_role_arn", "production_identity_secret",
        "devtest_identity_secret", "devtest_env_name",
        "deployment_subnet", "deployment_security_group",
        "source_db_identifier", "protected_db_identifier", "new_db_identifier",
        "old_db_identifier", "devtest_kms_key_id", "instance_class",
        "db_subnet_group", "vpc_security_group_ids",
        "production_role_name", "devtest_role_name", "poll_interval", "poll_timeout",
        "reindex_timeout",
    )
    # Polling knobs are deliberately excluded so an operator can legitimately extend
    # a too-small timeout in the manifest without bricking resume; everything
    # identity- or resource-shaped stays fingerprinted.
    POLLING_FIELDS = ("poll_interval", "poll_timeout", "reindex_timeout")
    # NOTE: the exclusion list is repeated literally because a class-body genexp
    # cannot reference other class attributes.
    FINGERPRINT_FIELDS = tuple(
        name for name in PERSISTED_FIELDS
        if name not in ("poll_interval", "poll_timeout", "reindex_timeout")
    )

    def validate(self) -> None:
        required = {
            "production_account_id": self.production_account_id,
            "devtest_account_id": self.devtest_account_id,
            "region": self.region,
            "production_profile": self.production_profile,
            "devtest_profile": self.devtest_profile,
            "production_kms_key_id": self.production_kms_key_id,
            "devtest_restore_role_arn": self.devtest_restore_role_arn,
            "production_identity_secret": self.production_identity_secret,
            "devtest_identity_secret": self.devtest_identity_secret,
            "devtest_env_name": self.devtest_env_name,
            "deployment_subnet": self.deployment_subnet,
            "deployment_security_group": self.deployment_security_group,
            "new_db_identifier": self.new_db_identifier,
            "db_subnet_group": self.db_subnet_group,
            "vpc_security_group_ids": self.vpc_security_group_ids,
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise SafetyViolation(
                f"Missing required configuration: {', '.join(sorted(missing))}."
                f" All account-sensitive values must be explicit; nothing is inferred"
                f" from ambient AWS defaults."
            )
        for name in ("production_account_id", "devtest_account_id"):
            value = getattr(self, name)
            if not ACCOUNT_ID_PATTERN.match(value):
                raise SafetyViolation(f"{name} must be a 12-digit AWS account id, got {value!r}.")
        if self.production_account_id == self.devtest_account_id:
            raise SafetyViolation(
                "production_account_id and devtest_account_id are identical;"
                " this workflow requires two distinct accounts."
            )
        if self.production_profile == self.devtest_profile:
            raise SafetyViolation(
                "production and devtest AWS profiles are identical; refusing to run"
                " with a single ambient credential context for both accounts."
            )
        role_match = IAM_ROLE_ARN_PATTERN.match(self.devtest_restore_role_arn)
        if not role_match or role_match.group("account") != self.devtest_account_id:
            raise SafetyViolation(
                "devtest_restore_role_arn must be an IAM role ARN in the configured"
                f" devtest account {self.devtest_account_id}."
            )
        for name in ("source_db_identifier", "protected_db_identifier", "new_db_identifier"):
            value = getattr(self, name)
            if not DB_IDENTIFIER_PATTERN.fullmatch(value):
                raise SafetyViolation(
                    f"{name} must be a valid lowercase RDS identifier (1-63 characters),"
                    f" got {value!r}."
                )
            if value.endswith("-") or "--" in value:
                raise SafetyViolation(
                    f"{name} may not end in a hyphen or contain consecutive hyphens."
                )
        if self.new_db_identifier in (self.protected_db_identifier, self.source_db_identifier):
            raise SafetyViolation(
                f"new_db_identifier {self.new_db_identifier!r} collides with the protected"
                f" or production database identifier; it must name a brand-new instance."
            )
        if self.old_db_identifier:
            if self.old_db_identifier == self.protected_db_identifier:
                raise SafetyViolation(
                    f"old_db_identifier {self.old_db_identifier!r} is the protected original"
                    f" devtest database. This tool never stops the protected database;"
                    f" it stays alive as the rollback safety net."
                )
            if self.old_db_identifier in (self.source_db_identifier, self.new_db_identifier):
                raise SafetyViolation(
                    f"old_db_identifier {self.old_db_identifier!r} collides with the production"
                    f" source or the new database identifier."
                )
        if not ENV_NAME_PATTERN.fullmatch(self.devtest_env_name):
            raise SafetyViolation(
                f"devtest_env_name must be a lowercase environment name (letters,"
                f" digits, hyphens), got {self.devtest_env_name!r}."
            )
        if not SUBNET_ID_PATTERN.fullmatch(self.deployment_subnet):
            raise SafetyViolation(
                f"deployment_subnet must be a subnet id (subnet-...), got"
                f" {self.deployment_subnet!r}."
            )
        if not SECURITY_GROUP_ID_PATTERN.fullmatch(self.deployment_security_group):
            raise SafetyViolation(
                f"deployment_security_group must be a security group id (sg-...), got"
                f" {self.deployment_security_group!r}."
            )
        if self.poll_interval <= 0:
            raise SafetyViolation("poll_interval must be greater than zero.")
        if self.poll_timeout < self.poll_interval:
            raise SafetyViolation("poll_timeout must be at least poll_interval.")
        if self.reindex_timeout < self.poll_interval:
            raise SafetyViolation("reindex_timeout must be at least poll_interval.")
        if len(set(self.vpc_security_group_ids)) != len(self.vpc_security_group_ids):
            raise SafetyViolation("vpc_security_group_ids contains duplicates.")
        for name, value, account in (
                ("production_identity_secret", self.production_identity_secret,
                 self.production_account_id),
                ("devtest_identity_secret", self.devtest_identity_secret,
                 self.devtest_account_id)):
            if value.startswith("arn:"):
                match = SECRET_ARN_PATTERN.fullmatch(value)
                if (not match or match.group("region") != self.region
                        or match.group("account") != account):
                    raise SafetyViolation(
                        f"{name} ARN must belong to account {account} in region {self.region}."
                    )

    def to_persisted_dict(self) -> Dict[str, Any]:
        return {name: getattr(self, name) for name in self.PERSISTED_FIELDS}

    @classmethod
    def from_persisted_dict(cls, data: Dict[str, Any], *, allow_kms_grant: bool = False,
                            allow_stop_old_db: bool = False) -> "RestoreConfig":
        known = {f.name for f in fields(cls)}
        kwargs = {k: v for k, v in data.items() if k in known}
        return cls(**kwargs, allow_kms_grant=allow_kms_grant, allow_stop_old_db=allow_stop_old_db)

    def fingerprint(self) -> str:
        payload = json.dumps(
            {name: getattr(self, name) for name in self.FINGERPRINT_FIELDS},
            sort_keys=True,
        )
        return hashlib.sha256(payload.encode()).hexdigest()


class Manifest:
    """JSON checkpoint for one operation. Never contains secret values."""

    def __init__(self, path: Path, data: Dict[str, Any]):
        self.path = path
        self.data = data

    # -- construction / persistence -------------------------------------------------

    @classmethod
    def create(cls, state_dir: Path, operation_id: str, config: RestoreConfig) -> "Manifest":
        if (not OPERATION_ID_PATTERN.fullmatch(operation_id)
                or operation_id.endswith("-") or "--" in operation_id):
            raise SafetyViolation(
                "operation_id must start with a lowercase letter and contain only"
                " lowercase letters, digits, and hyphens (maximum 40 characters)."
            )
        state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        state_dir.chmod(0o700)
        path = state_dir / f"{operation_id}.json"
        manifest = cls(path, {
            "operation_id": operation_id,
            "created_at": utcnow_iso(),
            "updated_at": utcnow_iso(),
            "status": "in_progress",
            "cancel_requested": False,
            "config": config.to_persisted_dict(),
            "config_fingerprint": config.fingerprint(),
            "steps": {},
            "resources": {},
        })
        manifest.save(exclusive=True)
        return manifest

    @classmethod
    def load(cls, state_dir: Path, operation_id: str) -> "Manifest":
        if (not OPERATION_ID_PATTERN.fullmatch(operation_id)
                or operation_id.endswith("-") or "--" in operation_id):
            raise SafetyViolation(f"Invalid operation id {operation_id!r}.")
        path = state_dir / f"{operation_id}.json"
        if not path.exists():
            raise RestoreError(f"No manifest found for operation {operation_id} in {state_dir}.")
        try:
            with open(path) as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            raise RestoreError(f"Manifest for operation {operation_id} cannot be read safely.") from e
        if not isinstance(data, dict) or data.get("operation_id") != operation_id:
            raise RestoreError(f"Manifest for operation {operation_id} has invalid ownership metadata.")
        required_types = {
            "status": str,
            "config": dict,
            "config_fingerprint": str,
            "steps": dict,
            "resources": dict,
        }
        if any(not isinstance(data.get(key), expected_type)
               for key, expected_type in required_types.items()):
            raise RestoreError(f"Manifest for operation {operation_id} has an invalid structure.")
        cls._assert_no_secret_values(data)
        return cls(path, data)

    @classmethod
    def list_operations(cls, state_dir: Path) -> List[str]:
        if not state_dir.exists():
            return []
        return sorted(p.stem for p in state_dir.glob("*.json"))

    # These config fields contain "KEY"/"SECRET" in their names but hold resource
    # identifiers and secret *names*, never secret values.
    NON_SECRET_KEYLIKE_FIELDS = frozenset({
        "production_kms_key_id", "devtest_kms_key_id",
        "production_identity_secret", "devtest_identity_secret",
        "production_kms_key_arn", "devtest_kms_key_arn",
    })

    @classmethod
    def _assert_no_secret_values(cls, obj: Any) -> None:
        """Defensive guard: manifest keys are chosen to be non-secret; refuse to
        persist any value stored under a secret-like key a future step might add."""
        if isinstance(obj, dict):
            for key, value in obj.items():
                if (is_secret_key(str(key))
                        and isinstance(value, (str, int, float))
                        and str(key) not in cls.NON_SECRET_KEYLIKE_FIELDS):
                    raise SafetyViolation(
                        f"Refusing to persist secret-like manifest key {key!r}.")
                cls._assert_no_secret_values(value)
        elif isinstance(obj, list):
            for item in obj:
                cls._assert_no_secret_values(item)

    @property
    def cancel_path(self) -> Path:
        return self.path.with_suffix(".cancel")

    @property
    def lock_path(self) -> Path:
        return self.path.with_suffix(".lock")

    def save(self, *, exclusive: bool = False) -> None:
        self.data["updated_at"] = utcnow_iso()
        self._assert_no_secret_values(self.data)
        serialized = json.dumps(self.data, indent=2, sort_keys=True)
        if exclusive:
            try:
                descriptor = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            except FileExistsError as e:
                raise RestoreError(
                    f"Operation {self.data['operation_id']} already exists at {self.path};"
                    " use resume/status/cancel instead."
                ) from e
            with os.fdopen(descriptor, "w") as manifest_file:
                manifest_file.write(serialized)
                manifest_file.flush()
                os.fsync(manifest_file.fileno())
            return
        tmp_path = self.path.with_suffix(".json.tmp")
        with open(tmp_path, "w") as manifest_file:
            os.chmod(tmp_path, 0o600)
            manifest_file.write(serialized)
            manifest_file.flush()
            os.fsync(manifest_file.fileno())
        os.replace(tmp_path, self.path)

    # -- step bookkeeping -------------------------------------------------------------

    def step(self, name: str) -> Dict[str, Any]:
        return self.data["steps"].setdefault(name, {"status": "pending"})

    def step_status(self, name: str) -> str:
        return self.data["steps"].get(name, {}).get("status", "pending")

    def mark_step(self, name: str, status: str, error: str = "") -> None:
        entry = self.step(name)
        entry["status"] = status
        if status == "in_progress":
            entry.setdefault("started_at", utcnow_iso())
            entry.pop("error", None)
        if status in ("completed", "skipped", "failed", "declined", "interrupted"):
            entry["finished_at"] = utcnow_iso()
        if error:
            entry["error"] = error
        self.save()

    def set_resource(self, key: str, value: Any) -> None:
        if is_secret_key(key) and key not in self.NON_SECRET_KEYLIKE_FIELDS:
            raise SafetyViolation(f"Refusing to persist secret-like resource key {key!r}.")
        self.data["resources"][key] = value
        self.save()

    def get_resource(self, key: str, default: Any = None) -> Any:
        return self.data["resources"].get(key, default)

    def set_status(self, status: str) -> None:
        self.data["status"] = status
        self.save()

    def request_cancel(self) -> None:
        descriptor = os.open(self.cancel_path, os.O_WRONLY | os.O_CREAT, 0o600)
        with os.fdopen(descriptor, "w") as cancel_file:
            cancel_file.write(f"requested_at={utcnow_iso()}\n")
            cancel_file.flush()
            os.fsync(cancel_file.fileno())

    def clear_cancel(self) -> None:
        try:
            self.cancel_path.unlink()
        except FileNotFoundError:
            pass
        self.data["cancel_requested"] = False
        self.save()

    def cancel_requested_on_disk(self) -> bool:
        """Read the independent marker so active manifest saves cannot lose cancellation."""
        if self.cancel_path.exists():
            return True
        if self.path.exists():
            with open(self.path) as f:
                on_disk = json.load(f)
            return bool(on_disk.get("cancel_requested"))
        return bool(self.data.get("cancel_requested"))


class OperationLock:
    """Exclusive ownership for active work; cancel uses a separate marker.

    Both a state-directory lock (preventing two restore operations from mutating the
    same devtest environment concurrently) and an operation lock are held. Operators
    must therefore use one shared state directory for a given environment.
    """

    def __init__(self, manifest: Manifest):
        self.manifest = manifest
        self.files: List[Any] = []

    def _acquire(self, path: Path, owner: str) -> None:
        lock_file = open(path, "a+")
        os.chmod(path, 0o600)
        try:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as e:
            lock_file.seek(0)
            current_owner = lock_file.read().strip() or "unknown owner"
            lock_file.close()
            raise SafetyViolation(
                f"Another restore-devtest-db invocation is already running"
                f" ({current_owner}); refusing concurrent mutation."
            ) from e
        lock_file.seek(0)
        lock_file.truncate()
        lock_file.write(owner)
        lock_file.flush()
        os.fsync(lock_file.fileno())
        self.files.append(lock_file)

    def __enter__(self) -> "OperationLock":
        try:
            owner = (f"operation={self.manifest.data['operation_id']} pid={os.getpid()}"
                     f" started_at={utcnow_iso()}\n")
            self._acquire(self.manifest.path.parent / ".active.lock", owner)
            self._acquire(self.manifest.lock_path, owner)
        except Exception:
            self.__exit__(None, None, None)
            raise
        return self

    def __exit__(self, _type: Any, _value: Any, _traceback: Any) -> None:
        while self.files:
            lock_file = self.files.pop()
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
            lock_file.close()


class Prompter:
    """Interactive confirmations. Tests inject a scripted replacement."""

    def __init__(self, input_fn: Callable[[str], str] = input, emit: Callable[[str], None] = print):
        self.input_fn = input_fn
        self.emit = emit

    def confirm(self, message: str) -> bool:
        self.emit(message)
        answer = self.input_fn("Proceed? [y/N]: ").strip().lower()
        return answer in ("y", "yes")

    def confirm_typed(self, message: str, required: str) -> bool:
        self.emit(message)
        answer = self.input_fn(f"Type '{required}' to proceed (anything else aborts): ").strip()
        return answer == required


@dataclass(frozen=True)
class StepDefinition:
    name: str
    scope: Optional[str]  # PRODUCTION / DEVTEST / None
    description: str
    confirmation: str = ""  # human description of the confirmation gate, if any
    opt_in_flag: str = ""   # CLI flag that must also be supplied, if any


STEP_DEFINITIONS: List[StepDefinition] = [
    StepDefinition(
        "verify_production_account", PRODUCTION,
        "Verify STS caller identity, account id, region, and role for the production profile.",
    ),
    StepDefinition(
        "capture_production_credentials_version", PRODUCTION,
        "Pin the production IDENTITY secret version used by the snapshot restore;"
        " secret values are validated in memory but never persisted.",
    ),
    StepDefinition(
        "create_production_snapshot", PRODUCTION,
        "Create a manual snapshot of the production database.",
        confirmation="yes/no confirmation before snapshotting production",
    ),
    StepDefinition(
        "wait_production_snapshot", PRODUCTION,
        "Wait (bounded polling) for the production snapshot to become available.",
    ),
    StepDefinition(
        "copy_snapshot_to_cmk", PRODUCTION,
        "Copy the snapshot, re-encrypting with the customer-managed KMS key"
        " (the default aws/rds key cannot be shared across accounts).",
        confirmation="yes/no confirmation before creating the re-encrypted copy",
    ),
    StepDefinition(
        "wait_encrypted_copy", PRODUCTION,
        "Wait (bounded polling) for the re-encrypted snapshot copy to become available.",
    ),
    StepDefinition(
        "ensure_kms_grant", PRODUCTION,
        "Ensure the devtest restore role holds a temporary KMS grant"
        " (DescribeKey/CreateGrant) on the customer-managed key. The grant is revoked"
        " after the devtest-local copy is safe, so most runs create one; creating it"
        " is a security-policy change.",
        confirmation="yes/no confirmation before creating a new KMS grant",
        opt_in_flag="--allow-kms-grant",
    ),
    StepDefinition(
        "share_snapshot_with_devtest", PRODUCTION,
        "Share the encrypted snapshot copy with the devtest account.",
        confirmation="typed confirmation: the devtest account id",
    ),
    StepDefinition(
        "verify_devtest_account", DEVTEST,
        "Verify STS caller identity, account id, region, and role for the devtest profile.",
    ),
    StepDefinition(
        "copy_shared_snapshot", DEVTEST,
        "Copy the shared snapshot into the devtest account under the devtest KMS key.",
    ),
    StepDefinition(
        "wait_devtest_snapshot", DEVTEST,
        "Wait (bounded polling) for the devtest snapshot copy to become available.",
    ),
    StepDefinition(
        "remove_temporary_source_access", PRODUCTION,
        "After the devtest-local copy is safe, unshare the production snapshot and"
        " revoke only a temporary KMS grant created by this operation.",
    ),
    StepDefinition(
        "restore_database", DEVTEST,
        f"Restore a new database instance from the devtest snapshot"
        f" (default {DEFAULT_INSTANCE_CLASS}, sized for roughly 16 indexers).",
    ),
    StepDefinition(
        "wait_database_available", DEVTEST,
        "Wait (bounded polling) for the new database instance to become available"
        " and record its endpoint.",
    ),
    StepDefinition(
        "update_identity_secret", DEVTEST,
        "Update the devtest IDENTITY secret with the new endpoint and the production"
        " database credentials. WARNING: after this step the devtest credentials"
        " match production. Secret values are never printed or persisted.",
        confirmation=f"typed confirmation: '{CREDENTIAL_CONFIRMATION_PHRASE}'",
    ),
    StepDefinition(
        "run_deployment_and_reindex", DEVTEST,
        "Run the environment's existing one-shot deployment task (cluster and task"
        " definition resolved from the environment name), require a successful exit,"
        " then wait for the environment's indexing queues to drain. No ECS service is"
        " mutated, scaled, or force-redeployed.",
        confirmation="yes/no confirmation before running the deployment task",
    ),
    StepDefinition(
        "stop_old_database", DEVTEST,
        "Optionally stop (NEVER delete) a previous replaceable restored database."
        " Skipped unless --old-db-identifier names one. The protected original"
        " devtest database is never stopped: it is the rollback safety net.",
        confirmation="typed confirmation: the old database identifier",
        opt_in_flag="--allow-stop-old-db",
    ),
]

STEP_NAMES = [step.name for step in STEP_DEFINITIONS]


class RestoreOrchestrator:
    """Runs the restore steps against injected AWS client and prompt boundaries.

    ``client_factory(service_name, scope)`` must return a boto3-compatible client
    bound to the named account scope. The default factory (``build_client_factory``)
    creates sessions lazily from the configured named profiles, so constructing the
    orchestrator never touches AWS.
    """

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

    # -- helpers ---------------------------------------------------------------------

    @property
    def operation_id(self) -> str:
        return self.manifest.data["operation_id"]

    def _client(self, service: str, scope: str) -> Any:
        return self.client_factory(service, scope)

    def _check_cancelled(self) -> None:
        if self.manifest.cancel_requested_on_disk():
            raise OperationCancelled(
                f"Cancellation requested for operation {self.operation_id}."
                f" Run 'restore-devtest-db resume --operation-id {self.operation_id}'"
                f" to continue later; no partial step is rolled back."
            )

    def verify_account(self, scope: str) -> None:
        """Fail closed unless the STS caller identity matches the expected account,
        region, and (if configured) role for ``scope``. Called before every step
        that touches that account."""
        expected_account = (self.config.production_account_id if scope == PRODUCTION
                            else self.config.devtest_account_id)
        expected_role = (self.config.production_role_name if scope == PRODUCTION
                         else self.config.devtest_role_name)
        sts = self._client("sts", scope)
        identity = sts.get_caller_identity()
        actual_account = identity.get("Account")
        if actual_account != expected_account:
            raise SafetyViolation(
                f"STS caller identity for the {scope} profile is account"
                f" {actual_account}, expected {expected_account}. Refusing to continue."
            )
        region = getattr(getattr(sts, "meta", None), "region_name", None)
        if region is not None and region != self.config.region:
            raise SafetyViolation(
                f"The {scope} client is bound to region {region}, expected"
                f" {self.config.region}. Refusing to continue."
            )
        if expected_role:
            arn = identity.get("Arn", "")
            marker = ":assumed-role/"
            actual_role = ""
            if marker in arn:
                actual_role = arn.split(marker, 1)[1].rsplit("/", 1)[0]
            if actual_role != expected_role:
                raise SafetyViolation(
                    f"STS caller ARN for the {scope} profile uses role {actual_role!r},"
                    f" expected exact role {expected_role!r}. Refusing to continue."
                )

    def _wait_for(self, describe: Callable[[], str], *, ready: str, waiting_on: str,
                  timeout: Optional[int] = None) -> None:
        """Bounded polling with cancellation checks between polls.

        ``describe`` returns the current status string; terminal failure statuses
        raise. Elapsed time is tracked by accumulating sleep intervals so tests can
        inject a no-op sleep."""
        waited = 0
        timeout = self.config.poll_timeout if timeout is None else timeout
        while True:
            self._check_cancelled()
            status = describe()
            if status == ready:
                return
            if status in ("failed", "error", "deleted", "deleting"):
                raise RestoreError(f"{waiting_on} entered status {status!r}; investigate in"
                                   f" the AWS console, then resume or cancel this operation.")
            if waited >= timeout:
                raise PollTimeout(
                    f"Timed out after {waited}s waiting for {waiting_on} (last status"
                    f" {status!r}). The operation is resumable once the resource settles:"
                    f" restore-devtest-db resume --operation-id {self.operation_id}"
                )
            self.emit(f"... {waiting_on}: {status} (waited {waited}s)")
            self.sleep_fn(self.config.poll_interval)
            waited += self.config.poll_interval

    def _retry(self, action: Callable[[], Any], *, retry_codes: set,
               waiting_on: str, timeout: Optional[int] = None) -> Any:
        waited = 0
        timeout = self.config.poll_timeout if timeout is None else timeout
        while True:
            self._check_cancelled()
            try:
                return action()
            except Exception as e:
                code = _error_code(e)
                if code not in retry_codes or waited >= timeout:
                    raise
                self.emit(f"... {waiting_on}: {code} (waited {waited}s; retrying)")
                self.sleep_fn(self.config.poll_interval)
                waited += self.config.poll_interval

    def _require_confirmation(self, ok: bool, action: str) -> None:
        if not ok:
            raise ConfirmationDeclined(
                f"Operator declined: {action}. Nothing was changed by this step."
                f" Resume later with: restore-devtest-db resume --operation-id {self.operation_id}"
            )

    # -- snapshot naming (deterministic per operation, so retries are idempotent) -----

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
    def ownership_tags(self) -> List[Dict[str, str]]:
        return [
            {"Key": OPERATION_TAG_KEY, "Value": self.operation_id},
            {"Key": CONFIG_TAG_KEY, "Value": self.config.fingerprint()},
        ]

    def _assert_owned(self, resource: Dict[str, Any], label: str) -> None:
        tags = {tag.get("Key"): tag.get("Value") for tag in resource.get("TagList", [])}
        expected = {tag["Key"]: tag["Value"] for tag in self.ownership_tags}
        if any(tags.get(key) != value for key, value in expected.items()):
            raise SafetyViolation(
                f"{label} already exists but does not carry this operation's ownership"
                " tags; refusing to adopt an unrelated resource."
            )

    def _create_or_adopt(self, *, describe: Callable[[], Optional[Dict[str, Any]]],
                         verify: Callable[[Dict[str, Any]], None],
                         create: Callable[[], None], label: str) -> None:
        """Create a tagged resource idempotently.

        If the resource already exists -- from an earlier attempt of this operation
        that mutated AWS before the checkpoint was written -- it is adopted only
        after its ownership tags and provenance checks prove this operation created
        it; anything unowned is refused. An already-exists race on create is resolved
        the same way: re-describe and require proven ownership."""
        existing = describe()
        if existing is None:
            try:
                create()
                return
            except Exception as e:
                if not _is_already_exists(e):
                    raise
                existing = describe()
                if existing is None:
                    raise RestoreError(
                        f"{label} reported already-exists but cannot be described yet;"
                        f" resume once it is visible."
                    ) from e
        self._assert_owned(existing, label)
        verify(existing)
        self.emit(f"{label} already exists with verified provenance; adopting it.")

    def _validated_kms_key(self, scope: str, configured_key: str) -> Dict[str, Any]:
        kms = self._client("kms", scope)
        metadata = kms.describe_key(KeyId=configured_key)["KeyMetadata"]
        expected_account = (self.config.production_account_id if scope == PRODUCTION
                            else self.config.devtest_account_id)
        arn = metadata.get("Arn", "")
        arn_parts = arn.split(":", 5)
        if (metadata.get("AWSAccountId") != expected_account or len(arn_parts) < 6
                or arn_parts[3] != self.config.region):
            raise SafetyViolation(
                f"The {scope} KMS key is not owned by account {expected_account}"
                f" in region {self.config.region}; refusing to use {arn!r}."
            )
        if metadata.get("KeyState") != "Enabled" or metadata.get("KeyUsage") != "ENCRYPT_DECRYPT":
            raise SafetyViolation(f"The {scope} KMS key must be enabled for encryption/decryption.")
        if metadata.get("KeySpec", "SYMMETRIC_DEFAULT") != "SYMMETRIC_DEFAULT":
            raise SafetyViolation(f"The {scope} KMS key must be symmetric.")
        if scope == PRODUCTION and metadata.get("KeyManager") != "CUSTOMER":
            raise SafetyViolation("The production snapshot-sharing KMS key must be customer-managed.")
        return metadata

    # -- individual steps --------------------------------------------------------------

    def _snapshot(self, rds: Any, snapshot_id: str) -> Optional[Dict[str, Any]]:
        try:
            result = rds.describe_db_snapshots(DBSnapshotIdentifier=snapshot_id)
        except Exception as e:
            if _is_not_found(e):
                return None
            raise
        snapshots = result.get("DBSnapshots", [])
        return snapshots[0] if snapshots else None

    def _snapshot_status(self, rds: Any, snapshot_id: str) -> Optional[str]:
        snapshot = self._snapshot(rds, snapshot_id)
        return snapshot.get("Status") if snapshot else None

    def _instance(self, rds: Any, db_id: str) -> Optional[Dict[str, Any]]:
        try:
            result = rds.describe_db_instances(DBInstanceIdentifier=db_id)
        except Exception as e:
            if _is_not_found(e):
                return None
            raise
        instances = result.get("DBInstances", [])
        return instances[0] if instances else None

    def step_verify_production_account(self) -> None:
        self.emit(f"Verified production account {self.config.production_account_id}"
                  f" in {self.config.region}.")

    def step_capture_production_credentials_version(self) -> None:
        secrets = self._client("secretsmanager", PRODUCTION)
        response = secrets.get_secret_value(SecretId=self.config.production_identity_secret)
        version_id = response.get("VersionId")
        if not version_id:
            raise RestoreError("Production identity secret returned no VersionId; refusing to continue.")
        try:
            identity = json.loads(response["SecretString"])
        except (KeyError, TypeError, json.JSONDecodeError) as e:
            raise RestoreError("Production identity secret is not a valid JSON object.") from e
        missing = [key for key in RDS_SECRET_KEYS if key not in identity]
        if missing:
            raise RestoreError(
                f"Production identity secret is missing expected keys: {', '.join(missing)}."
            )
        self.manifest.set_resource("production_identity_version_id", version_id)
        self.emit("Pinned the production identity secret version (values not shown).")

    def step_create_production_snapshot(self) -> None:
        rds = self._client("rds", PRODUCTION)
        snapshot_id = self.production_snapshot_id

        def verify(snapshot: Dict[str, Any]) -> None:
            if snapshot.get("DBInstanceIdentifier") != self.config.source_db_identifier:
                raise SafetyViolation(f"Snapshot {snapshot_id} belongs to a different source DB.")

        def create() -> None:
            self._require_confirmation(
                self.prompter.confirm(
                    f"About to create snapshot {snapshot_id} of the PRODUCTION database"
                    f" {self.config.source_db_identifier} in account"
                    f" {self.config.production_account_id}. This reads production;"
                    f" it does not modify the database."
                ),
                "create production snapshot",
            )
            rds.create_db_snapshot(
                DBSnapshotIdentifier=snapshot_id,
                DBInstanceIdentifier=self.config.source_db_identifier,
                Tags=self.ownership_tags,
            )

        self._create_or_adopt(describe=lambda: self._snapshot(rds, snapshot_id),
                              verify=verify, create=create,
                              label=f"Snapshot {snapshot_id}")
        self.manifest.set_resource("production_snapshot_id", snapshot_id)

    def step_wait_production_snapshot(self) -> None:
        rds = self._client("rds", PRODUCTION)
        snapshot_id = self.manifest.get_resource("production_snapshot_id", self.production_snapshot_id)
        self._wait_for(
            lambda: self._snapshot_status(rds, snapshot_id) or "not-found",
            ready="available",
            waiting_on=f"production snapshot {snapshot_id}",
        )
        snapshot = self._snapshot(rds, snapshot_id)
        self._assert_owned(snapshot or {}, f"Production snapshot {snapshot_id}")
        if snapshot.get("DBInstanceIdentifier") != self.config.source_db_identifier:
            raise SafetyViolation(f"Production snapshot {snapshot_id} source DB changed.")
        pinned_version = self.manifest.get_resource("production_identity_version_id")
        current_version = self._client("secretsmanager", PRODUCTION).get_secret_value(
            SecretId=self.config.production_identity_secret,
        ).get("VersionId")
        if current_version != pinned_version:
            raise SafetyViolation(
                "Production identity credentials changed while the snapshot was being created;"
                " refusing a potentially inconsistent restore. Start a new operation."
            )
        self.emit(f"Production snapshot {snapshot_id} is available.")

    def step_copy_snapshot_to_cmk(self) -> None:
        rds = self._client("rds", PRODUCTION)
        target_id = self.encrypted_snapshot_id
        key = self._validated_kms_key(PRODUCTION, self.config.production_kms_key_id)
        key_arn = key["Arn"]
        self.manifest.set_resource("production_kms_key_arn", key_arn)

        def verify(snapshot: Dict[str, Any]) -> None:
            if not snapshot.get("Encrypted") or snapshot.get("KmsKeyId") != key_arn:
                raise SafetyViolation(f"Encrypted copy {target_id} has the wrong KMS provenance.")
            source_id = snapshot.get("SourceDBSnapshotIdentifier")
            if source_id and source_id != self.production_snapshot_id:
                raise SafetyViolation(f"Encrypted copy {target_id} has the wrong snapshot source.")

        def create() -> None:
            self._require_confirmation(
                self.prompter.confirm(
                    f"About to copy snapshot {self.production_snapshot_id} to {target_id},"
                    f" re-encrypting with customer-managed KMS key"
                    f" {self.config.production_kms_key_id} so it can be shared"
                    f" cross-account (the default aws/rds key cannot be)."
                ),
                "copy snapshot with re-encryption",
            )
            rds.copy_db_snapshot(
                SourceDBSnapshotIdentifier=self.production_snapshot_id,
                TargetDBSnapshotIdentifier=target_id,
                KmsKeyId=key_arn,
                Tags=self.ownership_tags,
            )

        self._create_or_adopt(describe=lambda: self._snapshot(rds, target_id),
                              verify=verify, create=create,
                              label=f"Encrypted copy {target_id}")
        self.manifest.set_resource("encrypted_snapshot_id", target_id)
        self.manifest.set_resource("encrypted_snapshot_arn", self.encrypted_snapshot_arn)

    def step_wait_encrypted_copy(self) -> None:
        rds = self._client("rds", PRODUCTION)
        target_id = self.manifest.get_resource("encrypted_snapshot_id", self.encrypted_snapshot_id)
        self._wait_for(
            lambda: self._snapshot_status(rds, target_id) or "not-found",
            ready="available",
            waiting_on=f"encrypted snapshot copy {target_id}",
        )
        snapshot = self._snapshot(rds, target_id)
        self._assert_owned(snapshot or {}, f"Encrypted snapshot copy {target_id}")
        expected_key = self.manifest.get_resource("production_kms_key_arn")
        if not snapshot.get("Encrypted") or snapshot.get("KmsKeyId") != expected_key:
            raise SafetyViolation(f"Encrypted snapshot copy {target_id} has unexpected encryption.")
        source_id = snapshot.get("SourceDBSnapshotIdentifier")
        if source_id and source_id != self.production_snapshot_id:
            raise SafetyViolation(f"Encrypted snapshot copy {target_id} source changed.")
        self.emit(f"Encrypted snapshot copy {target_id} is available.")

    def step_ensure_kms_grant(self) -> None:
        kms = self._client("kms", PRODUCTION)
        grantee = self.config.devtest_restore_role_arn
        key_arn = self.manifest.get_resource("production_kms_key_arn")
        if not key_arn:
            key_arn = self._validated_kms_key(
                PRODUCTION, self.config.production_kms_key_id)["Arn"]
        grants: List[Dict[str, Any]] = []
        marker = None
        for _page_number in range(MAX_API_PAGES):
            kwargs = {"KeyId": key_arn, "GranteePrincipal": grantee}
            if marker:
                kwargs["Marker"] = marker
            page = kms.list_grants(**kwargs)
            grants.extend(page.get("Grants", []))
            if not page.get("Truncated"):
                break
            marker = page.get("NextMarker")
            if not marker:
                raise RestoreError("KMS grant listing was truncated without a continuation marker.")
        else:
            raise RestoreError(f"KMS grant listing exceeded {MAX_API_PAGES} pages.")
        # A constrained grant cannot be evaluated from here and might still block the
        # copy, so only an unconstrained grant with the required operations counts.
        existing = [
            g for g in grants
            if g.get("GranteePrincipal") == grantee
            and set(KMS_GRANT_OPERATIONS) <= set(g.get("Operations", []))
            and not g.get("Constraints")
        ]
        grant_name = f"smaht-devtest-restore-{self.operation_id}"
        if existing:
            grant = next((item for item in existing if item.get("Name") == grant_name), existing[0])
            grant_id = grant.get("GrantId", "")
            if not grant_id:
                raise RestoreError("A matching KMS grant returned no GrantId.")
            owned_grant = grant.get("Name") == grant_name
            self.emit(f"KMS grant already in place for {grantee} (grant id {grant_id});"
                      f" no security-policy change needed.")
            self.manifest.set_resource("kms_grant_id", grant_id)
            self.manifest.set_resource("kms_grant_created_by_this_tool", owned_grant)
            return
        if not self.config.allow_kms_grant:
            raise SafetyViolation(
                f"No usable grant exists on KMS key {key_arn} for {grantee}."
                f" Creating one is a security-policy change and requires the explicit"
                f" --allow-kms-grant flag (needed on most runs, because this tool"
                f" revokes its temporary grant after the devtest copy completes)."
                f" Re-run resume with --allow-kms-grant to permit it."
            )
        self._require_confirmation(
            self.prompter.confirm(
                f"SECURITY-POLICY CHANGE: about to create a KMS grant on key"
                f" {key_arn} allowing role {grantee}"
                f" the operations {', '.join(KMS_GRANT_OPERATIONS)}. These let the"
                f" devtest role ask RDS to use the key for the shared snapshot copy;"
                f" they give the role no direct Encrypt/Decrypt permission. The grant"
                f" will be revoked automatically after the devtest-local snapshot copy"
                f" is available."
            ),
            "create KMS grant",
        )
        response = kms.create_grant(
            KeyId=key_arn,
            GranteePrincipal=grantee,
            Operations=KMS_GRANT_OPERATIONS,
            Name=grant_name,
            RetiringPrincipal=grantee,
        )
        grant_id = response.get("GrantId")
        if not grant_id:
            raise RestoreError(
                "KMS accepted grant creation but returned no GrantId; resume will"
                " discover the operation-named grant before continuing."
            )
        self.manifest.set_resource("kms_grant_id", grant_id)
        self.manifest.set_resource("kms_grant_created_by_this_tool", True)
        self.emit("KMS grant created (first use). Record the grant id above for audit.")

    def step_share_snapshot_with_devtest(self) -> None:
        rds = self._client("rds", PRODUCTION)
        snapshot_id = self.manifest.get_resource("encrypted_snapshot_id", self.encrypted_snapshot_id)
        snapshot = self._snapshot(rds, snapshot_id)
        self._assert_owned(snapshot or {}, f"Encrypted snapshot {snapshot_id}")
        attributes = rds.describe_db_snapshot_attributes(
            DBSnapshotIdentifier=snapshot_id,
        )["DBSnapshotAttributesResult"]["DBSnapshotAttributes"]
        restore_values: List[str] = []
        for attribute in attributes:
            if attribute.get("AttributeName") == "restore":
                restore_values = attribute.get("AttributeValues", [])
        if self.config.devtest_account_id in restore_values:
            self.emit(f"Snapshot {snapshot_id} is already shared with"
                      f" {self.config.devtest_account_id}.")
            return
        self._require_confirmation(
            self.prompter.confirm_typed(
                f"CROSS-ACCOUNT SHARE: about to share snapshot {snapshot_id} (production"
                f" data) with AWS account {self.config.devtest_account_id}.",
                required=self.config.devtest_account_id,
            ),
            "share snapshot with devtest account",
        )
        rds.modify_db_snapshot_attribute(
            DBSnapshotIdentifier=snapshot_id,
            AttributeName="restore",
            ValuesToAdd=[self.config.devtest_account_id],
        )
        self.emit(f"Snapshot {snapshot_id} shared with {self.config.devtest_account_id}.")

    def step_verify_devtest_account(self) -> None:
        self.emit(f"Verified devtest account {self.config.devtest_account_id}"
                  f" in {self.config.region}.")

    def step_copy_shared_snapshot(self) -> None:
        rds = self._client("rds", DEVTEST)
        target_id = self.devtest_snapshot_id
        source_arn = self.manifest.get_resource("encrypted_snapshot_arn", self.encrypted_snapshot_arn)
        key_arn = self._validated_kms_key(DEVTEST, self.config.devtest_kms_key_id)["Arn"]
        self.manifest.set_resource("devtest_kms_key_arn", key_arn)

        def verify(snapshot: Dict[str, Any]) -> None:
            if not snapshot.get("Encrypted") or snapshot.get("KmsKeyId") != key_arn:
                raise SafetyViolation(f"Devtest snapshot copy {target_id} has wrong KMS provenance.")
            source_id = snapshot.get("SourceDBSnapshotIdentifier")
            if source_id and source_id != source_arn:
                raise SafetyViolation(f"Devtest snapshot copy {target_id} has the wrong source.")

        def create() -> None:
            # Share/grant propagation settles quickly; a longer retry would only
            # disguise a genuinely broken grant or share as slowness.
            self._retry(
                lambda: rds.copy_db_snapshot(
                    SourceDBSnapshotIdentifier=source_arn,
                    TargetDBSnapshotIdentifier=target_id,
                    KmsKeyId=key_arn,
                    Tags=self.ownership_tags,
                ),
                retry_codes={"KMSKeyNotAccessibleFault", "DBSnapshotNotFound"},
                waiting_on="cross-account snapshot/grant propagation",
                timeout=min(PROPAGATION_TIMEOUT_SECONDS, self.config.poll_timeout),
            )

        self._create_or_adopt(describe=lambda: self._snapshot(rds, target_id),
                              verify=verify, create=create,
                              label=f"Devtest snapshot copy {target_id}")
        self.manifest.set_resource("devtest_snapshot_id", target_id)

    def step_wait_devtest_snapshot(self) -> None:
        rds = self._client("rds", DEVTEST)
        target_id = self.manifest.get_resource("devtest_snapshot_id", self.devtest_snapshot_id)
        self._wait_for(
            lambda: self._snapshot_status(rds, target_id) or "not-found",
            ready="available",
            waiting_on=f"devtest snapshot copy {target_id}",
        )
        snapshot = self._snapshot(rds, target_id)
        self._assert_owned(snapshot or {}, f"Devtest snapshot copy {target_id}")
        if snapshot.get("KmsKeyId") != self.manifest.get_resource("devtest_kms_key_arn"):
            raise SafetyViolation(f"Devtest snapshot copy {target_id} KMS key changed.")
        source_arn = self.manifest.get_resource("encrypted_snapshot_arn", self.encrypted_snapshot_arn)
        source_id = snapshot.get("SourceDBSnapshotIdentifier")
        if source_id and source_id != source_arn:
            raise SafetyViolation(f"Devtest snapshot copy {target_id} source changed.")
        self.emit(f"Devtest snapshot copy {target_id} is available.")

    def step_remove_temporary_source_access(self) -> None:
        rds = self._client("rds", PRODUCTION)
        snapshot_id = self.manifest.get_resource("encrypted_snapshot_id", self.encrypted_snapshot_id)
        attributes = rds.describe_db_snapshot_attributes(
            DBSnapshotIdentifier=snapshot_id,
        )["DBSnapshotAttributesResult"]["DBSnapshotAttributes"]
        restore_values = next(
            (item.get("AttributeValues", []) for item in attributes
             if item.get("AttributeName") == "restore"),
            [],
        )
        if self.config.devtest_account_id in restore_values:
            rds.modify_db_snapshot_attribute(
                DBSnapshotIdentifier=snapshot_id,
                AttributeName="restore",
                ValuesToRemove=[self.config.devtest_account_id],
            )
            self.emit(f"Removed the devtest share from production snapshot {snapshot_id}.")
        if self.manifest.get_resource("kms_grant_created_by_this_tool"):
            grant_id = self.manifest.get_resource("kms_grant_id")
            if grant_id and not self.manifest.get_resource("kms_grant_revoked"):
                try:
                    self._client("kms", PRODUCTION).revoke_grant(
                        KeyId=self.manifest.get_resource("production_kms_key_arn"),
                        GrantId=grant_id,
                    )
                except Exception as e:
                    if not _is_not_found(e):
                        raise
                self.manifest.set_resource("kms_grant_revoked", True)
                self.emit(f"Revoked temporary KMS grant {grant_id}.")

    def step_restore_database(self) -> None:
        rds = self._client("rds", DEVTEST)
        db_id = self.config.new_db_identifier
        protected = self._instance(rds, self.config.protected_db_identifier)
        if protected is None:
            raise SafetyViolation(
                f"Protected devtest database {self.config.protected_db_identifier} was not found;"
                " refusing to infer network placement."
            )
        protected_subnet = protected.get("DBSubnetGroup", {}).get("DBSubnetGroupName")
        protected_groups = {
            item.get("VpcSecurityGroupId") for item in protected.get("VpcSecurityGroups", [])
            if item.get("VpcSecurityGroupId")
        }
        requested_groups = set(self.config.vpc_security_group_ids)
        if (protected_subnet != self.config.db_subnet_group
                or protected_groups != requested_groups):
            raise SafetyViolation(
                "Requested DB subnet/security groups do not exactly match the protected"
                f" devtest database (subnet {protected_subnet!r}, groups"
                f" {sorted(protected_groups)}); refusing unsafe network placement."
            )

        def create() -> None:
            rds.restore_db_instance_from_db_snapshot(
                DBInstanceIdentifier=db_id,
                DBSnapshotIdentifier=self.manifest.get_resource(
                    "devtest_snapshot_id", self.devtest_snapshot_id),
                DBInstanceClass=self.config.instance_class,
                PubliclyAccessible=False,
                DBSubnetGroupName=self.config.db_subnet_group,
                VpcSecurityGroupIds=self.config.vpc_security_group_ids,
                Tags=self.ownership_tags,
            )

        self._create_or_adopt(describe=lambda: self._instance(rds, db_id),
                              verify=self._assert_database_configuration, create=create,
                              label=f"Database instance {db_id}")
        self.manifest.set_resource("new_db_identifier", db_id)

    def _assert_database_configuration(self, instance: Dict[str, Any]) -> None:
        subnet = instance.get("DBSubnetGroup", {}).get("DBSubnetGroupName")
        groups = {
            item.get("VpcSecurityGroupId") for item in instance.get("VpcSecurityGroups", [])
            if item.get("VpcSecurityGroupId")
        }
        if (instance.get("DBInstanceClass") != self.config.instance_class
                or instance.get("PubliclyAccessible") is not False
                or subnet != self.config.db_subnet_group
                or groups != set(self.config.vpc_security_group_ids)):
            raise SafetyViolation(
                f"Database {self.config.new_db_identifier} exists but its class/network"
                " configuration does not match this operation."
            )

    def step_wait_database_available(self) -> None:
        rds = self._client("rds", DEVTEST)
        db_id = self.manifest.get_resource("new_db_identifier", self.config.new_db_identifier)

        def status() -> str:
            instance = self._instance(rds, db_id)
            return instance["DBInstanceStatus"] if instance else "not-found"

        self._wait_for(status, ready="available", waiting_on=f"database instance {db_id}")
        instance = self._instance(rds, db_id)
        self._assert_owned(instance or {}, f"Database instance {db_id}")
        self._assert_database_configuration(instance or {})
        endpoint = instance.get("Endpoint", {})
        address, port = endpoint.get("Address", ""), endpoint.get("Port", 5432)
        if not address:
            raise RestoreError(f"Database {db_id} is available but reports no endpoint address.")
        self.manifest.set_resource("new_db_endpoint", address)
        self.manifest.set_resource("new_db_port", port)
        self.emit(f"Database {db_id} is available at {address}:{port}.")

    def step_update_identity_secret(self) -> None:
        endpoint = self.manifest.get_resource("new_db_endpoint")
        port = self.manifest.get_resource("new_db_port", 5432)
        if not endpoint:
            raise RestoreError("No restored endpoint recorded; run the restore steps first.")
        production_secrets = self._client("secretsmanager", PRODUCTION)
        devtest_secrets = self._client("secretsmanager", DEVTEST)
        pinned_version = self.manifest.get_resource("production_identity_version_id")
        if not pinned_version:
            raise RestoreError("No pinned production identity secret version is recorded.")
        production_response = production_secrets.get_secret_value(
            SecretId=self.config.production_identity_secret,
            VersionId=pinned_version,
        )
        devtest_response = devtest_secrets.get_secret_value(
            SecretId=self.config.devtest_identity_secret,
        )
        try:
            production_identity = json.loads(production_response["SecretString"])
            devtest_identity = json.loads(devtest_response["SecretString"])
        except (KeyError, TypeError, json.JSONDecodeError) as e:
            raise RestoreError("An identity secret is not a valid JSON object.") from e
        updated = dict(devtest_identity)
        updated["RDS_HOSTNAME"] = endpoint
        updated["RDS_PORT"] = str(port)
        for key in RDS_SECRET_KEYS:
            if key not in production_identity:
                raise RestoreError(
                    f"Production identity secret is missing expected key {key}; refusing"
                    f" to write a partial credential update."
                )
            updated[key] = production_identity[key]
        changed_keys = sorted(
            key for key in updated if devtest_identity.get(key) != updated[key]
        )
        version_token = uuid.uuid5(
            uuid.NAMESPACE_URL,
            f"smaht-restore-devtest-db:{self.operation_id}:identity",
        ).hex
        previous_version = devtest_response.get("VersionId")
        if previous_version == version_token:
            if devtest_identity != updated:
                raise SafetyViolation(
                    "The operation-owned devtest secret version has unexpected content;"
                    " refusing to adopt it."
                )
            self.manifest.set_resource("devtest_identity_new_version_id", version_token)
            self.manifest.set_resource("identity_updated_fields", changed_keys)
            self.emit("Devtest identity secret already contains this operation's verified version.")
            return
        self._require_confirmation(
            self.prompter.confirm_typed(
                f"CREDENTIAL REPLACEMENT: about to update devtest identity secret"
                f" {self.config.devtest_identity_secret} (keys changing:"
                f" {', '.join(changed_keys)}; values not shown).\n"
                f"WARNING: the restored database keeps PRODUCTION credentials, so after"
                f" this step the devtest database password matches production. Treat the"
                f" devtest environment as containing production secrets until the"
                f" password is rotated.",
                required=CREDENTIAL_CONFIRMATION_PHRASE,
            ),
            "replace devtest identity credentials",
        )
        current_version = devtest_secrets.get_secret_value(
            SecretId=self.config.devtest_identity_secret,
        ).get("VersionId")
        if current_version != previous_version:
            raise SafetyViolation(
                "The devtest identity secret changed after it was reviewed; refusing to"
                " overwrite a concurrent update. Resume to review the new version."
            )
        response = devtest_secrets.put_secret_value(
            SecretId=self.config.devtest_identity_secret,
            SecretString=json.dumps(updated),
            ClientRequestToken=version_token,
        )
        new_version = response.get("VersionId")
        if new_version != version_token:
            raise RestoreError("Secrets Manager returned an unexpected devtest identity version id.")
        verified_response = devtest_secrets.get_secret_value(
            SecretId=self.config.devtest_identity_secret,
        )
        try:
            verified_identity = json.loads(verified_response["SecretString"])
        except (KeyError, TypeError, json.JSONDecodeError) as e:
            raise RestoreError("Updated devtest identity secret is not valid JSON.") from e
        if (verified_response.get("VersionId") != version_token
                or verified_identity != updated):
            raise SafetyViolation(
                "The devtest identity secret did not verify as the operation-owned"
                " current version after update."
            )
        if previous_version:
            self.manifest.set_resource("devtest_identity_previous_version_id", previous_version)
        if new_version:
            self.manifest.set_resource("devtest_identity_new_version_id", new_version)
        self.manifest.set_resource("identity_updated_fields", changed_keys)
        self.emit(f"Devtest identity secret updated ({len(changed_keys)} keys changed;"
                  f" values not shown).")

    # -- deployment / reindex (in-place database swap) ---------------------------------
    #
    # The environment's ECS cluster, one-shot deployment task definition family, and
    # indexing queues are all resolved from the environment name, following the DCIC
    # convention (dcicutils.ecs_utils / snovault queue naming). No ECS service is
    # described, mutated, scaled, or force-redeployed.

    @staticmethod
    def _normalized(value: str) -> str:
        return re.sub(r"[^a-z0-9]", "", value.lower())

    def _paginate(self, fetch: Callable[[Optional[str]], Dict[str, Any]],
                  result_key: str, what: str) -> List[Any]:
        items: List[Any] = []
        token: Optional[str] = None
        for _page_number in range(MAX_API_PAGES):
            page = fetch(token)
            items.extend(page.get(result_key, []))
            token = page.get("nextToken")
            if not token:
                return items
        raise RestoreError(f"{what} listing exceeded {MAX_API_PAGES} pages.")

    def _resolve_unique(self, candidates: List[str], what: str) -> str:
        env = self.config.devtest_env_name
        matches = sorted(
            candidate for candidate in candidates
            if self._normalized(env) in self._normalized(candidate.rsplit("/", 1)[-1])
        )
        if len(matches) != 1:
            raise RestoreError(
                f"Expected exactly one {what} matching environment {env!r}, found"
                f" {len(matches)}: {matches or sorted(candidates)}. Refusing to guess."
            )
        return matches[0]

    def _resolve_durable(self, resource_key: str, resolved: str, what: str) -> str:
        """Persist a resolved identifier and refuse a mid-operation change."""
        stored = self.manifest.get_resource(resource_key)
        if stored and stored != resolved:
            raise SafetyViolation(
                f"The resolved {what} changed from {stored!r} to {resolved!r} during"
                f" this operation; refusing to continue against a moved environment."
            )
        self.manifest.set_resource(resource_key, resolved)
        return resolved

    def _resolve_cluster_arn(self, ecs: Any) -> str:
        arns = self._paginate(
            lambda token: ecs.list_clusters(**({"nextToken": token} if token else {})),
            "clusterArns", "ECS cluster")
        cluster_arn = self._resolve_unique(arns, "ECS cluster")
        return self._resolve_durable("devtest_cluster_arn", cluster_arn, "ECS cluster")

    def _resolve_deployment_task_family(self, ecs: Any) -> str:
        families = self._paginate(
            lambda token: ecs.list_task_definition_families(
                status="ACTIVE", **({"nextToken": token} if token else {})),
            "families", "ECS task definition family")
        # The initial-deployment task definition wipes the database and search
        # contents; it must never be matched here.
        candidates = [
            family for family in families
            if "deployment" in family.lower() and "initial" not in family.lower()
        ]
        family = self._resolve_unique(candidates, "deployment task definition family")
        return self._resolve_durable("deployment_task_family", family,
                                     "deployment task definition family")

    def _resolve_indexer_queue_urls(self, sqs: Any) -> List[str]:
        urls: List[str] = []
        for suffix in INDEXER_QUEUE_SUFFIXES:
            name = f"{self.config.devtest_env_name}{suffix}"
            try:
                url = sqs.get_queue_url(QueueName=name)["QueueUrl"]
            except Exception as e:
                if "NonExistentQueue" in _error_code(e) or _is_not_found(e):
                    raise RestoreError(
                        f"Indexing queue {name} was not found in the devtest account;"
                        f" check --devtest-env-name against the environment's queues."
                    ) from e
                raise
            match = SQS_QUEUE_URL_PATTERN.fullmatch(url)
            if (not match or match.group("region") != self.config.region
                    or match.group("account") != self.config.devtest_account_id):
                raise SafetyViolation(
                    f"Resolved queue URL for {name} is not in the configured devtest"
                    f" account and region; refusing to poll it."
                )
            urls.append(url)
        stored = self.manifest.get_resource("indexer_queue_urls")
        if stored and stored != urls:
            raise SafetyViolation(
                "The resolved indexing queue URLs changed during this operation;"
                " refusing to continue."
            )
        self.manifest.set_resource("indexer_queue_urls", urls)
        return urls

    def _index_queue_counts(self, sqs: Any, queue_urls: List[str]) -> Dict[str, int]:
        totals = {"waiting": 0, "inflight": 0}
        for queue_url in queue_urls:
            attrs = sqs.get_queue_attributes(
                QueueUrl=queue_url,
                AttributeNames=[
                    "ApproximateNumberOfMessages",
                    "ApproximateNumberOfMessagesNotVisible",
                ],
            ).get("Attributes", {})
            totals["waiting"] += int(attrs.get("ApproximateNumberOfMessages", 0))
            totals["inflight"] += int(attrs.get("ApproximateNumberOfMessagesNotVisible", 0))
        return totals

    def _describe_deployment_task(self, ecs: Any, cluster_arn: str,
                                  task_arn: str) -> Optional[Dict[str, Any]]:
        response = ecs.describe_tasks(cluster=cluster_arn, tasks=[task_arn])
        tasks = response.get("tasks", [])
        if response.get("failures") or not tasks:
            return None
        return tasks[0]

    def step_run_deployment_and_reindex(self) -> None:
        ecs = self._client("ecs", DEVTEST)
        sqs = self._client("sqs", DEVTEST)
        cluster_arn = self._resolve_cluster_arn(ecs)
        family = self._resolve_deployment_task_family(ecs)
        queue_urls = self._resolve_indexer_queue_urls(sqs)

        if not self.manifest.get_resource("deployment_succeeded"):
            task_arn = self.manifest.get_resource("deployment_task_arn")
            if task_arn and self._describe_deployment_task(ecs, cluster_arn, task_arn) is None:
                # ECS retains stopped tasks only briefly; a task that can no longer be
                # described cannot be verified, so re-run it (with confirmation again)
                # rather than assume it succeeded.
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
                        f" scaled, or force-redeployed."
                    ),
                    "run the environment deployment task",
                )
                response = ecs.run_task(
                    cluster=cluster_arn,
                    taskDefinition=family,
                    count=1,
                    startedBy=f"restore-{self.operation_id}"[:36],
                    networkConfiguration={"awsvpcConfiguration": {
                        "subnets": [self.config.deployment_subnet],
                        "securityGroups": [self.config.deployment_security_group],
                    }},
                )
                if response.get("failures") or len(response.get("tasks", [])) != 1:
                    raise RestoreError("ECS failed to start exactly one deployment task.")
                task_arn = response["tasks"][0]["taskArn"]
                self.manifest.set_resource("deployment_task_arn", task_arn)

            def task_status() -> str:
                task = self._describe_deployment_task(ecs, cluster_arn, task_arn)
                if task is None:
                    raise RestoreError(
                        f"Deployment task {task_arn} disappeared before it could be"
                        f" verified; resume to run a new deployment task."
                    )
                return task.get("lastStatus", "UNKNOWN")

            self._wait_for(task_status, ready="STOPPED",
                           waiting_on=f"deployment task {task_arn}")
            task = self._describe_deployment_task(ecs, cluster_arn, task_arn)
            containers = (task or {}).get("containers", [])
            if not containers or any(container.get("exitCode") != 0 for container in containers):
                # Clear the durable task pointer so resume runs a fresh task (with
                # confirmation) instead of re-verifying the same failed task forever.
                self.manifest.set_resource("deployment_task_arn", "")
                raise RestoreError(
                    "The deployment task stopped without successful container exit"
                    " codes; investigate its logs, then resume to run it again."
                )
            self.manifest.set_resource("deployment_succeeded", True)
            self.emit(f"Deployment task {task_arn} succeeded: search mappings recreated"
                      f" and reindex enqueued.")

        # Reindex health: wait until the environment's indexing queues fully drain.
        # This is an absolute check with no enqueue-observation baseline, so a resume
        # after the queues already drained passes immediately instead of waiting for
        # a spike that will never reappear.
        consecutive_empty = 0

        def queue_status() -> str:
            nonlocal consecutive_empty
            counts = self._index_queue_counts(sqs, queue_urls)
            if counts["waiting"] == 0 and counts["inflight"] == 0:
                consecutive_empty += 1
                if consecutive_empty >= EMPTY_QUEUE_CONFIRMATIONS:
                    return "empty"
                return f"empty confirmation {consecutive_empty}/{EMPTY_QUEUE_CONFIRMATIONS}"
            consecutive_empty = 0
            return f"{counts['waiting']} waiting/{counts['inflight']} inflight"

        self._wait_for(
            queue_status,
            ready="empty",
            waiting_on="devtest indexing queues",
            timeout=self.config.reindex_timeout,
        )
        self.manifest.set_resource("reindex_completed", True)
        self.emit("Deployment task succeeded and all indexing queues drained; the"
                  " restored database is serving the reindexed environment.")

    def step_stop_old_database(self) -> None:
        old_db = self.config.old_db_identifier
        if not old_db:
            self.emit(
                "No --old-db-identifier supplied: nothing to stop. The original devtest"
                f" database {self.config.protected_db_identifier} is protected and stays"
                " alive as the rollback safety net (consider resizing it small instead)."
            )
            self.manifest.mark_step("stop_old_database", "skipped")
            return
        # Config validation already refuses protected/source/new collisions, but this
        # step is the last line of defense before a stop call, so re-check here.
        if old_db == self.config.protected_db_identifier:
            raise SafetyViolation(
                f"Refusing to stop {old_db}: it is the protected original devtest"
                f" database (rollback safety net). This tool never stops it."
            )
        if not self.manifest.get_resource("reindex_completed"):
            raise SafetyViolation(
                "Refusing to stop an old database before deployment health and reindex"
                " completion gates have passed."
            )
        if not self.config.allow_stop_old_db:
            raise SafetyViolation(
                f"Stopping old database {old_db} requires the explicit"
                f" --allow-stop-old-db flag. The database is left running."
                f" This tool never deletes databases."
            )
        rds = self._client("rds", DEVTEST)
        instance = self._instance(rds, old_db)
        if instance is None:
            raise RestoreError(f"Old database {old_db} not found in the devtest account;"
                               f" not stopping anything.")
        if instance.get("DBInstanceStatus") == "stopped":
            self.emit(f"Old database {old_db} is already stopped.")
            return
        tags = {tag.get("Key"): tag.get("Value") for tag in instance.get("TagList", [])}
        prior_operation = tags.get(OPERATION_TAG_KEY, "")
        prior_fingerprint = tags.get(CONFIG_TAG_KEY, "")
        if (not OPERATION_ID_PATTERN.fullmatch(prior_operation)
                or not re.fullmatch(r"[0-9a-f]{64}", prior_fingerprint)):
            raise SafetyViolation(
                f"Refusing to stop {old_db}: it is not tagged as a database created"
                " by a prior restore-devtest-db operation."
            )
        self._require_confirmation(
            self.prompter.confirm_typed(
                f"FINAL STEP: about to STOP (not delete) old devtest database {old_db}."
                f" It remains restorable by starting it again. This tool never deletes"
                f" databases.",
                required=old_db,
            ),
            "stop old devtest database",
        )
        rds.stop_db_instance(DBInstanceIdentifier=old_db)
        self.manifest.set_resource("stopped_old_db_identifier", old_db)
        self.emit(f"Old database {old_db} stopping. Start it again from the AWS console"
                  f" or CLI if rollback is needed.")

    # -- runner ------------------------------------------------------------------------

    def run(self) -> None:
        self.manifest.set_status("in_progress")
        for definition in STEP_DEFINITIONS:
            try:
                self._check_cancelled()
            except OperationCancelled:
                self.manifest.set_status("cancelled")
                raise
            if self.manifest.step_status(definition.name) in ("completed", "skipped"):
                self.emit(f"[{definition.name}] already done; skipping.")
                continue
            self.emit(f"[{definition.name}] {definition.description}")
            try:
                if definition.scope:
                    self.verify_account(definition.scope)
                self.manifest.mark_step(definition.name, "in_progress")
                getattr(self, f"step_{definition.name}")()
                if self.manifest.step_status(definition.name) == "in_progress":
                    self.manifest.mark_step(definition.name, "completed")
            except ConfirmationDeclined as e:
                self.manifest.mark_step(definition.name, "declined", error=str(e))
                self.manifest.set_status("paused")
                raise
            except OperationCancelled:
                self.manifest.mark_step(definition.name, "pending")
                self.manifest.set_status("cancelled")
                raise
            except KeyboardInterrupt as e:
                self.manifest.mark_step(definition.name, "interrupted")
                self.manifest.set_status("interrupted")
                raise OperationInterrupted(
                    f"Operation {self.operation_id} was interrupted during"
                    f" {definition.name}. State is checkpointed; resume with:"
                    f" restore-devtest-db resume --operation-id {self.operation_id}"
                ) from e
            except RestoreError as e:
                self.manifest.mark_step(definition.name, "failed", error=str(e))
                self.manifest.set_status("failed")
                raise
            except Exception as e:
                # Unknown failure: record it and fail closed with a recovery path.
                code = _error_code(e)
                message = f"{type(e).__name__}" + (f" ({code})" if code else "")
                self.manifest.mark_step(definition.name, "failed", error=message)
                self.manifest.set_status("failed")
                raise RestoreError(
                    f"Step {definition.name} failed: {message}. State is checkpointed;"
                    f" fix the cause and run: restore-devtest-db resume --operation-id"
                    f" {self.operation_id}"
                ) from e
        self.manifest.set_status("completed")
        self.emit(f"Operation {self.operation_id} completed. The protected database"
                  f" {self.config.protected_db_identifier} was not modified.")


def _error_code(exception: Exception) -> str:
    response = getattr(exception, "response", None)
    if isinstance(response, dict):
        code = response.get("Error", {}).get("Code", "")
        if isinstance(code, str) and SAFE_AWS_ERROR_CODE_PATTERN.fullmatch(code):
            return code
    return ""


def _is_not_found(exception: Exception) -> bool:
    code = _error_code(exception)
    return code.endswith("NotFound") or code.endswith("NotFoundFault") or "NotFound" in code


def _is_already_exists(exception: Exception) -> bool:
    code = _error_code(exception)
    return "AlreadyExists" in code or "DBSnapshotAlreadyExists" in code


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
    emit(f"  production account: {config.production_account_id}   devtest account:"
         f" {config.devtest_account_id}   region: {config.region}")
    emit(f"  source db: {config.source_db_identifier}   protected db (never stopped):"
         f" {config.protected_db_identifier}")
    emit(f"  new db: {config.new_db_identifier or '<required for run>'} "
         f"({config.instance_class})   old db to stop:"
         f" {config.old_db_identifier or '<none: nothing will be stopped>'}")
    emit(f"  operation id: {operation_id} (pass this exact id to run for the planned names)")
    emit(f"  profiles: production={config.production_profile} devtest={config.devtest_profile}")
    emit(f"  KMS: production={config.production_kms_key_id} devtest={config.devtest_kms_key_id}")
    emit(f"  KMS grantee: {config.devtest_restore_role_arn}")
    emit(f"  identity secrets: production={config.production_identity_secret}"
         f" devtest={config.devtest_identity_secret}")
    emit(f"  DB network: subnet={config.db_subnet_group}"
         f" security-groups={','.join(config.vpc_security_group_ids)}")
    emit(f"  environment name: {config.devtest_env_name} (resolves the ECS cluster,"
         f" the deployment task definition, and the"
         f" {'/'.join(INDEXER_QUEUE_SUFFIXES)} indexing queues)")
    emit(f"  deployment task network: subnet={config.deployment_subnet}"
         f" security-group={config.deployment_security_group}")
    emit("  ECS services: none are described, mutated, scaled, or force-redeployed")
    for number, definition in enumerate(STEP_DEFINITIONS, start=1):
        scope = f"[{definition.scope}]" if definition.scope else "[local]"
        emit(f"  {number:2d}. {scope:12s} {definition.name}")
        emit(f"      {definition.description}")
        if definition.confirmation:
            emit(f"      confirmation: {definition.confirmation}")
        if definition.opt_in_flag:
            enabled = getattr(config, definition.opt_in_flag.strip("-").replace("-", "_"), False)
            emit(f"      opt-in: {definition.opt_in_flag}"
                 f" ({'supplied' if enabled else 'NOT supplied; step will refuse to mutate'})")
    emit("This tool never deletes a database and never stops the protected database.")


def print_status(manifest: Manifest, emit: Callable[[str], None] = print) -> None:
    data = manifest.data
    emit(f"operation: {data['operation_id']}   status: {data['status']}"
         f"   cancel_requested: {manifest.cancel_requested_on_disk()}")
    emit(f"created: {data.get('created_at')}   updated: {data.get('updated_at')}")
    for name in STEP_NAMES:
        entry = data["steps"].get(name, {})
        line = f"  {entry.get('status', 'pending'):12s} {name}"
        if entry.get("error"):
            line += f"  ({entry['error']})"
        emit(line)
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
                           help="identifier for the newly restored devtest database (required for run)")
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
    sizing = parser.add_argument_group("sizing")
    sizing.add_argument("--instance-class", default=DEFAULT_INSTANCE_CLASS,
                        help=f"instance class for the restored database"
                             f" (default {DEFAULT_INSTANCE_CLASS}, sized for ~16 indexers)")
    sizing.add_argument("--db-subnet-group", default="",
                        help="required DB subnet group; must match the protected devtest database")
    sizing.add_argument("--vpc-security-group-id", action="append", default=[],
                        dest="vpc_security_group_ids",
                        help="required VPC security group matching protected devtest (repeatable)")
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
                        help="permit creating a KMS grant for the devtest restore role"
                             " on first use (a security-policy change)")
    opt_in.add_argument("--allow-stop-old-db", action="store_true",
                        help="permit stopping (never deleting) the --old-db-identifier database")


def _add_common_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--state-dir", default=DEFAULT_STATE_DIR,
                        help=f"directory for operation manifests (default {DEFAULT_STATE_DIR})")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="restore-devtest-db",
        description="Restore the smaht-devtest RDS database from a snapshot of"
                    " smaht-production. Resumable, checkpointed, and deliberately"
                    " conservative: it never deletes a database, never stops the"
                    " protected original devtest database, and fails closed on any"
                    " account/region/role mismatch. There is no --yes bypass.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    plan = subparsers.add_parser("plan", help="print the step plan; makes no AWS calls")
    _add_common_arguments(plan)
    _add_config_arguments(plan)
    plan.add_argument("--operation-id", default="",
                      help="stable operation id to preview (default: generated; reuse for run)")

    run = subparsers.add_parser("run", help="start a new restore operation")
    _add_common_arguments(run)
    _add_config_arguments(run)
    run.add_argument("--operation-id", default="",
                     help="optional explicit operation id (default: generated)")
    run.add_argument("--dry-run", action="store_true",
                     help="alias for plan: print the step plan and exit")

    resume = subparsers.add_parser("resume", help="resume an existing operation from its checkpoint")
    _add_common_arguments(resume)
    resume.add_argument("--operation-id", required=True)
    _add_opt_in_arguments(resume)

    status = subparsers.add_parser("status", help="show an operation's checkpointed progress")
    _add_common_arguments(status)
    status.add_argument("--operation-id", default="",
                        help="operation to show (default: list all operations)")

    cancel = subparsers.add_parser("cancel", help="request cancellation at the next step/poll boundary")
    _add_common_arguments(cancel)
    cancel.add_argument("--operation-id", required=True)

    return parser


def config_from_args(args: argparse.Namespace) -> RestoreConfig:
    return RestoreConfig(
        production_account_id=args.production_account_id,
        devtest_account_id=args.devtest_account_id,
        region=args.region,
        production_profile=args.production_profile,
        devtest_profile=args.devtest_profile,
        production_kms_key_id=args.production_kms_key_id,
        devtest_restore_role_arn=args.devtest_restore_role_arn,
        production_identity_secret=args.production_identity_secret,
        devtest_identity_secret=args.devtest_identity_secret,
        devtest_env_name=args.devtest_env_name,
        deployment_subnet=args.deployment_subnet,
        deployment_security_group=args.deployment_security_group,
        source_db_identifier=args.source_db_identifier,
        protected_db_identifier=args.protected_db_identifier,
        new_db_identifier=args.new_db_identifier,
        old_db_identifier=args.old_db_identifier,
        devtest_kms_key_id=args.devtest_kms_key_id,
        instance_class=args.instance_class,
        db_subnet_group=args.db_subnet_group,
        vpc_security_group_ids=list(args.vpc_security_group_ids),
        production_role_name=args.production_role_name,
        devtest_role_name=args.devtest_role_name,
        poll_interval=args.poll_interval,
        poll_timeout=args.poll_timeout,
        reindex_timeout=args.reindex_timeout,
        allow_kms_grant=args.allow_kms_grant,
        allow_stop_old_db=args.allow_stop_old_db,
    )


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
    except OperationCancelled as e:
        emit(str(e))
        return 4
    except OperationInterrupted as e:
        emit(str(e))
        return 130
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

    if args.command == "status":
        try:
            if args.operation_id:
                print_status(Manifest.load(state_dir, args.operation_id), emit)
            else:
                operations = Manifest.list_operations(state_dir)
                if not operations:
                    emit(f"No operations found in {state_dir}.")
                for operation_id in operations:
                    manifest = Manifest.load(state_dir, operation_id)
                    emit(f"{operation_id}: {manifest.data['status']}")
            return 0
        except RestoreError as e:
            emit(f"SAFETY: {e}")
            return 2

    if args.command == "cancel":
        try:
            manifest = Manifest.load(state_dir, args.operation_id)
            manifest.request_cancel()
            emit(f"Cancellation requested for {args.operation_id}; the run stops at the next"
                 f" step or polling boundary. Resume later with 'resume'.")
            return 0
        except RestoreError as e:
            emit(f"SAFETY: {e}")
            return 2

    if args.command == "plan" or (args.command == "run" and args.dry_run):
        config = config_from_args(args)
        try:
            config.validate()
        except SafetyViolation as e:
            emit(f"SAFETY: {e}")
            return 2
        operation_id = args.operation_id or generate_operation_id()
        if (not OPERATION_ID_PATTERN.fullmatch(operation_id)
                or operation_id.endswith("-") or "--" in operation_id):
            emit(f"SAFETY: Invalid operation id {operation_id!r}.")
            return 2
        print_plan(config, operation_id, emit)
        return 0

    if args.command == "run":
        config = config_from_args(args)
        try:
            config.validate()
        except SafetyViolation as e:
            emit(f"SAFETY: {e}")
            return 2
        operation_id = args.operation_id or generate_operation_id()
        try:
            manifest = Manifest.create(state_dir, operation_id, config)
            emit(f"Started operation {operation_id} (manifest: {manifest.path}).")
            with OperationLock(manifest):
                orchestrator = RestoreOrchestrator(
                    config, manifest, client_factory_builder(config), prompter,
                    emit=emit, sleep_fn=sleep_fn,
                )
                return _run_operation(orchestrator, emit)
        except RestoreError as e:
            emit(f"SAFETY: {e}")
            return 2

    if args.command == "resume":
        try:
            manifest = Manifest.load(state_dir, args.operation_id)
            with OperationLock(manifest):
                manifest = Manifest.load(state_dir, args.operation_id)
                if manifest.data["status"] == "completed":
                    emit(f"Operation {args.operation_id} is already completed.")
                    return 0
                config = RestoreConfig.from_persisted_dict(
                    manifest.data["config"],
                    allow_kms_grant=args.allow_kms_grant,
                    allow_stop_old_db=args.allow_stop_old_db,
                )
                config.validate()
                if config.fingerprint() != manifest.data.get("config_fingerprint"):
                    emit("SAFETY: manifest configuration fingerprint mismatch; the manifest may"
                         " have been edited. Refusing to resume.")
                    return 2
                if manifest.cancel_requested_on_disk():
                    if not prompter.confirm(
                            f"Operation {args.operation_id} has a pending cancellation request."
                            f" Clear it and resume?"):
                        emit("Leaving the cancellation request in place.")
                        return 4
                    manifest.clear_cancel()
                emit(f"Resuming operation {args.operation_id}; completed steps will be skipped.")
                orchestrator = RestoreOrchestrator(
                    config, manifest, client_factory_builder(config), prompter,
                    emit=emit, sleep_fn=sleep_fn,
                )
                return _run_operation(orchestrator, emit)
        except RestoreError as e:
            emit(f"SAFETY: {e}")
            return 2

    raise RestoreError(f"Unknown command {args.command!r}")  # pragma: no cover


if __name__ == "__main__":
    raise SystemExit(main())
