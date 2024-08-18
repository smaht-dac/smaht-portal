#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TYPE=users
COUNT=1000
ARGS="&status=current&status=deleted&status=inactive&status=revoke"
OUTPUT=$DIR/files
view-portal-object --env smaht-staging "/${TYPE}?limit=${COUNT}${ARGS}" --insert-files --verbose --force --output ${OUTPUT} $*
