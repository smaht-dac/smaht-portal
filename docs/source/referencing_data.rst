==================================
Linking Metadata During Submission
==================================

The SMaHT metadata model is composed of database objects that can be linked to each other to represent relationships.

These links are **extremely important**; without them, we would not be able to determine how files were generated from specific assay types or what samples come from which donors.

The metadata model allows us to link a tissue to the donor it was taken from or indicate that an aligned BAM was ``derived_from`` an unaligned FASTQ file. This linking is accomplished via “LinkTo” properties that allow objects to refer to other objects.


When and how do I "LinkTo" another object?
------------------------------------------
In the submission spreadsheet (See `Getting Started with Submissions </docs/submission/getting-started-with-submissions>`_), columns with *italicized* names indicate LinkTo fields. For example, Library items require links to Analyte and Assay items, as shown in the image below.

|

.. image:: /static/img/docs/submission_spreadsheet_example_library.jpg
  :alt: Submission spreadsheet Library screenshot

|



To link two items together, simply grab the identifier for the item you are linking to and copy it into the corresponding cell in the spreadsheet. In the example below, the Library item is linking to an Analyte item in the same workbook using its ``submitted_id`` and is linking to an assay on the data portal using its ``identifier``.

|

.. image:: /static/img/docs/link_to_example_diagram.jpg
  :alt: Linking example diagram

|



Finding the correct IDs to submit
---------------------------------
LinkTo property values must uniquely identify an object, either through a ``submitted_id`` value from another row and/or sheet in the submission workbook or an identifying property for an existing object on the portal (which could also be a ``submitted_id``).


For objects or rows in your workbook
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
When linking items that are already on your submission workbook in another row and/or sheet, please use the ``submitted_id`` value as the unique identifier for that item. Refer to the image above with the link from Library to Analyte to see an example of this.


For objects already on the data portal
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
To find an existing identifier on the portal, please use the links provided below. Each link will bring you to a table with all available items of that given item type. The “Submitted ID” and “Identifier” columns serve as unique identifiers for that item, either of which can be used as a LinkTo property value.

The links to the different reference tables can also be found right from the submission spreadsheet itself:

|

.. image:: /static/img/docs/submitr_spreadsheet_item_dropdown_example.jpg
  :alt: Linking example diagram

|

.. NOTE::
  You need to be logged in to the SMaHT data portal in order to see the data at the provided links.

|


Links to data tables to find identifiers on the portal
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
.. raw:: html

    <hr />
    <div class="table-responsive"> 
        <table class="table table-borderless table-sm text-start" style="min-width: 340px;">
            <thead class="thead-smaht">
                <tr class="">
                    <th class="px-2">Data Type</th>
                    <th class="px-2">LinkTo Property Options</th>
                </tr>
            </thead>
            <tbody class="table-border-inner">
                <tr class="">
                    <td class="px-2 d-flex flex-column">
                        <a href="/search/?type=Donor">
                            <b>Donors</b>
                        </a>
                        <a href="/search/?type=Tissue">
                            <b>Tissues</b>
                        </a>
                        <a href="/search/?type=CellCulture">
                            <b>CellCultures</b>
                        </a>
                        <a href="/search/?type=PreparationKit">
                            <b>PreparationKit</b>
                        </a>
                        <a href="/search/?type=Treatment">
                            <b>Treatment</b>
                        </a>
                        <a href="/search/?type=LibraryPreparation">
                            <b>LibraryPreparation</b>
                        </a>
                        <a href="/search/?type=AnalytePreparation">
                            <b>AnalytePreparation</b>
                        </a>
                        <a href="/search/?type=DonorSpecificAssembly">
                            <b>DonorSpecificAssembly</b>
                        </a>
                        <a href="/search/?type=Software">
                            <b>Software</b>
                        </a>
                    </td>
                    <td class="px-2">
                        Submitted ID
                    </td>
                </tr>
                <tr class="">
                    <td class="px-2 d-flex flex-column">
                        <a href="https://data.smaht.org/search/?type=Sequencer">
                           <b>Sequencers</b>
                        </a>
                        <a href="https://data.smaht.org/search/?type=Assay">
                           <b>Assays</b>
                        </a>
                        <a href="https://data.smaht.org/search/?type=ReferenceGenome">
                           <b>ReferenceGenomes</b>
                        </a>
                        <b>FileFormats</b>
                        <ul class="mt-0">
                           <li>For <a href="https://data.smaht.org/search/?type=FileFormat&valid_item_types=UnalignedReads">UnalignedReads</a></li>
                           <li>For <a href="https://data.smaht.org/search/?type=FileFormat&valid_item_types=AlignedReads">AlignedReads</a></li>
                           <li>For <a href="https://data.smaht.org/search/?type=FileFormat&valid_item_types=VariantCalls">VariantCalls</a></li>
                           <li>For <a href="https://data.smaht.org/search/?type=FileFormat&valid_item_types=SupplementaryFile">SupplementaryFile</a></li>
                        </ul>
                    </td>
                    <td class="px-2">
                        Identifier
                    </td>
                </tr>
            </tbody>
        </table>
    </div>


.. NOTE::
  The ``smaht-submitr`` tool and SMaHT data portal will automatically ensure that the referenced objects actually exist within SMaHT data portal or are defined within the spreadsheet itself; if this is not the case, an error will be returned.



Overview of the data model
--------------------------
As mentioned previously, metadata in the portal is connected by linking objects of a variety of item types together. A simplified version of the data model is shown below, with items linking together to indicate how files were derived from experiments, samples, and donors. This structure allows for clear interpretation of the origin of sequence data.

|

.. image:: /static/img/docs/data_model.png
  :alt: Data Model