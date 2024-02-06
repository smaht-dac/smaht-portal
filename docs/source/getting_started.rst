======================
Getting Started (User)
======================

In order to make your data accessible, searchable and assessable you should submit as much metadata as possible
to the SMaHT system along with the raw files you have generated in your experiments.

These pages are designed to:

* Show you how to find out what kind of metadata we collect for your particular type of experiment.
* Introduce the mechanisms by which you can submit your metadata and associated data files to the SMaHT data portal.

An overview of metadata structure is pending, check back soon!

The primary way to submit data to the SMaHT data portal is via Excel spreadsheet, as described below.


Data Submission via Excel Spreadsheet
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Uploading metadata and associated data files to the SMaHT data portal can be done using a software tool called ``smaht-submitr``.
This is a Python based command-line tool which is distributed on `PyPi <https://pypi.org/>`_ here: `smaht-submitr <https://pypi.org/project/smaht-submitr/>`_
The metadata is represented by an Excel spreadsheet (also called `workbook`) which contains a number of sheets (also called `worksheets`).

Such Excel metadata workbooks:

* Are useful for submitting metadata and data for several sequencing experiments or samples.
* Can be used to make bulk edits of submitted but not yet released metadata.
* Contain multiple sheets where each sheet corresponds to an object type and each column a field of metadata.
* Are used as input to the ``smaht-submitr`` software which validates submissions and pushes the content of the forms to our database.

Spreadsheet generation tools may be made available in the future; please contact the DAC directly for data submission templates.
More extensive documentation of the data submission process can be found `here <https://submitr.readthedocs.io/en/latest/>`_.

|

Formatting Files for Submission
-------------------------------
The file format recommended for the metadata is an Excel spreadsheet file (e.g. ``your_metadata_file.xlsx``),
comprised of one or more sheets. Each sheet name must be the name of a SMaHT data portal entity or `object` defined within the system.

For details specifics of the Excel metadata spreadsheet format please see: `this page </docs/user-guide/excel-submission>`_.

Each sheet must have as its first row, a special `header` row, which enumerates the names of the object properties as the column names;
each column name must match exactly the name of the property for the Portal object.
Each sheet may contain any number of rows, each representing an instance of the object.

Note that the first row which is entirely empty marks the end of the input, and any subsequenct rows will be entirely ignored.

And similarly, the first column in the header column which is empty marks the end of the header,
and any subsequent columns will be entirely ignored.

Here is screenshot of a simple example Excel spreadsheet: 

.. image:: /static/img/docs/excel_screenshot.png
   :target: /static/img/docs/excel_screenshot.png
   :alt: Excel Spreadsheet Screenshot

|

Notice that the first row comprises the property/column `header`, defining properties named ``submitted_id``, ``submission_centers``, and so on.

And also notice the multiple tabs at the bottom for the different sheets within the spreadsheet,
representing (in this example) data for the objects ``CellCultureSample``, ``Analyte``, and so on.

N.B. Though ``submission_center`` is shown in the above screenshot,
that particular field is not actually required, as it is automatically added by the ``smaht-submitr`` tool.

**Column Deletions**

A column value within a (non-header) row may be empty, but this only means that the value will be ignored
when creating or updating the associated object. In order to actually `delete` a property value from an object,
a special value - ``*delete*`` - should be used as the the property value.

**Nested Properties**

Some Portal object properties defined to contain other `nested` objects.
Since a (Excel spreadsheet) inherently defines a "flat" structure,
rather than the more hierarchical structure supported by Portal objects, in which such nested objects can be defined,
a special syntactic convention is needed to be able to reference the properties of these nested objects.
For this we will use a `dot-notation` whereby dots (``.``) are used to separate a parent property from its child property.
For example, an object may define a ``components`` property which itself may contain a ``cell_culture`` property;
to reference the ``cell_culture`` property then, the spreadsheet column header would need to be ``components.cell_culture``.

**Array Type Properties**

Some Portal object properties are defined to be lists (or `arrays`) of values.
Defining the values for such array properties, separate the individual array values by a comma (``,``).
For example if an object defines a ``molecules`` property as an array type, then to set this
value to an array with the two elements ``DNA`` and ``RNA``, use the value ``DNA,RNA`` in the associated spreadsheet cell.

Less common, but still supported, is the ability to set values for individual array elements.
This is accomplished by the convention suffixing the property name in the column header with
a pound sign (``#``) folowing by an integer representing the zero-indexed array element.
For example to set the first element of the ``molecules`` property (using the example above), use column header value ``molecule#0``.

**Boolean Type Properties**

For Portal object properties which are defined as `boolean` values, meaning either `true` or `false`,
simply use these values, i.e. ``true`` or ``false``.

**Property References**

Some Portal object properties are defined as being references to other Portal objects (also known as `linkTo` properties).
The values of these in the spreadsheet should be the unique identifying value for that object.
It is important to know that the ``smaht-submitr`` tool and SMaHT will ensure that the referenced
objects actually exist within the SMaHT Portal, `or` are defined within the spreadsheet itself;
if this is not the case then an error will be the result.
The identifying value for an object varies depending on the specific object in question,
though the ``uuid`` is common to all objects; other common identifying properties
are ``submitted_id`` and ``accession``.

|

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

|

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
