===============
Getting Started
===============

In order to make your data accessible, searchable, and assessable, you should submit as much metadata as possible to the SMaHT system along with the raw files you have generated in your experiments.

These pages are designed to:

* Show you how to find out what kind of metadata we collect for your particular type of experiment.
* Introduce the mechanisms by which you can submit your metadata and associated data files to SMaHT data portal.

The primary way to submit data to SMaHT data portal is via Excel spreadsheet, as described below.

**Tip**: For more detailed and comprehensive documentation, please see our ReadTheDocs based documentation here:

* https://submitr.readthedocs.io/en/draft/

An overview of the actual metadata structure is pending, check back soon! Though for now a reference can be found here:

* https://submitr.readthedocs.io/en/draft/object_model.html


Data Submission via Excel Spreadsheet
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Uploading metadata and associated data files to SMaHT data portal can be done using a software tool called ``smaht-submitr``. This is a Python based command-line tool which is distributed on PyPi. The metadata is represented by an Excel spreadsheet (also called a `workbook`) which contains a number of sheets (also called `worksheets`).

Such Excel metadata workbooks:

* Are useful for submitting metadata and data for several sequencing experiments or samples.
* Can be used to make bulk edits of submitted but not yet released metadata.
* Contain multiple sheets where each sheet corresponds to an object type and each column a field of metadata.
* Are used as input to the ``smaht-submitr`` software which validates submissions and pushes the content of the forms to our database.

Spreadsheet generation tools may be made available in the future; please contact the DAC directly for data submission templates. More extensive documentation of the data submission process can be found `here <https://submitr.readthedocs.io/en/draft/>`_.


Installing the Submission Tool
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
The SMaHT data portal submission tool is implemented as a command-line Python package, and is distributed on `PyPi <https://pypi.org/project/smaht-submitr/>`_.  It requires Python version 3.9, 3.10, or 3.11.  Installation is done via the standard Python ``pip`` command-line install tool like this::

    pip install smaht-submitr

Once installed, these key commands will be available for execution from the command-line: ``submit-metadata-bundle``, ``resume-uploads``


Templates
---------

A workbook containing worksheets for each item type with all properties available for submission can be found |template_workbook|.

.. |template_workbook| raw:: html

   <a href="https://docs.google.com/spreadsheets/d/1sEXIA3JvCd35_PFHLj2BC-ZyImin4T-TtoruUe6dKT4/edit?usp=sharing" target="_blank">here</a>

This workbook is a Google Sheet, and you can make a copy of it to your own Google Drive, or download it as an Excel file. For detailed information on an individual property, refer to its tooltip in the template by clicking or hovering over the column name.

An example of a filled out workbook ready for submission can be found |example_workbook|.

.. |example_workbook| raw:: html

   <a href="https://docs.google.com/spreadsheets/d/1b5W-8iBEvWfnJQFkcrO9_rG-K7oJEIJlaLr6ZH5qjjA/edit?usp=sharing" target="_blank">here</a>


|


Formatting Files for Submission
-------------------------------
Most commonly, the file format recommended for metadata submission to SMaHT Portal, is an Excel spreadsheet file (e.g. ``your_metadata_file.xlsx``), comprised of one or more sheets. Note these important aspects of using the Excel spreadsheet format:

#. Each sheet name must be the `exact` name of a SMaHT Portal entity or `object` defined within the system.
#. Each sheet must have as its first row a special `header` row, which enumerates in each column, the `exact` names of the Portal object `properties` as the column names; order does `not` matter.
#. Each sheet may contain any number of `data` rows (`directly` below the header row), each representing an instance of the Portal object.
#. The values in the cells/columns of each data row correspond to the property named in the same column of the header row.
#. The first column in the header row which is empty marks the end of the header, and any subsequent columns will be entirely ignored.
#. The first row which is entirely empty marks the end of the input, and any subsequent rows will be entirely ignored; this means you can include comments in your spreadsheet in rows after (below) the first blank row indicating the end of data input.
#. Sheets which are marked as "hidden" will be ignored; this provides a way of including sheets with other auxiliary information without their contents interfering with the submission tool.
#. Sheets which have a name enclosed in parenthesis, for example ``(My Comments)``, will be completely ignored; this provides a way of including sheets with other auxiliary information without their contents interfering with the submission tool.
#. The name of the spreadsheet file must be suffixed with ``.xls`` or ``.xlsx``; there are no other requirements for the name of this file.

Despite the rather dense chunk of text here, it is actually pretty intuitive, straightforward, and almost self-explanatory. Here is screenshot of a simple example Excel spreadsheet:

.. image:: /static/img/docs/excel_screenshot.png
   :target: /static/img/docs/excel_screenshot.png
   :alt: Excel Spreadsheet Screenshot

|

Notice that the first row comprises the property/column `header`, defining properties named ``submitted_id``, ``molecule``, ``components``, and so on.

And also notice the multiple tabs at the bottom for the different sheets within the spreadsheet, representing (in this example) data for the Portal objects ``CellCultureSample``, ``Analyte``, ``Library``, and so on.

|

**Tip:** Other file formats besides Excel actually `are` supported; see `this document <https://submitr.readthedocs.io/en/draft/advanced_usage.html#other-files-formats>`_ for more information.


Object Reference Properties
~~~~~~~~~~~~~~~~~~~~~~~~~~~

Some Portal object properties are defined as being references to other Portal objects (also known as `linkTo` properties). The values of these properties in the spreadsheet should be a unique identifying value for the object you are referencing or linking to. The identifying value property for an object varies depending on the specific object in question; the ``uuid`` property is common to all objects, but other common identifying properties are ``submitted_id`` and ``accession``.

It is important to know that the ``smaht-submitr`` tool and SMaHT data portal will ensure that the referenced objects actually exist within SMaHT data portal, `or` are defined within the spreadsheet itself; if this is not the case, an error will be returned.

You can view the identifying (and required) properties for objects here:

* https://staging.smaht.org/docs/user-guide/referencing-data
* https://submitr.readthedocs.io/en/draft/object_model.html


Nested Properties
~~~~~~~~~~~~~~~~~

Some SMaHT data portal object properties defined to contain other `nested` objects. Since a (Excel spreadsheet) inherently defines a "flat" structure, rather than the more hierarchical structure supported by SMaHT data portal objects (which are actually `JSON <https://en.wikipedia.org/wiki/JSON>`_ objects), in which such nested objects can be defined, a special syntactic convention is needed to be able to reference the properties of these nested objects.

For this we will use a `dot-notation` whereby dots (``.``) are used to separate a parent property from its child property. For example, an object may define a ``components`` property which itself may contain a ``cell_culture`` property; to reference the ``cell_culture`` property then, the spreadsheet column header would need to be ``components.cell_culture``.

Array Properties
~~~~~~~~~~~~~~~~

Some SMaHT data portal object properties are defined to be lists (or `arrays`) of values. To define the values for such array properties, separate the individual array values by a pipe character (``|``). For example, if an object defines an ``alignment_details`` property as an array type, use the value ``Sorted|Phased`` to set this value to an array with the two elements ``Sorted`` and ``Phased``.

Less common, but still supported, is the ability to set values for individual array elements. This is accomplished by suffixing the property name in the column header with a pound sign (``#``) followed by an integer representing the zero-indexed array element. For example, to set the first element of the ``alignment_details`` property (using the example above), use column header value ``alignment_details#0``.

Date/Time Properties
~~~~~~~~~~~~~~~~~~~~

For SMaHT data portal object properties which are defined as `date` values, the required format is ``YYYY-MM-DD``, for example ``2024-02-09``.

For SMaHT data portal object properties which are defined as `date-time` values, the required format is ``YYYY-MM-DD hh:mm:ss``, for example ``2024-02-09 13:25:10`` (note the use of 24-hour based clock time). This will default to your local timezone; if you want to specify a timezone, use a suffix like ``+hh:mm`` where ``hh`` and ``mm`` are the hour and minute (respectively) offsets from GMT (for example: ``2024-02-09 13:25:10+05:00``).

Boolean Properties
~~~~~~~~~~~~~~~~~~

For SMaHT data portal object properties which are defined as `boolean` values, meaning either `true` or `false`, simply use these values, i.e. ``true`` or ``false``.

Implicit Properties
~~~~~~~~~~~~~~~~~~~

Some SMaHT data portal objects require (or support) the ``submission_centers`` property. If you do not specify this though, ``smaht-submitr`` will `automatically` supply this particular property; it will be `implicitly` set to the submission center to which you belong.

Property Deletions
~~~~~~~~~~~~~~~~~~

In order to delete a property value from an object after having already submitted metadata for that object, a special value - ``*delete*`` - should be put in the cell corresponding to that property value. Do not simply leave the value empty and resubmit the workbook: an empty column value within a (non-header) data row may be empty, but this only means that the value will be ignored when creating or updating the associated object. 

A column value within a (non-header) data row may be empty, but this only means that the value will be ignored when creating or updating the associated object. In order to actually `delete` a property value from an object, a special value - ``*delete*`` - should be used as the the property value.


Submission
----------

The type of submission supported is called "metadata bundles" or `accessioning`. The name of the command-line tool to initiate a submission is ``submit-metadata-bundle``. A brief tour of this command, its arguments, and function is described below. To get additional information about the command, use the command::

  submit-metadata-bundle --help

To submit your metadata, run the following command::

   submit-metadata-bundle your_metadata_file.xlsx --env data --submit

where ``<your_metdata_file.xlsx>`` is the path to your metadata file. The argument passed to the ``--env`` option corresponds to the SMaHT environment name (e.g. ``data``) from your keys file (as described in the `Credentials </docs/user-guide/credentials>`_ section).

This will first validate your metadata, and if no errors were encountered, it will perform the actual metadata submission; you `will` be prompted for confirmation before the submission is started. If errors are encountered, the submission will `not` commence; you will `not` be able to submit until you fix the errors.

|

**Tip**: You can omit the ``--env`` option entirely if your keys file has only `one` single entry or if you have your ``SMAHT_ENV`` environment variable setup (see the `Credentials </docs/user-guide/credentials>`_ section).

|

**Note**: If you opted to use a file other than ``~/.smaht-keys.json`` to store your credentials, you will need to use the ``--keys`` option with the path name to your alternate file as an argument or have your ``SMAHT_KEYS`` environment variable setup (see the `Credentials </docs/user-guide/credentials>`_ section).

This command should do everything, `including` uploading any referenced files, which will be done after first
prompting the user for confirmation; see the `Uploading Files </docs/user-guide/uploading-files>`_ section for more on this.

If you belong to multiple consortia and/or submission centers, you can also add the ``--consortium <consortium>`` and ``--submission-center <submission-center>`` options to explicitly specify which consortium or submission center you are submitting on behalf of; if you belong to only one, the command will automatically detect which groups you are a part of (based on your user profile) and use those.

**Tip**: You may wonder: Is it okay to submit the same metadata file more than once? The answer is: Yes. If any changes were made to the file, updates will be applied as expected.


Validation
----------

As mentioned in the previous section, using the ``--submit`` option `will` perform validation of your metadata before submitting it (after prompting you to do so). But if you want to `only` run validation `without` submitting the metadata to SMaHT data portal, then invoke ``submit-metadata-bundle`` with the ``--validate`` option as follows::

   submit-metadata-bundle your_metadata_file.xlsx --env <environment-name> --validate

**Tip**: This feature basically constitutes a sort of "**dry run**" facility.

To be more specific about the the validation checks, they include the following:

#. Ensures the basic integrity of the format of the metadata submission file.
#. Validates that objects defined within the metadata submission file conform to the corresponding SMaHT data portal schemas for these objects.
#. Confirms that any objects referenced within the submission file can be resolved, i.e. either they already exist within SMaHT data portal or are defined within the metadata submission file itself.
#. Verifies that referenced files (to be subsequently uploaded) actually exist on the file system.

|

**Note**: If you try to resubmit your metadata sheet after fixing your validation errors, it is possible that you will get new, additional errors. Not all validation errors will be comprehensively reported at once. This is because there are two kinds (or phases) of validation: local client-side and remote server-side. You can learn more about the details of the validation process in the `Advanced Usage <https://submitr.readthedocs.io/en/draft/advanced_usage.html#more-on-validation>`_ section.


**Example Screenshots**

The output of a successful ``submit-metadata-bundle --submit`` will look something like this:

|

.. image:: /static/img/docs/submit_output.png
    :target: /static/img/docs/submit_output.png
    :alt: Submission Output Screenshot

Notice the **Submission tracking ID** value as well as the **Upload File ID** values. These may be used in a subsequent ``resume-uploads`` invocation (see the Uploading Files section for more on this).

When instead specifying the ``--validate`` option, the output will look something like this:

|

.. image:: /static/img/docs/validate_output.png
    :target: /static/img/docs/validate_output.png
    :alt: Validation Output Screenshot

If you additionally specify the ``--verbose`` option, the output will look something like this:

|

.. image:: /static/img/docs/validate_verbose_output.png
    :target: /static/img/docs/validate_verbose_output.png
    :alt: Validation Verbose Output Screenshot


Getting Submission Info
-----------------------
To view relevant information about a submission, use the command::

   check-submission --env <environment-name> <uuid>

where the ``uuid`` argument is the Submission tracking ID for the submission, which should have been displayed in the output of the ``submit-metadata-bundle`` command.


Listing Recent Submissions
--------------------------
To view a list of recent submissions (with submission UUID and submission date/time), in order of most to least recent, use the ``list-submissions`` command as follows::

   list-submissions --env <environment-name>

Use the ``--verbose`` option to list more information for each of the recent submissions shown. You can control the maximum number of results output using the ``--count`` option with an integer count argument.
