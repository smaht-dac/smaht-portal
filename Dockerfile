# syntax=docker/dockerfile:1.7
# SMaHT-Portal (Production) Dockerfile

# Bookworm (Debian 12) with Python 3.11.16
# History: python:3.9.16-slim-buster -> python:3.11.12-slim-bullseye (2025-05-08)
#          -> python:3.11.16-slim-bookworm (2026-09).
#
# 2026-09: moved off bullseye because Debian 11 LTS ENDED 2026-08-31. After that date
# `deb.debian.org/debian-security bullseye-security` still publishes an index listing
# package versions whose .deb files have been pruned from the pool, so `apt-get upgrade`
# and even `apt-get install` fail with 404s (exit 100) on a clean-cache build. That is an
# unfixable-by-pinning condition: the archive no longer carries the artifacts its own
# index advertises, and libssl1.1 -- which the previously pinned nginx needs -- is among
# them. Debian 12 bookworm is under Debian LTS through 2028-06-30, which outlasts Python
# 3.11's own EOL (2027-10), so it is the release this image should sit on.
#
# BASE_IMAGE is overridable, but defaults to the standard Debian slim Python image
# (NOT a hardened image) so plain `docker build .` works with no registry auth.
ARG BASE_IMAGE=python:3.11.16-slim-bookworm

# ---------------------------------------------------------------------------
# Builder stage: full toolchain (compilers, Node) used only to build the Python
# venv and the front-end assets. None of this ships in the runtime image.
# ---------------------------------------------------------------------------
FROM ${BASE_IMAGE} AS builder

ENV DEBIAN_FRONTEND=noninteractive \
    CRYPTOGRAPHY_DONT_BUILD_RUST=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_DEFAULT_TIMEOUT=100 \
    NVM_VERSION=v0.39.1 \
    NODE_VERSION=21.7.3

# Python venv (poetry + supervisor + app deps all install into here)
ENV VIRTUAL_ENV=/opt/venv
RUN python -m venv /opt/venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Build toolchain + Node (via nvm). Editors/net-tools intentionally omitted.
WORKDIR /home/nginx/.nvm
ENV NVM_DIR=/home/nginx/.nvm

# deb.debian.org is served via a Fastly CDN that intermittently resets pipelined
# connections ("Connection reset by peer"); retry and disable pipelining so
# transient network blips don't fail the build.
RUN echo 'Acquire::Retries "5";' > /etc/apt/apt.conf.d/80-retries && \
    echo 'Acquire::http::Pipeline-Depth "0";' >> /etc/apt/apt.conf.d/80-retries

RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends ca-certificates build-essential \
    gcc zlib1g-dev libpq-dev git make curl libmagic-dev gzip xz-utils && \
    pip install --upgrade pip && \
    pip install poetry==1.8.5 && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh | bash && \
    . "$NVM_DIR/nvm.sh" && nvm install ${NODE_VERSION} && \
    nvm use v${NODE_VERSION} && \
    nvm alias default v${NODE_VERSION}
ENV PATH="/home/nginx/.nvm/versions/node/v${NODE_VERSION}/bin/:${PATH}"

WORKDIR /home/nginx/smaht-portal

# Back-end dependencies first, from the lockfiles only, so this expensive layer is
# cached across code-only changes. BuildKit cache mounts persist the package caches.
COPY pyproject.toml poetry.lock poetry.toml ./
RUN --mount=type=cache,target=/root/.cache/pypoetry \
    --mount=type=cache,target=/root/.cache/pip \
    poetry install --no-root --no-dev

# Front-end dependencies next (also cache-friendly).
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-fund --no-progress --no-optional --no-audit --python=/opt/venv/bin/python

# Now the full source, then install the project itself and build assets.
COPY . .
RUN --mount=type=cache,target=/root/.cache/pypoetry \
    poetry install --no-dev && \
    python setup_eb.py develop && \
    make fix-dist-info
ENV NODE_ENV=production
RUN npm run build && \
    npm run build-scss && \
    rm -rf node_modules/

# Build-time data fetches (kept in the built tree, carried into runtime below).
# NOTE: restricted_domains.txt is pulled from a third-party gist - consider vendoring
# it into the repo with a checksum to remove this build-time supply-chain dependency.
RUN curl -o aws-ip-ranges.json https://ip-ranges.amazonaws.com/ip-ranges.json && \
    curl https://gist.githubusercontent.com/ammarshah/f5c2624d767f91a7cbdc4e54db8dd0bf/raw > restricted_domains.txt

# NOTE: the Splunk Universal Forwarder is NOT installed in this image. It runs as
# its own ECS sidecar (see deploy/docker/splunk/), mirroring the CrowdStrike
# Falcon sensor sidecar. The application container only WRITES its logs to a
# shared volume (/var/log/smaht) that the Splunk sidecar mounts and tails.

# ---------------------------------------------------------------------------
# Runtime stage: same hardened base, without the builder's additional toolchain.
# Copy the application venv and Node runtime for server-side rendering below.
# ---------------------------------------------------------------------------
FROM ${BASE_IMAGE} AS runtime

# Build Arguments
ARG INI_BASE
ENV INI_BASE=${INI_BASE:-"smaht_any_alpha.ini"}

ENV NGINX_USER=nginx \
    DEBIAN_FRONTEND=noninteractive \
    PYTHONFAULTHANDLER=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONHASHSEED=random \
    VIRTUAL_ENV=/opt/venv \
    GIT_PYTHON_GIT_EXECUTABLE=/usr/bin/git \
    NODE_VERSION=21.7.3
# Node is required at runtime for server-side rendering. We don't reinstall the Node
# toolchain here - just copy the prebuilt runtime from the builder (below) onto PATH,
# which keeps the build toolchain (gcc, headers, npm build deps) out of the final image.
ENV NODE_DIR=/home/nginx/.nvm/versions/node/v${NODE_VERSION}
ENV PATH="$VIRTUAL_ENV/bin:${NODE_DIR}/bin:$PATH"

# deb.debian.org CDN reset mitigation (see builder stage).
RUN echo 'Acquire::Retries "5";' > /etc/apt/apt.conf.d/80-retries && \
    echo 'Acquire::http::Pipeline-Depth "0";' >> /etc/apt/apt.conf.d/80-retries

# Runtime OS deps only. psycopg2-binary bundles libpq, so libpq-dev isn't needed
# here; gcc/build tools aren't needed since wheels are built in the builder stage.
# libmagic1 is for python-magic; make is for the local entrypoint; git is invoked
# indirectly by dcicutils at runtime.
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends ca-certificates git make libmagic1 && \
    apt-get clean

# nginx: install the pinned nginx.org build via the bookworm install script. That
# script also creates the non-root nginx user (uid/gid 121) and symlinks nginx's
# access/error logs to stdout/stderr.
# On this standard Debian slim base the `adm` group (gid 4) and `www-data` user
# (uid 33) already exist and uid/gid 121 are free (re-verified on bookworm), so -
# unlike the hardened base - no extra account/tooling bootstrapping is required
# before installing nginx.
COPY deploy/docker/production/install_nginx_bookworm.sh /install_nginx.sh
RUN bash /install_nginx.sh && \
    apt-get clean

# nginx config: drop the packaged defaults and install ours.
RUN rm -f /etc/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/docker/production/nginx.conf /etc/nginx/nginx.conf
# Shared server body (locations + security headers), included by both the plain
# :8000 server and the generated TLS server. Copied read-only.
COPY deploy/docker/production/nginx/smaht_server_common.conf /etc/nginx/conf.d/smaht_server_common.conf
# Plain HTTP (:8000) server include -- the image default (TLS disabled / local runs).
# setup_nginx_tls.sh regenerates it at runtime (empties it when TLS is enabled -> fail
# closed), so it must be nginx-writable.
COPY deploy/docker/production/nginx/smaht_http.conf /etc/nginx/conf.d/smaht_http.conf

# LB->ECS TLS scaffolding. nginx.conf `include`s conf.d/smaht_http.conf and
# conf.d/smaht_tls.conf; ship smaht_tls.conf EMPTY so the plain :8000 server works
# with TLS disabled. When TLS is enabled, setup_nginx_tls.sh (run by the portal
# entrypoint) materializes the cert/key into /etc/nginx/ssl (owner-only), writes the
# TLS server block into smaht_tls.conf, and EMPTIES smaht_http.conf (no plaintext
# :8000). The ssl dir and both generated includes must be nginx-writable at runtime
# (the container runs as nginx).
RUN mkdir -p /etc/nginx/ssl /etc/nginx/conf.d && \
    chmod 700 /etc/nginx/ssl && \
    : > /etc/nginx/conf.d/smaht_tls.conf && \
    chown -R nginx:nginx /etc/nginx/ssl \
          /etc/nginx/conf.d/smaht_tls.conf /etc/nginx/conf.d/smaht_http.conf

# nginx + app runtime log filesystem. Everything runs as the non-root nginx user
# (uid/gid 121) under supervisord, so every path written must be nginx-owned.
#
# /var/log/smaht is the SHARED-VOLUME log root: the app container writes here and the
# Splunk sidecar mounts it read-only and tails it. It holds BOTH the app worker logs
# (smahtN.log) AND nginx error logs (nginx/error.log) -- one volume. The pre-created
# access.log is unused by the targeted stdout access stream. /var/lib/nginx is nginx's state/temp dir;
# it stays image-local (not shared). /var/log/nginx is kept nginx-owned as insurance
# for nginx's compiled-in default error-log path (our config redirects logs to
# /var/log/smaht/nginx, but the default dir must be writable for any pre-config error).
# Files are pre-created nginx-owned so the shipper and the sidecar find them
# immediately, and so this ownership is what the shared volume preserves (VOLUME, B2).
RUN mkdir -p /var/lib/nginx /var/log/nginx /var/log/smaht/nginx && \
    chown -R nginx:nginx /var/lib/nginx /var/log/nginx /var/log/smaht && \
    touch /var/run/nginx.pid \
          /var/log/smaht/nginx/error.log /var/log/smaht/nginx/access.log \
          /var/log/smaht/smaht1.log /var/log/smaht/smaht2.log /var/log/smaht/smaht3.log \
          /var/log/smaht/smaht4.log /var/log/smaht/smaht5.log && \
    chown nginx:nginx /var/run/nginx.pid \
          /var/log/smaht/nginx/error.log /var/log/smaht/nginx/access.log \
          /var/log/smaht/smaht1.log /var/log/smaht/smaht2.log /var/log/smaht/smaht3.log \
          /var/log/smaht/smaht4.log /var/log/smaht/smaht5.log && \
    chmod 0755 /var/log/smaht /var/log/smaht/nginx

# nginx config gate (from main PR #721): validate the installed nginx.conf against
# the actual nginx now that the config, its conf.d includes, and the log paths it
# references all exist. This runs during `docker build` (the CI Docker job), so a
# syntactically invalid or directive-incompatible nginx.conf fails the build instead
# of only failing at container start. Syntax/directive test only -- it does not prove
# runtime behavior, and it validates the TLS-DISABLED default (empty smaht_tls.conf);
# the runtime TLS cert/config is validated separately by setup_nginx_tls.sh.
# The root-run check also creates Debian nginx's temp subdirectories, owned by
# its compiled-in default worker user. Repair them AFTER the check so runtime
# uid 121 can buffer request bodies and upstream responses to disk.
RUN nginx -v && nginx -t && \
    chown -R nginx:nginx /var/lib/nginx

# B2 (shared-volume ownership): declare /var/log/smaht a VOLUME so an ECS bind/managed
# mount PRESERVES the image path's nginx (uid 121) ownership + mode instead of masking
# it with a fresh root:root 0755 mount. Without this the non-root app could not create
# /var/log/smaht/*.log. Declared AFTER the directory is created, chowned, and validated
# so the preserved content is correct. The Splunk sidecar mounts the same volume
# read-only as uid 4321; 0755 dirs + world-readable log files let that other-uid read.
# See deploy/docker/splunk/README.md ("shared log volume") for the task-definition mounts.
VOLUME ["/var/log/smaht"]

WORKDIR /home/nginx/smaht-portal

# Bring in the built venv and the built application tree from the builder. --chown
# avoids a second full-size layer that a later `chown -R` would create.
COPY --chown=nginx:nginx --from=builder /opt/venv /opt/venv
COPY --chown=nginx:nginx --from=builder /home/nginx/smaht-portal /home/nginx/smaht-portal
# Node runtime (for server-side rendering) - just the prebuilt interpreter, no toolchain.
COPY --chown=nginx:nginx --from=builder ${NODE_DIR} ${NODE_DIR}

# App config + entrypoints. entrypoint.sh dispatches by $application_type; *.ini must
# match the env name in Secrets Manager.
COPY --chown=nginx:nginx deploy/docker/local/docker_development.ini development.ini
COPY --chown=nginx:nginx deploy/docker/local/entrypoint.sh entrypoint_local.sh
COPY --chown=nginx:nginx deploy/docker/local/gitinfo.json .
COPY --chown=nginx:nginx deploy/docker/production/$INI_BASE deploy/ini_files/.
COPY --chown=nginx:nginx deploy/docker/production/entrypoint.sh .
COPY --chown=nginx:nginx deploy/docker/production/entrypoint_portal.sh .
COPY --chown=nginx:nginx deploy/docker/production/entrypoint_deployment.sh .
COPY --chown=nginx:nginx deploy/docker/production/entrypoint_indexer.sh .
COPY --chown=nginx:nginx deploy/docker/production/entrypoint_ingester.sh .
COPY --chown=nginx:nginx deploy/docker/production/supervisord.conf .
COPY --chown=nginx:nginx deploy/docker/production/assume_identity.py .
COPY --chown=nginx:nginx deploy/docker/production/setup_nginx_tls.sh .

# Create the runtime-writable files (populated at startup) and make entrypoints
# executable - all in one layer.
RUN touch production.ini session-secret.b64 supervisord.log supervisord.sock supervisord.pid && \
    chown nginx:nginx production.ini session-secret.b64 supervisord.log supervisord.sock supervisord.pid && \
    chmod +x entrypoint.sh entrypoint_local.sh entrypoint_portal.sh \
             entrypoint_deployment.sh entrypoint_indexer.sh entrypoint_ingester.sh \
             assume_identity.py setup_nginx_tls.sh

# 8000 = plain HTTP (TLS disabled); 8443 = HTTPS for the LB->ECS TLS path when
# NGINX_TLS_ENABLED=true. The ECS task definition / LB target group selects which
# port the load balancer forwards to (see deploy/docker/production/nginx/README.md).
EXPOSE 8000 8443

# Container does not run as root
USER nginx

ENTRYPOINT ["/home/nginx/smaht-portal/entrypoint.sh"]
