# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## S3 upload/download credentials need `S3_UPLOAD_ROLE_ARN` once `encoded-core` >= 1.0.0

`encoded_core.types.file.external_creds()` generates the temporary S3 credentials returned by
`upload_credentials`/`extra_files_creds`/download redirects. As of `encoded-core` 1.0.0 it calls
`sts:assume_role` (previously `sts:get_federation_token`, changed because `GetFederationToken`
cannot be called with temporary credentials — which is exactly what OIDC-based
`aws-actions/configure-aws-credentials` produces in CI).

`assume_role` requires an explicit `RoleArn`. That value comes *only* from:
- `identity.get('S3_UPLOAD_ROLE_ARN')` when the `IDENTITY` env var is set (production path, value
  lives in the app's Secrets Manager `GLOBAL_APPLICATION_CONFIGURATION` secret), or
- `os.environ.get('S3_UPLOAD_ROLE_ARN')` otherwise — the path taken by unit tests, since
  `conftest.py` sets `USE_SAMPLE_ENVUTILS = True` and never sets `IDENTITY`.

There is no `S3_UPLOAD_ROLE_ARN` wired into this repo's CI (`.github/workflows/main.yml`),
`Makefile`, or `conftest.py`, so any test that exercises file upload/download credentials
(`test_permissions.py`, `test_types_file.py`, `test_schema_meta_workflow.py`, etc.) fails with
`ParamValidationError: Invalid type for parameter RoleArn, value: None` until that env var is set
to a real IAM role ARN. That role must (a) have S3 `GetObject`/`PutObject`/`ListBucket` on the
unit-test buckets (e.g. `smaht-unit-testing-wfout`), and (b) trust whatever identity the CI job
authenticates as (the role behind `AWS_OIDC_ROLE_ARN`) for `sts:AssumeRole`. This is an AWS IAM
change plus a new GitHub Actions secret — not fixable from application code alone. See PR #646 for
the full investigation.
