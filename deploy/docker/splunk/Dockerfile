# syntax=docker/dockerfile:1.7
# SMaHT-Portal Splunk Universal Forwarder ECS sidecar image.
#
# This is a SEPARATE image from the application container. It runs as its own
# ECS sidecar (mirroring the CrowdStrike Falcon sensor sidecar) and ships the
# app/web logs written by the application container to a shared volume. The
# application image no longer bundles or runs the forwarder.
#
# Build context is this directory:
#   docker build -f deploy/docker/splunk/Dockerfile deploy/docker/splunk
# The ECS task definition wires the shared log volume, secrets, dependsOn, and
# log driver (see README.md, "ECS task-definition handoff") - none of which is
# owned by this repository.

# Same hardened Debian base as the application image (Debian userland is required
# for the Splunk .deb). Pin by digest for reproducible builds. It can be
# overridden with a public Debian base for local/offline builds:
#   docker build --build-arg BASE_IMAGE=debian:bookworm-slim ...
ARG BASE_IMAGE=dhi.io/python:3.11-debian-sfw-dev

# ---------------------------------------------------------------------------
# Builder stage: download + extract the forwarder tree. curl/dpkg live here only;
# they are NOT carried into the runtime image.
# ---------------------------------------------------------------------------
FROM ${BASE_IMAGE} AS builder

ENV DEBIAN_FRONTEND=noninteractive

# Retry + no pipelining: deb.debian.org via Fastly intermittently resets
# pipelined connections; matches the application Dockerfile.
RUN echo 'Acquire::Retries "5";' > /etc/apt/apt.conf.d/80-retries && \
    echo 'Acquire::http::Pipeline-Depth "0";' >> /etc/apt/apt.conf.d/80-retries

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

# Pin the forwarder version/build (matches the app image's prior pin) AND verify the
# download's SHA-256 before extraction (N3): a version/build tag alone does not
# guarantee integrity. The default hash was verified by independently downloading this
# exact artifact from download.splunk.com (Splunk's authoritative CDN). Before bumping
# the version, re-verify the new hash from Splunk's published checksums and update
# SPLUNK_UF_SHA256 -- a mismatch fails the build.
#
# `dpkg -x` unpacks the filesystem tree (to /opt/splunkforwarder) WITHOUT running any
# maintainer scripts, so no users/dirs are created in the builder - the runtime stage
# owns user creation and ownership. (The deb's postinst normally writes
# etc/splunk-launch.conf / etc/packagetype; the forwarder regenerates a usable
# splunk-launch.conf on first `splunk` invocation, which the sidecar tests exercise.)
ARG SPLUNK_UF_VERSION=9.4.12
ARG SPLUNK_UF_BUILD=9dfc486f3d48
ARG SPLUNK_UF_SHA256=92559ff78ddbb99c3ff278a7f8ecc7c4c07e1c5def0d7232e50c6df2303c4e6e
RUN curl -fsSL -o /tmp/splunkforwarder.deb \
      "https://download.splunk.com/products/universalforwarder/releases/${SPLUNK_UF_VERSION}/linux/splunkforwarder-${SPLUNK_UF_VERSION}-${SPLUNK_UF_BUILD}-linux-amd64.deb" && \
    echo "${SPLUNK_UF_SHA256}  /tmp/splunkforwarder.deb" | sha256sum -c - && \
    dpkg -x /tmp/splunkforwarder.deb / && \
    rm -f /tmp/splunkforwarder.deb

# ---------------------------------------------------------------------------
# Runtime stage: the forwarder tree + our static config + the entrypoint, run by
# a dedicated non-root user. No curl, no dpkg, no apt metadata.
# ---------------------------------------------------------------------------
FROM ${BASE_IMAGE} AS runtime

ENV DEBIAN_FRONTEND=noninteractive \
    SPLUNK_HOME=/opt/splunkforwarder

# Dedicated non-root forwarder user (HMS doc: do NOT run the forwarder as root).
# The hardened base strips the user-management tooling (like the app image), so
# install `passwd` (provides groupadd/useradd) first, create the user, then drop
# the apt metadata. ca-certificates is kept for TLS trust to the deployment server.
RUN echo 'Acquire::Retries "5";' > /etc/apt/apt.conf.d/80-retries && \
    echo 'Acquire::http::Pipeline-Depth "0";' >> /etc/apt/apt.conf.d/80-retries && \
    apt-get update && \
    apt-get install -y --no-install-recommends passwd ca-certificates && \
    /usr/sbin/groupadd --system --gid 4321 splunkfwd && \
    /usr/sbin/useradd --system --gid splunkfwd --no-create-home \
      --home-dir "$SPLUNK_HOME" --shell /usr/sbin/nologin --uid 4321 splunkfwd && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Forwarder tree from the builder, owned by the forwarder user. The tree resets
# to this baked-in (un-licensed, FTR) state on every boot because there is no
# persistent Splunk volume - the entrypoint accepts the license per boot.
COPY --chown=splunkfwd:splunkfwd --from=builder /opt/splunkforwarder /opt/splunkforwarder

# Static forwarder config: deploy-poll target + shared-volume file inputs. The
# deployment server pushes the outputs/index config after the forwarder phones
# home, so we do not define outputs.conf locally.
COPY --chown=splunkfwd:splunkfwd deploymentclient.conf /opt/splunkforwarder/etc/system/local/deploymentclient.conf
COPY --chown=splunkfwd:splunkfwd inputs.conf /opt/splunkforwarder/etc/system/local/inputs.conf
COPY --chown=splunkfwd:splunkfwd entrypoint.sh /opt/splunkforwarder/entrypoint.sh

RUN chmod +x /opt/splunkforwarder/entrypoint.sh

# Shared log volume mount target. The app container writes here; ECS mounts the
# same volume into this sidecar. Pre-create it owned by the forwarder user so the
# mount + monitors work immediately. (ECS bind mounts may override ownership;
# the monitors only read.)
RUN mkdir -p /var/log/smaht && chown splunkfwd:splunkfwd /var/log/smaht

USER splunkfwd

ENTRYPOINT ["/opt/splunkforwarder/entrypoint.sh"]
