======================================================
Downloading Data from SMaHT Manifest files with awscli
======================================================


In addition to direct processing of file downloads via ``curl`` in the manifest file, DAC also supports downloads through the ``awscli``. In some situations, you may get better bandwidth using the ``awscli`` over ``curl`` or equivalent. We recommend testing both to see which ends up better.

The ``download_cli`` API will return short term AWS credentials for direct access to DAC buckets to facilitate data transfers over ``awscli``. When downloading the manifest file, you may specify you want download URLs in this format. The standard command provided with the manifest will not work though, you must use a different command. Note that this command assumes you have previously installed ``awscli``. It will work with both version 1 and 2 of ``awscli``. It also uses ``jq`` to process the JSON response. See the `Installing AWS CLI <https://github.com/smaht-dac/smaht-portal/blob/minor-doc-updates-20240711/docs/source/download_cli.rst#installing-aws-cli>`_ section below for more information.

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

Installing AWS CLI
^^^^^^^^^^^^^^^^^^

It is likely that the aws command-line tool is already installed on your system, but if not here are some brief instructions for how to do this.
For more information see: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html

Linux
-----

.. code-block:: bash

    curl https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip -o awscliv2.zip
    unzip awscliv2.zip
    sudo ./aws/install
    # The 'aws' command should now be ready for use.

For more information see: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html

MacOS
-----

If you are using `Homebrew <https://brew.sh/>`_ simply run:

.. code-block:: bash

    brew install awscli

For more information see: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
