# SMaHT-Portal (Production) Dockerfile
# Multi-stage build: frontend -> backend -> runtime

# =============================================================================
# Stage 1: Frontend build
# =============================================================================
FROM node:21.7.3-slim AS frontend

# node-gyp requires Python, make, and a C compiler; git dependencies require git
RUN apt-get update && apt-get install -y --no-install-recommends python3 git make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /home/nginx/smaht-portal

# Install npm deps (cached unless package files change)
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-progress --no-optional --no-audit --python=python3

# Copy only what the frontend build needs
COPY webpack.config.js gulpfile.js ./
COPY src/encoded/static/ src/encoded/static/

# Build JS bundles and CSS
ENV NODE_ENV=production
RUN npm run build && npm run build-scss


# =============================================================================
# Stage 2: Backend dependency build
# =============================================================================
FROM python:3.11.12-slim-bullseye AS backend

ENV VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=on

RUN python -m venv $VIRTUAL_ENV && \
    pip install --upgrade pip && \
    pip install poetry==1.8.5

# Install build-time system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential gcc zlib1g-dev libpq-dev git make curl libmagic-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /home/nginx/smaht-portal

# Install Python dependencies first (cached unless pyproject.toml/poetry.lock change)
# README.rst is required by pyproject.toml (readme = "README.rst")
COPY pyproject.toml poetry.lock poetry.toml README.rst ./
RUN poetry install --without dev --no-root -vvv

# Copy source and install local package
COPY src/ src/
COPY setup_eb.py Makefile ./
COPY scripts/ scripts/
RUN poetry install --without dev -vvv && \
    python setup_eb.py develop && \
    make fix-dist-info


# =============================================================================
# Stage 3: Runtime
# =============================================================================
FROM python:3.11.12-slim-bullseye

LABEL maintainer="William Ronchetti <william_ronchetti@hms.harvard.edu>"

# Build arguments
ARG INI_BASE

# Runtime environment
ENV INI_BASE=${INI_BASE:-"smaht_any_alpha.ini"} \
    VIRTUAL_ENV=/opt/venv \
    PYTHONFAULTHANDLER=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONHASHSEED=random \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_DEFAULT_TIMEOUT=100 \
    PATH="/opt/venv/bin:$PATH"

# Install runtime-only system dependencies
# git is required by dcicutils at startup (used to resolve version info during ini generation)
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client libpq5 libmagic1 curl ca-certificates make git && \
    rm -rf /var/lib/apt/lists/*

# Install nginx (creates nginx user/group)
COPY deploy/docker/production/install_nginx_bullseye.sh /tmp/install_nginx.sh
RUN bash /tmp/install_nginx.sh && rm /tmp/install_nginx.sh && \
    apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy virtualenv with all Python deps from backend builder
COPY --from=backend /opt/venv /opt/venv

WORKDIR /home/nginx/smaht-portal

# Copy application source
COPY src/ src/

# Overlay built frontend assets from frontend stage
COPY --from=frontend /home/nginx/smaht-portal/src/encoded/static/build/ src/encoded/static/build/
COPY --from=frontend /home/nginx/smaht-portal/src/encoded/static/css/style.css src/encoded/static/css/style.css
COPY --from=frontend /home/nginx/smaht-portal/src/encoded/static/css/style.css.map src/encoded/static/css/style.css.map
COPY --from=frontend /home/nginx/smaht-portal/src/encoded/static/css/print.css src/encoded/static/css/print.css
COPY --from=frontend /home/nginx/smaht-portal/src/encoded/static/css/print.css.map src/encoded/static/css/print.css.map

# Copy files needed by poetry at runtime
COPY pyproject.toml poetry.lock poetry.toml Makefile ./

# Fetch restricted domain list with error checking
RUN curl --fail --silent --show-error -o restricted_domains.txt \
        https://gist.githubusercontent.com/ammarshah/f5c2624d767f91a7cbdc4e54db8dd0bf/raw && \
    touch restricted_emails.txt

# Fetch AWS IP ranges
RUN curl --fail --silent --show-error -o aws-ip-ranges.json \
        https://ip-ranges.amazonaws.com/ip-ranges.json

# Configure nginx
RUN rm -f /etc/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/docker/production/nginx.conf /etc/nginx/nginx.conf

# Nginx filesystem setup
RUN chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid && \
    rm -f /var/log/nginx/* && \
    touch /var/log/nginx/access.log /var/log/nginx/error.log && \
    chown -R nginx:nginx /var/log/nginx && \
    mkdir -p /data/nginx/cache && chown -R nginx:nginx /data/nginx/cache

# Local development files
COPY deploy/docker/local/docker_development.ini development.ini
COPY deploy/docker/local/entrypoint.sh entrypoint_local.sh
COPY deploy/docker/local/gitinfo.json .
RUN chown nginx:nginx development.ini && chmod +x entrypoint_local.sh

# Production setup
RUN chown nginx:nginx poetry.toml && \
    touch production.ini session-secret.b64 supervisord.log supervisord.sock supervisord.pid && \
    chown nginx:nginx production.ini session-secret.b64 supervisord.log supervisord.sock supervisord.pid

COPY deploy/docker/production/$INI_BASE deploy/ini_files/.
COPY deploy/docker/production/entrypoint.sh .
COPY deploy/docker/production/entrypoint_portal.sh .
COPY deploy/docker/production/entrypoint_deployment.sh .
COPY deploy/docker/production/entrypoint_indexer.sh .
COPY deploy/docker/production/entrypoint_ingester.sh .
COPY deploy/docker/production/supervisord.conf .
COPY deploy/docker/production/assume_identity.py .
# Fix: original was missing entrypoint_portal.sh and had entrypoint_deployment.sh twice
RUN chmod +x entrypoint.sh entrypoint_portal.sh entrypoint_deployment.sh \
              entrypoint_indexer.sh entrypoint_ingester.sh assume_identity.py

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Container does not run as root
USER nginx

ENTRYPOINT ["/home/nginx/smaht-portal/entrypoint.sh"]
