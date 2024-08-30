#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export AWS_PROFILE=$(hms-config smaht-portal/wolf/AWS_PROFILE)
export IDENTITY=$(hms-config smaht-portal/wolf/IDENTITY)

update-portal-object --ini $DIR/../development.ini --load $DIR/files --verbose
