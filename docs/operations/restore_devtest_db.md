# Restoring the devtest database from a production snapshot

`restore-devtest-db` (see `src/encoded/commands/restore_devtest_db.py`, registered in
`pyproject.toml`) rebuilds the `smaht-devtest` RDS database from a fresh snapshot of
`rds-smaht-production`. It is an operator-facing, production-adjacent workflow, so the
command is deliberately conservative: every run is checkpointed and resumable, every
dangerous action needs an interactive confirmation, and several actions additionally
need an explicit opt-in flag. There is **no** `--yes` bypass.

## What it does

One operation walks these steps in order (run `restore-devtest-db plan ...` to see the
live version of this list, including which confirmations apply — plan mode makes no
AWS calls at all):

1. **Verify the production caller identity.** STS account id, client region, and
   (optionally) role name must match the values you passed. The same check runs
   before *every* subsequent step in that account; nothing is inferred from ambient
   AWS defaults.
2. **Create a production snapshot** of `rds-smaht-production` (confirmation).
3. **Copy the snapshot with re-encryption** from the default `aws/rds` key to your
   customer-managed KMS key (confirmation). The default key cannot be shared across
   accounts; the CMK copy can.
4. **Ensure a KMS grant** lets the devtest restore role (`--devtest-restore-role-arn`)
   use the CMK. On first use no grant exists: creating one is a security-policy change
   and requires both `--allow-kms-grant` **and** a confirmation. On subsequent runs the
   existing grant is detected and reused with no policy change. The grant is auditable
   (`aws kms list-grants`) and revocable (`aws kms revoke-grant`). The command never
   reads or writes the key *policy* itself, and never prints policy contents.
5. **Share the encrypted copy** with the devtest account. Confirmation requires typing
   the devtest account id.
6. **Verify the devtest caller identity** (same checks as step 1, devtest values).
7. **Copy the shared snapshot** into the devtest account under the devtest KMS key
   (`--devtest-kms-key-id`, default `alias/aws/rds`).
8. **Restore a new database instance** from that copy. Default instance class is
   `db.t4g.medium`, a reasonable starting size for roughly 16 indexer workers. The new
   identifier (`--new-db-identifier`) must not collide with the production or protected
   databases.
9. **Update the devtest IDENTITY secret** with the new endpoint/port and the
   production `RDS_USERNAME`/`RDS_PASSWORD`/`RDS_DB_NAME` (read from the production
   identity secret — the restored database keeps production's credentials).
   Confirmation requires typing `replace-devtest-credentials`. Only the *names* of
   changed keys are shown; secret values are never printed, logged, or persisted.
10. **Redeploy and reindex.** Forces a new deployment of every ECS service in
    `--devtest-ecs-cluster` (the deployment entrypoint recreates mappings and
    reindexes against the restored database) and scales the indexer service to
    `--indexer-count` (1–64; default 16, the documented starting point for a small
    `db.t4g.medium` database — scale up cautiously and watch DB CPU). Confirmation
    required.
11. **Optionally stop a previous replaceable database.** Skipped unless you pass
    `--old-db-identifier`. Requires `--allow-stop-old-db` plus typing the identifier.
    The instance is **stopped, never deleted**, so it can be started again for
    rollback.

## Credential warning

After step 9 the devtest database password **is the production password**. Treat the
devtest environment as containing production secrets until you rotate the restored
database's master password (e.g. `aws rds modify-db-instance --master-user-password`
followed by another identity-secret update). The command warns about this and requires
the typed phrase before touching the secret.

## Protected vs. old databases

- The **protected original** devtest database (`--protected-db-identifier`, default
  `rds-smaht-devtest`) is the rollback safety net. The tool refuses to stop it, ever —
  at config validation *and* again inside the stop step. Keep it alive; resize it to
  something small by hand if cost matters.
- An **old replaceable** database (`--old-db-identifier`) is a previous restore you are
  replacing. It may be stopped (opt-in + typed confirmation) but never deleted.
- On a first-time run, leave `--old-db-identifier` unset: there is nothing to stop.

## What the command deliberately refuses to do

- Delete any database or snapshot, under any flag combination.
- Stop the protected original devtest database.
- Continue past any STS account/region/role mismatch (it fails closed before the
  affected step, leaving the checkpoint intact).
- Create a KMS grant, or stop an old database, without both a dedicated CLI opt-in
  flag and an interactive confirmation. Opt-in flags are never persisted; a resume
  must supply them again.
- Print or persist secret values, or accept a blanket `--yes`.
- Modify the production database itself (only a snapshot is taken).

## Operation lifecycle: plan / run / resume / status / cancel

Each `run` gets a stable operation id and a JSON manifest (no secrets) under
`~/.smaht/restore-devtest-db/` (`--state-dir` to override). The manifest records step
status and AWS resource identifiers, so:

- `restore-devtest-db plan ...` — print the step plan; makes no AWS calls.
  `run --dry-run` is an alias.
- `restore-devtest-db run ...` — start a new operation. Long waits poll with a bounded
  timeout (`--poll-interval`/`--poll-timeout`); a timeout fails the step but keeps the
  checkpoint.
- `restore-devtest-db status [--operation-id ID]` — show per-step progress, or list
  all operations.
- `restore-devtest-db cancel --operation-id ID` — from any terminal; the run stops at
  the next step or polling boundary. Nothing is rolled back.
- `restore-devtest-db resume --operation-id ID [--allow-kms-grant]
  [--allow-stop-old-db]` — continue: completed steps are skipped, snapshot/instance
  names are deterministic per operation, and "already exists" responses are adopted,
  so retries are idempotent. Resuming a cancelled operation asks before clearing the
  cancellation request; a manifest whose config was edited fails a fingerprint check.

A declined confirmation exits code 3 with the step marked `declined`; a safety refusal
exits 2; other failures exit 1 with the error checkpointed. In every case the recovery
path is `status` to inspect, then `resume` to continue (or `cancel` to abandon — any
resources already created remain and are listed by `status`).

## Required configuration and permissions

Everything is explicit; there are no environment-derived defaults for accounts:

| Flag | Meaning |
| --- | --- |
| `--production-account-id` / `--devtest-account-id` | 12-digit account ids (must differ) |
| `--region` | region for both accounts |
| `--production-profile` / `--devtest-profile` | named AWS profiles (must differ) |
| `--production-role-name` / `--devtest-role-name` | optional: require this role name in the caller ARN |
| `--production-kms-key-id` | customer-managed key used for the shareable copy |
| `--devtest-restore-role-arn` | devtest IAM role that must be able to use that key |
| `--production-identity-secret` / `--devtest-identity-secret` | IDENTITY secret names |
| `--devtest-ecs-cluster` | cluster redeployed to reindex |
| `--new-db-identifier` | identifier for the restored instance |

The production principal needs `rds:CreateDBSnapshot`, `rds:CopyDBSnapshot`,
`rds:Describe*`, `rds:ModifyDBSnapshotAttribute`, `kms:ListGrants`, `kms:CreateGrant`
(first use only), `secretsmanager:GetSecretValue` (production identity), and
`sts:GetCallerIdentity`. The devtest principal needs `rds:CopyDBSnapshot`,
`rds:RestoreDBInstanceFromDBSnapshot`, `rds:Describe*`, `rds:StopDBInstance` (only if
stopping an old database), `secretsmanager:GetSecretValue`/`PutSecretValue` (devtest
identity), `ecs:ListServices`/`ecs:UpdateService`, and `sts:GetCallerIdentity`.

## Example: first-time run

```bash
restore-devtest-db run \
  --production-account-id 111111111111 --devtest-account-id 222222222222 \
  --region us-east-1 \
  --production-profile smaht-prod --devtest-profile smaht-devtest \
  --production-kms-key-id arn:aws:kms:us-east-1:111111111111:key/... \
  --devtest-restore-role-arn arn:aws:iam::222222222222:role/... \
  --production-identity-secret SmahtProductionIdentity \
  --devtest-identity-secret SmahtDevtestIdentity \
  --devtest-ecs-cluster smaht-devtest \
  --new-db-identifier rds-smaht-devtest-restored-20260716 \
  --allow-kms-grant
```

Run `plan` with the same arguments first to review what will happen. On later runs,
pass the previous restored instance as `--old-db-identifier` (with
`--allow-stop-old-db`) to stop it after the new one is serving.

## Rollback

The previous database is never deleted. To roll back: point the devtest IDENTITY
secret back at the old endpoint (and its credentials, if you had rotated them), start
the old instance if it was stopped (`aws rds start-db-instance`), and force a new ECS
deployment. The new instance can then be stopped (again: not deleted) once you are
sure.

## Tests

`src/encoded/tests/test_restore_devtest_db.py` covers the whole flow with **all
external boundaries mocked** — the AWS clients are in-memory fakes injected through
the command's client-factory seam, prompts are scripted, and sleeps are no-ops. One
test booby-traps `boto3` to prove a full run never touches it. No test contacts AWS
or any deployed environment.
