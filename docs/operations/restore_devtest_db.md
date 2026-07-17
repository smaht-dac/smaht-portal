# Restoring the devtest database from a production snapshot

`restore-devtest-db` (implemented in `src/encoded/commands/restore_devtest_db.py`,
registered in `pyproject.toml`) rebuilds the `smaht-devtest` RDS database from a fresh
snapshot of `rds-smaht-production` and points the devtest IDENTITY secret at the new
instance. **That is the whole job**: reindexing and all other environment setup are
performed manually afterwards, and the command makes no ECS or SQS calls of any kind.
There is no `--yes` bypass, no deletion path, and no path that stops any database —
the protected original devtest database in particular stays untouched as the rollback
safety net.

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
7. **restore_database** — restore the new instance (default `db.t4g.medium`; not
   publicly accessible) with **network placement copied from the protected devtest
   database**, and wait for its endpoint. If the protected database cannot be
   described, the step refuses to guess placement.
8. **update_identity_secret** — point the devtest IDENTITY (`RDS_HOSTNAME`/`RDS_PORT`)
   at the new endpoint and copy `RDS_USERNAME`/`RDS_PASSWORD`/`RDS_DB_NAME` from the
   production IDENTITY (the restored database keeps production's credentials).
   Confirmation requires typing `replace-devtest-credentials`. Only changed key
   *names* are shown; values are never printed or persisted.

The workflow ends there. Manual follow-ups (outside this command): recycle or
redeploy the application so it picks up the new IDENTITY endpoint, recreate mappings
and reindex, scale indexers as desired, and — once the environment is verified —
optionally stop a previous restored instance by hand. This command performs none of
those.

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
- `resume --operation-id ID [--allow-kms-grant]` — continue after a failure, a
  declined confirmation, or Ctrl-C. Completed steps are skipped; resource names are
  deterministic and every step describes before it creates, so retries are
  idempotent. The opt-in flag is never persisted and must be re-supplied.

Exit codes: 0 success, 1 failure, 2 safety refusal, 3 declined confirmation,
130 interrupted. Failures record the failing step in the manifest and print the
resume command. Long waits are bounded (`--poll-timeout`, editable in the manifest
before a resume if it proves too small).

## What the command deliberately refuses to do

- Delete any database or snapshot, or stop any database, under any flag combination.
- Touch ECS or SQS at all — no deployment tasks, no service mutation or scaling, no
  queue polling. Reindexing is a manual step.
- Proceed on an STS account/region/role mismatch or a non-customer-managed
  production KMS key — it fails closed with the checkpoint intact.
- Create a KMS grant without `--allow-kms-grant` plus an interactive confirmation.
- Print or persist secret values, or accept a blanket `--yes`.

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

DB network placement is copied from the protected devtest database, so there are no
subnet/security-group flags.

## IAM permissions

Production principal: `sts:GetCallerIdentity`; `rds:DescribeDBInstances`,
`rds:DescribeDBSnapshots`, `rds:DescribeDBSnapshotAttributes`,
`rds:CreateDBSnapshot`, `rds:CopyDBSnapshot`, `rds:ModifyDBSnapshotAttribute`,
`rds:AddTagsToResource`; `kms:DescribeKey`, `kms:ListGrants`, and
`kms:CreateGrant`/`kms:RevokeGrant` for the temporary grant;
`secretsmanager:GetSecretValue` for the production IDENTITY.

Devtest principal: `sts:GetCallerIdentity`; `rds:DescribeDBInstances`,
`rds:DescribeDBSnapshots`, `rds:CopyDBSnapshot`,
`rds:RestoreDBInstanceFromDBSnapshot`, `rds:AddTagsToResource`;
`secretsmanager:GetSecretValue` and `secretsmanager:PutSecretValue` for the devtest
IDENTITY. No ECS, SQS, or `rds:StopDBInstance`/`rds:Delete*` permission is needed or
used.

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
  --new-db-identifier rds-smaht-devtest-restored-20260717
```

After reviewing the plan, replace `plan` with `run`, keep the same operation id, and
add `--allow-kms-grant` if the temporary grant may be created.

## Rollback

Nothing is deleted or stopped by this command, so rollback is: point the devtest
IDENTITY back at the previous endpoint (and its credentials, if rotated) and redeploy
the application via normal tooling. Snapshot and database cleanup remain manual and
outside this command. Restored RDS data is lazy-loaded, so performance can stay cold
for a while after the instance first reports `available`; verify the environment
before decommissioning anything by hand.

## Tests

`src/encoded/tests/test_restore_devtest_db.py` covers the whole flow with **every
external boundary mocked**: STS/RDS/KMS/Secrets Manager are in-memory fakes injected
through the command's client-factory seam; prompts and sleeps are scripted; one test
booby-traps `boto3` to prove a full run never touches it. The fake factory provides
no ECS or SQS clients and the fake RDS client implements no delete or stop APIs, so
any regression toward deployment orchestration, service mutation, stopping, or
deletion fails loudly. No test contacts AWS or a deployed environment.
