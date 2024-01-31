In order to make your data accessible, searchable and assessable you should submit as much metadata as possible to the SMaHT system along with the raw files you have generated in your experiments.

These pages are designed to:

* Show you how to find out what kind of metadata we collect for your particular type of experiment.
* Introduce the mechanisms by which you can submit your metadata and data to the SMaHT data portal.

An overview of metadata structure is pending, check back soon!

We have two primary ways that you can submit data to the SMaHT data portal.


Data Submission via Spreadsheet
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

The Excel metadata workbooks:

* Are useful for submitting metadata and data for several sequencing experiments or samples
* Can be used to make bulk edits of submitted but not yet released metadata
* Contain multiple sheets where each sheet corresponds to an object type and each column a field of metadata
* Can be generated using the ``submitr`` software
* Are used as input to the ``submitr`` software which validates submissions and pushes the content of the forms to our database.

Documentation of the data submission process using these forms will soon be available
`here <https://submitr.readthedocs.io/en/latest/>`_.


REST API
^^^^^^^^

For both meta/data submission and retrival, you can also access our database directly via the REST-API.


* Data objects exchanged with the server conform to the standard JavaScript Object Notation (JSON) format.
* Our implementation is analagous to the one developed
  by the `ENCODE DCC <https://www.encodeproject.org/help/rest-api/>`_.



Referencing existing objects
^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Using submitted_id
------------------

**submitted_ids** are a convenient way for you to refer to other items that you are submitting or have submitted in the past.


* A submitted_id is a specific identifier that you can assign to any item
* A submitted_id has a specific naming convention per item type that can be viewed in schema.
* A submitted_id must be unique within all items.
* Once you submit a submitted_id for an Item then that id can be used as an identifier for that Item in the current submission as well as in any subsequent submission.


Other ways to reference existing items
--------------------------------------

You don't need to use a submitted_id if you are referencing an item that already exists in the database.

Any of the following can be used to reference an existing item in an excel sheet or when using the REST-API.


* **accession** - Objects of some types (eg. Files, Analytes, Samples etc) are *accessioned*\ , e.g. SMAFI4723419.
* **uuid** - Every item in our database is assigned a “uuid” upon its creation, e.g. “44d3cdd1-a842-408e-9a60-7afadca11575”.
* **type/id** in a few cases object specific identifying terms are also available, e.g. name of submission center or consortia

.. list-table::
   :header-rows: 1

   * - Object
     - Field
     - type/ID
     - ID
   * - Consortia
     - identifier
     - /consortia/smaht-consortia/
     - smaht-consortia
   * - Submission Center
     - identifier
     - /submission-center/dac/
     - dac
   * - User
     - email
     - /users/test@test.com/
     - test@test.com



Getting Added as a SMaHT User or Submitter
------------------------------------------

Before you can view protected data or submit data to the SMaHT system you must be a registered user of the site and have the appropriate access credentials.


* To view data that is still in the review phase you must be registered as a member of the submission center that produced the data.
* To submit metadata and files you must be designated as a submitter for a submission center
* Most current SMaHT consortia members should already be registered in our system.

For instructions on creating an account, please see `this page </docs/user-guide/account-creation>`_.

**Metadata and data accessibility.**


Most metadata items have the following default permissions:


  * members of the submitting lab can view
  * submitters for the lab can edit
  * to help you review and edit a lab's submissions the DAC data wranglers can view and edit
  * Once the data and metadata are complete and quality controlled, they will be released according to the data release policy adopted by the SMaHT consortia.
  * After release the data can no longer be edited by data submitters - contact the DAC to report data issues and we can work together to get them resolved

Getting Access Keys for the SMaHT Data Portal servers
-----------------------------------------------------

If you have been designated as a submitter for the project and plan to use either our spreadsheet-based submission system or the REST-API an access key and a secret key are required to establish a connection to the DAC database and to fetch, upload (post), or change (patch) data. Please follow these steps to get your keys.


#. Log in to the SMaHT `website <https://data.smaht.org>`_ with your username (email) and password. If you have not yet created an account, see `this page </docs/user-guide/account-creation>`_ for instructions.
#. Once logged in, go to your ”Profile” page by clicking **Account** on the upper right side of the page.
#. In your profile page, click the green “Add Access Key” button, and copy the “access key ID” and “secret access key” values from the pop-up page. *Note that once the pop-up page disappears you will not be able to see the secret access key value.* However, if you forget or lose your secret key you can always delete and add new access keys from your profile page at any time.
#. Create a file to store this information.

   * The default parameters used by the submission software is to look for a file named ``~/.smaht-keys.json`` in your home directory.
   * However you can specify your own filename and file location as parameters to the software (see below).
   * The key information is stored in JSON format and is used to establish a secure connection.
   * the JSON must be formatted as shown below - replace key and secret with your new “Access Key ID” and “Secret Access Key”.
   * You can use the same key and secret to use the SMaHT REST API.

**Sample content for ~/.smaht-keys.json**

.. code-block:: json

   {
     "default": {
       "key": "ABCDEFG",
       "secret": "abcdefabcd1ab",
       "server": "https://data.smaht.org/"
     }
   }


**If you have any questions or need to set up access credentials for data submission, please contact the SMaHT DAC team through HelpDesk.**
