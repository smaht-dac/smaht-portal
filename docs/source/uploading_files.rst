===============
Uploading Files
===============

.. TIP::
   This assumes you have already installed ``smaht-submitr``. If you have not yet, please see the `Installation </docs/user-guide/getting-started#installing-the-submission-tool>`_ section.

|

As mentioned in the `Getting Started with Submissions </docs/user-guide/getting-started>`_ section, after ``submit-metadata-bundle`` processes the main submitted metadata file, it will (after prompting) upload any files referenced within the submission metadata file.

These files should reside in the same directory as your submission file. Or, if they do not, then you must specify the directory where these files can be found, like this::

   submit-metadata-bundle your_metadata_file.xlsx --env <environment-name> --directory <path-to-files>

The above commands will only look for the files to upload directly within the specified directory
and in any sub-directories therein. To look `only` within the specified directorye use the analogous ``--directory-only`` option.


Resuming Uploads
^^^^^^^^^^^^^^^^
When using ``submit-metadata-bundle`` you can choose `not` to upload any referenced files when prompted. In this case, you will probably want to manually upload them subsequently; or you may want to `update` a previously uploaded file. You can do this using the ``resume-uploads`` command.

You can resume execution with the upload part by doing::

   resume-uploads --env <environment-name> <uuid>

where the ``<uuid>`` argument is the UUID (e.g. ``0ad28518-2755-40b5-af51-036042dd099d``) for the submission which should have been displayed in the output of the ``submit-metadata-bundle`` command; this will upload `all` of the files references for the given submission UUID.

Or, you can upload `individual` files referenced in the original submission separately by doing::

   resume-uploads --env <environment-name> <referenced-file-uuid> --uuid <item-uuid>

where the ``<referenced-file-uuid>`` argument is the UUID for the individual file referenced (e.g. ``b5a7999e-d614-4deb-b98d-b784925ab910``), `or` the accession ID (e.g. ``SMAURL8WB1ZS``) or accession ID based file name (e.g. ``SMAURL8WB1ZS.fastq``) of the referenced file. This UUID, and accession ID and accession ID based file name, is included in the output of ``submit-metadata-bundle``; specifically in the **Upload Info** section of that output.

For both of these commands above, you will be asked to confirm if you would like to continue with the stated action. If you would like to skip these prompts so the commands can be run by a scheduler or in the background, you can pass the ``--no_query`` or ``-nq`` argument, such as::

    submit-metadata-bundle your_metadata_file.xlsx --no_query


Other File Upload Considerations
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Since ``smaht-submitr`` will only upload files found on the local computer running the package, if your files are not stored locally and are instead in Cloud storage or a local cluster, you need to consider other options for uploading such files.


Upoading Files Locally
~~~~~~~~~~~~~~~~~~~~~~

This option works well for uploading a small number of files or files of small size. Files can be transferred to your local computer from Cloud storage or a computing cluster in several ways.

Alternatively, the files can be directly downloaded from a remote location, for example from AWS S3, using the AWS command-line tool (``awscli``) for files on AWS S3.

However, note that the methods above require enough free disk space on your local computer to store the files to upload. As such files can be rather large, we recommend performing the upload from a Cloud or cluster instance for uploading many files or larger files.

Mounting AWS S3 Files 
~~~~~~~~~~~~~~~~~~~~~
If your files are stored on `AWS S3 <https://en.wikipedia.org/wiki/Amazon_S3>`_, tools such as `s3fs <https://github.com/s3fs-fuse/s3fs-fuse>`_ or `goofys <https://github.com/kahing/goofys>`_ facilitate mounting of S3 buckets as local file systems that can be readily accessed by ``smaht-submitr``. Similar tools exist for `Google Cloud Storage <https://en.wikipedia.org/wiki/Google_Cloud_Storage>`_ and `Microsoft Azure <https://en.wikipedia.org/wiki/Microsoft_Azure>`_.

Uploading Files from Google Cloud Storage
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
If your data files reside in Google Cloud Storage (GCS), we support the ability to upload,
or more precisely, `transfer` files directly from GCS to AWS S3. The smaht-submitr command-line
tools (``submit-metadata-bundle`` and ``resume-uploads``) accomplish this by leveraging
third-party open source software called `rclone <https://rclone.org>`_.

.. TIP::
   You needn't worry about the details of rclone - its installation, usage, and whatnot - the ``smaht-submitr`` tools automatically installs and hides the details of its workings from you.

|

The advantage of this is that you do not need to download the entire data file to your local machine, which may well not have enough disk space. The rclone facility transfers the data file from GCS to AWS S3 by way of your machine, i.e. by using it as an intermediary, so that only a small portion of the data ever actually travels through your machine at a time.

To take advantage of this you merely need to specificy a couple of command-line options, specifially ``--rclone-google-source`` and ``--rclone-google-credentials``, for example::

    submit-metadata-bundle your-metadata.xlsx --submit \
        --rclone-google-source your-gcs-bucket-or-bucket-and-folder \
        --rclone-google-credentials your-gcp-service-account-file

The ``resume-uploads`` command support these same options. The value specified for the ``--rclone-google-source`` may be either just a GCS bucket name or
a bucket name and a sub-folder name within that buckup, e.g. ``your-gcs-bucket/your-gcs-sub-folder``.

To obtain the credentials file you need, via the Google Cloud console (in your browser), navigate to the ``IAM & Admin`` section, select ``Service Accounts``, click on your desired listed service account, and from there click the ``KEYS`` tab at the top, and then the ``ADD KEY`` and ``Create new key`` from the dropdown, and select ``JSON`` for the ``Key type``. This will save the JSON file with your exported credentials to your download folder; and this is the file to specify with the ``--rclone-google-credentials`` option. (Note that for security, you should `chmod 600`` on this file).

.. TIP::
    If you happen to be running smaht-submitr on a Google Compute Engine (GCE) instance there is no need to specify the ``--rclone-google-credentials`` option as the credentials for the associated Google Cloud account are automatically and implicitly available and in force.

|


Running Submission Remotely
~~~~~~~~~~~~~~~~~~~~~~~~~~~

File submission can be scripted to accommodate running on a another remote server from your own. Once an instance has been launched with appropriate storage requirements for the files to upload, the files can either be mounted or downloaded as before, ``smaht-submitr`` can be installed, and the remainder of the upload process can continue as on your local computer.

Note that your ``smaht-submitr`` keys (residing by default in ``~/.smaht-keys.json``) will also have to be copied to this server for successful file upload.

For example, if using an AWS EC2 instance running Amazon Linux 2 with files in AWS S3 and an appropriate IAM role and associated access/secret keys, executing the below will mount the indicated bucket(s) and upload the appropriate files to the DAC if found within the buckets::

    # Install s3fs for mounting S3 buckets locally.
    sudo amazon-linux-extras install epel -y
    sudo yum install s3fs-fuse -y

    # Setup your AWS credentials.
    echo 'your-aws-access-key-id:your-aws-secret-access-key' > ~/.passwd-s3fs
    chmod 600 ~/.passwd-s3fs

    # Setup your SMaHT credentials.
    echo '{"data": {"key": "your-smaht-access-key-id", "secret": "your-smaht-secret-key", "server": "https://data.smaht.org"}}' > ~/.smaht-keys.json
    chmod 600 ~/.smaht-keys.json

    # Mount buckets on your local /path-to-your-mount-directory directory.
    mkdir /path-to-your-mount-directory
    s3fs your-s3-bucket-name /path-to-your-mount-directory -o passwd_file=~/.passwd-s3fs

    # Run smaht-submitr with mounted files (assuming you have python and pip installed).
    pip install smaht-submitr
    resume-uploads your-upload-file-uuid --directory /path-to-your-mount-directory --sub-directories -nq 

For further support or questions regarding file submission, please contact the SMaHT DAC Team at `smhelp@hms-dbmi.atlassian.net <mailto:smhelp@hms-dbmi.atlassian.net>`_
