#!/bin/bash

set -e

echo "Running a SMAHT deployment on the given environment"

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
# TEMPORARY, branch-specific override (cfm-publication_updates only - do not
# merge to main as the permanent default): --wipe-es forces WIPE_ES=True,
# which makes create_mapping.run() set check_first=False, so every deploy
# from this branch does a complete, unconditional ES reindex regardless of
# mapping comparisons, changed item types, or INITIAL_DEPLOYMENT. This does
# not touch clear-db-es-contents/--only-if-env/--allow-prod above, which only
# affects the Postgres DB and is unrelated to this ES-only reindex.
poetry run create-mapping-on-deploy-verbose production.ini --app-name app --wipe-es

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
