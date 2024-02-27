=============================
Credentials for smaht-submitr
=============================

If you have been designated as a submitter for the project,
and plan to use spreadsheet-based submission system (``smaht-submitr``)
to view, upload, create, or update data from/to the SMaHT data portal,
you are required to obtain and setup an access and secret key from the SMaHT data portal.
These must stored in a specific format and file on your local system.
Please follow these steps below to get your access keys and configure your local system for ``smath-submitr`` usage.

|

**Obtaining SMaHT Data Portal Access Keys**

#. Log in to the SMaHT `website <https://data.smaht.org>`_ with your username (email) and password. If you have not yet created an account, see `this page </docs/user-guide/account-creation>`_ for instructions.
#. Once logged in, go to your **Profile** page by clicking **Account** on the upper right corner of the page.
#. On your profile page, click the green **Add Access Key** button, and copy the **Access Key ID** and **Secret Access Key** values from the popup page. Note that *once the pop-up page disappears you will not be able to see the secret access key value*. However, if you forget/lose your secret key you can always delete and add new access keys from your profile page at any time.
#. Store these values the file ``~/.smaht-keys.json`` on your local machine; see the next section for details.

|

**Storing SMaHT Data Portal Access Keys**

Once you've obtained access and secret keys (per the previous) section, they should be stored in a file on your local machine called ``~/.smaht-keys.json``. (Note that the ``~`` there refers to your local home directory). The format of this file should look like this::

   {
       "data": {
           "key": "<your-access-key-id>",
           "secret": "<your-secret-access-key>",
           "server": "https://data.smaht.org"
       }
   }

To create or modify and edit this file, use a text editor of your choice (``vim`` or ``TextEdit`` or whatever).
For example, using ``TextEdit``, from a MacOS Terminal window, like this::

    $ open -a TextEdit ~/.smaht-keys.json

The environment name, e.g. ``data`` in the above example, is of your own choosing; this name will be used
as the ``--env`` argument to the various `smaht-submitr` commands, e.g. ``submit-metadata-bundle`` and ``resume-uploads``.
Though if you only have one environment defined in this file (as above) then this (``--env`` argument) will not be necessary.

N.B. If you are not sure what ``server`` you should be submitting to, reach out to your contact on the SMaHT DAC Team.

**Securing SMaHT Data Portal Access Keys**

For extra security, this file should **not** be readable by others; only yourself.
Set its permissions accordingly by using ``chmod 600``,
which sets the file to be readable and writable only by yourself,
and gives no one else (but the system superuser) any permissions at all::

   $ ls -l ~/.smaht-keys.json
   -rw-r--r--  1 youruser  staff  137 Jan 31 08:55 /Users/your_username/.smaht-keys.json
   $ chmod 600 ~/.smaht-keys.json
   $ ls -l ~/.smaht-keys.json
   -rw-------  1 youruser  staff  137 Jan 31 08:55 /Users/your_username/.smaht-keys.json

|

Getting Added as a SMaHT User or Submitter
------------------------------------------

Before you can view protected data or data submitted to the SMaHT system you must be a registered user of the site and have the appropriate access credentials.

* To view data that is still in the review phase you must be registered as a member of the submission center that produced the data.
* To submit metadata and files you must be designated as a submitter for a submission center.
* Most current SMaHT consortia members should already be registered in our system.

For instructions on creating an account, please see `this page </docs/user-guide/account-creation>`_.

**Metadata and data accessibility.**

Most metadata items have the following default permissions:

  * Members of the submitting lab can view data.
  * Submitters for the lab can edit data.
  * To help you review and edit a lab's submissions the DAC data wranglers can view and edit the data.
  * Once the data and metadata are complete and quality controlled, they will be released according to the data release policy adopted by the SMaHT consortia.
  * After release the data can no longer be edited by data submitters - contact the DAC to report data issues and we can work together to get them resolved
