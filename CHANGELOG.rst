============
smaht-portal
============


----------
Change Log
----------

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
=====

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
