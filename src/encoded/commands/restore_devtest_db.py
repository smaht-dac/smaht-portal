"""restore-devtest-db: restore the smaht-devtest RDS database from a snapshot of smaht-production.

This is an operator-facing, production-adjacent workflow. The command walks a fixed,
resumable sequence of steps:

  Production account:
    1. Verify the production STS caller identity (account/region/role).
    2. Create a snapshot of the production database (confirmation required).
    3. Copy the snapshot, re-encrypting from the default aws/rds key to a
       customer-managed KMS key (confirmation required).
    4. Ensure a KMS grant lets the devtest restore role use that key. Creating the
       grant is a security-policy change and requires both --allow-kms-grant and an
       interactive confirmation; on subsequent runs the existing grant is reused.
    5. Share the encrypted snapshot copy with the devtest account (confirmation
       requires typing the devtest account id).

  Devtest account:
    6. Verify the devtest STS caller identity.
    7. Copy the shared snapshot into the devtest account under the devtest KMS key.
    8. Restore a new database instance from that copy (default db.t4g.medium).
    9. Update the devtest IDENTITY secret with the new endpoint and the production
       database credentials (confirmation requires typing a fixed phrase; secret
       values are never printed or persisted).
   10. Redeploy the portal services and scale indexers (default 16) to reindex.
   11. Optionally stop -- never delete -- a previous replaceable restored database.
       Requires both --allow-stop-old-db and typing the database identifier. The
       original protected devtest database is never stopped by this tool; it stays
       alive as the rollback safety net.

Every run has a stable operation id and a JSON manifest checkpoint (no secrets) so
`resume`, `status`, and `cancel` work across invocations. All mutating steps are
idempotent: completed steps are skipped and already-existing AWS resources are
adopted rather than recreated. The tool deliberately refuses to delete any database,
to stop the protected database, and to proceed on any account/region/role mismatch.

See docs/operations/restore_devtest_db.md for the full operator guide.
"""

import argparse
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
DEFAULT_INDEXER_COUNT = 16
MAX_INDEXER_COUNT = 64
DEFAULT_DEVTEST_KMS_KEY = "alias/aws/rds"

KMS_GRANT_OPERATIONS = ["Decrypt", "DescribeKey", "CreateGrant"]

# Identity-secret keys copied from the production identity into the devtest identity,
# because the restored database keeps production's users and passwords.
RDS_SECRET_KEYS = ("RDS_USERNAME", "RDS_PASSWORD", "RDS_DB_NAME")

# Substrings that mark a secret key name whose value must never be printed or persisted.
SECRET_KEY_MARKERS = ("PASSWORD", "SECRET", "KEY", "TOKEN", "CREDENTIAL")

CREDENTIAL_CONFIRMATION_PHRASE = "replace-devtest-credentials"

POLL_INTERVAL_SECONDS = 30
POLL_TIMEOUT_SECONDS = 2 * 60 * 60  # snapshots/restores of a large database are slow

ACCOUNT_ID_PATTERN = re.compile(r"^[0-9]{12}$")


class RestoreError(Exception):
    """Base error for the restore workflow; message is safe to print."""


class SafetyViolation(RestoreError):
    """A safety rail failed closed (mismatched account, refused mutation, ...)."""


class ConfirmationDeclined(RestoreError):
    """The operator declined an interactive confirmation."""


class OperationCancelled(RestoreError):
    """Cancellation was requested for this operation."""


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
    devtest_ecs_cluster: str = ""
    source_db_identifier: str = DEFAULT_SOURCE_DB
    protected_db_identifier: str = DEFAULT_PROTECTED_DB
    new_db_identifier: str = ""
    old_db_identifier: str = ""
    devtest_kms_key_id: str = DEFAULT_DEVTEST_KMS_KEY
    instance_class: str = DEFAULT_INSTANCE_CLASS
    indexer_count: int = DEFAULT_INDEXER_COUNT
    db_subnet_group: str = ""
    vpc_security_group_ids: List[str] = field(default_factory=list)
    production_role_name: str = ""
    devtest_role_name: str = ""
    poll_interval: int = POLL_INTERVAL_SECONDS
    poll_timeout: int = POLL_TIMEOUT_SECONDS
    # Opt-in flags are deliberately NOT persisted to the manifest: they must be
    # re-supplied on every invocation that needs them.
    allow_kms_grant: bool = False
    allow_stop_old_db: bool = False

    PERSISTED_FIELDS = (
        "production_account_id", "devtest_account_id", "region",
        "production_profile", "devtest_profile", "production_kms_key_id",
        "devtest_restore_role_arn", "production_identity_secret",
        "devtest_identity_secret", "devtest_ecs_cluster",
        "source_db_identifier", "protected_db_identifier", "new_db_identifier",
        "old_db_identifier", "devtest_kms_key_id", "instance_class",
        "indexer_count", "db_subnet_group", "vpc_security_group_ids",
        "production_role_name", "devtest_role_name", "poll_interval", "poll_timeout",
    )
    FINGERPRINT_FIELDS = (
        "production_account_id", "devtest_account_id", "region",
        "source_db_identifier", "protected_db_identifier", "new_db_identifier",
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
            "devtest_ecs_cluster": self.devtest_ecs_cluster,
            "new_db_identifier": self.new_db_identifier,
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
        if not (1 <= self.indexer_count <= MAX_INDEXER_COUNT):
            raise SafetyViolation(
                f"indexer_count must be between 1 and {MAX_INDEXER_COUNT} (16 is the"
                f" documented starting point for a small database), got {self.indexer_count}."
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
        return hashlib.sha256(payload.encode()).hexdigest()[:16]


class Manifest:
    """JSON checkpoint for one operation. Never contains secret values."""

    def __init__(self, path: Path, data: Dict[str, Any]):
        self.path = path
        self.data = data

    # -- construction / persistence -------------------------------------------------

    @classmethod
    def create(cls, state_dir: Path, operation_id: str, config: RestoreConfig) -> "Manifest":
        state_dir.mkdir(parents=True, exist_ok=True)
        path = state_dir / f"{operation_id}.json"
        if path.exists():
            raise RestoreError(f"Operation {operation_id} already exists at {path};"
                               f" use resume/status/cancel instead.")
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
        manifest.save()
        return manifest

    @classmethod
    def load(cls, state_dir: Path, operation_id: str) -> "Manifest":
        path = state_dir / f"{operation_id}.json"
        if not path.exists():
            raise RestoreError(f"No manifest found for operation {operation_id} in {state_dir}.")
        with open(path) as f:
            return cls(path, json.load(f))

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

    def save(self) -> None:
        self.data["updated_at"] = utcnow_iso()
        self._assert_no_secret_values(self.data)
        serialized = json.dumps(self.data, indent=2, sort_keys=True)
        tmp_path = self.path.with_suffix(".json.tmp")
        tmp_path.write_text(serialized)
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
        if status in ("completed", "skipped", "failed", "declined"):
            entry["finished_at"] = utcnow_iso()
        if error:
            entry["error"] = error
        self.save()

    def set_resource(self, key: str, value: Any) -> None:
        if is_secret_key(key):
            raise SafetyViolation(f"Refusing to persist secret-like resource key {key!r}.")
        self.data["resources"][key] = value
        self.save()

    def get_resource(self, key: str, default: Any = None) -> Any:
        return self.data["resources"].get(key, default)

    def set_status(self, status: str) -> None:
        self.data["status"] = status
        self.save()

    def request_cancel(self) -> None:
        self.data["cancel_requested"] = True
        self.save()

    def clear_cancel(self) -> None:
        self.data["cancel_requested"] = False
        self.save()

    def cancel_requested_on_disk(self) -> bool:
        """Re-read the manifest so a `cancel` issued from another terminal is seen."""
        if self.path.exists():
            with open(self.path) as f:
                on_disk = json.load(f)
            return bool(on_disk.get("cancel_requested"))
        return bool(self.data.get("cancel_requested"))


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
        "Ensure the devtest restore role holds a KMS grant on the customer-managed key."
        " Reuses an existing grant; creating one is a security-policy change.",
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
        "restore_database", DEVTEST,
        f"Restore a new database instance from the devtest snapshot"
        f" (default {DEFAULT_INSTANCE_CLASS}, sized for ~{DEFAULT_INDEXER_COUNT} indexers).",
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
        "update_application_and_reindex", DEVTEST,
        "Force a new deployment of the devtest ECS services (reruns the deployment"
        " entrypoint, which recreates mappings and reindexes) and scale the indexer"
        " service (default 16 workers for a small database).",
        confirmation="yes/no confirmation before redeploy/reindex",
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
            if expected_role not in arn:
                raise SafetyViolation(
                    f"STS caller ARN for the {scope} profile does not include the"
                    f" expected role name {expected_role!r}. Refusing to continue."
                )

    def _wait_for(self, describe: Callable[[], str], *, ready: str, waiting_on: str) -> None:
        """Bounded polling with cancellation checks between polls.

        ``describe`` returns the current status string; terminal failure statuses
        raise. Elapsed time is tracked by accumulating sleep intervals so tests can
        inject a no-op sleep."""
        waited = 0
        while True:
            self._check_cancelled()
            status = describe()
            if status == ready:
                return
            if status in ("failed", "error", "deleted", "deleting"):
                raise RestoreError(f"{waiting_on} entered status {status!r}; investigate in"
                                   f" the AWS console, then resume or cancel this operation.")
            if waited >= self.config.poll_timeout:
                raise PollTimeout(
                    f"Timed out after {waited}s waiting for {waiting_on} (last status"
                    f" {status!r}). The operation is resumable once the resource settles:"
                    f" restore-devtest-db resume --operation-id {self.operation_id}"
                )
            self.emit(f"... {waiting_on}: {status} (waited {waited}s)")
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

    # -- individual steps --------------------------------------------------------------

    def _snapshot_status(self, rds: Any, snapshot_id: str) -> Optional[str]:
        try:
            result = rds.describe_db_snapshots(DBSnapshotIdentifier=snapshot_id)
        except Exception as e:
            if _is_not_found(e):
                return None
            raise
        snapshots = result.get("DBSnapshots", [])
        return snapshots[0]["Status"] if snapshots else None

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

    def step_create_production_snapshot(self) -> None:
        rds = self._client("rds", PRODUCTION)
        snapshot_id = self.production_snapshot_id
        if self._snapshot_status(rds, snapshot_id) is not None:
            self.emit(f"Snapshot {snapshot_id} already exists; adopting it.")
        else:
            self._require_confirmation(
                self.prompter.confirm(
                    f"About to create snapshot {snapshot_id} of the PRODUCTION database"
                    f" {self.config.source_db_identifier} in account"
                    f" {self.config.production_account_id}. This reads production;"
                    f" it does not modify the database."
                ),
                "create production snapshot",
            )
            try:
                rds.create_db_snapshot(
                    DBSnapshotIdentifier=snapshot_id,
                    DBInstanceIdentifier=self.config.source_db_identifier,
                )
            except Exception as e:
                if not _is_already_exists(e):
                    raise
                self.emit(f"Snapshot {snapshot_id} already exists (created by a previous"
                          f" attempt); adopting it.")
        self.manifest.set_resource("production_snapshot_id", snapshot_id)

    def step_wait_production_snapshot(self) -> None:
        rds = self._client("rds", PRODUCTION)
        snapshot_id = self.manifest.get_resource("production_snapshot_id", self.production_snapshot_id)
        self._wait_for(
            lambda: self._snapshot_status(rds, snapshot_id) or "not-found",
            ready="available",
            waiting_on=f"production snapshot {snapshot_id}",
        )
        self.emit(f"Production snapshot {snapshot_id} is available.")

    def step_copy_snapshot_to_cmk(self) -> None:
        rds = self._client("rds", PRODUCTION)
        target_id = self.encrypted_snapshot_id
        if self._snapshot_status(rds, target_id) is not None:
            self.emit(f"Encrypted copy {target_id} already exists; adopting it.")
        else:
            self._require_confirmation(
                self.prompter.confirm(
                    f"About to copy snapshot {self.production_snapshot_id} to {target_id},"
                    f" re-encrypting with customer-managed KMS key"
                    f" {self.config.production_kms_key_id} so it can be shared"
                    f" cross-account (the default aws/rds key cannot be)."
                ),
                "copy snapshot with re-encryption",
            )
            try:
                rds.copy_db_snapshot(
                    SourceDBSnapshotIdentifier=self.production_snapshot_id,
                    TargetDBSnapshotIdentifier=target_id,
                    KmsKeyId=self.config.production_kms_key_id,
                )
            except Exception as e:
                if not _is_already_exists(e):
                    raise
                self.emit(f"Encrypted copy {target_id} already exists; adopting it.")
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
        self.emit(f"Encrypted snapshot copy {target_id} is available.")

    def step_ensure_kms_grant(self) -> None:
        kms = self._client("kms", PRODUCTION)
        grantee = self.config.devtest_restore_role_arn
        grants = kms.list_grants(KeyId=self.config.production_kms_key_id).get("Grants", [])
        existing = [
            g for g in grants
            if g.get("GranteePrincipal") == grantee
            and set(KMS_GRANT_OPERATIONS) <= set(g.get("Operations", []))
        ]
        if existing:
            grant_id = existing[0].get("GrantId", "")
            self.emit(f"KMS grant already in place for {grantee} (grant id {grant_id});"
                      f" no security-policy change needed (subsequent use).")
            self.manifest.set_resource("kms_grant_id", grant_id)
            self.manifest.set_resource("kms_grant_created_by_this_tool", False)
            return
        if not self.config.allow_kms_grant:
            raise SafetyViolation(
                f"First use of KMS key {self.config.production_kms_key_id} for devtest"
                f" restores: no grant exists for {grantee}. Creating one is a"
                f" security-policy change and requires the explicit --allow-kms-grant"
                f" flag. Re-run resume with --allow-kms-grant to permit it."
            )
        self._require_confirmation(
            self.prompter.confirm(
                f"SECURITY-POLICY CHANGE: about to create a KMS grant on key"
                f" {self.config.production_kms_key_id} allowing role {grantee}"
                f" the operations {', '.join(KMS_GRANT_OPERATIONS)}. This permits the"
                f" devtest account to decrypt shared production snapshots. The grant"
                f" can be revoked later with 'aws kms revoke-grant'."
            ),
            "create KMS grant",
        )
        response = kms.create_grant(
            KeyId=self.config.production_kms_key_id,
            GranteePrincipal=grantee,
            Operations=KMS_GRANT_OPERATIONS,
            Name=f"smaht-devtest-restore-{self.operation_id}",
        )
        self.manifest.set_resource("kms_grant_id", response.get("GrantId", ""))
        self.manifest.set_resource("kms_grant_created_by_this_tool", True)
        self.emit("KMS grant created (first use). Record the grant id above for audit.")

    def step_share_snapshot_with_devtest(self) -> None:
        rds = self._client("rds", PRODUCTION)
        snapshot_id = self.manifest.get_resource("encrypted_snapshot_id", self.encrypted_snapshot_id)
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
        if self._snapshot_status(rds, target_id) is not None:
            self.emit(f"Devtest snapshot copy {target_id} already exists; adopting it.")
        else:
            try:
                rds.copy_db_snapshot(
                    SourceDBSnapshotIdentifier=source_arn,
                    TargetDBSnapshotIdentifier=target_id,
                    KmsKeyId=self.config.devtest_kms_key_id,
                )
            except Exception as e:
                if not _is_already_exists(e):
                    raise
                self.emit(f"Devtest snapshot copy {target_id} already exists; adopting it.")
        self.manifest.set_resource("devtest_snapshot_id", target_id)

    def step_wait_devtest_snapshot(self) -> None:
        rds = self._client("rds", DEVTEST)
        target_id = self.manifest.get_resource("devtest_snapshot_id", self.devtest_snapshot_id)
        self._wait_for(
            lambda: self._snapshot_status(rds, target_id) or "not-found",
            ready="available",
            waiting_on=f"devtest snapshot copy {target_id}",
        )
        self.emit(f"Devtest snapshot copy {target_id} is available.")

    def step_restore_database(self) -> None:
        rds = self._client("rds", DEVTEST)
        db_id = self.config.new_db_identifier
        if self._instance(rds, db_id) is not None:
            self.emit(f"Database instance {db_id} already exists; adopting it.")
        else:
            kwargs: Dict[str, Any] = {
                "DBInstanceIdentifier": db_id,
                "DBSnapshotIdentifier": self.manifest.get_resource(
                    "devtest_snapshot_id", self.devtest_snapshot_id),
                "DBInstanceClass": self.config.instance_class,
                "PubliclyAccessible": False,
            }
            if self.config.db_subnet_group:
                kwargs["DBSubnetGroupName"] = self.config.db_subnet_group
            if self.config.vpc_security_group_ids:
                kwargs["VpcSecurityGroupIds"] = self.config.vpc_security_group_ids
            try:
                rds.restore_db_instance_from_db_snapshot(**kwargs)
            except Exception as e:
                if not _is_already_exists(e):
                    raise
                self.emit(f"Database instance {db_id} already exists; adopting it.")
        self.manifest.set_resource("new_db_identifier", db_id)

    def step_wait_database_available(self) -> None:
        rds = self._client("rds", DEVTEST)
        db_id = self.manifest.get_resource("new_db_identifier", self.config.new_db_identifier)

        def status() -> str:
            instance = self._instance(rds, db_id)
            return instance["DBInstanceStatus"] if instance else "not-found"

        self._wait_for(status, ready="available", waiting_on=f"database instance {db_id}")
        instance = self._instance(rds, db_id)
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
        production_identity = json.loads(
            production_secrets.get_secret_value(
                SecretId=self.config.production_identity_secret)["SecretString"]
        )
        devtest_identity = json.loads(
            devtest_secrets.get_secret_value(
                SecretId=self.config.devtest_identity_secret)["SecretString"]
        )
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
        devtest_secrets.put_secret_value(
            SecretId=self.config.devtest_identity_secret,
            SecretString=json.dumps(updated),
        )
        self.manifest.set_resource("identity_updated_fields", changed_keys)
        self.emit(f"Devtest identity secret updated ({len(changed_keys)} keys changed;"
                  f" values not shown).")

    def step_update_application_and_reindex(self) -> None:
        ecs = self._client("ecs", DEVTEST)
        cluster = self.config.devtest_ecs_cluster
        service_arns = ecs.list_services(cluster=cluster).get("serviceArns", [])
        if not service_arns:
            raise RestoreError(f"No ECS services found in cluster {cluster};"
                               f" check --devtest-ecs-cluster.")
        indexer_services = [arn for arn in service_arns if "indexer" in arn.lower()]
        if len(indexer_services) != 1:
            raise RestoreError(
                f"Expected exactly one indexer service in cluster {cluster}, found"
                f" {len(indexer_services)}: {indexer_services or service_arns}."
                f" Refusing to guess."
            )
        self._require_confirmation(
            self.prompter.confirm(
                f"About to force a new deployment of {len(service_arns)} devtest ECS"
                f" services in cluster {cluster} (this reruns the deployment entrypoint,"
                f" which recreates mappings and reindexes the portal against the restored"
                f" database) and scale the indexer service to"
                f" {self.config.indexer_count} tasks."
            ),
            "redeploy devtest services and reindex",
        )
        ecs.update_service(
            cluster=cluster,
            service=indexer_services[0],
            desiredCount=self.config.indexer_count,
            forceNewDeployment=True,
        )
        for arn in service_arns:
            if arn == indexer_services[0]:
                continue
            ecs.update_service(cluster=cluster, service=arn, forceNewDeployment=True)
        self.manifest.set_resource("indexer_count", self.config.indexer_count)
        self.manifest.set_resource("reindex_triggered", True)
        self.emit(f"Devtest services redeploying; indexers scaled to"
                  f" {self.config.indexer_count}. Reindexing a full database takes hours;"
                  f" monitor the indexing queue before relying on search results.")

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
            self._check_cancelled()
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
            except RestoreError as e:
                self.manifest.mark_step(definition.name, "failed", error=str(e))
                self.manifest.set_status("failed")
                raise
            except Exception as e:
                # Unknown failure: record it and fail closed with a recovery path.
                message = f"{type(e).__name__}: {e}"
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
        return response.get("Error", {}).get("Code", "")
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

def print_plan(config: RestoreConfig, emit: Callable[[str], None] = print) -> None:
    """Print the step plan. Makes no AWS calls of any kind."""
    emit("restore-devtest-db plan (no AWS calls were made):")
    emit(f"  production account: {config.production_account_id}   devtest account:"
         f" {config.devtest_account_id}   region: {config.region}")
    emit(f"  source db: {config.source_db_identifier}   protected db (never stopped):"
         f" {config.protected_db_identifier}")
    emit(f"  new db: {config.new_db_identifier or '<required for run>'} "
         f"({config.instance_class})   old db to stop:"
         f" {config.old_db_identifier or '<none: nothing will be stopped>'}")
    emit(f"  indexers after restore: {config.indexer_count}")
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
         f"   cancel_requested: {data.get('cancel_requested', False)}")
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
                     help="optional role name that must appear in the production caller ARN")
    aws.add_argument("--devtest-role-name", default="",
                     help="optional role name that must appear in the devtest caller ARN")
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
    resources.add_argument("--devtest-ecs-cluster", default="",
                           help="devtest ECS cluster whose services are redeployed to reindex")
    sizing = parser.add_argument_group("sizing")
    sizing.add_argument("--instance-class", default=DEFAULT_INSTANCE_CLASS,
                        help=f"instance class for the restored database"
                             f" (default {DEFAULT_INSTANCE_CLASS}, sized for ~16 indexers)")
    sizing.add_argument("--indexer-count", type=int, default=DEFAULT_INDEXER_COUNT,
                        help=f"indexer tasks after restore (1..{MAX_INDEXER_COUNT},"
                             f" default {DEFAULT_INDEXER_COUNT})")
    sizing.add_argument("--db-subnet-group", default="", help="optional DB subnet group for the restore")
    sizing.add_argument("--vpc-security-group-id", action="append", default=[],
                        dest="vpc_security_group_ids",
                        help="optional VPC security group for the restore (repeatable)")
    polling = parser.add_argument_group("polling")
    polling.add_argument("--poll-interval", type=int, default=POLL_INTERVAL_SECONDS,
                         help="seconds between status polls")
    polling.add_argument("--poll-timeout", type=int, default=POLL_TIMEOUT_SECONDS,
                         help="maximum seconds to wait for any one resource")
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
        devtest_ecs_cluster=args.devtest_ecs_cluster,
        source_db_identifier=args.source_db_identifier,
        protected_db_identifier=args.protected_db_identifier,
        new_db_identifier=args.new_db_identifier,
        old_db_identifier=args.old_db_identifier,
        devtest_kms_key_id=args.devtest_kms_key_id,
        instance_class=args.instance_class,
        indexer_count=args.indexer_count,
        db_subnet_group=args.db_subnet_group,
        vpc_security_group_ids=list(args.vpc_security_group_ids),
        production_role_name=args.production_role_name,
        devtest_role_name=args.devtest_role_name,
        poll_interval=args.poll_interval,
        poll_timeout=args.poll_timeout,
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

    if args.command == "cancel":
        manifest = Manifest.load(state_dir, args.operation_id)
        manifest.request_cancel()
        emit(f"Cancellation requested for {args.operation_id}; the run stops at the next"
             f" step or polling boundary. Resume later with 'resume'.")
        return 0

    if args.command == "plan" or (args.command == "run" and args.dry_run):
        config = config_from_args(args)
        print_plan(config, emit)
        return 0

    if args.command == "run":
        config = config_from_args(args)
        try:
            config.validate()
        except SafetyViolation as e:
            emit(f"SAFETY: {e}")
            return 2
        operation_id = args.operation_id or generate_operation_id()
        manifest = Manifest.create(state_dir, operation_id, config)
        emit(f"Started operation {operation_id} (manifest: {manifest.path}).")
        orchestrator = RestoreOrchestrator(
            config, manifest, client_factory_builder(config), prompter,
            emit=emit, sleep_fn=sleep_fn,
        )
        return _run_operation(orchestrator, emit)

    if args.command == "resume":
        manifest = Manifest.load(state_dir, args.operation_id)
        if manifest.data["status"] == "completed":
            emit(f"Operation {args.operation_id} is already completed.")
            return 0
        config = RestoreConfig.from_persisted_dict(
            manifest.data["config"],
            allow_kms_grant=args.allow_kms_grant,
            allow_stop_old_db=args.allow_stop_old_db,
        )
        try:
            config.validate()
        except SafetyViolation as e:
            emit(f"SAFETY: {e}")
            return 2
        if config.fingerprint() != manifest.data.get("config_fingerprint"):
            emit("SAFETY: manifest configuration fingerprint mismatch; the manifest may"
                 " have been edited. Refusing to resume.")
            return 2
        if manifest.data.get("cancel_requested"):
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

    raise RestoreError(f"Unknown command {args.command!r}")  # pragma: no cover


if __name__ == "__main__":
    raise SystemExit(main())
