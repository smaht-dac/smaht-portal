# Restoring the devtest database from a production snapshot

`restore-devtest-db` (implemented in `src/encoded/commands/restore_devtest_db.py`,
registered in `pyproject.toml`) rebuilds the `smaht-devtest` RDS database from a fresh
snapshot of `rds-smaht-production`. It is an **in-place database swap** for a single
trusted operator: a new instance is restored, the devtest IDENTITY secret is pointed
at it, and the environment's existing one-shot deployment task recreates search
mappings and reindexes. **No ECS service is created, described, mutated, scaled, or
force-redeployed.** There is no `--yes` bypass, no deletion path, and no path that
stops the protected original devtest database.

## Workflow

Run `restore-devtest-db plan ...` first: it validates the configuration and prints the
step list, computed resource names, and every confirmation gate — without making a
single AWS call (`run --dry-run` is an alias). A `run` then walks these steps:

1. **snapshot_production** — verify the production STS caller (account, region,
   optional exact assumed-role name), then create a tagged manual snapshot and wait
   for it. One y/n confirmation here also covers step 2's copy.
2. **encrypt_snapshot_copy** — copy the snapshot re-encrypted with the configured KMS
   key, which must be an enabled customer-managed key owned by the production account
   (the default `aws/rds` key cannot be shared cross-account); wait for it.
3. **ensure_kms_grant** — reuse an existing unconstrained grant for the exact devtest
   restore role, or create a temporary one (`DescribeKey`/`CreateGrant` only — no
   direct Encrypt/Decrypt). Creating a grant is a security-policy change: it requires
   both `--allow-kms-grant` and a confirmation. Because step 6 revokes it, most runs
   need the flag.
4. **share_snapshot_with_devtest** — share the encrypted copy with the devtest
   account. Confirmation requires typing the devtest account id.
5. **copy_shared_snapshot** — verify the devtest STS caller, then copy the shared
   snapshot under the devtest KMS key (default `alias/aws/rds`); wait for it.
6. **remove_temporary_source_access** — unshare the production snapshot and revoke a
   grant this operation created (a pre-existing grant found at step 3 is left alone).
7. **restore_database** — restore the new instance (default `db.t4g.medium`, roughly
   right for 16 indexers; not publicly accessible) with **network placement copied
   from the protected devtest database**, and wait for its endpoint. If the protected
   database cannot be described, the step refuses to guess placement.
8. **update_identity_secret** — point the devtest IDENTITY (`RDS_HOSTNAME`/`RDS_PORT`)
   at the new endpoint and copy `RDS_USERNAME`/`RDS_PASSWORD`/`RDS_DB_NAME` from the
   production IDENTITY (the restored database keeps production's credentials).
   Confirmation requires typing `replace-devtest-credentials`. Only changed key
   *names* are shown; values are never printed or persisted.
9. **run_deployment_and_reindex** — resolve the ECS cluster ARN, the deployment task
   definition family, and the indexing queues (`<env>-indexer-queue`,
   `<env>-secondary-indexer-queue`) from `--devtest-env-name`. Resolution requires
   exactly one match and always excludes the destructive *initial*-deployment task
   definition; resolved queue URLs must live in the devtest account/region. After a
   confirmation, run one task in the explicit `--deployment-subnet`/
   `--deployment-security-group`, checkpoint its ARN, wait for it to stop, and
   require successful container exit codes — that proves mappings were recreated and
   the reindex enqueued (`entrypoint_deployment.sh` runs
   `create-mapping-on-deploy --wipe-es`). Then wait for the queues to fully drain
   within `--reindex-timeout`. The drain check is absolute (never "did we observe the
   enqueue spike"), so a resume after the queues already drained passes immediately.
10. **stop_old_database** — optionally STOP (never delete) a previous replaceable
    restored database. Requires `--old-db-identifier`, `--allow-stop-old-db`, typing
    the identifier, and the completed deployment/reindex gate. Skipped when no old
    database is named; the protected database is refused here even if configuration
    were bypassed.

Running portal/ingester/indexer tasks pick up the new IDENTITY endpoint as their
tasks naturally recycle or via normal operations tooling; indexer worker counts are
managed by the infrastructure, not this command.

## Credential warning

After step 8 the devtest database password **is the production password**. Treat
devtest as containing production secrets until you rotate the restored database's
master password (`aws rds modify-db-instance --master-user-password ...`) and update
the IDENTITY secret again. No secret value is ever written to the terminal, manifest,
status output, or an error message (unknown exceptions are reduced to their type and
AWS error code before display or persistence).

## Operation lifecycle

Every run has a stable operation id and a JSON manifest under
`~/.smaht/restore-devtest-db/` (`--state-dir` to override) recording the
configuration, completed steps, and created resource identifiers — never secrets.

- `plan` — validate and preview; zero AWS calls.
- `run [--operation-id ID]` — start; resource names derive from the operation id.
- `status [--operation-id ID]` — show step progress and resources, or list operations.
- `resume --operation-id ID [--allow-kms-grant] [--allow-stop-old-db]` — continue
  after a failure, a declined confirmation, or Ctrl-C. Completed steps are skipped;
  resource names are deterministic and every step describes before it creates, so
  retries are idempotent. Opt-in flags are never persisted and must be re-supplied.

Exit codes: 0 success, 1 failure, 2 safety refusal, 3 declined confirmation,
130 interrupted. Failures record the failing step in the manifest and print the
resume command. Long waits are bounded (`--poll-timeout`, `--reindex-timeout`,
editable in the manifest before a resume if a bound proves too small). A failed
deployment task clears its checkpointed ARN so resume runs a fresh, freshly
confirmed task instead of re-verifying a failed one.

## What the command deliberately refuses to do

- Delete any database or snapshot, under any flag combination.
- Stop the protected original devtest database (the rollback safety net).
- Proceed on an STS account/region/role mismatch, a non-customer-managed production
  KMS key, ambiguous cluster/task-definition resolution, or a queue outside the
  devtest account/region — it fails closed with the checkpoint intact.
- Select the initial-deployment task definition (it wipes database/search contents).
- Create a KMS grant or stop an old database without a dedicated opt-in flag plus an
  interactive confirmation. There is no `--yes`.
- Mutate, scale, or redeploy any ECS service.

## Required configuration

Nothing is inferred from ambient AWS defaults.

| Flags | Requirement |
| --- | --- |
| `--production-account-id`, `--devtest-account-id` | Distinct 12-digit accounts |
| `--region` | Region for both explicitly scoped sessions |
| `--production-profile`, `--devtest-profile` | Distinct named AWS profiles |
| `--production-role-name`, `--devtest-role-name` | Optional exact assumed-role names |
| `--production-kms-key-id` | Customer-managed production key (id/ARN/alias) |
| `--devtest-restore-role-arn` | IAM role ARN in the devtest account |
| `--production-identity-secret`, `--devtest-identity-secret` | IDENTITY secret names |
| `--new-db-identifier` | Brand-new identifier (must not collide with source/protected) |
| `--devtest-env-name` | Resolves the cluster, deployment task definition, and queues |
| `--deployment-subnet`, `--deployment-security-group` | Network for the one-shot task |

DB network placement is copied from the protected devtest database, so there are no
DB subnet/security-group flags; there are likewise no ECS service or queue flags.

## IAM permissions

Production principal: `sts:GetCallerIdentity`; `rds:DescribeDBSnapshots`,
`rds:DescribeDBSnapshotAttributes`, `rds:CreateDBSnapshot`, `rds:CopyDBSnapshot`,
`rds:ModifyDBSnapshotAttribute`, `rds:AddTagsToResource`; `kms:DescribeKey`,
`kms:ListGrants`, and `kms:CreateGrant`/`kms:RevokeGrant` for the temporary grant;
`secretsmanager:GetSecretValue` for the production IDENTITY.

Devtest principal: `sts:GetCallerIdentity`; `rds:DescribeDBInstances`,
`rds:DescribeDBSnapshots`, `rds:CopyDBSnapshot`,
`rds:RestoreDBInstanceFromDBSnapshot`, `rds:AddTagsToResource`, and
`rds:StopDBInstance` only if stopping an old database; `secretsmanager:GetSecretValue`
and `secretsmanager:PutSecretValue` for the devtest IDENTITY; `ecs:ListClusters`,
`ecs:ListTaskDefinitionFamilies`, `ecs:RunTask`, `ecs:DescribeTasks` plus scoped
`iam:PassRole` for the deployment task roles; `sqs:GetQueueUrl` and
`sqs:GetQueueAttributes` for the environment's indexing queues. No
`ecs:UpdateService`/`ecs:DescribeServices` is needed or used.

## Example

```bash
restore-devtest-db plan --operation-id restore-20260717 \
  --production-account-id 111111111111 --devtest-account-id 222222222222 \
  --region us-east-1 \
  --production-profile smaht-prod --devtest-profile smaht-devtest \
  --production-kms-key-id arn:aws:kms:us-east-1:111111111111:key/... \
  --devtest-restore-role-arn arn:aws:iam::222222222222:role/... \
  --production-identity-secret SmahtProductionIdentity \
  --devtest-identity-secret SmahtDevtestIdentity \
  --new-db-identifier rds-smaht-devtest-restored-20260717 \
  --devtest-env-name smaht-devtest \
  --deployment-subnet subnet-0123456789abcdef0 \
  --deployment-security-group sg-0fedcba9876543210
```

After reviewing the plan, replace `plan` with `run`, keep the same operation id, and
add `--allow-kms-grant` if the temporary grant may be created. On later runs, pass the
previous restored instance as `--old-db-identifier` (with `--allow-stop-old-db`) to
stop it once the new one is verified.

## Rollback

The previous database is never deleted. To roll back: point the devtest IDENTITY back
at the old endpoint (and its credentials, if rotated), start the old instance if it
was stopped (`aws rds start-db-instance`), and run the deployment task again (or
redeploy via normal tooling). Note that a manually stopped RDS instance restarts
automatically after seven days; stopping is not a durable cost-control mechanism.
Snapshot and database deletion remain manual and outside this command. A successful
deployment task plus drained queues verify reindexing, but they do not replace a
portal smoke test before stopping anything.

## Tests

`src/encoded/tests/test_restore_devtest_db.py` covers the whole flow with **every
external boundary mocked**: STS/RDS/KMS/Secrets Manager/ECS/SQS are in-memory fakes
injected through the command's client-factory seam; prompts and sleeps are scripted;
one test booby-traps `boto3` to prove a full run never touches it. The fake ECS
client implements no service APIs and the fake RDS client implements no delete APIs,
so any regression fails loudly. No test contacts AWS or a deployed environment.
