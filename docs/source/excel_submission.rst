.. role:: raw-html-m2r(raw)
   :format: html


================
Excel Submission
================

* Metadata can be submitted to our platform using Microsoft Excel WorkBooks that describe related items in separate sheets.
* This section provides detailed information on how to use the WorkBooks.
* A link to a detailed example of a filled out spreadsheet is forthcoming.
* Based on the type of experiment(s) for which you plan to submit data, the data wranglers can provide you with an Excel WorkBook containing several WorkSheets.
* Each sheet corresponds to an Item type in our metadata database.
* The workbook provided should contain all the sheets that you may need for your submission.
* Each sheet should also contain all the data fields that can be submitted for that Item type.
* Depending on if you have submitted data before or if you are using shared resources that have been submitted by other groups, you may not need to provide information on every sheet or in every field.

|

Formatting Files for Submission
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

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

Preparing Excel Workbooks
^^^^^^^^^^^^^^^^^^^^^^^^^


* A field can be one of a few different types;

  * string
  * number/integer
  * array/list
  * Item


* The type will be indicated in the second row.

:raw-html-m2r:`<span id="basic-field"></span>`


Most field values are strings:


  * a term from a controlled vocabulary, i.e. from a constrained list of choices
  * a string that identifies an Item
  * a text description.
  * If the field type is an array, you may enter multiple values separated by commas.


* There are some fields values that require specific formatting. These cases and how to identify them are described below.

|

Required string formatting
^^^^^^^^^^^^^^^^^^^^^^^^^^

In some cases a field value must be formatted in a certain way or the Item will fail validation. In most cases tips on formatting requirements will be included in the *Additional Info* row of the spreadsheet.

Examples of these are


* *Date* fields - YYYY-MM-DD format.
* *URLs* -checked for proper URI syntax.
* *patterns* - checked against simple regular expressions (eg. a DNA sequence can only contain A, T, G, C or N).
* *Database Cross Reference (DBxref) fields* that contain identifiers that refer to external databases

  * In many cases the values of these fields need to be in database_name:ID format. eg. an SRA experiment identifier ‘SRA:SRX1234567’ (see also `Basic fields example <#basic-field>`_ above).
  * In a few cases where the field takes only identifiers for one specific databases the ID alone can be entered - eg. *'targeted_genes’* field of the Target Item enter gene symbols eg. PARK2, DLG1.

|

Linked item fields
^^^^^^^^^^^^^^^^^^


* Some fields in a Sheet for an Item may contain references to another Item.
* The referenced Item may be of the same or different type.
* The *'files'* field is also an example of a list field that can take multiple values.
* You can reference an item in the excel workbooks using one of four possible ways:

  #. submitted_id
  #. accession
  #. item-type-specific identifier
  #. UUID

We recommend using submitted_id for simplicity. More information about these four identifiers is provided in `Using aliases </help/submitter-guide/getting-started#using-identifiers>`_.

|

Field(s) with subobjects
^^^^^^^^^^^^^^^^^^^^^^^^


TODO: handled differently in the new submission tool and should be documented


Referencing existing items
^^^^^^^^^^^^^^^^^^^^^^^^^^


* Ways that you can reference items that already exist in the SMahT database in your spreadsheet submission is described `here </help/submitter-guide/getting-started#referencing-existing-objects>`_.
  :raw-html-m2r:`<span id="supp_files"></span>`
* In some cases information for existing items will be present in the Excel Work Sheets provided for your submission.
* You can also check the existing items from *collection* pages that list all of them.
* The links for item lists can be constructed by ``https://data.smaht.org/ + plural-object-name`` (e.g. https://data.smaht.org/analyte/ ) and the identifiers that can be used for collections are referenced in `this table <schema_info.md>`_.

:raw-html-m2r:`<span id="excel_reps"></span>`

|

Submitting Excel Workbooks
--------------------------


* The SMaHT DAC website has an REST API for fetching and submitting data.
* In our **submitr** package the ``submit-metadata-bundle`` script utilizes an organized bundle of REST API commands that parse the Excel workbook and submit the metadata to the database for you.
* The package can be installed from pypi.
