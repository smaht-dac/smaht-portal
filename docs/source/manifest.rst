==============================================
Understanding SMaHT Data Portal Manifest Files
==============================================


The preferred method to download data from the SMaHT data portal is to pass
portal access credentials to the command provided in the ``smaht_manifest`` files.

Most values in the manifest are single valued, but in some select scenarios multi-valued fields are separated by the pipe (``|``) character.

Below are the columns listed in the ``manifest`` files as of the May 2024 data release.

#. **File Download URL** - this URL, when navigated to while passing portal access credentials, will redirect to a pre-signed URL for downloading the associated file provided the user who made the request has access to the file.

#. **File Accession** - this value is a server generated value specific to the SMaHT data portal, generally speaking it is unique with the exception that any associated extra files associated with the root file will have the same accession but different file extension. While you can reference files in data portal by this value, when communicating with others it is best to use the following field **File Name**.

#. **File Name** - this value is the consortia-approved identifier for files, and is guaranteed to be a unique identifier encoding details about the file into the name. When downloading files, this will be the name of the file.

#. **Size** - file size in bytes.

#. **md5sum** - md5 of the file content.

#. **Data Category** - this value tells you the file type, for example: Aligned Reads, Unaligned Reads or Variant Calls.

#. **File Format** - the format of the file (bam, fastq.gz etc).

#. **Sample Name** - SMaHT approved identifier of the sample from which this file was generated.

#. **Sample Studies** - studies associated with this file, for example Benchmarking or Production.

#. **Sample Tissues** - tissues used to generate this file, if applicable. For example, this field will be populated for tissue based analysis and empty for cell lines.

#. **Sample Donors** - similar to above, the donors from which the above tissues were generated from, again empty for cell lines.

#. **Sample Source** - Submitter provided sample IDs identifying the sample source. If the file is a result of a mixture, there may be multiple sample sources.

#. **Analytes** - Analytes used for analysis, typically one of RNA or DNA.

#. **Sequencer** - name of the sequencer used to generate this file upstream, for example ``PacBio Revio``.

#. **Assay** - experimental assay used to generate this file, for example ``WGS, PCR Free``.

#. **Software Name/Version** - name and version of software used to generate this file, for example ``pbmm2 (1.13.0)``.

#. **Reference Genome** - name of the reference genome used for the analysis, for example ``GRCh38 [GCA_000001405.15]``.

#. **File Merge Group** - this is a special field with a dedicated section below. This value helps identify groups of ``bam`` files that are candidates for merging together for further analysis.


----------------
File Merge Group
----------------

The ``File Merge Group`` field is a special field that attempts to provide a unified tag on bam files to indicate whether certain files are candidates for merge. It is important to note that just because two files share the same value, *it does not guarantee that they can be merged*. Further manual intervention is needed to ensure the files are compatible. The idea though is to reduce the set of files in need of checking to a more manageable number.

Structurally, the ``File Merge Group`` combines several pieces of information, including:

* The center that submitted the file
* Aggregated sample source information
* Aggregated sequencing information
* Aggregated assay information

The below example highlights the various parts.

``bcm_gcc-WASHU_CELL-CULTURE-MIXTURE_SMAHT_CORIELL_POOL1-pacbio_revio_hifi-Single-end-17500-no-flow-cell-bulk_wgs_pcr_free``

* Submission Center Part = ``bcm_gcc``, indicating this file is a result of analysis done by the GCC from BCM.
* Sample Source part = ``WASHU_CELL-CULTURE-MIXTURE_SMAHT_CORIELL_POOL1``, indicating this file was generated from this sample source.
* Sequencing Part = ``pacbio_revio_hifi-Single-end-17500-no-flow-cell``, indicating this file was generated from a PacBio Revio sequencer with target read length 17500 and no flow cell information.
* Assay Part = ``bulk_wgs_pcr_free``, indicates the identifier for the assay used for the analysis.

When the ``File Merge Group`` column matches in the ``manifest`` file, this is considered a candidate match and the user should verify the various parts to ensure the files can actually be merged. *Please note this functionality is experimental and subject to change. If you encounter issues with this functionality, please report it to DAC!*
