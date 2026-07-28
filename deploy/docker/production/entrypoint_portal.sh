#!/bin/sh

echo "Starting up SMAHT WSGI"

# Run assume_identity.py to access the desired deployment configuration from
# secrets manager - this builds production.ini
poetry run python -m assume_identity

# Configure the LB->ECS TLS path. setup_nginx_tls.sh materializes the nginx
# cert/key from the ECS-injected secret (NGINX_SSL_CERTIFICATE[_KEY]) into
# owner-only files and writes the TLS server block. If NGINX_TLS_ENABLED != true
# it just clears the include (plain :8000 only). A non-zero exit means TLS was
# requested but the material was missing/malformed - fail the container rather
# than silently serving plaintext, so ECS restarts it and the problem is loud.
echo "Configuring nginx TLS (LB->ECS)"
sh setup_nginx_tls.sh || exit 1

# Drop the raw cert/key from this container's environment so the app workers and
# nginx (which reads the cert from disk, not env) never inherit the secret. nginx
# already has the materialized files; supervisord + its children start next.
unset NGINX_SSL_CERTIFICATE NGINX_SSL_CERTIFICATE_KEY

# Start application workers and nginx (nginx runs in the foreground under supervisord)
echo "Starting supervisor"
supervisord -c supervisord.conf
