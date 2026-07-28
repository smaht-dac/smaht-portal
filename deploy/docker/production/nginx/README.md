# nginx — LB→ECS TLS (encryption in transit)

The load balancer terminates the public TLS session and opens a **second, inner
TLS session to the ECS task**. nginx in the app container is the server for that
inner session. This directory + `../setup_nginx_tls.sh` + `../nginx.conf`
implement the ECS-container side of that path. The LB listener/target-group and
the ECS `secrets:` mapping are **infrastructure, not owned by this repo** — see
the handoff at the bottom.

```
client ──TLS──▶ ALB ──TLS (inner)──▶ nginx :8443 ssl ──▶ app workers
                     cert/key from Secrets Manager, materialized per boot
```

## Moving parts (in this repo)

| File | Role |
| --- | --- |
| `smaht_server_common.conf` | The shared server body (routing, security headers, static handling). Included by **both** the plain `:8000` server and the generated TLS server so they can't drift. |
| `../nginx.conf` | Plain `:8000` server (`include smaht_server_common.conf`) + `include /etc/nginx/conf.d/smaht_tls.conf` (empty unless TLS is enabled). |
| `../setup_nginx_tls.sh` | Run by `entrypoint_portal.sh` before supervisord. Materializes the cert/key from env into owner-only files and writes the `listen 8443 ssl` server block into `smaht_tls.conf`. |
| `tests/setup_nginx_tls_tests.sh` | Self-contained regression suite (mints throwaway certs with openssl; validates the generated block with `nginx -t`). |

## Enabling TLS

Set these on the **app** container (via the ECS `secrets:` block — see handoff):

| Env var | Meaning |
| --- | --- |
| `NGINX_TLS_ENABLED` | `true` turns on the LB→ECS TLS path. Anything else → plain `:8000` only (default). |
| `NGINX_SSL_CERTIFICATE` | Full-chain certificate **PEM** (leaf + any intermediates). |
| `NGINX_SSL_CERTIFICATE_KEY` | Private-key **PEM**. |

On boot, `setup_nginx_tls.sh`:

1. Validates both are present and PEM-structured (and, if `openssl` is available,
   that they parse **and** their public keys match — catching a mismatched pair).
2. Writes them to `/etc/nginx/ssl/server.crt` and `/etc/nginx/ssl/server.key`,
   mode `0600`, in a `0700` dir.
3. Writes the `listen 8443 ssl` server block (TLSv1.2/1.3, `HIGH:!aNULL:!MD5`)
   into `/etc/nginx/conf.d/smaht_tls.conf`, reusing `smaht_server_common.conf`.
4. Emits `HEALTHY: LB->ECS TLS configured …`.

`entrypoint_portal.sh` then **unsets** `NGINX_SSL_CERTIFICATE[_KEY]` before
starting supervisord, so nginx (which reads the cert from disk) and the app
workers never inherit the raw secret.

**Failure is loud.** Missing, empty, non-PEM, or mismatched material makes
`setup_nginx_tls.sh` exit non-zero; `entrypoint_portal.sh` then exits and ECS
restarts the task rather than silently serving plaintext. Only sanitized metadata
(present/absent, byte counts, file modes, parse verdict) is ever logged — never
the certificate or key bytes, no `set -x`, no env dump.

## The required secret shape

Store one Secrets Manager secret (JSON) with the PEM material, e.g.:

```json
{
  "NGINX_SSL_CERTIFICATE": "-----BEGIN CERTIFICATE-----\n…leaf…\n-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----\n…intermediate…\n-----END CERTIFICATE-----\n",
  "NGINX_SSL_CERTIFICATE_KEY": "-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n"
}
```

The certificate value should be the **full chain** (leaf first, then
intermediates) so clients that don't cache intermediates still verify.

## Rotation / restart behavior

The cert/key are materialized **once per container start**, so rotation is a
restart operation, not hot-reload:

1. Update the Secrets Manager secret value with the new PEM material.
2. Force a new ECS deployment (rolling restart). Each new task reads the updated
   secret, re-materializes the files, and `nginx -t`-valid config comes up on the
   new cert. Old tasks keep serving the old cert until they drain — zero-downtime.

There is no in-place `nginx -s reload` of new certs; a task lives with the cert it
booted with. Rotate before expiry with a rolling deploy.

## Tests

```sh
sh deploy/docker/production/tests/setup_nginx_tls_tests.sh   # direct
# or via pytest / make test-unit:
#   deploy/docker/production/tests/test_setup_nginx_tls.py
```

Covers: TLS-disabled no-op; missing cert; missing key; malformed cert; malformed
key; mismatched pair; valid pair → `0600` files + a `listen 8443 ssl` block that
`nginx -t` accepts; and proof the secret bytes never reach stdout/stderr.

## Infrastructure handoff (NOT owned by this repository)

This repo configures nginx and materializes the cert files. Two pieces live in
the ECS/CloudFormation infrastructure project and must be added there:

1. **ECS `secrets:` mapping.** On the app container definition, map the Secrets
   Manager secret's JSON keys to the env vars above:
   ```
   secrets:
     - name: NGINX_TLS_ENABLED           valueFrom: <secret-arn>:NGINX_TLS_ENABLED::   # or a plain env "true"
     - name: NGINX_SSL_CERTIFICATE       valueFrom: <secret-arn>:NGINX_SSL_CERTIFICATE::
     - name: NGINX_SSL_CERTIFICATE_KEY   valueFrom: <secret-arn>:NGINX_SSL_CERTIFICATE_KEY::
   ```
   The task **execution role** needs `secretsmanager:GetSecretValue` on that ARN
   (and `kms:Decrypt` if the secret is CMK-encrypted).
2. **LB listener + target group.** Point the load balancer at the container's
   **8443** target (the image now `EXPOSE`s 8000 and 8443) and configure the
   listener→target hop as TLS/HTTPS. If the ALB validates the upstream
   certificate, the cert's SAN must match what the target group expects.

Certificate and private-key values must never appear in task definitions, PR
text, logs, or images — only the **secret ARN** is referenced. Until the two
items above land, the app image runs plain `:8000` (TLS disabled) with no
behavior change.
