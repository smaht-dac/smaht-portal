=================================
File Download on the Data Portal
=================================

Before You Can Download
^^^^^^^^^^^^^^^^^^^^^^^
You need to be able to log into the portal to access the data. To obtain portal access, you need to:

1. Become a verified member of the SMaHT Network. Contact OC `here <mailto:smahtsupport@gowustl.onmicrosoft.com>`_ for more information about verification.

**AND**

2. Get added to the portal user base at DAC. Contact `DAC <mailto:smhelp@hms-dbmi.atlassian.net>`_ to obtain portal access.

.. TIP::
   To run the download command and gain access to SMaHT data, all users need to **create a secret access key** on the portal. If you have not yet created an access key, please see the `Credentials </docs/user-guide/credentials>`_ page for detailed instruction.

|

Instructions to Download
^^^^^^^^^^^^^^^^^^^^^^^^
1. Once you are logged in, navigate to the benchmarking data table through the homepage

|

.. image:: /static/img/docs/homepage_benchmarking_link.png
   :target: /static/img/docs/homepage_benchmarking_link.png
   :alt: Homepage Benchmarking Link

|

OR through the navigation bar:

|

.. image:: /static/img/docs/navigation_benchmarking_link.png
   :target: /static/img/docs/navigation_benchmarking_link.png
   :alt: Navigation Benchmarking Link

|

2. You can select any files you wish from each data table in the portal. In this example we used the facets on the left to search for and select 12 BAM files to download from the COLO829BLT50 table. To download, click the blue download button.

|

.. image:: /static/img/docs/benchmarking_bam_selection.png
   :target: /static/img/docs/benchmarking_bam_selection.png
   :alt: Benchmarking BAM File Selection

|

3. Selecting the download button will open this popup with a summary of your selected data and instructions to open and download the manifest file. Select the Download Manifest Button to create a manifest file.

|

.. image:: /static/img/docs/download_modal_example.png
   :target: /static/img/docs/download_modal_example.png
   :alt: Download Modal Example

|


Interpreting the Manifest
^^^^^^^^^^^^^^^^^^^^^^^^^

The ``Manifest`` file contains **important metadata such as file group information** for BAM files that can be merged to create high-coverage BAMs (i.e. can be merged if ``FileFormat`` is ``bam`` and ``FileGroup`` values are identical). More detailed information about the Manifest tsv file can be found on the `Interpreting Manifest Files </docs/user-guide/manifest>`_ page on the data portal.

|

.. image:: /static/img/docs/manisfest_tsv_example.png
   :target: /static/img/docs/manisfest_tsv_example.png
   :alt: Manifest TSV Example

|
