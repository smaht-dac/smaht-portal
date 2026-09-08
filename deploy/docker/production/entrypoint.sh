#!/bin/sh


# Global SMAHT Application Entrypoint
# This script resolves which application type is desired based on
# the "$application_type" environment variable. Possible options are:
#  * "deployment" to run the deployment
#  * "ingester" to run the production ingester (forever)
#  * "indexer" to run the production indexer (forever)
#  * "portal" to run the production portal worker (API back-end)
#  * "local" to run a local deployment

# Note that only "local" can be run from the local machine
# but the same image build is run across the entire local/production stack.

deployment="deployment"
ingester="ingester"
indexer="indexer"
portal="portal"
local="local"

echo "Generating session randomness"
cat /dev/urandom | head -c 256 | base64 >> session-secret.b64

echo "Resolving which entrypoint is desired"

# Dispatch with `exec` so the selected role script REPLACES this shell as PID 1
# (B5). That gives the role's final process (e.g. supervisord) proper container
# signal delivery, and means no long-lived parent shell lingers holding the
# original ECS-injected environment (which includes the TLS secret) for other
# same-uid processes to read.
# shellcheck disable=SC2154
if [ "$application_type" = $deployment ]; then
  exec sh entrypoint_deployment.sh
elif [ "$application_type" = $ingester ]; then
  exec sh entrypoint_ingester.sh
elif [ "$application_type" = $indexer ]; then
  exec sh entrypoint_indexer.sh
elif [ "$application_type" = $portal ]; then
  exec sh entrypoint_portal.sh
elif [ "$application_type" = $local ]; then
  exec sh entrypoint_local.sh
else
  echo "Could not resolve entrypoint! Check that \$application_type is set."
  exit 1
fi

