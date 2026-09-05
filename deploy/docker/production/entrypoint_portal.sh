#!/bin/sh

echo "Starting up SMAHT WSGI"

# Configure the LB->ECS TLS path FIRST, then scrub the raw secret from THIS shell's
# environment BEFORE launching any other helper (B5). setup_nginx_tls.sh materializes
# the nginx cert/key from the ECS-injected secret (NGINX_SSL_CERTIFICATE[_KEY]) into
# owner-only files, writes the server blocks, and validates the whole config with
# `nginx -t`. If NGINX_TLS_ENABLED != true it configures plain :8000 only. A non-zero
# exit means TLS was requested but the material was missing/malformed/invalid - fail
# the container rather than silently serving plaintext, so ECS restarts it loudly.
echo "Configuring nginx TLS (LB->ECS)"
sh setup_nginx_tls.sh || exit 1

# Scrub the raw cert/key from this shell's environment now, so NOTHING launched after
# this point (assume_identity below, then supervisord and every app worker + nginx,
# which read the cert from disk, not env) inherits the secret. Because this shell is
# PID 1 (the global entrypoint exec'd us) and we exec supervisord below, the scrubbed
# environment is what PID 1 keeps -- /proc/1/environ will not contain the key.
unset NGINX_SSL_CERTIFICATE NGINX_SSL_CERTIFICATE_KEY

# Run assume_identity.py to access the desired deployment configuration from
# secrets manager - this builds production.ini. It runs AFTER the scrub above so the
# TLS private key is never present in its process environment.
poetry run python -m assume_identity

# Start application workers and nginx (nginx runs in the foreground under supervisord).
# exec so supervisord REPLACES this shell as PID 1 (proper signal delivery on task
# stop; no lingering parent shell holding the original environment).
echo "Starting supervisor"
exec supervisord -c supervisord.conf
