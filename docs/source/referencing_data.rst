=========================
Links to Existing Data
=========================

Metadata in the portal is connected by linking item types together:

.. image:: /static/img/docs/data_model.png
  :target: /static/img/docs/data_model.png
  :alt: Data Model Image


A simplified version of the data model is shown here, with items linking together to indicate how files were derived from experiments, samples, and donors.
This allows for clear interpretation of the origin of sequence data. 

References to existing data are frequently required to submit new data. The links below will display all options available for referencing data already in the database.

In the submission spreadsheet (See <a href="/docs/submission/getting-started-with-submissions", target="_blank">Getting Started with Submissions</a>), columns that are italicized indicate fields that should be unique identifiers for items of another time.
For example, FileSet items require links to Library and Sequencing items.
.. image:: /static/img/docs/file_set_screenshot.png
  :target: /static/img/docs/file_set_screenshot.png
  :alt: FileSet Screenshot


For data types submitted by your own or another submission center, the unique identifier can be the submitted_id or accession of the item.

.. TIP::
  You need to be logged in to the SMaHT data portal in order to actually see the data at the links below.


DAC-Controlled Data
--------------------
Values for the following columns in the submission spreadsheet are unique identifiers for pre-existing items that are controlled by DAC:
* `reference_genome`
* `sequencer`
* `assay`
* `file_format`

`file_format` is a special case in that the accepted values for this field depend on the item type. For instance, if you are submitting VariantCalls items, the only accepted file formats are vcf or vcf.gz, so this field will only accept the unique identifiers for those two FileFormat items (i.e. `vcf` or `vcf_gz`)

To link to DAC-controlled data, you can use values for any of the following properties:

* `identifier`
* `uuid`
* `accession`
The links below show the existing items present in the portal by item type.

|Sequencers|
^^^^^^^^^^^^

.. |Sequencers| raw:: html

  <a href="/search/?type=Sequencer", target="_blank">Sequencers</a>


|Assays|
^^^^^^^^

.. |Assays| raw:: html

  <a href="/search/?type=Assay", target="_blank">Assays</a>

|ReferenceGenomes|
^^^^^^^^^^^^^^^^^^

.. |ReferenceGenomes| raw:: html

  <a href="/search/?type=ReferenceGenome", target="_blank">ReferenceGenomes</a>

FileFormats
^^^^^^^^^^^

Each file type available in the database accepts a limited selection of file formats. Use the following links to see options for the following file types:

* For |UnalignedReads|
* For |AlignedReads|
* For |VariantCalls|


.. |UnalignedReads| raw:: html

  <a href="/search/?type=FileFormat&valid_item_types=UnalignedReads", target="_blank">UnalignedReads</a>


.. |AlignedReads| raw:: html

  <a href="/search/?type=FileFormat&valid_item_types=AlignedReads", target="_blank">AlignedReads</a>


.. |VariantCalls| raw:: html

  <a href="/search/?type=FileFormat&valid_item_types=VariantCalls", target="_blank">VariantCalls</a>

.. |SupplementaryFiile| raw:html

  <a href="/search/?type=FileFormat&valid_item_types=SupplementaryFile", target="_blank">SupplementaryFile</a>


Data Submitted by the Consortium
--------------------------------

To link to data submitted by other consortium members, you can use values for any of the following properties:

* `submitted_id`
* `uuid`
* `accession`


|Donors|
^^^^^^^^

.. |Donors| raw:: html

   <a href="/search/?type=Donor", target="_blank">Donors</a>


|Tissues|
^^^^^^^^^

.. |Tissues| raw:: html

   <a href="/search/?type=Tissue", target="_blank">Tissues</a>


|CellCultures|
^^^^^^^^^^^^^^

.. |CellCultures| raw:: html

   <a href="/search/?type=CellCulture", target="_blank">CellCultures</a>


|Samples|
^^^^^^^^^

.. |Samples| raw:: html

   <a href="/search/?type=Sample", target="_blank">Samples</a>


|Analytes|
^^^^^^^^^^

.. |Analytes| raw:: html

   <a href="/search/?type=Analyte", target="_blank">Analytes</a>


|Libraries|
^^^^^^^^^^^

.. |Libraries| raw:: html

   <a href="/search/?type=Library", target="_blank">Libraries</a>


|FileSets|
^^^^^^^^^^

.. |FileSets| raw:: html

   <a href="/search/?type=FileSet", target="_blank">FileSets</a>


|Files|
^^^^^^^

.. |Files| raw:: html

   <a href="/search/?type=File", target="_blank">Files</a>

|Software|
^^^^^^^^^^

.. |Software| raw:: html

   <a href="/search/?type=Software", target="_blank">Software</a>

|DonorSpecificAssembly|
^^^^^^^^^^

.. |DonorSpecificAssembly| raw:: html

   <a href="/search/?type=DonorSpecificAssembly", target="_blank">DonorSpecificAssembly</a>