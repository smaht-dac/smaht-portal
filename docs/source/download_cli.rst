======================================================
Downloading Data from SMaHT Manifest files with awscli
======================================================


In addition to direct processing of file downloads via ``curl`` in the manifest file, DAC also supports downloads through the ``awscli``. In some situations, you may get better bandwidth using the ``awscli`` over ``curl`` or equivalent. We recommend testing both to see which ends up better.

The ``download_cli`` API will return short term AWS credentials for direct access to DAC buckets to facilitate data transfers over ``awscli``. When downloading the manifest file, you may specify you want download URLs in this format. The standard command provided with the manifest will not work though, you must use a different command. Note that this command assumes you have previously installed ``awscli``. It will work with both version 1 and 2 of ``awscli``. It also uses ``jq`` to process the JSON response.

.. code-block:: bash

    cut -f 1,3 ./smaht_manifest.tsv |
    tail -n +4 |
    grep -v ^# |
    xargs -n 2 -L 1 sh -c '
    credentials=$(curl -s -L --user <id>>:<secret> "$0" | jq -r ".download_credentials | {AccessKeyId, SecretAccessKey, SessionToken, download_url}") &&
    export AWS_ACCESS_KEY_ID=$(echo $credentials | jq -r ".AccessKeyId") &&
    export AWS_SECRET_ACCESS_KEY=$(echo $credentials | jq -r ".SecretAccessKey") &&
    export AWS_SESSION_TOKEN=$(echo $credentials | jq -r ".SessionToken") &&
    download_url=$(echo $credentials | jq -r ".download_url") &&
    aws s3 cp "$download_url" "$1"''

