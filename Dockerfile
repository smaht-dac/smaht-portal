# syntax=docker/dockerfile:1.7
# SMaHT-Portal (Production) Dockerfile

# Bullseye with Python 3.11.12
# 2025-05-08: Update docker image to a newer Python 3.11 version;
# this was previously: FROM python:3.9.16-slim-buster
# BASE_IMAGE is overridable, but defaults to the standard Debian slim Python image
# (NOT a hardened image) so plain `docker build .` works with no registry auth.
ARG BASE_IMAGE=python:3.11.12-slim-bullseye

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
    gcc zlib1g-dev libpq-dev git make curl libmagic-dev && \
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

# ---------------------------------------------------------------------------
# Runtime stage: slim image with only what's needed to serve the app - no
# compilers, no Node toolchain, no editors.
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

# nginx: install the pinned nginx.org build (identical to the previous single-stage
# image) via the bullseye install script. That script also creates the non-root
# nginx user (uid/gid 121) and symlinks nginx's access/error logs to stdout/stderr.
# On this standard Debian slim base the `adm` group (gid 4) and `www-data` user
# (uid 33) already exist and uid/gid 121 are free, so - unlike the hardened base -
# no extra account/tooling bootstrapping is required before installing nginx.
COPY deploy/docker/production/install_nginx_bullseye.sh /install_nginx.sh
RUN bash /install_nginx.sh && \
    apt-get clean

# nginx config: drop the packaged defaults and install ours.
RUN rm -f /etc/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/docker/production/nginx.conf /etc/nginx/nginx.conf

# nginx filesystem setup - everything runs as the non-root nginx user under
# supervisord, so the paths nginx writes must be nginx-owned.
RUN chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid && \
    rm -f /var/log/nginx/* && \
    touch /var/log/nginx/access.log && \
    chown -R nginx:nginx /var/log/nginx/access.log && \
    touch /var/log/nginx/error.log && \
    chown -R nginx:nginx /var/log/nginx/error.log && \
    mkdir -p /data/nginx/cache && \
    chown -R nginx:nginx /data/nginx/cache

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

# Create the runtime-writable files (populated at startup) and make entrypoints
# executable - all in one layer.
RUN touch production.ini session-secret.b64 supervisord.log supervisord.sock supervisord.pid && \
    chown nginx:nginx production.ini session-secret.b64 supervisord.log supervisord.sock supervisord.pid && \
    chmod +x entrypoint.sh entrypoint_local.sh entrypoint_portal.sh \
             entrypoint_deployment.sh entrypoint_indexer.sh entrypoint_ingester.sh \
             assume_identity.py

EXPOSE 8000

# Container does not run as root
USER nginx

ENTRYPOINT ["/home/nginx/smaht-portal/entrypoint.sh"]
