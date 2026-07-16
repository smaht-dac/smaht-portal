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
   grant allows only `DescribeKey` and `CreateGrant`; its encryption-context
   constraint requires child grants to be equally or more tightly restricted to the
   production RDS `DbiResourceId`. It gives the role no direct Encrypt/Decrypt grant.
6. Confirm the cross-account share by typing the devtest account ID, verify the
   devtest STS context, and make a tagged devtest-local snapshot copy under the
   resolved devtest key. The copy retries only known KMS propagation failures and
   every retry/poll is bounded.
7. After the devtest-local copy is available and its provenance is verified, remove
   the production snapshot share and revoke only a temporary grant created by this
   operation. A pre-existing exact constrained grant is not revoked.
8. Describe the protected devtest database and require the operator-supplied DB
   subnet group and complete security-group set to match it exactly. Restore a new,
   private, tagged instance using those explicit values and wait until available.
9. Confirm IDENTITY replacement by typing `replace-devtest-credentials`. The new
   secret version points to the restored endpoint and uses the exact production
   credential version pinned at the snapshot boundary. A deterministic Secrets
   Manager request token makes an accepted-but-uncheckpointed write safely adoptable
   on resume. Concurrent changes to the devtest secret fail closed.
10. Confirm an ordered ECS cutover: quiesce the configured indexer service; run one
    deployment task from the configured deployment service's task definition and
    network settings; require successful container exits and index queue work above
    the recorded predeployment baseline; force new portal and ingester deployments
    and wait for ECS stability;
    restart the configured indexer count and wait for ECS stability; then require all
    configured SQS index queues to report empty repeatedly within
    `--reindex-timeout`.
11. Optionally stop a previous replaceable restored database. This requires
    `--old-db-identifier`, the nonpersistent `--allow-stop-old-db` opt-in, typing the
    identifier, ownership tags from a prior `restore-devtest-db` operation, and
    successful deployment/service/reindex gates. The operation never deletes it.

The deployment service is used as a source for a one-shot `RunTask`; it is not
force-redeployed as a long-running service. Confirm with the infrastructure owner
that its task definition is the SMaHT `deployment` entrypoint and that the configured
portal, ingester, indexer, and queue names are the complete devtest topology. The
repository provides the role entrypoints but not the deployed ECS definitions.

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
of the complete persisted configuration. On a fresh step, any name collision fails.
On resume, an existing resource is adopted only when both ownership tags and its
source/KMS/class/network attributes match. An `AlreadyExists` response from a
concurrent creator is never accepted as success.

The configuration fingerprint detects accidental manifest edits; it is not a
cryptographic authentication mechanism because it is stored beside the configuration.
Protect the state directory as operator data.

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
- A deployment failure can leave the indexer quiesced. Resume adopts the operation's
  deployment task and continues the ordered gates. The old database remains running
  because `reindex_completed` is absent.
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
| `--devtest-ecs-cluster` | Exact devtest cluster |
| `--deployment-service-name` | Service whose task definition/network runs the one-shot deployment |
| `--portal-service-name`, `--ingester-service-name`, `--indexer-service-name` | Distinct exact service names |
| `--indexer-queue-url` | Repeat for every index queue; each URL must match devtest account/region |
| `--indexer-count` | 1–64; default 16 |
| `--poll-interval`, `--poll-timeout`, `--reindex-timeout` | Positive bounded waits; timeout must be at least interval |

## IAM permissions

Scope policies to the exact database, snapshots, key, secrets, cluster, services,
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
  temporary constrained production-key grant described above
- `secretsmanager:GetSecretValue` and `secretsmanager:PutSecretValue` for devtest
  IDENTITY
- `ecs:DescribeServices`, `ecs:UpdateService`, `ecs:ListTasks`, `ecs:RunTask`, and
  `ecs:DescribeTasks`, plus narrowly scoped `iam:PassRole` for the deployment task's
  execution/task roles when required
- `sqs:GetQueueAttributes` for every configured index queue

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
  --devtest-ecs-cluster smaht-devtest \
  --deployment-service-name smaht-devtest-deployment \
  --portal-service-name smaht-devtest-portal \
  --ingester-service-name smaht-devtest-ingester \
  --indexer-service-name smaht-devtest-indexer \
  --indexer-queue-url https://sqs.us-east-1.amazonaws.com/222222222222/index-primary \
  --indexer-queue-url https://sqs.us-east-1.amazonaws.com/222222222222/index-secondary
```

After reviewing the plan, replace `plan` with `run`, retain the exact operation ID,
and add `--allow-kms-grant` only if the confirmed temporary grant may be created.

## Residual operational risks

Manual snapshots can add production I/O and snapshot copies incur RDS/KMS/storage
cost. Restored RDS data is lazy-loaded, so performance can remain cold after the
instance first reports `available`. ECS stability and queue drain verify the deployed
orchestration available to this command, but they do not replace an operator's portal
smoke test. Do not stop an old database until application-level behavior has also been
checked when the environment requires a stronger acceptance gate.

## Tests

`src/encoded/tests/test_restore_devtest_db.py` injects in-memory fakes for STS, RDS,
KMS, Secrets Manager, ECS, and SQS; prompts and sleeps are scripted. Tests cover
resource collisions/provenance, cross-account key/role/queue validation, pagination,
grant cleanup, concurrent locking/cancellation, secret write ambiguity/redaction,
deployment failure, queue observation/drain timeouts, and the no-delete invariant.
A full-run test booby-traps `boto3`. No test contacts AWS or a deployed environment.
