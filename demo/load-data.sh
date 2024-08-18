#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

update-portal-object --ini $DIR/../development.ini --load $DIR/files --verbose
