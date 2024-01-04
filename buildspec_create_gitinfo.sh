#!/bin/bash
echo "{\"repo\": \"$CODEBUILD_SOURCE_REPO_URL\", \"branch\": \"$CODEBUILD_SOURCE_VERSION\", \"commit\": \"$CODEBUILD_RESOLVED_SOURCE_VERSION\"}" > deploy/docker/local/gitinfo.json
