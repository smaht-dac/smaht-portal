# SMaHT-Portal (Production) Dockerfile
# Multi-stage build: frontend assets built in node stage, then everything else
# in a single runtime stage to preserve system dependency co-location.

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
# Stage 2: Runtime (backend build + runtime in one stage)
# =============================================================================
FROM python:3.11.12-slim-bullseye

LABEL maintainer="William Ronchetti <william_ronchetti@hms.harvard.edu>"

# Build arguments
ARG INI_BASE
ENV INI_BASE=${INI_BASE:-"smaht_any_alpha.ini"}

# Configure environment
ENV VIRTUAL_ENV=/opt/venv \
    PYTHONFAULTHANDLER=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONHASHSEED=random \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_DEFAULT_TIMEOUT=100 \ 
    GIT_PYTHON_REFRESH=quiet

# Create Python virtual environment
RUN python -m venv /opt/venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install system dependencies (build + runtime)
WORKDIR /home/nginx/.nvm
ENV NVM_DIR=/home/nginx/.nvm
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends ca-certificates build-essential \
    gcc zlib1g-dev postgresql-client libpq-dev git make curl libmagic-dev && \
    pip install --upgrade pip && \
    pip install poetry==1.8.5 && \
    curl -o aws-ip-ranges.json https://ip-ranges.amazonaws.com/ip-ranges.json

# Install nginx (creates nginx user/group)
COPY deploy/docker/production/install_nginx_bullseye.sh /install_nginx.sh
RUN bash /install_nginx.sh && \
    chown -R nginx:nginx /opt/venv && \
    mkdir -p /home/nginx/smaht-portal && \
    mv aws-ip-ranges.json /home/nginx/smaht-portal/aws-ip-ranges.json && \
    apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
    apt-get clean

# Build application
WORKDIR /home/nginx/smaht-portal

# Install Python deps first (cached unless pyproject.toml/poetry.lock change)
COPY pyproject.toml poetry.lock poetry.toml README.rst ./
RUN poetry install --without dev --no-root -vvv

# Copy application source and install local package
COPY src/ src/
COPY setup_eb.py Makefile ./
COPY scripts/ scripts/
RUN poetry install --without dev -vvv && \
    python setup_eb.py develop && \
    make fix-dist-info

# Overlay built frontend assets from frontend stage (replaces node-built files only)
COPY --from=frontend /home/nginx/smaht-portal/src/encoded/static/build/ src/encoded/static/build/
COPY --from=frontend /home/nginx/smaht-portal/src/encoded/static/css/style.css src/encoded/static/css/style.css
COPY --from=frontend /home/nginx/smaht-portal/src/encoded/static/css/style.css.map src/encoded/static/css/style.css.map
COPY --from=frontend /home/nginx/smaht-portal/src/encoded/static/css/print.css src/encoded/static/css/print.css
COPY --from=frontend /home/nginx/smaht-portal/src/encoded/static/css/print.css.map src/encoded/static/css/print.css.map

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

# Fetch restricted domain/email lists with error checking
RUN curl --fail --silent --show-error -o restricted_domains.txt \
        https://gist.githubusercontent.com/ammarshah/f5c2624d767f91a7cbdc4e54db8dd0bf/raw && \
    touch restricted_emails.txt

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

# Container does not run as root
USER nginx

ENTRYPOINT ["/home/nginx/smaht-portal/entrypoint.sh"]
