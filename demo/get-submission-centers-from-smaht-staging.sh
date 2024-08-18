#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TYPE=submission-centers
COUNT=1000
ARGS=
OUTPUT=$DIR/files
view-portal-object --env smaht-staging "/${TYPE}?limit=${COUNT}${ARGS}" --insert-files --verbose --force --output ${OUTPUT} $*
