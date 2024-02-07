==========================
Uploading Referenced Files
==========================


As mentioned in the `Getting Started with Submissions </docs/user-guide/getting-started>`_ section, after ``submit-metadata-bundle`` processes the main submission file, it will (after prompting) upload files referenced within the submission file. These files should reside
in the same directory as the submission file.
Or, if they do not, then yo must specify the directory where these files can be found, like this::

   submit-metadata-bundle your_metadata_file.xlsx --env <environment-name> --directory <path-to-files>

The above commands will only look for the files to upload only directly within the specified directory
(and not any sub-directories therein). To look within subdirectories, do::

   submit-metadata-bundle your_metadata_file.xlsx --env <environment-name> --directory <path-to-files> --subdirectories

|

Resuming Uploads
----------------
When using ``submit-metadata-bundle`` you can choose `not` to upload any referenced files when prompted.
In this case, you will probably want to manually upload them subsequently;
you can do this using the ``resume-uploads`` command.

You can resume execution with the upload part by doing::

   resume-uploads --env <environment-name> <uuid>

where the ``uuid`` argument is the UUID for the submission which should have been displayed in the output of the ``submit-metadata-bundle`` command.

You can upload individual files referenced in the original submission separately by doing::

   resume-uploads --env <environment-name> <referenced-file-uuid-or-accesssion-id> --uuid <item-uuid>

where the ``<referenced-file-uuid-or-accesssion-id>`` is the uuid (or the accession ID or accession based file name) of the 
individual file referenced (`not` the submission or metadata bundle UUID) which you wish to upload;
this uuid (or accession ID or accession based file name) is included in the output of ``submit-metadata-bundle``. 

For both of these commands above, you will be asked to confirm if you would like to continue with the stated action.
If you would like to skip these prompts so the commands can be run by a
scheduler or in the background, you can pass the ``--no_query`` or ``-nq`` argument, such as::

    submit-metadata-bundle your_metadata_file.xlsx --no_query

|

Other File Upload Considerations
--------------------------------

Since ``smaht-submitr`` will only upload files found on the local computer running the package,
if your files are not stored locally and are instead in cloud storage or a local cluster,
you need to consider other options for uploading such files.


**Loading Files Locally**

This option works well for uploading a small number
of files or files of small size. Files can be
transferred to your local computer from cloud storage
or a computing cluster in several ways. For example,
if your files are stored on AWS S3, tools such as
<a href="https://github.com/s3fs-fuse/s3fs-fuse">s3fs</a>
or <a href="https://github.com/kahing/goofys">goofys</a>
facilitate mounting of S3 buckets as local file
systems that can be readily accessed by submitr.
Similar tools exist for Google Cloud Storage and
Azure Storage.

Alternatively, the files can be directly downloaded
from the remote location, for example using the
AWS CLI for files on AWS S3.

However, the methods above require enough free disk space
on your local computer to store the files to upload.
As such files can be rather large, we recommend performing
the upload from a cloud/cluster instance
for uploading many files or larger files.


**Running smaht-submitr Remotely**

File submission can easily be scripted to accommodate
running on a remote instance. Once an instance has
been launched with appropriate storage requirements
for the files to upload, the files can either be
mounted or downloaded as before, submitr can be
installed, and the remainder of the upload process
can continue as on your local computer. Note that
your submitr keys (located at <code>~/.smaht-keys.json</code>)
will also have to be uploaded to the instance for
successful file upload to the DAC.

For example, if using an AWS EC2 instance running
Amazon Linux 2 with
files in AWS S3 and an appropriate IAM role,
executing the script below (named upload_files.sh)
with the command::

    BUCKETS=<S3 buckets to mount>
    SUBMISSION_UUIDS=<Ingestion submission UUID(s) for the submitted file(s)>
    bash upload_files.sh

will mount the indicated bucket(s) and upload the
appropriate files to the DAC if found within the buckets::

	#!/bin/bash

	# Install s3fs-fuse for mounting S3 buckets
	sudo amazon-linux-extras install epel -y
	sudo yum install s3fs-fuse -y

	# Mount buckets to ~/upload_files directory
	mkdir upload_files
	for BUCKET in $BUCKETS
	do
		s3fs $BUCKET ~/upload_files/ -o iam_role
	done

	# Create virtual env for package installation
	python3 -m venv ~/smaht_submission
	source ~/smaht_submission/bin/activate

	# Run submitr with mounted files
	pip install submitr
	for UUID in $SUBMISSION_UUIDS
	do
		resume-uploads $UUID -u ~/upload_files/ -nq -sf
	done

For further support or questions regarding file
submission, please contact the SMaHT DAC team at
<a href="mailto:smhelp@hms-dbmi.atlassian.net">smhelp@hms-dbmi.atlassian.net</a>.
