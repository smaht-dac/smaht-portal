#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p $DIR/files
$DIR/get-assays-from-smaht-staging.sh $*
$DIR/get-file-formats-from-smaht-staging.sh --noheader $*
$DIR/get-software-from-smaht-staging.sh --noheader $*
$DIR/get-quality-metrics-from-smaht-staging.sh --noheader $*
$DIR/get-sequencers-from-smaht-staging.sh --noheader $*
$DIR/get-sequencing-from-smaht-staging.sh --noheader $*
$DIR/get-submission-centers-from-smaht-staging.sh --noheader $*
$DIR/get-users-from-smaht-staging.sh --noheader $*
