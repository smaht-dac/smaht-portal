#!/bin/bash
# NOTE: entrypoint.sh dispatches with `exec sh entrypoint_deployment.sh`, so this
# runs under /bin/sh (dash on the Debian base) and the shebang above is NOT what
# executes it. Keep everything in this file POSIX sh - no bashisms - and lint with
# `shellcheck -s sh`.

set -e

echo "Running a SMAHT deployment on the given environment"

# ---------------------------------------------------------------------------
# Optional Splunk Cloud HEC connectivity diagnostic.
#
# Runs FIRST so the captain sees the network verdict immediately, even if a later
# deployment step fails, and because it needs nothing from production.ini - only
# the ECS task role, which is already available.
#
# OPT-IN: does nothing at all unless SPLUNK_HEC_CONNECTIVITY_TEST=true. On the
# success path it sends exactly ONE synthetic event, so ordinary deployments must
# not (and do not) trigger it.
#
# NON-FATAL BY DESIGN: this is a diagnostic, not a gate. `set -e` is active, so
# the call is wrapped in an `if` (exempt from -e) and the exit status is only
# reported - a failed probe must never abort a production deployment. That is
# deliberately the OPPOSITE of setup_nginx_tls.sh, which fails closed because
# serving plaintext when TLS was requested is a security regression; failing to
# reach a test HEC endpoint is not.
#
# The script logs only timestamped, bounded, sanitized lines; the HEC token is
# fetched from Secrets Manager at runtime and is never logged, never placed on a
# command line, and never exported into this shell. See the module docstring in
# deploy/docker/production/hec_connectivity_check.py for the env contract.
# ---------------------------------------------------------------------------
if poetry run python -m hec_connectivity_check; then
  echo "HEC connectivity check finished (exit 0); see the [hec-check] RESULT line above"
else
  echo "HEC connectivity check reported exit $? (non-fatal); see the [hec-check] RESULT line above"
fi

# Run assume_identity.py to access the desired deployment configuration from
# secrets manager - this builds production.ini
poetry run python -m assume_identity

poetry run delete-revision-history production.ini --app-name app --prod

# Clear db/es on smaht-devtest eventually if we run an "initial" deploy
# Do nothing on other environments
# TEMP: add --allow-prod
if [ -n "${INITIAL_DEPLOYMENT}" ]; then
  poetry run clear-db-es-contents production.ini --app-name app --only-if-env smaht-nothing --allow-prod
fi

# Create mapping
# Force wipe of ES
# create-mapping-on-deploy-verbose delegates argument parsing, mapping
# comparison, index deletion/recreation, reindex selection, and queueing
# unchanged to create-mapping-on-deploy; it only raises this command's own
# decision-narration loggers to INFO first, since create-mapping-on-deploy's
# own set_logging() call never reaches them (see the module docstring in
# encoded/commands/create_mapping_on_deploy_verbose.py).
poetry run create-mapping-on-deploy-verbose production.ini --app-name app --selective-reindex

# Load Data (based on development.ini, for now just master-inserts)
# Not necessary after first deploy
if [ -n "${INITIAL_DEPLOYMENT}" ]; then
    poetry run load-data production.ini --app-name app --prod
else
    # Patch higlass_view_config items on every deploy from the master-inserts directory as they have to be in sync with the code
    poetry run load-data-by-type production.ini --app-name app --prod --overwrite --indir master-inserts --itype higlass_view_config
    # Added load of the following item types on 2023-10-20 for testing on staging - Bianca
    # Reordering these to respect data relations - Will
    # Removing --overwrite from the user load to avoid needless indexing - Will
    poetry run load-data-by-type production.ini --app-name app --prod --indir master-inserts --itype user
    poetry run load-data-by-type production.ini --app-name app --prod --overwrite --indir master-inserts --itype static_section
    poetry run load-data-by-type production.ini --app-name app --prod --overwrite --indir master-inserts --itype page

fi

# Load access keys
# Note that the secret name must match that which was created for this environment
poetry run load-access-keys production.ini --app-name app --secret-name "$IDENTITY"

exit 0
