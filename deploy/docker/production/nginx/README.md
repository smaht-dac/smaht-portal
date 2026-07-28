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
   into `/etc/nginx/conf.d/smaht_tls.conf`, reusing `smaht_server_common.conf`, and
   **empties `smaht_http.conf`** so there is **no plaintext `:8000` listener at
   all** — TLS mode fails closed (B4).
4. Runs the **authoritative `nginx -t -c /etc/nginx/nginx.conf`** (B3). This loads
   the cert/key and parses every include, so marker-shaped-but-invalid material, a
   mismatched pair, or any config/include error is caught HERE — even when
   `openssl` is unavailable. `openssl` is nonetheless installed in the image as a
   first-line check.
5. Emits `HEALTHY: LB->ECS TLS configured …` **only after `nginx -t` passes**.

`entrypoint_portal.sh` **unsets** `NGINX_SSL_CERTIFICATE[_KEY]` immediately after
this step and **before** it runs `assume_identity` or `exec supervisord` (B5), so
nothing downstream (nginx — which reads the cert from disk — the app workers, or
`assume_identity`) inherits the raw secret, and PID 1 (`exec`'d to supervisord)
does not keep it in `/proc/1/environ`.

**Failure is loud.** Missing, empty, non-PEM, mismatched, or `nginx -t`-invalid
material makes `setup_nginx_tls.sh` exit non-zero; `entrypoint_portal.sh` then
exits and ECS restarts the task rather than silently serving plaintext OR coming up
with a broken cert (which would previously have surfaced as an nginx restart loop
behind a still-"HEALTHY" log). Only sanitized metadata (present/absent, byte
counts, file modes, parse verdict, redacted `nginx -t` output) is ever logged —
never the certificate or key bytes, no `set -x`, no env dump.

### Ports (fail closed)

| Mode | `:8000` (plaintext) | `:8443` (TLS) |
| --- | --- | --- |
| `NGINX_TLS_ENABLED` unset/false | **serving** (plain HTTP) | not listening |
| `NGINX_TLS_ENABLED=true` | **not listening** (removed) | serving (TLS) |

So a stale/mistyped target group or security-group rule cannot quietly keep using
plaintext when TLS is enabled — nothing answers on `:8000`. The image still
`EXPOSE`s both ports (metadata only); the ACTIVE listener is chosen at boot.

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

Covers: TLS-disabled plain-`:8000` include (validated by `nginx -t`); missing cert;
missing key; malformed cert; malformed key; mismatched pair; valid pair → `0600`
files + a `listen 8443 ssl` block **and an emptied plaintext include** (fail
closed) that `nginx -t` accepts; the **no-`openssl` path** where `nginx -t` alone
catches marker-shaped garbage (no false HEALTHY) and accepts valid material; and
proof the secret bytes never reach stdout/stderr. The structural container
invariants (VOLUME, exec chain, log paths, sha256 pin) are guarded by
`deploy/docker/production/tests/test_container_contracts.py`.

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
2. **LB listener + target group + health check.** Point the load balancer at the
   container's **8443** target and configure the listener→target hop as HTTPS. In
   TLS mode nothing listens on `:8000`, so the **target-group health check must
   also target `:8443` (HTTPS)** — a health check left on `:8000` will fail every
   task.

   **ALB certificate validation (N4).** An Application Load Balancer does **not**
   validate the target's certificate: per AWS's ALB target-group documentation it
   accepts self-signed or expired target certs and does not check the SAN/hostname.
   So the cert here does not need a particular SAN for the ALB to connect — this
   hop encrypts transit, it does not authenticate the target to the ALB. Choose the
   certificate's lifecycle/rotation to fit your compliance policy (see "Rotation /
   restart behavior"); the encryption requirement stands regardless.

`NGINX_TLS_ENABLED` can be a plain container `environment` entry (`"true"`) — it is
not sensitive; only `NGINX_SSL_CERTIFICATE[_KEY]` come from the `secrets:` mapping.

Certificate and private-key values must never appear in task definitions, PR
text, logs, or images — only the **secret ARN** is referenced. Until the two
items above land, the app image runs plain `:8000` (TLS disabled) with no
behavior change.
