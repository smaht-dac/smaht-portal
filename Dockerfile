# syntax=docker/dockerfile:1.7
# SMaHT-Portal (Production) Dockerfile

# Debian Hardened Image. Pin by digest for reproducible, tamper-evident builds:
#   docker buildx imagetools inspect dhi.io/python:3.11-debian-sfw-dev   # copy the sha256
#   docker build --build-arg BASE_IMAGE=dhi.io/python:3.11-debian-sfw-dev@sha256:<digest> .
ARG BASE_IMAGE=dhi.io/python:3.11-debian-sfw-dev

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

# Splunk Universal Forwarder (HMS/FISMA compliance agent). Installed here via the
# Debian package per the HMS instructions; the extracted /opt/splunkforwarder tree
# is copied into the runtime image below, so no download/dpkg runs in runtime.
# No first-run state is generated at build time - that happens per-container at
# startup (see deploy/docker/production/splunk/run_splunk_forwarder.sh).
ARG SPLUNK_UF_VERSION=9.4.12
ARG SPLUNK_UF_BUILD=9dfc486f3d48
RUN curl -fsSL -o /tmp/splunkforwarder.deb \
      "https://download.splunk.com/products/universalforwarder/releases/${SPLUNK_UF_VERSION}/linux/splunkforwarder-${SPLUNK_UF_VERSION}-${SPLUNK_UF_BUILD}-linux-amd64.deb" && \
    dpkg -i /tmp/splunkforwarder.deb && \
    rm -f /tmp/splunkforwarder.deb

# ---------------------------------------------------------------------------
# Runtime stage: slim image with only what's needed to serve the app - no
# compilers, no Node, no editors. Same hardened base, runtime libs only.
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

# Runtime OS deps only. psycopg2-binary bundles libpq, so libpq is not needed here;
# gcc/build tools aren't needed since wheels are built in the builder stage.
# This hardened base strips standard accounts/tooling that Debian's nginx packaging
# assumes, so we install the user tooling and create the `adm` group (nginx-common's
# postinst does `chown root:adm /var/log/nginx`, which fails if `adm` doesn't exist)
# BEFORE installing nginx. libmagic1 is for python-magic; make is for the local
# entrypoint; git is invoked indirectly by dcicutils at runtime.
RUN apt-get update && \
    apt-get install -y --no-install-recommends adduser passwd init-system-helpers && \
    # nginx-common's postinst does `chown www-data:adm /var/log/nginx`; this hardened
    # base ships neither the `adm` group nor the `www-data` user, so create both first.
    ( getent group adm >/dev/null || /usr/sbin/groupadd --system adm ) && \
    ( getent group www-data >/dev/null || /usr/sbin/groupadd --system www-data ) && \
    ( getent passwd www-data >/dev/null || /usr/sbin/useradd --system --gid www-data --no-create-home --home-dir /var/www --shell /usr/sbin/nologin www-data ) && \
    apt-get install -y --no-install-recommends nginx ca-certificates git libmagic1 make && \
    /usr/sbin/groupadd --system --gid 121 nginx && \
    /usr/sbin/useradd --system --gid nginx --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --uid 121 nginx && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# nginx config: drop the Debian defaults (sites-enabled/* layout) and install ours.
RUN rm -f /etc/nginx/nginx.conf \
          /etc/nginx/conf.d/default.conf \
          /etc/nginx/sites-enabled/default \
          /etc/nginx/sites-available/default
COPY deploy/docker/production/nginx.conf /etc/nginx/nginx.conf

# nginx + app runtime log filesystem. Everything runs as the non-root nginx user
# under supervisord, so the paths written (nginx error/access logs, state/temp dir,
# pid, and the app worker logs) must be nginx-owned. /var/log/smaht holds the app
# worker output that the Splunk forwarder tails; the log files are pre-created so
# the forwarder and the tail-to-stdout shipper find them immediately at startup.
RUN mkdir -p /var/log/nginx /var/lib/nginx /var/log/smaht && \
    chown -R nginx:nginx /var/log/nginx /var/lib/nginx /var/log/smaht && \
    rm -f /var/log/nginx/* && \
    touch /var/log/nginx/error.log /var/log/nginx/access.log /var/run/nginx.pid \
          /var/log/smaht/smaht1.log /var/log/smaht/smaht2.log /var/log/smaht/smaht3.log \
          /var/log/smaht/smaht4.log /var/log/smaht/smaht5.log && \
    chown nginx:nginx /var/log/nginx/error.log /var/log/nginx/access.log /var/run/nginx.pid \
          /var/log/smaht/smaht1.log /var/log/smaht/smaht2.log /var/log/smaht/smaht3.log \
          /var/log/smaht/smaht4.log /var/log/smaht/smaht5.log

WORKDIR /home/nginx/smaht-portal

# Bring in the built venv and the built application tree from the builder. --chown
# avoids a second full-size layer that a later `chown -R` would create.
COPY --chown=nginx:nginx --from=builder /opt/venv /opt/venv
COPY --chown=nginx:nginx --from=builder /home/nginx/smaht-portal /home/nginx/smaht-portal
# Node runtime (for server-side rendering) - just the prebuilt interpreter, no toolchain.
COPY --chown=nginx:nginx --from=builder ${NODE_DIR} ${NODE_DIR}

# Splunk Universal Forwarder: copy the installed tree from the builder (no download
# or dpkg in the runtime image) and drop in our static config. It runs as the
# non-root nginx user under supervisord; deploy-poll (deploymentclient.conf) points
# it at the HMS deployment server, which pushes the outputs/index config after it
# phones home. inputs.conf monitors the app + nginx log files on disk.
ENV SPLUNK_HOME=/opt/splunkforwarder
COPY --chown=nginx:nginx --from=builder /opt/splunkforwarder /opt/splunkforwarder
COPY --chown=nginx:nginx deploy/docker/production/splunk/deploymentclient.conf /opt/splunkforwarder/etc/system/local/deploymentclient.conf
COPY --chown=nginx:nginx deploy/docker/production/splunk/inputs.conf /opt/splunkforwarder/etc/system/local/inputs.conf
COPY --chown=nginx:nginx deploy/docker/production/splunk/run_splunk_forwarder.sh run_splunk_forwarder.sh

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
             assume_identity.py run_splunk_forwarder.sh

EXPOSE 8000

# Container does not run as root
USER nginx

ENTRYPOINT ["/home/nginx/smaht-portal/entrypoint.sh"]
