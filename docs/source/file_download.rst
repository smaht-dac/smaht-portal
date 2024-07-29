=================================
File Download on the Data Portal
=================================

Before You Can Download
^^^^^^^^^^^^^^^^^^^^^^^
You need to be able to log into the portal to access the data. To obtain portal access, you need to:

1. Become a verified member of the SMaHT Network. Contact `OC <mailto:smahtsupport@gowustl.onmicrosoft.com>`_ for more information about verification.

**AND**

2. Get added to the portal user base at DAC. Contact `DAC <mailto:smhelp@hms-dbmi.atlassian.net>`_ to obtain portal access.

.. TIP::
   To run the download command and gain access to SMaHT data, all users need to **create a secret access key** on the portal.
   
   If you have not yet created an access key, please see the `Credentials </docs/user-guide/credentials>`_ page for detailed instruction.

|

Instructions to Download
^^^^^^^^^^^^^^^^^^^^^^^^
1. Once you are logged in, navigate to the benchmarking data table through the homepage

|

.. image:: /static/img/docs/homepage_benchmarking_link.png
   :target: /static/img/docs/homepage_benchmarking_link.png
   :alt: Homepage Benchmarking Link

|

OR through the navigation bar:

|

.. image:: /static/img/docs/navigation_benchmarking_link.png
   :target: /static/img/docs/navigation_benchmarking_link.png
   :alt: Navigation Benchmarking Link

|

2. You can select any files you wish from each data table in the portal. In this example, we used the facets on the left to search for and select 12 BAM files to download from the COLO829BLT50 table. To download, click the blue download button.

**Please note that the indexed BAM file (.bai) associated with the selected BAM file will be automatically included for download.**

|

.. image:: /static/img/docs/benchmarking_bam_selection.png
   :target: /static/img/docs/benchmarking_bam_selection.png
   :alt: Benchmarking BAM File Selection

|

3. Selecting the download button will open this popup with a summary of your selected data and instructions to open and download the manifest file. Select the Download Manifest Button to create a manifest file.

|

.. image:: /static/img/docs/download_modal_example.png
   :target: /static/img/docs/download_modal_example.png
   :alt: Download Modal Example

|


Interpreting the Manifest
^^^^^^^^^^^^^^^^^^^^^^^^^

The ``Manifest`` file contains **important metadata such as file group information** for BAM files that can be merged to create high-coverage BAMs (i.e. can be merged if ``FileFormat`` is ``bam`` and ``FileGroup`` values are identical). More detailed information about the Manifest tsv file can be found on the `Interpreting Manifest Files </docs/user-guide/manifest>`_ page on the data portal.

|

.. image:: /static/img/docs/manisfest_tsv_example.png
   :target: /static/img/docs/manisfest_tsv_example.png
   :alt: Manifest TSV Example

|


Downloading Files with the AWS CLI
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

The AWS CLI is a command-line (CLI) utility (from Amazon) used for a variety of AWS (Amazon Web Services) related tasks (the command name is ``aws``). In particular it can be use to download files from AWS S3 storage. And it can do so with greater efficiency (speed) than a standard tool like ``curl``.

So in addition to direct processing of file downloads via ``curl`` in the manifest file, DAC also supports downloads through the ``awscli``. In some situations, you may get better bandwidth using the ``awscli`` over ``curl`` or equivalent. We recommend testing both to see which ends up better.

The ``download_cli`` API will return short term AWS credentials for direct access to DAC buckets to facilitate data transfers over ``awscli``. When downloading the manifest file, you may specify you want download URLs in this format. The standard command provided with the manifest will not work though, you must use a different command. Note that this command assumes you have previously installed ``awscli``. It will work with both version 1 and 2 of ``awscli``. It also uses ``jq`` to process the JSON response. See the `Installing AWS CLI </docs/access/how-to-download-files#installing-aws-cli>`_ section below for more information::

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

It is likely that the ``aws`` command-line tool is already installed on your system, but if not here are some brief instructions for how to do this.
For more information see: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html

Linux
-----

To install the AWS CLI on Linux run from the command-line::

    curl https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip -o awscliv2.zip
    unzip awscliv2.zip
    sudo ./aws/install
    aws --version

If the ``unzip`` command happens to not be installed then for Debian/Ubuntu flavors of Linux you'll first need to run from the command-line::

    sudo apt install -y unzip

If the ``unzip`` command happens to not be installed then for RedHat/CentoS flavors of Linux you'll first need to run from the command-line::

    sudo yum install -y unzip

MacOS
-----

If you are using the ``brew`` command (i.e. `Homebrew <https://brew.sh/>`_) simply run from the command-line::

    brew install awscli
    aws --version

If you are not using ``brew`` run this from the command-line::

    curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
    sudo installer -pkg AWSCLIV2.pkg -target /
    aws --version
