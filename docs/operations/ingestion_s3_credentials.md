# Ingestion S3 credentials

Which AWS identity signs the portal's metadata-bundle reads and writes, and what has to be true in
the environment for them to work.

## The identity

Metadata-bundle S3 calls are signed by the **ECS task role** the portal and ingester tasks already
run under, resolved through the ordinary boto3 default credential provider chain. In a task that is
the container credential provider, so the credentials are temporary, carry a session token and are
refreshed by botocore itself — nothing caches them for the lifetime of the long-running ingestion
listener.

The client is built by `make_s3_client_for_ingestion` in `dcicsnovault`, used at three call sites:

| call site | task | operation |
|---|---|---|
| `snovault/ingestion/ingestion_listener.py` `submit_for_ingestion` | portal | `PutObject` of the submitted datafile and `manifest.json` |
| `snovault/ingestion/ingestion_listener.py` `process_submission` | ingester | `GetObject` of `manifest.json` |
| `snovault/ingestion/ingestion_message_handler_default.py` `process_submission` | ingester | `GetObject` of `manifest.json` |

Submission *results* were already written by `SubmissionFolio`, which has always used the default
chain against this same bucket.

There is deliberately **no fallback**: if the chain resolves nothing, or the call is denied, the
submission fails and the error surfaces. It is never retried under another identity.

## Prerequisites

* The portal and ingester tasks run under the ECS task role (`ecs_assumed_iam_role` in
  4dn-cloud-infra). Both already do.
* That role needs `s3:PutObject` and `s3:GetObject` on the metadata-bundles bucket named by the
  `metadata_bundles_bucket` setting. The existing `ECSS3Policy` covers it; **no policy change is
  required and none should be made for this.**
* Where a KMS key is configured (`ENCODED_S3_ENCRYPT_KEY_ID`), the task role needs
  `kms:GenerateDataKey*` / `kms:Encrypt` / `kms:Decrypt` on that key, from **both** its IAM policy
  and the key's own key policy. The datastore key policy already names the task role as a permitted
  principal. Objects are still written with `ServerSideEncryption: aws:kms` and that key id; this
  behavior is unchanged.

## What this is *not*

* **Not `S3_UPLOAD_ROLE_ARN`.** That role exists for `external_creds` — the scoped, short-lived
  credentials handed to clients for *file* upload and download — and its policy is scoped to the
  files bucket. It does not grant the metadata-bundles bucket, and a session policy can only narrow
  what a role already allows. It must not be widened to cover ingestion.
* **Not a second AssumeRole hop.** The task role is already an assumed role; adding `sts:AssumeRole`
  here would buy nothing and would need trust and policy changes.
* **Not a change to downloads.** `make_s3_client` is untouched and still uses the configured static
  credentials. It also backs `build_s3_presigned_get_url`, whose URLs are presigned for 36 hours — a
  URL signed with temporary credentials stops working as soon as that session expires, so repointing
  it would silently shorten download-URL lifetime. `test_download_client_still_uses_static_keys` in
  `src/encoded/tests/test_ingestion_s3_credentials.py` guards that boundary.

## Legacy static keys

`S3_AWS_ACCESS_KEY_ID` / `S3_AWS_SECRET_ACCESS_KEY` in the global application configuration belong
to a legacy IAM user. Ingestion no longer reads them. They may still be present, and ingestion works
whether they are valid, stale or absent — an environment whose key had been deleted was the original
symptom:

```
An error occurred (InvalidAccessKeyId) when calling the PutObject operation:
The AWS Access Key Id you provided does not exist in our records.
```

Removing them is a separate decision: other code paths, including presigned downloads, still use
them. Nothing in this change requires a secrets edit.

## Tests

`src/encoded/tests/test_ingestion_s3_credentials.py` drives the real `submit_for_ingestion` view and
the real client factories with real SigV4 signing against a local fake transport, and asserts on the
credential that actually reaches the wire: the task role signs, the static key never does, the
session token is carried, SSE-KMS headers are preserved, and denial or missing credentials surface
instead of falling back. No network, AWS or SQS access.
