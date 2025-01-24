============
smaht-portal
============


----------
Change Log
----------

0.129.0
======
`PR 323 SN Ontology terms <https://github.com/smaht-dac/smaht-portal/pull/323>`_

* Update properties for OntologyTerm item to be implemented with Tissue `uberon_id`

0.128.0
=======
`PR 322: QC metrics visualization <https://github.com/smaht-dac/smaht-portal/pull/322>`_

* Add QC metrics visualization


0.127.1
=======
Hotfixes for browse view
* Remove reference to `reference_genome` from File schema https://github.com/smaht-dac/smaht-portal/pull/320
* Remove `reference_genome` embed from UnalignedReads/Reference File https://github.com/smaht-dac/smaht-portal/pull/321


0.127.0
=======
`PR 305: BM Browse View <https://github.com/smaht-dac/smaht-portal/pull/305>`_

* Implements UI of browse view + generalization of benchmarking layout
* Rework navbar to include new structure
* Adjustments to home page to include only two tiers
* Slight schema edits for facets and columns
* Update to SPC version 0.1.92


0.126.1
=======
`PR 313 SN Reference file columns <https://github.com/smaht-dac/smaht-portal/pull/313>`_

* Add `title` and `version` to columns for ReferenceFile
* Minor fix: remove Basecalling from the automated spreadsheet script


0.126.0
=======
`PR246: feat: homepage updates <https://github.com/smaht-dac/smaht-portal/pull/246>`_

* Implement new announcements panel on homepage
* Resize homepage layout for larger screens


0.125.0
=======

* 2024-11-20/dmichaels - branch: dmichaels-20241119-browse-view (PR-295)

* Added module browse.py for /browse; adapted from fourfront/.../search.py/browse.
  This is for ticket: https://hms-dbmi.atlassian.net/browse/C4-1184

* New endpoint /recent_files_summary which, by default, returns info for files released
  within the past three months grouped by release-date, cell-line or donor, and 
  file-description. The specific fields used for these groupings are:
  - release-date: file_status_tracking.released
  - cell-line: file_sets.libraries.analytes.samples.sample_sources.cell_line.code
  - donor: donors.display_title
  - file-dsecription: release_tracker_description
  Note that release_tracker_description is a newer (2024-12) calcprop (PR-298/sn_file_release_tracker);
  and included in this branch are these files from the branch sn_file_release_tracker:
  - src/encoded/item_utils/file.py
  - src/encoded/types/file.py
  Added these new modules to support this new endpoint:
  - src/encoded/endpoints/recent_files_summary/recent_files_summary.py
  - src/encoded/endpoints/recent_files_summary/recent_files_summary_fields.py
  - src/encoded/endpoints/recent_files_summary/recent_files_summary_troubleshooting.py (functionally unnecessary)
  - src/encoded/endpoints/elasticsearch_utils.py (maybe move to dcicutils eventually)
  - src/encoded/endpoints/endpoint_utils.py (maybe move to dcicutils eventually)
  This is for ticket: https://hms-dbmi.atlassian.net/browse/C4-1192
  - FYI commit before recent (2025-01-13) change for additional tissue info: bf7ed2bcb9df387721fd329e36e8c15b97a43681


0.124.2
=======
`Increase limit of SampleSources retrieved for SubmissionStatus page <https://github.com/smaht-dac/smaht-portal/pull/315>`_

* Increase limit of SampleSources retrieved for SubmissionStatus page select to 300


0.124.1
=======
`PR 297: BM Register Text Fix <https://github.com/smaht-dac/smaht-portal/pull/297>`_

* Update text in UserRegistrationModal to not refer to 2023 data release


0.124.0
=======
`PR 311 SN Move donor properties <https://github.com/smaht-dac/smaht-portal/pull/311>`_

* For protection of potentially identifiable information, move properties `height`, `weight`, and `body_mass_index` to MedicalHistory. These will later be removed from Donor
* Move `hardy_scale` to Donor, as this can be public information. Later will be removed from DeathCircumstances


0.123.0
=======
`PR 310 SN Add liquid category <https://github.com/smaht-dac/smaht-portal/pull/310>`_

* Add "Liquid" to `category` for TissueSample, to be used to liquid tissue and cell culture samples
* Adjust `FileSet.file_group` and `commands/create_annotated_filename.py` to reflect this change


0.122.0
=======
`PR 277 DSA Release <https://github.com/smaht-dac/smaht-portal/pull/277>`_

* In `commands/release-file.py` and `commands/create-annotated-filenames.py`:
  * Assay and sequencer codes value set to XX for DSA fasta files and chain files
  * For Supplementary Files, use `haplotype`, `target_assembly`, and `source_assembly` properties to create annotated filenames for chain and fasta files


0.121.0
=======
`PR 300 SN Remove basecalling <https://github.com/smaht-dac/smaht-portal/pull/300>`_

* Remove Basecalling item and transfer properties to Software item


0.120.0
=======
`PR 306 SN Add cell_sorting_method <https://github.com/smaht-dac/smaht-portal/pull/306>`_

* Add property `cell_sorting_method` to AnalytePreparation


0.119.0
=======
`PR 304 SN remove recovery_datetime from tissue <https://github.com/smaht-dac/smaht-portal/pull/304>`_

* Remove `recovery_datetime` from Tissue after having moved the property to TissueCollection, as it is protected information


0.118.0
=======
`PR 303 SN Rnaseq filenames <https://github.com/smaht-dac/smaht-portal/pull/303>`_

* Make `annotation` link in OutputFile an array of links to ReferenceFile
* Add `code` property to ReferenceFile


0.117.1
=======
`PR 284: Bm nomenclature page3 <https://github.com/smaht-dac/smaht-portal/pull/284>`_

* Rework various tables to match the new version of the documentation
* Add newest version of the pdf document to the page


0.117.0
=======
`PR 298 SN File release tracker <https://github.com/smaht-dac/smaht-portal/pull/298>`_

* Add calcprop to file returning concatenated string of `file_sets.libraries.assays.display_title`, `file_sets.sequencing.sequencer.display_title`, and `file_format.display_title`
* If there are multiple values for assay or sequencer, return an empty string

0.116.0
=======
`PR 299 SN RNA-seq filenames <https://github.com/smaht-dac/smaht-portal/pull/299>`_

* Create new item GeneAnnotation that OutputFile and SupplementaryFile link to with property `gene_annotation`
* Update `commands/create_annotated_filenames.py` to include gencode version and gene/isoform information for RSEM tsv output files and RNA-seq aligned bams


0.115.1
=======
`PR 302 SN fix sequencing validator <https://github.com/smaht-dac/smaht-portal/pull/302>`_

* Adds `on_target_rate` to sequencing validator in FileSet for DNA libraries


0.115.0
=======
`PR 296 SN Sequencing validation <https://github.com/smaht-dac/smaht-portal/pull/296>`_

* Add custom validator to FileSet to ensure that `sequencing.target_coverage` is present if `libraries.analytes.molecule` contains "DNA" and `sequencing.target_read_count` is present if `libraries.analytes.molecule` contains "RNA"
* Refactor custom validators
* Specify molecule type in `submitted_ids` for workbook-inserts to keep track across tests


0.114.1
=======
`PR 301 SN Add enum to extraction method <https://github.com/smaht-dac/smaht-portal/pull/301>`_

* Add "Mechanical Dissociation" as an enum for `extraction_method` in AnalytePreparation


0.114.0
=======
`PR 288 SN comparators description <https://github.com/smaht-dac/smaht-portal/pull/288>`_

* Add property `comparator_description` to Variant Calls that is required if `mode` is "Paired"


0.113.1
=======
`PR 294 BM Truth Set <https://github.com/smaht-dac/smaht-portal/pull/294>`_

* Add "coming soon" tabs for HapMap and iPSC truth sets
* Comment out URLs for real search tables for future use, once data is ready


0.113.0
=======
`PR 282 New Cypress Tests <https://github.com/smaht-dac/smaht-portal/pull/282>`_

* Upgrade: Cypress v10 to v13
* Add new cypress tests
  - Authentication & Basic Functionality
  - Home Page Tests
  - User Impersonation
  - Documentation Page
  - Search View Tests
  - Post-Deployment Validation
  - Statistics Page
  - Benchmarking Page
  - About Page
* Cypress Commands: Introduced commands for testing across environments (data, local, staging, etc.).


0.112.3
=======
* 2024-11-08/dmichaels
* Updated some demo_inserts data files to make them more consistent with what is in production;
  i.e. e.g. some of the submission-center uuids here were in conflict with production which
  impedes local development when exporting from production and importing locally.
* Added /debug_user_principals endpoint for debugging/troubleshooting/undestanding only;
  this will simply return the list of principals for the calling user.
* Updated dcicutils to latest version (8.16.4).


0.112.2
=======
`PR 293 SN extraction enum <https://github.com/smaht-dac/smaht-portal/pull/293>`_

* Add enum "Density Gradient Centrifugation" to `extraction_method` in AnalytePreparation
* Update description for `homogenization_method`


0.112.1
=======
`PR 292 SN dataset enums<https://github.com/smaht-dac/smaht-portal/pull/292>`_

* Add `hapmap_snv_indel_challenge_data` and `ipsc_snv_indel_challenge_data` to dataset enums list


0.112.0
=======
`PR 287 SN Override Coverage <https://github.com/smaht-dac/smaht-portal/pull/287>`_

* Add property to file, `override_group_coverage` that displays in `data_generation_summary` calculated property for the File Overview page, which takes precedence  over `file_set.sequencing.target_coverage` if set


0.111.0
=======
`PR 291 SN recovery_datetime <https://github.com/smaht-dac/smaht-portal/pull/291>`_

* Add `recovery_datetime` to Tissue Collection, to then remove this property from Tissue, as this can be considered identifying information


0.110.1
======
`PR259: fix: target coverage and read count <https://github.com/smaht-dac/smaht-portal/pull/259>`_

* Show total target coverage for aligned wgs, fiber-seq, or hi-c bam
* Show target read count for rna-seq and mas-iso-seq
* Show N/A where unavailable


0.110.0
=======

* 2024-11-04/dmichaels
* Fix for unexpected-sid validation-error (snovault 11.23.0).
* Updated rsa library version (4.9) from vulnerability scan alerts for CVE-2020-13757).
* Updated idna library version (3.10) (from vulnerability scan alerts for CVE-2024-3651).
* Fix in download_cli to check for dbgap group user exactly like the download endpoint.


0.109.0
=======

`PR 280 SN Assay info <https://github.com/smaht-dac/smaht-portal/pull/280>`_
* Add `amplification_method`, `cell_isolation_method`, and `molecule_specificity` properties to Assay

0.108.0
=======
`PR 279: BM Create Account Doc <https://github.com/smaht-dac/smaht-portal/pull/279>`_

* Rework create account documentation to be clearer.
* Add some new styling to support various versions of RST admonitions
* Remove variant_type column and facet.
* Rename data_type column.


0.107.5
=======
`PR 283: SN Ploidy fix <https://github.com/smaht-dac/smaht-portal/pull/283>`_

* Re-add `ploidy` property to DonorSpecificAssembly

0.107.4
=======
`PR 271: SN Links to Existing Data <https://github.com/smaht-dac/smaht-portal/pull/271>`_

* Update text descriptions and add images for Links to Existing Data page


0.107.3
=======
`PR 274: chore: add new TEnCATS assay to table <https://github.com/smaht-dac/smaht-portal/pull/274>`_

* Update assay table with new TEnCATS assay


0.107.2
=======

`PR 265: Bm links to existing data <https://github.com/smaht-dac/smaht-portal/pull/265>`_

* Add two new links for SupplementaryFile and DonorSpecificAssembly items


0.107.1
=======

`PR 281: Access table button and table styles <https://github.com/smaht-dac/smaht-portal/pull/281>`_

* Bug fix: Make link buttons not underlined and access keys table reponsive for small and mid-size screens


0.107.0
=======

`PR 235: Sn ExternalQualityMetric submission template <https://github.com/smaht-dac/smaht-portal/pull/235>`_

* In `commands/write_submission_spreadsheets.py`:
  
  * Add `--eqm [dsa duplexseq]` argument that grabs `tooltip`, `key`, and `derived_from` from the appropriate `ExternalQualityMetric` template and writes out to a new tab in the spreadsheet

* Remove properties from DonorSpecificAssembly that are now on ExternalQualityMetric


0.106.0
=======

`PR 263: React bootstrap v2, React 18, Redux and Misc. Npm Packages Upgrade <https://github.com/smaht-dac/smaht-portal/pull/263>`_

* Upgrade: React v17 to v18
* Upgrade: Redux v4 to v5 (there are breaking changes in store and dispatchers. SPC is updated to support both new and legacy usage)
* Upgrade: auth0-Lock v11 to v12
* Upgrade: gulp.js v4 to v5
* Upgrade: react-workflow-viz (animation updates to eliminate findDOMNode errors)
* Fix: User Content updates to fix markdown, jsx, and HTML static section rendering
* Upgrade: Bootstrap v5
* Upgrade: React-Bootstrap v2
* Upgrade: FontAwesome v6


0.105.0
=====

`PR 266: Node v20 Upgrade <https://github.com/smaht-dac/smaht-portal/pull/266>`_

* Node 18 to 20 upgrade including GitHub actions


0.104.2
=======

`PR 276: Updates for Statistics Legend Section & Mobile UI <https://github.com/smaht-dac/smaht-portal/pull/276>`_

* Adjust legend's items size for sm to xl displays
* Truncate long text for dropdown text for lg and md displays
* Fix toggle display for upcoming xxl displays upon react-bootstrap v2 upgrade


0.104.1
=======

`PR 272: SN Enzymes optional <https://github.com/smaht-dac/smaht-portal/pull/272>`_

* Make property `enzymes` in LibraryPreparation optional if `fragmentation_method` does not contain "Transposase" or "Restriction Enzyme", otherwise required


0.104.0
=======

* 2024-10-11/dmichaels
* Updated dcicutils version (8.16.1) for vulnerabilities.


0.103.0
=======

`PR 273: GA4 & Usage Statistics Follow-up <https://github.com/smaht-dac/smaht-portal/pull/273>`_

* New/Updated charts:

  * File downloads
  * Top file set downloads by file type - file format
  * File detail views by file type - file format
  * File search result appearances by file type - file format
  * File search result clicks by file type - file format
  * Metadata.tsv included file counts by location

* New options:

  * 6-12-18 months and All date interval options added
  * Toggle for charts



0.102.2
=======

`PR 224: feat: error state for homepage timeline <https://github.com/smaht-dac/smaht-portal/pull/224>`_

* Implement error state for homepage timeline


0.102.1
=======
* Bugfix on Submission Status page. Could not set tags from Review File Group Qc modal when there were no tags present


0.102.0
=======
`PR267: SN Add target_read_count <https://github.com/smaht-dac/smaht-portal/pull/267>`_

* Add `target_read_count` to File `data_generation_summary`


0.101.0
=======
* Added scripts/opensearch-dashboard-start.bash and Makefile target opensearch-dashboard-starto
  now that we are using OpenSearch rather than ElasticSearch we seem to need this rather than Kibana.
* Simplified Makefile for deploy1/1a/1b/2 for dcicsnovault 11.21.1 changes;
  related to allowing smaht-portal and cgap-portal to run at the same time locally.
* Added /files/upload_file_size endpoint (types/file.py); for use by smaht-submitr to determine if a file to
  upload has already been uploaded; and get its size as a side-effect; returns HTTP 200 if found otherwise 404);
  in particular we want to check if it has been uploaded but is still marked as 'uploading' because its md5 is
  still in the process of being computed (i.e. otherwise we could simply look at the file status an be done with it).
* New protection of /ingestion-status endpoint used by smaht-submitr (in ingestion/ingestion_status.py) for
  authenticated users only; and also limit /ingestion-status/{keys,keys_sorted,flush} to admin users only.


0.100.1
=======
`PR268: SN Validator Fix <https://github.com/smaht-dac/smaht-portal/pull/268>`_

* Add decorator link_related_validator to edit validators as well as add


0.100.0
=======
`PR260: SN Add assay and vcf properties <https://github.com/smaht-dac/smaht-portal/pull/260>`_

* Add property 'category' to Assay
* Add property `mode` to VariantCalls
* Fix `age` maximum to 89 for Donor
* Add property `rna_seq_protocol` to LibraryPreparation and adjust enums for `insert_selection_method`


0.99.3
======
`PR 231: Bm file overview updates <https://github.com/smaht-dac/smaht-portal/pull/231>`_

* Change warning banner on COLO829
* Improve status indicators to File Overview Page
* Add support for tsv notes
* Ajax in related files to display status indicator warning for files with obsolete & retracted statuses and available notes


0.99.2
======
`PR 242: BM colo829 truth set <https://github.com/smaht-dac/smaht-portal/pull/242>`_

* Add COLO829 Truth Set Tab to benchmarking page
* Add a way to change facets and columns from BenchmarkingDataMap


0.99.1
======
`PR264: SN remove tissue from cell culture  <https://github.com/smaht-dac/smaht-portal/pull/264>`_
* Remove tissue link from CellCulture as part of switch to TissueSample link


0.99.0
======
`PR261: Bring QC information to the Submission Status page <https://github.com/smaht-dac/smaht-portal/pull/261>`_
* New version of Submission Status page


0.98.0
======
`PR256: SN Write automated example <https://github.com/smaht-dac/smaht-portal/pull/256>`_

* In `commands/write_submission_spreadsheets.py`:

  * Add argument `--example` that will pull metadata from a template uuid to fill out an example submission spreadsheet for the current schema


0.97.1
======
`PR257: SN Update DSA calc_prop <https://github.com/smaht-dac/smaht-portal/pull/257>`_

* Change DSA calc prop for non-fasta files `supplementary_files`


0.97.0
======
`PR238: SN Add valid_molecules required <https://github.com/smaht-dac/smaht-portal/pull/238>`_

* Add `valid_molecules` as a required property for Assay


0.96.4
======
`PR 252: feat: add manifest type to button <https://github.com/smaht-dac/smaht-portal/pull/252>`_

* Add manifest type to download manifest button


0.96.3
======
`PR247: feat: add downsampled tab <https://github.com/smaht-dac/smaht-portal/pull/247>`_

* Add downsampled hapmap tab
* Update benchmarking descriptions


0.96.2
======
`PR 258: Usage Stats Updates <https://github.com/smaht-dac/smaht-portal/pull/258>`_

* Adds data table view
* Links to data table view to related tracking-item


0.96.1
======
`PR 253: SN file_group update <https://github.com/smaht-dac/smaht-portal/pull/253>`_

* Add to `file_group` calc_prop to accommodate FileSets with multiple samples

  * If samples are homogenate tissue samples, `sample_source` is the Tissue
  * If samples are cell culture samples, `sample_source` is the CellCulture
  * If samples are intact tissue samples, `sample_source` is TissueSample (not mergeable)


0.96.0
======
`PR255: SN Add on_target_rate <https://github.com/smaht-dac/smaht-portal/pull/255>`_

* Add property `on_target_rate` to Sequencing that is included in the `anyOf` with `target_coverage` and `target_read_count`


0.95.1
======
`PR 254: Bm doc tweaks <https://github.com/smaht-dac/smaht-portal/pull/254>`_

* Update links to go to newest documentation
* Add a tip with a warning about submissions


0.95.0
======
`PR 215: Bm genome reference <https://github.com/smaht-dac/smaht-portal/pull/215>`_

* Add "Resources" to navigation
* Add "Genome Reference & Related Data" page


0.94.0
======
`PR251: SN Donor schema update <https://github.com/smaht-dac/smaht-portal/pull/251>`_

* Add property `tpc_submitted` for whether or not the donor was submitted by the TPC
* Include a maximum value of 90 for `age` to remove identifiable information


0.93.2
======
`PR 240: fix: SN TPC samples annotated_filenames <https://github.com/smaht-dac/smaht-portal/pull/240>`_

* In `commands/create_annotated_filename.py`:

  * Grab unique `aliquot_ids` so that files with tissue samples from TPC are not considered to have merged aliquots e.g. file has identical samples `ST001-1A-001A1` from GCC and `ST001-1A-001A1` from TPC. The TPC item is used for metadata cross-checking, and shouldn't be considered when checking if samples were merged for analyte extraction.


0.93.1
======
`PR249: SN Revert FileSet calcprop <https://github.com/smaht-dac/smaht-portal/pull/249>`_

* Revert PR 244, removing `files_status_retracted` calc_prop from FileSet


0.93.0
======
* Effectively disable server-side validators which reference
  linked objects for smaht-submitr, when the skip_links=True.


0.92.0
======
`PR244: SN FileSet calcprop <https://github.com/smaht-dac/smaht-portal/pull/244>`_

* Create calcprop for FileSet, `files_status_retracted`, that returns "True" if a file in files has the status of `obsolete` or `retracted`
* Embed `file_set.files_status_retracted` in File


0.91.0
======
`PR234: SN Cell Line links <https://github.com/smaht-dac/smaht-portal/pull/234>`_

* Allow `CellLine` to link to itself with `parent_cell_lines`
* Allow `CellLine` to link to `TissueSample` (`Sample`) with `tissue_samples`
* Allow `CellCulture` to link to `TissueSample`. Keeping `Tissue` link for now, to remove later.
* Add a calculated property to `CellLine`, `source_donor`, that gets the donor information, if present, from `donor`, `tissue_samples`, or `parent_cell_lines`


0.90.2
======
`PR 245: SN Make antibody an array <https://github.com/smaht-dac/smaht-portal/pull/245>`_
* In Library, make `antibody` and array of strings
* Small fix to submission template delimiter description


0.90.1
======

* Add operator `is_type` to QC thresholds schema


0.90.0
======
`PR241: SN Add properties to library <https://github.com/smaht-dac/smaht-portal/pull/241>`_

* Add properties `dna_target`, `guide_sequence`, and `antibody` to Library schema
* Change property `restriction_enzymes` to `enzymes` in LibraryPreparation (recently added property so it is empty in the portal) to apply for transposase enzymes as well and update associated tests.


0.89.3
======
`PR239: Add mei_detection_challenge_data enum ot dataset <https://github.com/smaht-dac/smaht-portal/pull/239>`_

* Add `mei_detection_challenge_data` enum to `dataset`


0.89.2
======

* Update manifest to prioritize `filename` over `display_title`


0.89.1
======

`PR222: feat: add dataset target coverage row <https://github.com/smaht-dac/smaht-portal/pull/222>`_
* Add dataset target coverage row to File Overview's Data Information card


0.89.0
======

`PR 232: SN RE property <https://github.com/smaht-dac/smaht-portal/pull/232>`_
* Add a property `restriction_enzymes` to `LibraryPreparation`
* Add columns to `SubmissionCenter` search page for `identifier` and `code`
* Add `description` property to `VariantCalls`


0.88.0
======

* Add new section to Data nav for challenge results
* Add COLO829 SNV/Indel V1 Challenge Page + tables

0.87.0
======

`PR 219: SN Metadata Custom Validators<https://github.com/smaht-dac/smaht-portal/pull/219>`_

* Add custom validators for metadata audit checks with tests for POST and PATCH:
  * Update `assay.json``` schema to include properties `valid_molecules` and `valid_sequencers` to assist in validation. Will need to patch current assay items for this to function
  * In `FileSet`, check that the combination of `libraries.analytes.assay` and `sequencing.sequencer` are compatible
  * In `Library`, check that assay-specific properties are compatible with the linked assay (e.g. `bulk_mas_iso_seq` and `target_monomer_size`)
  * In `Library` and `Analyte` , check that `molecule` is compatible with molecule-specific properties
  * In `UnalignedReads`, check that `paired_with` is only present for R2 files and that the linked file is R1. Also check the the R1 and R2 files are linked to the same `FileSet`
  * Add more specific error messages to help with submission


0.86.0
======

`PR 230: SN Update annotated_filenames <https://github.com/smaht-dac/smaht-portal/pull/230>`_

* In `commands/create_annotated_filenames.py`:
  * For annotated filenames, update `aliquot_id` to be `[aliquot_id]MC` if multiple benchmarking or production tissue samples from the same tissue aliquot but multiple cores (e.g. ST001-1A-001A1 and ST001-1A-001B2) and` MAMC` if from multiple tissue samples from different tissue aliquots
  * Remove the variant type from the end of annotated filenames for vcfs
* In `commands/write_submission_spreadsheets.py`
  * Add notes for properties that allow commas for large numbers and allow abbreviations (e.g. 100M or 3.1 Gb)
* In `schemas/file.json`
  * Add a `version` property for front-end


0.85.1
======

* Update to `file_group` to evaluate homogenate samples as if they are cell lines (using `sample_source`)


0.85.0
======
`PR 225: SN Improvements to automated submission spreadsheet <https://github.com/smaht-dac/smaht-portal/pull/226>`_

* In `write-submission-spreadsheet`:
  * clean up args messages
  * Add functionality for` --item` working with `--google`
  * Adjust comment descriptions to clarify | delimiter and add search links for submitted items
* In `schemas/`:
  * Include schema description for GCC-submitted items


0.84.0
======
`PR 229`: SN Cell Culture upgrade `<https://github.com/smaht-dac/smaht-portal/pull/229>`_

* Change `CellCulture.cell_line` property to be an array of strings linking to `CellLine`, rather than a string.
  * Adds an upgrader with test for `cell_culture`


0.83.1
======

* Updates `file_group` calcprop to properly resolve analyte.samples only when computing the `sample_source_part`


0.83.0
======
`PR226: SN Add tissue link to cell_culture <https://github.com/smaht-dac/smaht-portal/pull/226>`_
* Add `parent_samples` link in `cell_culture_sample.json`
* Add `tissue` link in `cell_culture.json`
* Make `anyOf` for requiring `cell_line` and/or `tissue`


0.82.1
======

`PR 207: feat: about page visualization updates <https://github.com/smaht-dac/smaht-portal/pull/207>`_

* Reorganize Awardees Visualizations
* Provide links to individual PI's labs
* Reformat/reword copy


0.82.0
======

* Added validators endpoint to validate (initially) submitted_id for smaht-submitr.
* Added allow_multiplier_suffix and allow_commas properties (both true) to these schemas properties:
  - Sequencing.target_read_length
  - DonorSpecificAssembly.contig_n50
  - DonorSpecificAssembly.genome_size
  - DonorSpecificAssembly.largest_contig_size
  - DonorSpecificAssembly.scaffold_n50
  - DonorSpecificAssembly.total_ungapped_length


0.81.0
======

`PR 209: Statistics Y-Axis Scale <https://github.com/smaht-dac/smaht-portal/pull/209>`_

* Usage stats: Add y-axis linear/pow/log scale options
* Usage stats: Split file downlods into two sections as file downloads and top file downloads (/w top 10/25/50/100 options) for clarity
* Usage stats: Exclude index file downloads (external_files)
* Submission stats: Fix custom date range filtering bug
* Misc: Improve charts and filters rendering in small and mid-size devices
* Misc: Improves warning messages displayed when the charts fail to render


0.80.0
======
`PR216: Add ExternalQualityMetric <https://github.com/smaht-dac/smaht-portal/pull/216>`_

* Add `ExternalQualityMetric` item type which is a submitted item inheriting some properties from pre-existing `QualityMetric`
* Create new linking property `external_quality_metrics` in `file.json`
* Add new properties to `variant_calls.json` schema: `comparator`, `external_databases`, and `filtering_methods`


0.79.0
======
`PR221: Include target_coverage in file data_generation_summary <https://github.com/smaht-dac/smaht-portal/pull/221>`_

* Embed `file_sets.sequencing.target_coverage`` in file.py and adds "Target Group Coverage" to `data_generation_summary`` used in the File Overview Page


0.78.5
======

`PR 220: fix: move modal styles into search.scss <https://github.com/smaht-dac/smaht-portal/pull/220>`_

* fix: styling issue in File Overview metadata download modal
* Move modal styles into _search.scss file


0.78.4
======

`PR 218: fix: typerror in ItemDetailList's ShouldUseTable <https://github.com/smaht-dac/smaht-portal/pull/218>`_

* fix: typerror, support number value being first


0.78.3
======

`PR 213: Bm homepage drawer update <https://github.com/smaht-dac/smaht-portal/pull/213>`_

* Change defaultActiveKey and activeKey settings to get different home page drawer-tiers to stay open once selected


0.78.2
======

`PR 208: feat: AWS CLI command <https://github.com/smaht-dac/smaht-portal/pull/208>`_

* Reorganize CLI commands components
* Utilize bootstrap Tabs component
* Styling updates for the command container


0.78.1
======

* Disable tagging and commenting functionality for non-admins on Submission Status page


0.78.0
======
`PR212: Add functionality for arrays of objects <https://github.com/smaht-dac/smaht-portal/pull/212>`_

* Updates write_submission_spreadsheets to write out columns for arrays of objects
* Currently relevant for CellCultureMixture and the components property which has two nested properties, `ratio` and `cull_culture`


0.77.0
======

`PR210: DSA Schema Update <https://github.com/smaht-dac/smaht-portal/pull/210>`_

* Changes to DonorSpecificAssembly and SupplementaryFile schemas to reflect GCC feedback:
  * BUSCO score properties created for each haplotype  (e.g. `percent_single_copy` to `percent_single_copy_hap1` and `percent_single_copy_hap2`)
  * Change property name from `percent_duplicate` to `percent_multi_copy` for clarity
  * Change property name from `largest_contig` to `largest_contig_size` for clartiy
  * Change enums for `data_type` and `data_category` specific to SupplementaryFile fasta and chain files
  * Fix descriptions of some properties


0.76.2
======

* Remove Doug user


0.76.1
======

`PR 195: fix: tablet navigation collapse <https://github.com/smaht-dac/smaht-portal/pull/195>`_

* Fix collapsing navigation bar for tablet size screens
* Switch to mobile navigation component early
* Show initials for username in tablet screen size
* Fix mobile styling bugs


0.76.0
======

* Minor documentation updates for how to install awscli in docs/source/{file_download,download_cli}.rst.
* Update to dcicutils 8.13.3.


0.75.0
======

* Bug fix: consider loadxl order in staggered reindexing
* Add ``retracted`` status to Files with submission center only view


0.74.1
======

`PR 188: feat: increase benchmarking table visibility <https://github.com/smaht-dac/smaht-portal/pull/188>`_

* Increase height of benchmarking tables
* Support toggling the benchmarking page descriptions
* Upgrade SPC to v0.1.86


0.74.0
======
`PR 205: Update submission schema from TPC and GCC feedback <https://github.com/smaht-dac/smaht-portal/pull/205>`_

* Adds two arguments to `write-submission-spreadsheets` that create submission_workbook templates with a subset of ordered tabs consistent with the submission templates shared with TPCs and GCCs/TDDs.
  * `--tpc` outputs tabs for the TPC submission
  * `--gcc` outputs tabs for the GCC/TDD submissions


0.73.0
=======
`PR 206: SN Remove tissue recovery_interval  <https://github.com/smaht-dac/smaht-portal/pull/206>`_

* Removes `recovery_interval` property from Tissue schema
* Includes upgrader for tissue schema from version 2 to 3 with test
* All existing `recovery_interval` values for Tissue items have already been transferred to TissueCollection items linked to Donor


0.72.0
======

`PR 204: Update submission schema from TPC and GCC feedback <https://github.com/smaht-dac/smaht-portal/pull/204>`_

* For MedicalHistory, change `enum` from "Not done" to "Not Done" for consistency


0.71.1
======

`PR 198: Bm accessibility font fix <https://github.com/smaht-dac/smaht-portal/pull/198>`_

* Convert pixel font sizes to use rem


0.71.0
======

`PR 189: Update submission schema from TPC and GCC feedback <https://github.com/smaht-dac/smaht-portal/pull/189>`_

* Create DonorSpecificAssembly item type that contains information and QC metrics, and links to FileSet and Software used to generate the assembly.
* Create a submittable SupplementaryFile that can contain files as reference fasta and chain files. These can link to DSA.
* Add notes_to_tsv property to file.json schema for including static banners for notes on file pages.
* Add test for DonorSpecificAssembly rev_links


0.70.0
======

`PR 200: SN TPC Schema update <https://github.com/smaht-dac/smaht-portal/pull/200>`_

* Follow-up changes to the TPC submission schema:
* Add `preservation_type` and `preservation_medium` properties to Tissue.
* Make `preservation_type` an enum for Tissue and Sample
* Make `core_size` a string enum
* Add `size_unit` to Tissue to account for tissues measured in cm^2 instead of cm^3


0.69.1
======
* Update ``/homepage`` to include counts for benchmarking tissues
* Update ``file_group`` calcprop to account for tissue data


0.69.0
======
* Documentation for smaht-submitr binary (pyinstaller-based) installation.
* Updates related to Python 3.12.
* New (and commented out by default) elasticsearch.server.actual_port property in base.ini
  to facilitate running a local ElasticSearch proxy to observe traffic (resquests/responses)
  between the portal and ElasticSearch with a tool like mitmproxy or mitmweb; see comments
  in base.ini; and see in snovault/dev_server for where this is handled.


0.68.5
======

* Quick fix to hide validation errors facet


0.68.4
======

*  Update /homepage to include counts for benchmarking tissues

`PR 196: Bm primary tissue fixes <https://github.com/smaht-dac/smaht-portal/pull/196>`_

* Hide unexpected facets
* Fix tab title counts
* Fix for home page link to primary/benchmarking tissue page


0.68.3
======

`PR 194: Fix constants casing <https://github.com/smaht-dac/smaht-portal/pull/194>`_

* Fix `access_status` enum options case in `item_utils`


0.68.2
======

`PR 190: Bm primary tissue ui 2 <https://github.com/smaht-dac/smaht-portal/pull/190>`_

* Add brain table for donors 3 & 4
* Remaining update to use `dataset=tissue`


0.68.1
======

`PR 192: fix: include missing TPC and GCC in awardees table <https://github.com/smaht-dac/smaht-portal/pull/192>`_

* Fix missing consortium entries in the awardees table


0.68.0
======

`PR 193: Add routes endpoint <https://github.com/smaht-dac/smaht-portal/pull/193>`_

* Add `/routes` endpoint to return all available routes


0.67.0
======

`PR 187: Update file naming and release commands <https://github.com/smaht-dac/smaht-portal/pull/187>`_

* Refactor and improve commands `release_file` and `create_annotated_filenames`
  * Add test coverage, especially for annotated filenames
  * Add to `item_utils` and use extensively in commands
  * Fix command names in pyproject.toml
  * Update commands for tissue data
* Add `tissue` to `dataset` enum for benchmarking files + update benchmarking searches


0.66.0
======

`PR 184: Update submission schema from TPC and GCC feedback <https://github.com/smaht-dac/smaht-portal/pull/184>`_

* Remove SamplePreparation item and merges the property homogenization_method with AnalytePreparation
* Add properties to Analyte based on GCC Benchmarking Extraction input
* Change to properties of Library based on GCC feedback
* Include more detailed descriptions and examples of some fields that are technology-specific (i.e. Kinnex)
* Minor change to TCC submission schema related to units and changing enums to suggested enums
* Update documentation for setting up Google Sheet API credentials for automated submission templates


0.65.3
======

`PR 186: Bm primary tissue ui <https://github.com/smaht-dac/smaht-portal/pull/186>`_

* Enable benchmarking tables for Donor 1 and Donor 2 primary tissues
* Fix bug with Donor 2 data table


0.65.2
======

`PR 185: Bm link fix <https://github.com/smaht-dac/smaht-portal/pull/185>`_

* Move "credentials for submission" to Access and rename it to "access key generation"
* Set up an additional re-direct, update old redirect


0.65.1
======

`PR 182: Bm nomenclature fix jun2024 <https://github.com/smaht-dac/smaht-portal/pull/182>`_

* Update PDF with brain and change version
* Update RST file with brain

0.65.0
======

* Adds a new API /download_cli that accepts a resource path as a URL or POST param and returns federation token for use with `awscli`
* Updates /metadata to allow download_cli links


0.64.0
======

`PR 181: Submission and Usage Statistics Follow-up Updates  <https://github.com/smaht-dac/smaht-portal/pull/181>`_

* Filtering
  * Previous 60 days added to date range options
  * Cumulative sum checkbox added to switch between individual bars and cumulative sum
* File downloads
  * File downloads splitted into two charts (count and volume)
  * Assay Type and Dataset views added
* File views
  * Assay Type and Dataset views added
* Page Views
  * Page views, Uniqe users by country/city views added
  * Page title and URL views added
* Schema and Style
  * `tracking_item`` schema fields that are still mapped to Universal Analytics naming convention are renamed/replaced
  * glitches in mobile view fixed


0.63.0
======

`PR 169: Submission Templates <https://github.com/smaht-dac/smaht-portal/pull/169>`_

* Add new command `write-submission-spreadsheets` to generate submission spreadsheets (Excel or Google sheets) for submittable items
* Schema updates
  * Update descriptions for many properties with standardized units formatting
  * Misc. updates to TPC-related properties
  * Breaking change: Tissue `location` renamed to `anatomical_location`; upgrader included


0.62.1
======

* Fix minor issue on Submission Status page


0.62.0
======

Submission Status page updates:
* Add filters for CellLine and CellCultureMixture
* Some refactoring of the React component
* Color filesets by file group


0.61.0
======

* Added src/encoded/tests/data/demo_inserts with (well) demo inserts for objects needed
  by the demo metadata spreadsheet (for annual meeting 2024): bcm_formatted_hapmapmix.xlsx ...
  https://docs.google.com/spreadsheets/d/1qCm0bY-vG4a9uiaOvmKHZ12MvhmMKKRfEpgAm-7Hsh4/edit#gid=1472887809
  FYI: To cause these to be loaded at startup when running locally, edit development.ini and
  set load_test_data = snovault.loadxl:load_local_data (rather than the default load_prod_data).
* Updated dcicutils to 8.10.0 (mostly merge support in structured_data).
* Changed workbook-inserts/assay.json bulk_wgs item to code 002 (to match data/staging/wolf).
* Changed workbook-inserts/sequencer.json code from A to X (interfering with demo testing).
* Support merge in ingester for partial object updates from metedata.
  -  Removed ref_lookup_strategy references for structured_data; refactored/internalized in dcicutils.
* Added rclone (Google-to-AWS) related documentation.
* Some make lint fixups.


0.60.2
======

* Ensure ``docutils`` is a true dependency


0.60.1
======

* Add new command ``check-insert-consistency`` to quickly detect errors on live environments related to inconsistencies with ``master-inserts``
* Add new command ``load-data-from-local`` to allow interactive updates from ``master-inserts``


0.60.0
======

`PR 123: File Overview Page <https://github.com/smaht-dac/smaht-portal/pull/123>`_

* Add File Overview Page for improved view of additional details for File items
* Upgrade SPC to v0.1.85


0.59.3
======

`PR 179: Bring in inserts command fix <https://github.com/smaht-dac/smaht-portal/pull/179>`_

* Bring in snovault with fix for help strings for command to update inserts


0.59.2
======

`PR 178: Clean up poetry commands <https://github.com/smaht-dac/smaht-portal/pull/178>`_

* Clean up commands in `pyproject.toml`
  * Remove commands not present in repo
  * Use snovault commands where possible
  * Reorganize commands by source repo


0.59.1
======

`PR 175: Fix command to load inserts <https://github.com/smaht-dac/smaht-portal/pull/175>`_

* Update snovault and use its updated command to load inserts


0.59.0
======

`PR 148: Submission statistics <https://github.com/smaht-dac/smaht-portal/pull/148>`_

* Submission statistics charts for metadata submitted, data submitted and data released files with various group by options


0.58.0
======

`PR 176: Bm benchmarking v3 <https://github.com/smaht-dac/smaht-portal/pull/176>`_

* Add benchmarking tables for primary tissue data, organized by Donor, then Tissue type
* Update navbar and navbar links


0.57.0
======

`PR 173: Multiple analytes per library <https://github.com/smaht-dac/smaht-portal/pull/173>`_

* **Breaking change**: Remove `analyte` from Library and replace with `analytes` array of linkTos
* Includes corresponding changes to `item_utils`, commands, calcprops, embeds, front-end, and tests


0.56.0
======

`PR 171: Bm docs nav update <https://github.com/smaht-dac/smaht-portal/pull/171>`_

* Add a bunch of new inserts to serve as the new links to these various pages
* Rework the old inserts into redirect-only pages, so that people who have bookmarked old links don't lose their place
* Permission and order tweaks for sanity's sake


0.55.0
======

`PR 141: Link FileSets to Samples <https://github.com/smaht-dac/smaht-portal/pull/141>`_

* Add `samples` linkTo to FileSet to track related samples for single-cell data
* Update `item_utils` to handle new linkTo (+ misc. cleanup)


0.54.0
======

`PR 170: Added SN User <https://github.com/smaht-dac/smaht-portal/pull/170>`_

* Added Sarah Nicholson to user.json master-inserts


0.53.0
=======
`PR 168: Update columns/facets <https://github.com/smaht-dac/smaht-portal/pull/168>`_

* Update file columns and facets for benchmarking tables
* Add `released_date` to file calcprop for display in benchmarking tables
* Update Donor, Tissue, and TissueSample columns and facets for searches
* Add Donor and Tissue links from doc page


0.52.4
======

`PR 167: Bm select all fix <https://github.com/smaht-dac/smaht-portal/pull/167>`_

* Load search tables on tab open (instead of all at once on initial page load)
* Cleanup of context and fix for select all button and checkbox bugs
* Enable SPC fix of selected items clearing on filter by passing props to EmbeddedSearchView (spc v0.1.82b1)

0.52.3
======

* Extend release script to handle obsolete files


0.52.2
======

* 2024-05-08/dmichaels/PR-163
* Added option to ingester to skip validation on submit.
  With smaht-submitr/submit-metadata-bundle --validate-remote-skip flag;
  this flag previously only prevented server-side validation from being
  kicked off by submitr, but on actual submit server-side validation
  was still being done before loadxl; this flag now prevents that as well.
  This is hooked on a (submission folio) validate_skip flag; and this is
  ONLY allowed for admin users; if non-admin validate_skip forced to False.


0.52.1
======

`PR 162: Broaden derived_from link <https://github.com/smaht-dac/smaht-portal/pull/162>`_

* Update `derived_from` linkTo from SubmittedFile to File
* Change File `unique_key` to `submitted_id` to allow finding SubmittedFiles by `submitted_id`
* Add `accession` to default lookup field for all collections, i.e. `/<collection>/<accession>/` will work for all collections with accessions


0.52.0
======

`PR 165: Update preparation items <https://github.com/smaht-dac/smaht-portal/pull/165>`_

* Move common preparation links to parent item and share props with all children
* Remove stale properties from preparation items
* Update workbook inserts to reflect changes


0.51.0
======

`PR 164: Add Tissue code for table search <https://github.com/smaht-dac/smaht-portal/pull/164>`_

* Add `code` property to Tissue to be used in benchmarking table search


0.50.0
======

`PR 160: Add N50 prop + in silico data type <https://github.com/smaht-dac/smaht-portal/pull/160>`_

* Add N50 property to UnalignedReads and AlignedReads
* Add in silico enum to File `data_type`


0.49.0
======

`PR 161: feat: file download doc page <https://github.com/smaht-dac/smaht-portal/pull/161>`_

* Add file download doc page


0.48.0
======

`PR 159: feat: colo829 benchmarking page banner <https://github.com/smaht-dac/smaht-portal/pull/159>`_

* Add callout banner for colo829 dataset benchmarking pages


0.47.2
======

* Add `paired_with` property to OutputFiles


0.47.1
======

`PR 155: BM In Silico Mix <https://github.com/smaht-dac/smaht-portal/pull/155>`_

* Add in silico mix tab to COLO829 benchmarking


0.47.0
======

* Add calcprop `file_merge_group` as a tag on file sets to help determine which file sets contain files that are candidates for merging
* Add additional fields to manifest files
* Documentation on manifest files
* Documentation on data release via status
* Adjust access key expiration down to 30 days


0.46.2
======

`PR 151: fix: HapMap description formatting / Access key button text update <https://github.com/smaht-dac/smaht-portal/pull/151>`_

* Fix formatting issue with HapMap description
* Remove empty div element when BamQCLink not provided
* Update the access key button text


0.46.1
======

`PR 152: Bm small fixes <https://github.com/smaht-dac/smaht-portal/pull/152>`_

* Fix for front page links and update to tab titles for iPSC


0.46.0
======

`PR 153: New dataset for in silico Colo829 mixes <https://github.com/smaht-dac/smaht-portal/pull/153>`_

* Add new option for in silico Colo829 mixtures to File `dataset` enum


0.45.0
======

`PR 129: Categories for RNASeq pipelines <https://github.com/smaht-dac/smaht-portal/pull/129>`_

* Add category enums for RNASeq pipelines to MWF, Workflow, Software, and File


0.44.0
======

`PR 140: Basecalling details <https://github.com/smaht-dac/smaht-portal/pull/140>`_

* Create new item (Basecalling) to track basecalling details
* Add link from Sequencing to Basecalling


0.43.0
======

`PR 149: File overview sample summary <https://github.com/smaht-dac/smaht-portal/pull/149>`_

* Complete sample summary calcprop for file overview page
* Refactor `utils` modules to enable test app integration
* Fix bugs + type hints and add more functionality to `item_utils` modules


0.42.2
======

* Improvements to Status Submission page (refactoring + new filters)


0.42.1
======

`PR 128: Bm nomenclature page2 <https://github.com/smaht-dac/smaht-portal/pull/128>`_

* Improvements to SMaHT Nomenclature Page
* Update SMaHT Nomenclature PDF document


0.42.0
======

`PR 143: Flow cell lane data <https://github.com/smaht-dac/smaht-portal/pull/143>`_

* Add properties to capture flow cell lane data on UnalignedReads and AlignedReads


0.41.1
======

* Add tagging and direct fileset search to Submission Status page


0.41.0
======

`PR 145: ReferenceGenome build info <https://github.com/smaht-dac/smaht-portal/blob/main/src/encoded/schemas/file.json#L182-L184>`_

* Add properties to capture build information for ReferenceGenome
* Add URL property to ReferenceFile to track source of files


0.40.0
======

`PR 144: Add parent samples to TissueSample <https://github.com/smaht-dac/smaht-portal/pull/144>`_

* Add `parent_samples` to TissueSample to track related samples


0.39.3
======

`PR 124: File release <https://github.com/smaht-dac/smaht-portal/pull/124>`_

* Add scripts to release files and create annotated filenames


0.39.2
======

`PR 138: feat: total file counts for benchmarking page tabs <https://github.com/smaht-dac/smaht-portal/pull/138>`_

* Fetch total number of files and render as a badge on benchmarking tabs (next to the title)


0.39.1
======

* Improve Submission Status page styling


0.39.0
======

`PR 134: Updates for TPC metadata <https://github.com/smaht-dac/smaht-portal/pull/134>`_

* Reorganize donor-related items and fields following discussions/feedback from the TPC
  * Add new item types: FamilyHistory and MedicalTreatment
  * Delete unused item types: Therapeutic and MolecularTest
  * Removal, addition, and renaming of many properties
* Add `external_id` mixin to multiple SubmittedItem types for tracking identifiers from submitters


0.38.1
======

* Improve Submission Status page styling


0.38.0
======

* Add Submission Status page
* Add various embeddings to FileSet
* Add ``file_status_tracking`` calc prop to File


0.37.4
======

* Dumb typo/mistake in ingestion.loadxl_extensions (portal.is_file_schema -> is_schema_file_type)


0.37.3
======

* Added expiration for access-keys on user profile page.
* New version of dcicutils with minor fix in structured_data for smaht-submitr progress monitoring.
* Added support to get the version of the latest smaht-submitr Google Sheets metadata template;
  added endpoint /submitr_metadata_template_info (defined ingestion.metadata_template); added
  GOOGLE_API_KEY in development.ini.template, smaht_any_alpha.ini, and dcicutils.deployment_utils.


0.37.2
======

`PR 131: feat: Benchmarking Page navigation toggle functionality <https://github.com/smaht-dac/smaht-portal/pull/131>`_

* Enable toggle for benchmarking page navigation


0.37.1
======

`PR 132: Fix file embeds <https://github.com/smaht-dac/smaht-portal/pull/132>`_

* Fix file embeds by removing sub-type LinkTos from Samples to SampleSources and deletion of unused embed


0.37.0
======

`PR 127: File Overview Calcprops + Item Utils <https://github.com/smaht-dac/smaht-portal/pull/127>`_

* Add calcprops for file overview page
* Add calcprops for associated items on files
* Add item_utils module for common item functions


0.36.0
======

* 2024-03-25
* Changes to support tracking ingestion progess for smaht-submitr (via Redis).
* Minor documentation tweaks.


0.35.2
======

`PR 139: feat: format latest release date string <https://github.com/smaht-dac/smaht-portal/pull/130>`_

* Format latest release date

0.35.1
======

* Fix sex not appearing on donor (and other) detail pages


0.35.0
======

* Dynamic homepage count support
* Isolate workbook and non-workbook tests


0.34.1
======

* Add facets to HapMap and iPSC
* Fix HapMap and iPSC links


0.34.0
======

* 2024-03-14: This is a temporary branch (extra_files_plus_main_20240314)
  which is Will's extra_files branch with main merged in (2024-03-14), and
  also Utku's utk_es_max_hit branch (PR-114) with documentation changes merge in.
  FYI: Branch utk_es_max_hit was merged into main 2024-03-19.
* Added missing import of calculated_property from snovault to types/submitted_file.py.
* Documentation changes.

* Changes to support "resuming" smaht-submitr submission after a server
  validation "submission" timed out while waiting (via submit-metadata-bundle).

  In this (server validation timeout) case the user can then run check-submission with
  the UUID for the validation submission, and if/when it is complete and successful,
  the user will be allowed to continue on to do the actual submission. Slightly tricky
  because the metadata file was uploaded (to S3) as a part of the validation submission,
  and/but when check-submission is run we don't want the user to have to specify this
  file again, partly because it is an odd user experience, but mostly because when we
  do the actual submission we want to make sure we use the EXACT file that was validated;
  and so to do this we grab the file from where it was uploaded as part of the validation
  submission (i.e. under an S3 key with the validation UUID) and copy it over to where
  it would normally be (i.e. under an S3 key with the submission UUID); and from there
  things continue as normal. Note also that both of the IngestionSubmission objects have
  a pointer to the other; i.e. the validation submission object has "submission_uuid"
  and the actual submission object has a "validation_uuid" (in the "parameters");
  this hookup is done by the smaht-submitr code.

  The "resuming" scare-quotes are because this is not really resuming a submission but
  rather resuming the process the submit-metadata-bundle was doing, i.e. where it does
  a server validation then then, if successful and okay with the user, it continues on
  to do the actual submission. The "submission" scare-quotes for the server validation
  is because this is a submission in the sense that an IngestionSubmission object is
  created, but not an actual submission because it is a validate_only submission.

* Added display_title calculated property to IngestionSubmission to display either
  Validation or Submission depending on validate_only (followed by colon and uuid).


0.33.3
======

`PR 114: ES total count, HealthView and rst content updates <https://github.com/smaht-dac/smaht-portal/pull/114>`_

* Adds UI updates implemented in https://github.com/smaht-dac/smaht-portal/pull/114
* Ports HealthView page fixes previously implemented in 4DN for package-lock.json v3
* Adds admonition support for rst-to-html conversion in static content


0.33.2
======

`PR 121: Upgrader additions <https://github.com/smaht-dac/smaht-portal/pull/121>`_

* Add upgraders for Sequencing and CellCulture for properties changed or removed in prior PRs


0.33.1
======

* Updating ethnicity/nationality descriptions for HapMap


0.33.0
======

`PR 117: Assay link change #2 <https://github.com/smaht-dac/smaht-portal/pull/117>`_

* Breaking scheme change: Assay link removed from file set and required on library
* Create FileSet upgrader to remove assay link for schema version 1 items
* Update loadxl order to account for new assay linkTo location


0.32.2
======

* Add common_fields to MetaWorkflowRun and sequencing_center to WorkflowRun and QualityMetric


0.32.1
======

* Add new option to Software category enum


0.32.0
======

* Removed master-inserts/file_format.json.
* Changes for new skip_links (snovault.loadxl) mode for smaht-submitr.
* Added submits_for to master-inserts/users.json.
* Documentation related to smaht-submitr updates.
* FYI: For the record some merging complications (2024-03-09 ~ 15:35) ...
  Merged in some changes from commit c67d442e for __init__.py and server_defaults.py as
  issues with make deploy1a load errors related to user_submission_centers, after merging
  in from main, which had issues with make deploy1b WRT circular dependencies like
  ImportError: cannot import name 'test_accession' from partially initialized
  module 'snovault.server_defaults' (most likely due to a circular import).


0.31.0
======

* Updates nginx version to latest as of 03/13/2024 to resolve security alerts


0.30.2
======

`PR 112: Assay link change #1 <https://github.com/smaht-dac/smaht-portal/pull/112>`_

* Add assay linkTo to library in preparation for future removal from current location on file set
* Add anyOf requirement on sequencing for coverage or read count


0.30.1
======

`PR 111: Minor schema updates <https://github.com/smaht-dac/smaht-portal/pull/111>`_

* Update select item properties to match those desired for "automated" submission


0.30.0
======

* Only documentation updates (related to smaht-submitr) from add_valid_item_types_to_fileformat_in_masterinserts branch.


0.29.0
======

* Permissions update: support for ``submits_for`` and ``restricted`` status


0.28.0
======

`PR 82: UI Dev 5 - March 1st Benchmarking Release <https://github.com/smaht-dac/smaht-portal/pull/82>`_

* Feedback and bugfixes from v1 release (see trello for full list: https://trello.com/c/2TSRUHWT/880-feedback-from-feb-1-release)
* v2 benchmarking with support for cell line pages
* Updated/improved alluvial, etc. visualizations
* New documentation page for SMaHT nomenclature PDF download
* Merged PRs:
  - https://github.com/smaht-dac/smaht-portal/pull/101
  - https://github.com/smaht-dac/smaht-portal/pull/85
  - https://github.com/smaht-dac/smaht-portal/pull/97
  - https://github.com/smaht-dac/smaht-portal/pull/103
  - https://github.com/smaht-dac/smaht-portal/pull/86


0.27.2
======

`PR 107: Documentation updates <https://github.com/smaht-dac/smaht-portal/pull/107>`_

* Update small sections of documentation for referencing existing items


0.27.1
======

`PR 105: GA4 file sequencing center updates <https://github.com/smaht-dac/smaht-portal/pull/105>`_

* Replaces submission center with sequencing center in file views/downloads GA4 analytics


0.27.0
======

`PR 104: Automated submission alignment <https://github.com/smaht-dac/smaht-portal/pull/104>`_

* Update select property names to align with those in the 'manual' submission template
* Remove select properties suggested by feedback from submitters
* Create defaults and remove requirements for properties that currently only have one enum value
* Fix UUIDs in master-inserts to match items in the database


0.26.0
======

`PR 99: Submission links <https://github.com/smaht-dac/smaht-portal/pull/99>`_

* Add documentation page for finding data relevant to submissions
* Add templates for submissions
* Improve columns + facets for searching on collections
* Add calcprops for searching on collections


0.25.3
======

`PR 100: Upgrader fixes <https://github.com/smaht-dac/smaht-portal/pull/100>`_

* Fix file upgrader for handling additional enum values
* Add upgrader for MetaWorkflow `custom_pf_fields`


0.25.2
======

`PR 96: Bm robots fix <https://github.com/smaht-dac/smaht-portal/pull/96>`_

* Updated robots.txt to allow search engines, disallow known bots, and block /ingestion_status & /\*-files downloads
* Update SEO utilities to reflect SMaHT-specific text & branding (will need further adjustments in future, most likely)
* Add small square SMaHT logo for use in search engines


0.25.1
======

* Remove unnecessary file_format.json & insert from master-inserts
* Remove duplicate code key from smaht-dac submission center in master-inserts


0.25.0
======

`PR 92: Schema updates for submission <https://github.com/smaht-dac/smaht-portal/pull/92>`_

* Add new properties suggested by previous submitters
* Add fields to MetaWorkflow `custom_pf_fields` to bring in metadata from pipelines to files required for release
* Breaking property requirement changes with upgraders to clean up schema changes from benchmarking data model release


0.24.1
======

`PR 95: Tracking Item and Misc. Google Analytics Updates <https://github.com/smaht-dac/smaht-portal/pull/95>`_

* Fixed a bug that prevents collecting submission center and file type dimensions in file views
* Fixed the incorrect links in top files download statistics tooltip
* Adds tracking_item py test
* Removes/Replaces legacy 4DN-specific reports and styles


0.24.0
======

* Documentation updates related to submission.
* Test fixes for test_structured_data related to date/time type handling.
* Update for smaht-submitr to suppress reference (linkTo) errors on validate_only,
  iff not reference errors according to structured_data; has dependent
  changes in snovault loadxl and schema_validation (version >= 11.11.0.1b2).
* Update for smaht-submitr to support --validate-first option, which means
  we do a validate_only check first before loading the data (both via loadxl).


0.23.2
======

* Schema additions to facilitate automation


0.23.1
======

* Hooks in QC Download API


0.23.0
======

`PR 84: More Benchmarking Data Sets <https://github.com/smaht-dac/smaht-portal/pull/84>`_

* Update enums File `dataset` to include all expected cell line benchmarking data sets


0.22.0
======

`PR 57: Submitter ID Validation <https://github.com/smaht-dac/smaht-portal/pull/57>`_

* Validate `submitter_id` for all submitted items
  * Validation includes: SubmissionCenter code, item type, and unique identifier


0.21.6
======

* Repair test namespacing in unit tests


0.21.5
======

* Adds `last_modified` to all items for edit tracking


0.21.4
======

`PR 74: Table of Content improvements for RST content <https://github.com/smaht-dac/smaht-portal/pull/74>`_

* user_content.py is updated to support multi-level TOC generation for RST content
* Static_section.json in master-inserts is updated to correct text and navigation URL in Next - Previous links under the TOC
* Level 1 titles are disabled under Documents in top navigation bar
* Serkan Utku Öztürk added to users


0.21.3
======

* Update `derived_from` linkTo from File to SubmittedFile


0.21.2
======

* Add lifecycle properties to File schema


0.21.1
======

* Update SPC from 0.1.76b1 to 0.1.76


0.21.0
======

`PR 45: UI Dev 4: End of January Release w/Benchmarking <https://github.com/smaht-dac/smaht-portal/pull/45>`_

* UIs for Benchmarking Data
* Google Analytics implementation
* Navigation edits to accommodate new documentation, about, data pages
* Various other front-end tweaks to home page, user pages, etc
* Note: many PRs included in this one - see link above for breakdown, commit history


0.20.0
======

`PR 63: Benchmarking release data model <https://github.com/smaht-dac/smaht-portal/pull/63>`_

* Add two new item types: Sequencer + Assay
* Add `code` property to multiple item types to store file naming conventions
* Share SubmittedFile release properties with OutputFile
* Update file facets + columns and embed fields for search


0.19.0
======

* Repair small bug in extra file line generation, implement/test field fallbacks
* Repair permissions issues coming from snovault
* Update extra file names in encoded-core


0.18.0
======

* Adds a command to load users from a master OC spreadsheet (not tracked in git)


0.17.0
======

* Version updates to dcicutils, dcicsnovault, encoded-core.
  Changes to itemize SMaHT submission ingestion create/update/diff situation and deletes.
* Removed Rahi from admin group for submission ingestion testing purposes (master-inserts/user.json).


0.16.0
======

* Adds `/peak-metadata` support for retrieving facet information from the metadata.tsv


0.15.0
======

* Added gitinfo.json to buildspec.yml to make available to the app basic git info (branch/commit).
* Updated test_structured_data.py to (optionally - default for now) insulate itself from change to the
  schemas while they are undergoing a lot of modification, leading to frequent/annoying test breakage.
* Fixed load(xl) error handling for ingestion submission to report back to submitr properly.


0.14.0
======

* Adds `/metadata` support


0.13.1
======

`PR 58: Culture mixture parent types <https://github.com/smaht-dac/smaht-portal/pull/58>`_

* Include CellCulture as parent item of CellCultureMixture for resolving reference during submissions


0.13.0
======

`PR 56: Implement submittable item API <https://github.com/smaht-dac/smaht-portal/pull/56>`_

* Add functionality and tests for submittable item api to smaht portal
* update lockfile with latest snovault that contains the primitive for this


0.12.0
======

`PR 50: Upgrader implementation <https://github.com/smaht-dac/smaht-portal/pull/50>`_

* Add upgrader functionality from encoded-core + tests
* Update dcicutils with schema_utils module


0.11.8
======

* Add portal side validation for QC rulesets


0.11.7
======

* Fix in ingestion.loadxl_extensions.load_data_into_database to handle errors correctly.
* Added record (uw_gcc) to master-inserts/submission_center.json for testing.
* Added test_structured_data.py back in after resolved GitHub Actions (only) failure.


0.11.6
======

`PR 47: Fix admin affiliation validation <https://github.com/smaht-dac/smaht-portal/pull/47>`_

* Fix and test item affiliation validation for admins


0.11.5
======

`PR 48: More QC value types <https://github.com/smaht-dac/smaht-portal/pull/48>`_

* Allow any non-object JSON type for QC values instead of just strings


0.11.4
======

* Final adjustments to documentation, namely help desk email references


0.11.3
======

`PR 42: Bm user org profile <https://github.com/smaht-dac/smaht-portal/pull/42/files>`_

* Rework broken editable fields on User Page
* Add consortia and submission centers to User Page


0.11.2
======

* Broaden software version pattern pending further discussion with bioinformatics.


0.11.1
======

* Add some adapted user facing documentation


0.11.0
======

* Merge in ui-dev3 branch: `PR: 39: UI-Dev 3 <https://github.com/smaht-dac/smaht-portal/pull/39>`_
  * [Cfm homepage updates] (https://github.com/smaht-dac/smaht-portal/pull/39)
  * Additional UI changes for V1 pre-release, including updates to user page, registration modal, nav, etc.


0.10.0
======
* SMaHT ingestion related work.


0.9.0
=====

* Add first cut at "submittable" data model
* Fix default collection ACLs
* Add inserts for all item types to workbook-inserts
* Increase test coverage for schemas, types, item creation permissions, and various calcprops
* Remove redundant tests now covered by workbook inserts or elsewhere


0.8.1
=====

* Update encoded-core with fix to `extra_files` property on File items


0.8.0
=====

* Refactor schemas for increased sharing and less duplication
* Update bioinformatics-related schemas based on feedback + testing
* Update identifying properties in schemas for loadxl handling
* Clean up unique keys for item types
* Improve test coverage for schemas and types


0.7.1
=====

* Fix statuses in inserts
* Fix ingester permissions


0.7.0
=====

* Expanded permissions implementation
* Remove statuses no longer in use
* Refine the state each status corresponds to
* Update and add additional tests for this functionality


0.6.0
=====

* Repair various schema and core data model issues associated with bioinformatics processing


0.5.0
=====

* Merge in ui-dev2 branch: `PR 28: UI-Dev 2 <https://github.com/smaht-dac/smaht-portal/pull/28>`_
  * Fixes for UI broken by data model update (including SPC update to [v0.1.73b1] (https://github.com/4dn-dcic/shared-portal-components/releases/tag/0.1.73b1))
  * [Cfm map popover #27] (https://github.com/smaht-dac/smaht-portal/pull/27)


0.4.0
=====

* Merge in drr_shared_schemas branch.
* Merge in ui-dev branch: `PR 19: UI-Dev <https://github.com/smaht-dac/smaht-portal/pull/20>`_
  * Remove Splash Page + [re-add various features](https://github.com/smaht-dac/smaht-portal/pull/19)
  * Series of Fixes for Static Sections and Pages
  * [Bm homepage and more inserts #22] (https://github.com/smaht-dac/smaht-portal/pull/22)
  * [Bm cypress + studio #16] (https://github.com/smaht-dac/smaht-portal/pull/16)
  * [Cfm data viz integration #23] (https://github.com/smaht-dac/smaht-portal/pull/23)
  * [Cfm homepage figure #25] (https://github.com/smaht-dac/smaht-portal/pull/25)
* Update dcicutils to ^8.2.0.
* 2023-11.02


0.3.0
=====
* Upgrade to Python 3.11.
* Adding ingestion processor.
  * Added/implemented ingestion_processor.py.
  * Added generate-local-access-key script (from snovault) to pyproject.toml.
  * Added view-local-object script (from snovault) to pyproject.toml.
  * Changed metadata_bundles_bucket to smaht-production-application-metadata-bundles in development.ini.template.
* Removed types/access_key.py and schemas/access_key.json as the ones in snovault are sufficient.


0.2.0
=====
`PR 18: Prettier bulk reformat <https://github.com/smaht-dac/smaht-portal/pull/18>`_

* What it says on the tin: ran `npm run format` to reformat JS/JSX files


0.1.1
=====
`PR 17: Webpack 5 Config Fixes + Prettier Install & Config <https://github.com/smaht-dac/smaht-portal/pull/17>`_

* Remove direct Terser-Webpack-Plugin from dev-dependencies
* Fix NODE_ENV warning on webpack build
* Add some comments for profiling webpack easily
* Also included changes from: https://github.com/smaht-dac/smaht-portal/pull/15


0.1.0
=====
`PR 10: Bm-node18-upgrade <https://github.com/smaht-dac/smaht-portal/pull/10>`_

* Update Docker's MakeFile to use Node version 18.17.0
* Update SPC to 0.1.69
* Fix for search view error
* Fix for auth0 bug when SPC symlinking


0.0.9
=====

* Hook in and test DRS implementation


0.0.8
=====
* Lock newer snovault, utils versions with bug fixes


0.0.7
=====

* Made scripts/psql-start.bash and bin/macpoetry-install.bash executable.
* Makefile invokes macbuild rather than build if this looks like Mac (uname -s contains Darwin).
* Corrected Makefile to refer to psql-start.bash and macpoetry-install.bash (with the .bash suffix).
* Pinned PyYAML version in pyproject.toml to 5.3.1 (as Mac M1 really wants this one, not 5.4.1).
* Fix to src/encoded/__init__.py for allowedConnections in /auth0_config endpoint.


0.0.6
=====

* Removes ``jsonschema_serialize_fork``, use new schema draft version
* Implement ``$merge`` referential schema fields


0.0.5
=====

* Improve testing by porting relevant tests as needed
* Changes to accommodate working search/other tests
* Allow testing with ES in GA with smaht-development credentials
* Build Docker as part of GA


0.0.4
=====

* Implementation of SMaHT splash page UI as temporary placeholder
* Some additional clean up of front end described in more detail here: https://github.com/smaht-dac/smaht-portal/pull/5
* Update to use Webpack 5
* Do some light adjustments to be more compatible with Google Analytics 4 down the line


0.0.3
=====

* Implements various changes across repos to allow deployment of the smaht-portal


0.0.2
=====

* Implement base level permissioning scheme working with ``consortia`` and ``submission_center``


0.0.1
=====

* Initial version
* TODO: update base.ini, various other ini file templates once new AWS is provisioned
* TOOD: build GLOBAL_ENV_BUCKET for testing (conftest.py)
