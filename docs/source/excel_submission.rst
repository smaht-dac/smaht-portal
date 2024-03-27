.. role:: raw-html-m2r(raw)
   :format: html


Overview
--------


* Metadata can be submitted to our platform using Microsoft Excel WorkBooks that describe related items in separate sheets.
* This section provides detailed information on how to use the WorkBooks.
* A link to a detailed example of a filled out spreadsheet is forthcoming.
* Based on the type of experiment(s) for which you plan to submit data, the data wranglers can provide you with an Excel WorkBook containing several WorkSheets.
* Each sheet corresponds to an Item type in our metadata database.
* The workbook provided should contain all the sheets that you may need for your submission.
* Each sheet should also contain all the data fields that can be submitted for that Item type.
* Depending on if you have submitted data before or if you are using shared resources that have been submitted by other groups, you may not need to provide information on every sheet or in every field.


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


Submitting Excel Workbooks
--------------------------


* The SMaHT DAC website has an REST API for fetching and submitting data.
* In our **submitr** package the ``submit-metadata-bundle`` script utilizes an organized bundle of REST API commands that parse the Excel workbook and submit the metadata to the database for you.
* The package can be installed from pypi.

