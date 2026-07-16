# Restoring the devtest database from a production snapshot

`restore-devtest-db` is a checkpointed operator workflow that restores a new
`smaht-devtest` RDS instance from a fresh `rds-smaht-production` snapshot. It is
production-adjacent: use a reviewed plan, explicit named profiles, and one shared
state directory. There is no `--yes` bypass, no database or snapshot deletion path,
and no path that stops the protected original devtest database.

## Verified workflow

Run `restore-devtest-db plan ...` to print the authoritative ordered steps without
constructing an AWS client. A run performs these gates:

1. Verify the production STS account, configured region, and optional exact assumed
   role before every production-scoped step.
2. Read and pin the nonsecret `VersionId` of the production IDENTITY secret. The
   required database fields are checked in memory; values are never persisted.
3. Confirm and create a tagged manual production snapshot, then wait with a bounded
   poll until it is available. If the production secret's current version changed
   during snapshot creation, start a new operation.
4. Confirm and copy the snapshot under the resolved production customer-managed KMS
   key. The key must be enabled, symmetric, customer-managed, and owned by the
   configured production account in the configured region.
5. Find or confirm creation of a KMS grant for the exact devtest role ARN. A new
   grant allows only `DescribeKey` and `CreateGrant` -- what RDS needs to use the key
   for the cross-account copy -- and gives the role no direct Encrypt/Decrypt
   permission. Because the grant is revoked at step 7, most runs create one and
   therefore need `--allow-kms-grant` plus the interactive confirmation.
6. Confirm the cross-account share by typing the devtest account ID, verify the
   devtest STS context, and make a tagged devtest-local snapshot copy under the
   resolved devtest key. The copy retries only known KMS propagation failures, and
   those retries are bounded to fifteen minutes so a broken share or grant surfaces
   quickly instead of masquerading as slow propagation.
7. After the devtest-local copy is available and its provenance is verified, remove
   the production snapshot share and revoke only a temporary grant created by this
   operation. A pre-existing matching grant found at step 5 is not revoked.
8. Describe the protected devtest database and require the operator-supplied DB
   subnet group and complete security-group set to match it exactly. Restore a new,
   private, tagged instance using those explicit values and wait until available.
9. Confirm IDENTITY replacement by typing `replace-devtest-credentials`. The new
   secret version points to the restored endpoint and uses the exact production
   credential version pinned at the snapshot boundary. A deterministic Secrets
   Manager request token makes an accepted-but-uncheckpointed write safely adoptable
   on resume. Concurrent changes to the devtest secret fail closed.
10. Confirm and run the environment's existing one-shot deployment task. The ECS
    cluster ARN and the deployment task definition family are resolved from
    `--devtest-env-name` (exactly one match each, or the step fails and lists the
    candidates; the destructive initial-deployment task definition is always
    excluded). The task runs in the explicit `--deployment-subnet` /
    `--deployment-security-group`, its ARN is checkpointed in the manifest, and it
    must stop with successful container exit codes -- that is the proof mappings were
    recreated and the reindex was enqueued (`entrypoint_deployment.sh` runs
    `create-mapping-on-deploy --wipe-es`). Then the environment's indexing queues
    (`<env>-indexer-queue` and `<env>-secondary-indexer-queue`, resolved by name and
    verified to live in the devtest account/region) must report empty on several
    consecutive polls within `--reindex-timeout`. The drain check is absolute -- it
    never waits to *observe* enqueued work -- so a resume after the queues already
    drained passes immediately. **This is an in-place database swap: no ECS service
    is created, described, mutated, scaled, quiesced, or force-redeployed.** Running
    portal/ingester/indexer tasks pick up the new IDENTITY endpoint as their tasks
    naturally recycle or through normal operations tooling; indexer worker counts
    (16 is a reasonable starting point against a `db.t4g.medium`) are likewise
    managed by the infrastructure, not by this command.
11. Optionally stop a previous replaceable restored database. This requires
    `--old-db-identifier`, the nonpersistent `--allow-stop-old-db` opt-in, typing the
    identifier, ownership tags from a prior `restore-devtest-db` operation, and the
    completed deployment/reindex gates above. The operation never deletes it. An old
    database that predates this tooling carries no ownership tags and must be stopped
    manually; the command refuses it.

## Credential and rollback warning

After the IDENTITY step, the restored devtest database uses production database
credentials. Treat devtest as containing production secrets until the restored DB
password and IDENTITY are deliberately rotated. No secret value is written to the
manifest, terminal, status output, or exception checkpoint.

The manifest records the previous and new devtest Secrets Manager version IDs. It
does not perform automatic rollback. If rollback is required:

1. Inspect `status` and identify `devtest_identity_previous_version_id` and
   `devtest_identity_new_version_id` in the manifest. KMS identifiers are redacted
   in terminal status but remain in the mode-0600 manifest for recovery.
2. Move `AWSCURRENT` back to the recorded previous secret version, explicitly moving
   it away from the new version. This restores the old endpoint and credentials as
   one versioned value; do not edit only the hostname.
3. Start the old instance if it was stopped.
4. Redeploy the application roles and verify their health against that database.

The protected original devtest database is always left intact as the primary rollback
safety net. A manually stopped RDS instance automatically restarts after seven days;
stopping is not a durable cost-control mechanism.

## Resource ownership and idempotency

Created snapshots and DB instances are tagged with the operation ID and a fingerprint
of the persisted configuration. An existing resource -- found by describe or surfaced
by an `AlreadyExists` response -- is adopted only when both its ownership tags and its
source/KMS/class/network attributes prove this operation created it; anything unowned
is refused. That makes retries and resumes idempotent even when the process died
between the AWS call and the checkpoint write, without ever accepting a stranger's
resource. A failed deployment task clears its checkpointed ARN so resume runs a fresh
task (with a fresh confirmation) rather than re-verifying a known-failed one.

The configuration fingerprint detects accidental manifest edits; it is not a
cryptographic authentication mechanism because it is stored beside the configuration.
The polling knobs (`poll_interval`, `poll_timeout`, `reindex_timeout`) are excluded
from the fingerprint so an operator can deliberately extend a too-small timeout in
the manifest before resuming. Protect the state directory as operator data.

## Operation lifecycle

Manifests live under `~/.smaht/restore-devtest-db/` by default and are mode 0600 in a
mode-0700 directory. Use the same `--state-dir` for every operation targeting one
devtest environment. Run/resume takes an exclusive state-directory lock, so a second
operation or resume fails before any AWS call. A different state directory cannot
participate in that lock and must not be used to bypass it.

- `plan` validates the same pure configuration as `run`, accepts an operation ID,
  prints computed targets and confirmation gates, and makes no AWS calls.
- `run` exclusively creates a stable operation manifest. Use the same operation ID
  shown by plan if deterministic resource names were reviewed.
- `status` shows checkpointed step/resource state or lists operations.
- `cancel` writes an independent marker from another terminal. The active runner
  observes it at the next step or poll boundary; normal manifest saves cannot erase
  it. Cancellation does not roll back completed mutations.
- `resume` revalidates the complete configuration fingerprint, asks before clearing
  a cancellation marker, skips completed steps, and verifies provenance before
  adopting retry resources.

Exit codes are 0 for success, 1 for an operational failure, 2 for a safety refusal,
3 for a declined confirmation, 4 for cancellation, and 130 for a checkpointed local
keyboard interrupt. A failure message contains a safe error type/code and a resume
command, not the raw SDK exception text.

Partial failures are intentionally visible rather than automatically destructive:

- Before the devtest-local snapshot is available, a temporary share/grant can remain;
  resume completes the copy and cleanup. The manifest identifies the exact grant.
- After IDENTITY replacement, use the recorded version IDs for rollback. The command
  never guesses that restoring only an endpoint is sufficient.
- A failed deployment task leaves nothing mutated in ECS; resume runs a fresh task
  after confirmation. The old database remains running because `reindex_completed`
  is absent.
- Snapshot and database deletion remain manual and outside this command.

## Required configuration

No account, profile, region, network, deployment role, or queue is inferred from an
ambient AWS default.

| Flags | Requirement |
| --- | --- |
| `--production-account-id`, `--devtest-account-id` | Distinct 12-digit accounts |
| `--region` | Region used for both explicitly scoped sessions |
| `--production-profile`, `--devtest-profile` | Distinct named profiles |
| `--production-role-name`, `--devtest-role-name` | Optional exact assumed-role names |
| `--production-kms-key-id` | Production customer-managed KMS key ID/ARN/alias |
| `--devtest-restore-role-arn` | Exact IAM role ARN in the configured devtest account |
| `--production-identity-secret`, `--devtest-identity-secret` | Secret names, or ARNs account/region-bound to their scopes |
| `--new-db-identifier` | Brand-new valid RDS identifier |
| `--db-subnet-group`, `--vpc-security-group-id` | Required; must exactly match the protected devtest DB |
| `--devtest-env-name` | Environment name; resolves the ECS cluster ARN, deployment task definition family, and indexing queue names |
| `--deployment-subnet`, `--deployment-security-group` | Explicit network placement (subnet-.../sg-...) for the one-shot deployment task |
| `--poll-interval`, `--poll-timeout`, `--reindex-timeout` | Positive bounded waits; timeout must be at least interval |

There are deliberately no ECS service-name or queue-URL flags: services are never
touched, and queues are resolved from the environment name and then verified to live
in the configured devtest account and region.

## IAM permissions

Scope policies to the exact database, snapshots, key, secrets, cluster, deployment
task definition/roles, and queues wherever the AWS action supports resource scoping.

The production principal needs:

- `sts:GetCallerIdentity`
- `rds:DescribeDBInstances`, `rds:DescribeDBSnapshots`,
  `rds:DescribeDBSnapshotAttributes`, `rds:CreateDBSnapshot`,
  `rds:CopyDBSnapshot`, `rds:ModifyDBSnapshotAttribute`, and
  `rds:AddTagsToResource`
- `kms:DescribeKey`, `kms:ListGrants`, and, only for a new temporary grant,
  `kms:CreateGrant`/`kms:RevokeGrant`
- `secretsmanager:GetSecretValue` for the production IDENTITY

The devtest principal needs:

- `sts:GetCallerIdentity`
- `rds:DescribeDBInstances`, `rds:DescribeDBSnapshots`, `rds:CopyDBSnapshot`,
  `rds:RestoreDBInstanceFromDBSnapshot`, `rds:AddTagsToResource`, and optionally
  `rds:StopDBInstance`
- `kms:DescribeKey` for the devtest snapshot key; the exact restore role receives the
  temporary production-key grant described above
- `secretsmanager:GetSecretValue` and `secretsmanager:PutSecretValue` for devtest
  IDENTITY
- `ecs:ListClusters`, `ecs:ListTaskDefinitionFamilies`, `ecs:RunTask`, and
  `ecs:DescribeTasks`, plus narrowly scoped `iam:PassRole` for the deployment task's
  execution/task roles when required -- no `ecs:UpdateService` or
  `ecs:DescribeServices` is needed or used
- `sqs:GetQueueUrl` and `sqs:GetQueueAttributes` for the environment's index queues

## Example

```bash
restore-devtest-db plan --operation-id restore-20260716 \
  --production-account-id 111111111111 --devtest-account-id 222222222222 \
  --region us-east-1 \
  --production-profile smaht-prod --devtest-profile smaht-devtest \
  --production-kms-key-id arn:aws:kms:us-east-1:111111111111:key/... \
  --devtest-restore-role-arn arn:aws:iam::222222222222:role/... \
  --production-identity-secret SmahtProductionIdentity \
  --devtest-identity-secret SmahtDevtestIdentity \
  --new-db-identifier rds-smaht-devtest-restored-20260716 \
  --db-subnet-group smaht-devtest-db \
  --vpc-security-group-id sg-0123456789abcdef0 \
  --devtest-env-name smaht-devtest \
  --deployment-subnet subnet-0123456789abcdef0 \
  --deployment-security-group sg-0fedcba9876543210
```

After reviewing the plan, replace `plan` with `run`, retain the exact operation ID,
and add `--allow-kms-grant` only if the confirmed temporary grant may be created.

## Residual operational risks

Manual snapshots can add production I/O and snapshot copies incur RDS/KMS/storage
cost. Restored RDS data is lazy-loaded, so performance can remain cold after the
instance first reports `available`. A successful deployment task plus drained index
queues verify mapping creation and reindex completion, but they do not replace an
operator's portal smoke test. Do not stop an old database until application-level
behavior has also been checked when the environment requires a stronger acceptance
gate.

## Tests

`src/encoded/tests/test_restore_devtest_db.py` injects in-memory fakes for STS, RDS,
KMS, Secrets Manager, ECS, and SQS; prompts and sleeps are scripted. The fake ECS
client implements no service APIs at all, so any attempted service mutation fails the
suite loudly. Tests cover resource collisions/provenance (including adoption of an
operation-owned resource surfaced by an already-exists race), cluster/task-definition
resolution from the environment name (ambiguous, missing, and initial-deployment
cases), cross-account key/role/queue validation, bounded KMS propagation retries,
grant cleanup, concurrent locking/cancellation (including cancellation at a step
boundary), secret write ambiguity/redaction, deployment-task failure and re-run,
resume-after-drain completion (the reindex gate is absolute, never
observation-based), manifest timeout edits on resume, and the no-delete invariant.
A full-run test booby-traps `boto3`. No test contacts AWS or a deployed environment.
