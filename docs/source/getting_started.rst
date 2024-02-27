===============
Getting Started
===============

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
Most commonly, the file format recommended for metadata submission to SMaHT Portal,
is an Excel spreadsheet file (e.g. ``your_metadata_file.xlsx``),
comprised of one or more sheets.
Note these important aspects of using the Excel spreadsheet format:

#. Each sheet name must be the `exact` name of a SMaHT Portal entity or `object` defined within the system.
#. Each sheet must have as its first row, a special `header` row, which enumerates in each column, the `exact` names of the Portal object `properties` as the column names; order does `not` matter.
#. Each sheet may contain any number of `data` rows (`directly` below the header row), each representing an instance of the Portal object.
#. The values in the cells/columns of each data row correspond each to the property named in same column of the header row. 
#. The first column in the header row which is empty marks the end of the header, and any subsequent columns will be entirely ignored.
#. The first row which is entirely empty marks the end of the input, and any subsequenct rows will be entirely ignored;
   this means you can include comments in your spreadsheet in rows after (below) the first blank row indicating the end of data input.
#. Sheets which are marked as "hidden" will be ignored; this provides a way of including sheets with other auxiliary information
   without its content interfering the submission tool.
#. The name of the spreadsheet file must be suffixed with ``.xls`` or ``.xlsx``; there are no other requirements for the name of this file.

Here is screenshot of a simple example Excel spreadsheet: 

.. image:: /static/img/docs/excel_screenshot.png
   :target: /static/img/docs/excel_screenshot.png
   :alt: Excel Spreadsheet Screenshot

|

Notice that the first row comprises the property/column `header`, defining properties named ``submitted_id``, ``molecule``, ``components``, and so on.

And also notice the multiple tabs at the bottom for the different sheets within the spreadsheet,
representing (in this example) data for the Portal objects ``CellCultureSample``, ``Analyte``, ``Library``, and so on.

Property Deletions
~~~~~~~~~~~~~~~~~~

A column value within a (non-header) data row may be empty, but this only means that the value will be ignored
when creating or updating the associated object. In order to actually `delete` a property value from an object,
a special value - ``*delete*`` - should be used as the the property value.

Nested Properties
~~~~~~~~~~~~~~~~~

Some Portal object properties defined to contain other `nested` objects.
Since a (Excel spreadsheet) inherently defines a "flat" structure,
rather than the more hierarchical structure supported by Portal objects (which are actually `JSON <https://en.wikipedia.org/wiki/JSON>`_ objects),
in which such nested objects can be defined,
a special syntactic convention is needed to be able to reference the properties of these nested objects.

For this we will use a `dot-notation` whereby dots (``.``) are used to separate a parent property from its child property.
For example, an object may define a ``components`` property which itself may contain a ``cell_culture`` property;
to reference the ``cell_culture`` property then, the spreadsheet column header would need to be ``components.cell_culture``.

Array Type Properties
~~~~~~~~~~~~~~~~~~~~~

Some Portal object properties are defined to be lists (or `arrays`) of values.
Defining the values for such array properties, separate the individual array values by a pipe character (``|``).
For example if an object defines a ``molecules`` property as an array type, then to set this
value to an array with the two elements ``DNA`` and ``RNA``, use the value ``DNA|RNA`` in the associated spreadsheet cell.

Less common, but still supported, is the ability to set values for individual array elements.
This is accomplished by the convention suffixing the property name in the column header with
a pound sign (``#``) followed by an integer representing the zero-indexed array element.
For example to set the first element of the ``molecules`` property (using the example above), use column header value ``molecule#0``.

Date/Time Type Properties
~~~~~~~~~~~~~~~~~~~~~~~~~

For Portal object properties which are defined as `date` values,
the required format is ``YYYY-MM-DD``, for example ``2024-02-09``.

For Portal object properties which are defined as `date-time` values,
the required format is ``YYYY-MM-DD hh:mm:ss``, for example ``2024-02-09 08:25:10``.
This will default to your local timezone; if you want to specify a timezone
use a suffix like ``+hh:mm`` where ``hh`` and ``mm`` are the hour and minute (respectively) offsets from GMT.

Boolean Type Properties
~~~~~~~~~~~~~~~~~~~~~~~

For Portal object properties which are defined as `boolean` values, meaning either `true` or `false`,
simply use these values, i.e. ``true`` or ``false``.

Object Reference Properties
~~~~~~~~~~~~~~~~~~~~~~~~~~~

Some Portal object properties are defined as being references to other Portal objects (also known as `linkTo` properties).
The values of these in the spreadsheet should be the unique identifying value for that object.

It is important to know that the ``smaht-submitr`` tool and SMaHT will ensure that the referenced
objects actually exist within the SMaHT Portal, `or` are defined within the spreadsheet itself;
if this is not the case then an error will result.
The identifying value property for an object varies depending on the specific object in question,
though the ``uuid`` property is common to all objects; other common identifying properties
are ``submitted_id`` and ``accession``.

|

Submission
----------

The type of submission supported is called a "metadata bundles", or `accessioning`.
And the name of the command-line tool to initiate a submission is ``submit-metadata-bundle``.
A brief tour of this command, its arguments, and function is described below.
To get help about the command, do::

   submit-metadata-bundle --help

For many cases it will suffice simply to specify the metadata bundle file you want to upload,
and the SMaHT environment name (such as ``data`` or ``staging``) from your ``~/.smaht-keys.json`` keys file (as described in the `Credentials <credentials.html>`_ section),
as an argument to the ``--env`` option.
For example::

   submit-metadata-bundle your_metadata_file.xlsx --env data

You can omit the ``--env`` option entirely if your ``~/.smaht-keys.json`` file has only `one` single entry.

.. note::
    If you opted to use a file other than ``~/.smaht-keys.json`` to store
    your `credentials <credentials.html>`_, you will need to use the ``--keys``
    options with the path name to your alternate file as an argument.

This command should do everything, `including` uploading any referenced files,
prompting first for confirmation;
see the `Uploading Files <uploading_files.html>`_ section for more on this.

If you belong to
multiple consortia and/or submission centers, you can also add the ``--consortium <consortium>``
and ``--submission-center <submission-center>`` options; if you belong to only one,
the command will automatically detect (based on your user profile) and use those.

.. tip::
    You may wonder: Is it okay to submit the same metadata file more that once?
    The answer is: Yes. And, if you had made any changes to the file, updates
    will be applied as expected.

Validation
----------

To invoke the submission with validation checking, do::

   submit-metadata-bundle your_metadata_file.xlsx --env <environment-name> --validate

This is the recommended usage, and in fact, this (``--validate`` option) is actually the `default`
behavior unless your user profile indicates that you are an `admin` user.

To be more specific, the validation checks include the following:

#. Ensures the basic integrity of the format of the metadata submission file.
#. Validates that objects defined within the metadata submission file conform to the corresponding Portal schemas for these objects.
#. Confirms that any objects referenced within the submission file can be resolved; i.e. either they already exist within the Portal, or are defined within the metadata submission file itself.
#. Verifies that referenced files (to be subsequently uploaded) actually exist on the file system.

.. tip::
    Using this ``--validate`` feature, if any errors are encountered, the actual ingestion of data
    will `not` commence. (Even if no errors are encountered, you `will` be prompted as to 
    whether or not you wish to proceed). In other words, this constitutes a sort of "**dry run**" facility.

Not generally necessary to know,
but for more detailed information on the validation process
see the `Advanced Usage <advanced_usage.html#more-on-validation>`_ section.

.. note::
    Even in the absence of validation,
    if there are problems with specific objects within your submitted data,
    they will `not` be ingested into SMaHT Portal; i.e. no worries that corrupt data will sneak into the system.
    However, `without` the ``--validate`` option it `is` possible that `some` of your objects
    will be ingested properly, and other, problematic ones, will `not` be ingested at all.

**Example Screenshots**

The output of a successfully completed ``submit-metadata-bundle`` will look something like this:

.. image:: /static/img/docs/submitr_output.png
    :target: /static/img/docs/submitr_output.png
    :alt: Excel Spreadsheet Screenshot

Notice the **Submission UUID** value in the **Validation Output** section as well as the **uuid** values in the **Upload Info** section;
these may be used in a subsequent ``resume-uploads`` invocation.

When specifying the ``--check`` the additional sanity checking output will look something like this:

.. image:: /static/img/docs/submitr_check.png
    :target: /static/img/docs/submitr_check.png
    :alt: Excel Spreadsheet Screenshot

|

Getting Submission Info
-----------------------
To view relevant information about a submission using, do::

   check-submission --env <environment-name> <uuid>

where the ``uuid`` argument is the UUID for the submission which should have been displayed in the output of the ``submit-metadata-bundle`` command.
