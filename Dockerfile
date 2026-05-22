# SMaHT-Portal (Production) Dockerfile

# Hardened Debian 13 image with Python 3.12
# Override BASE_IMAGE in CI/CD to use ECR mirror (avoids propagating Docker Hub credentials):
#   docker build --build-arg BASE_IMAGE=<account>.dkr.ecr.<region>.amazonaws.com/dhi-io/python:3.12-debian13-sfw-dev .
ARG BASE_IMAGE=dhi.io/python:3.12-debian13-sfw-dev
FROM ${BASE_IMAGE}

# Build Arguments
ARG INI_BASE
ENV INI_BASE=${INI_BASE:-"smaht_any_alpha.ini"}

# Configure (global) Env
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
    NODE_VERSION=21.7.3

# Configure Python venv
ENV VIRTUAL_ENV=/opt/venv
RUN python -m venv /opt/venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install system dependencies, poetry, and NVM/Node in one layer
WORKDIR /home/nginx/.nvm
ENV NVM_DIR=/home/nginx/.nvm
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
        vim emacs net-tools ca-certificates build-essential \
        gcc zlib1g-dev postgresql-client libpq-dev git make curl libmagic-dev && \
    apt-get clean && rm -rf /var/lib/apt/lists/* && \
    pip install --upgrade pip && \
    pip install poetry==1.8.5 && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh | bash && \
    . "$NVM_DIR/nvm.sh" && nvm install ${NODE_VERSION} && \
    nvm use v${NODE_VERSION} && \
    nvm alias default v${NODE_VERSION} && \
    curl -o aws-ip-ranges.json https://ip-ranges.amazonaws.com/ip-ranges.json

# Install nginx
COPY deploy/docker/production/install_nginx_debian13.sh /install_nginx.sh
RUN bash /install_nginx.sh && \
    chown -R nginx:nginx /opt/venv && \
    mkdir -p /home/nginx/smaht-portal && \
    mv aws-ip-ranges.json /home/nginx/smaht-portal/aws-ip-ranges.json && \
    apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Link, verify installations
ENV PATH="/home/nginx/.nvm/versions/node/v${NODE_VERSION}/bin/:${PATH}"

# Build application
WORKDIR /home/nginx/smaht-portal

# Front-end dependency install first (most cache-intensive, changes less than app code)
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-progress --no-optional --no-audit --python=/opt/venv/bin/python && \
    npm cache clean --force

# Copy over the rest of the code
COPY . .

# Build back-end
RUN poetry install --only main -vvv && \
    python setup_eb.py develop && \
    make fix-dist-info

# Build front-end, remove node_modules when done
ENV NODE_ENV=production
RUN npm run build && \
    npm run build-scss && \
    rm -rf node_modules/

# Configure nginx (remove defaults, copy config)
RUN rm /etc/nginx/nginx.conf && \
    rm /etc/nginx/conf.d/default.conf
COPY deploy/docker/production/nginx.conf /etc/nginx/nginx.conf

# nginx filesystem setup
RUN chown -R nginx:nginx \
        /var/cache/nginx \
        /var/log/nginx \
        /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown nginx:nginx /var/run/nginx.pid && \
    rm -f /var/log/nginx/* && \
    touch /var/log/nginx/access.log /var/log/nginx/error.log && \
    chown nginx:nginx /var/log/nginx/access.log /var/log/nginx/error.log && \
    mkdir -p /data/nginx/cache && \
    chown -R nginx:nginx /data/nginx/cache

# Local dev config files
COPY deploy/docker/local/docker_development.ini development.ini
COPY deploy/docker/local/entrypoint.sh entrypoint_local.sh
COPY deploy/docker/local/gitinfo.json .
RUN chown nginx:nginx development.ini && \
    chmod +x entrypoint_local.sh

# Production setup
RUN chown nginx:nginx poetry.toml && \
    touch production.ini session-secret.b64 supervisord.log supervisord.sock supervisord.pid && \
    chown nginx:nginx production.ini session-secret.b64 supervisord.log supervisord.sock supervisord.pid

COPY deploy/docker/production/$INI_BASE deploy/ini_files/.
COPY deploy/docker/production/entrypoint.sh \
     deploy/docker/production/entrypoint_portal.sh \
     deploy/docker/production/entrypoint_deployment.sh \
     deploy/docker/production/entrypoint_indexer.sh \
     deploy/docker/production/entrypoint_ingester.sh \
     deploy/docker/production/supervisord.conf \
     deploy/docker/production/assume_identity.py \
     ./
RUN chmod +x \
    entrypoint.sh \
    entrypoint_portal.sh \
    entrypoint_deployment.sh \
    entrypoint_indexer.sh \
    entrypoint_ingester.sh \
    assume_identity.py

# Grab restricted domain list
RUN curl https://gist.githubusercontent.com/ammarshah/f5c2624d767f91a7cbdc4e54db8dd0bf/raw > restricted_domains.txt

EXPOSE 8000

# Container does not run as root
USER nginx

ENTRYPOINT ["/home/nginx/smaht-portal/entrypoint.sh"]
