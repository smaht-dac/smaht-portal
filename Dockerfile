# SMaHT-Portal (Production) Dockerfile

# Bullseye with Python 3.11.12
# 2025-05-08: Update docker image to a newer Python 3.11 version;
# this was previously: FROM python:3.9.16-slim-buster
FROM python:3.11.12-slim-bullseye

MAINTAINER William Ronchetti "william_ronchetti@hms.harvard.edu"

# Build Arguments
ARG INI_BASE
ENV INI_BASE=${INI_BASE:-"smaht_any_alpha.ini"}

# Configure (global) Env
# Note that some important versions are pinned in this statement
ENV NGINX_USER=nginx \
    DEBIAN_FRONTEND=noninteractive \
    CRYPTOGRAPHY_DONT_BUILD_RUST=1 \
    PYTHONFAULTHANDLER=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONHASHSEED=random \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_DEFAULT_TIMEOUT=100 \
    NVM_VERSION=v0.39.1 \
    NODE_VERSION=20.17.0

# Configure Python3.9 venv
ENV VIRTUAL_ENV=/opt/venv
RUN python -m venv /opt/venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install system level dependencies (poetry, nvm)
# Note that the ordering of these operations is intentional to minimize package footprint
WORKDIR /home/nginx/.nvm
ENV NVM_DIR=/home/nginx/.nvm
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends vim emacs net-tools ca-certificates build-essential \
    gcc zlib1g-dev postgresql-client libpq-dev git make curl libmagic-dev && \
    pip install --upgrade pip && \
    pip install poetry==1.8.5 && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh | bash && \
    . "$NVM_DIR/nvm.sh" && nvm install ${NODE_VERSION} && \
    nvm use v${NODE_VERSION} && \
    nvm alias default v${NODE_VERSION} && \
    curl -o aws-ip-ranges.json https://ip-ranges.amazonaws.com/ip-ranges.json

# Install nginx
COPY deploy/docker/production/install_nginx_bullseye.sh /install_nginx.sh
RUN bash /install_nginx.sh && \
    chown -R nginx:nginx /opt/venv && \
    mkdir -p /home/nginx/smaht-portal && \
    mv aws-ip-ranges.json /home/nginx/smaht-portal/aws-ip-ranges.json && \
    # uninstalled by nginx install, but needed later for npm install
    apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
    apt-get clean

# Link, verify installations
ENV PATH="/home/nginx/.nvm/versions/node/v${NODE_VERSION}/bin/:${PATH}"

# Build application
WORKDIR /home/nginx/smaht-portal

# Do the front-end dependency install first, since this is most intensive
COPY package.json .
COPY package-lock.json .
RUN npm ci --no-fund --no-progress --no-optional --no-audit --python=/opt/venv/bin/python && npm cache clean --force

# Copy over the rest of the code
COPY . .

# Build remaining back-end
RUN poetry install --no-dev -vvv && \
    python setup_eb.py develop && \
    make fix-dist-info

# Build front-end, remove node_modules when done
ENV NODE_ENV=production
RUN npm run build && \
    npm run build-scss && \
    rm -rf node_modules/ && \
    apt-get remove --purge --auto-remove -y ca-certificates

# Copy config files in (down here for quick debugging)
# Remove default configuration from Nginx
RUN rm /etc/nginx/nginx.conf && \
    rm /etc/nginx/conf.d/default.conf
COPY deploy/docker/production/nginx.conf /etc/nginx/nginx.conf

# nginx filesystem setup
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

# Pull all required files
# Note that *.ini must match the env name in secrets manager!
# Note that deploy/docker/production/entrypoint.sh resolves which entrypoint to run
# based on env variable "application_type".
# For now, this is mastertest. - Will 04/29/21
COPY deploy/docker/local/docker_development.ini development.ini
COPY deploy/docker/local/entrypoint.sh entrypoint_local.sh
COPY deploy/docker/local/gitinfo.json .
RUN chown nginx:nginx development.ini
RUN chmod +x entrypoint_local.sh

# Production setup
RUN chown nginx:nginx poetry.toml && \
    touch production.ini && \
    chown nginx:nginx production.ini && \
    touch session-secret.b64 && \
    chown nginx:nginx session-secret.b64 &&  \
    touch supervisord.log && \
    chown nginx:nginx supervisord.log && \
    touch supervisord.sock && \
    chown nginx:nginx supervisord.sock && \
    touch supervisord.pid && \
    chown nginx:nginx supervisord.pid
COPY deploy/docker/production/$INI_BASE deploy/ini_files/.
COPY deploy/docker/production/entrypoint.sh .
COPY deploy/docker/production/entrypoint_portal.sh .
COPY deploy/docker/production/entrypoint_deployment.sh .
COPY deploy/docker/production/entrypoint_indexer.sh .
COPY deploy/docker/production/entrypoint_ingester.sh .
COPY deploy/docker/production/supervisord.conf .
COPY deploy/docker/production/assume_identity.py .
RUN chmod +x entrypoint.sh && \
    chmod +x entrypoint_deployment.sh && \
    chmod +x entrypoint_deployment.sh && \
    chmod +x entrypoint_indexer.sh && \
    chmod +x entrypoint_ingester.sh && \
    chmod +x assume_identity.py
EXPOSE 8000

# Container does not run as root
USER nginx

ENTRYPOINT ["/home/nginx/smaht-portal/entrypoint.sh"]
