============
smaht-portal
============


----------
Change Log
----------


1.4.1
=====

`PR 495 Script for Bulk Donor Manifests <https://github.com/smaht-dac/smaht-portal/pull/495>`_

* Add script to generate bulk donor metadata manifests - can generate the 4 different files containing
  public or protected donor metadata for production or benchmarking donors that have been publicly released
  or are only available to network members.

1.4.0
=====

`PR 516: feat: Browse By Donor + Visualizations + User Registration Form <https://github.com/smaht-dac/smaht-portal/pull/516>`_

* New browse by donor (and protected donor) view
* Visualizations for donor demographics including age, sex, and, hardy scale and self-reported ethnicity
* New user registration form with email verification and reCAPTCHA
* Updates "status" for browse views, data matrix and misc. filters


1.3.3
=====
`PR 515: feat: sort tables by date_released <https://github.com/smaht-dac/smaht-portal/pull/515>`_

* Sort benchmarking tables by date_released instead of date_created


1.3.2
=====
`PR 514: fix: correct assay counts for browse by file page <https://github.com/smaht-dac/smaht-portal/pull/514>`_

* Fix assay counts on File Browse Data Summary Statistics


1.3.1
=======
`PR 527: feat: homepage announcement for portal shutdown <https://github.com/smaht-dac/smaht-portal/pull/527>`_

* Implement announcement in homepage banner for portal shutdown
* Prevent non-admins from seeing the user registration modal during portal shutdown 


1.3.0
=====
`PR 523: feat: Donor Metadata Dictionary <https://github.com/smaht-dac/smaht-portal/pull/523>`_

* Implement Donor Metadata Dictionary page


1.2.1
=====

* Correct link in submission doc page 


1.2.0
=====

* Adjusts the user schema to replicate the attributions without
  serverDefault for submission center, ensuring attribution is not given
  erroneously to non-affiliated users
* Regression test for the above
* Change data release tracker to direct users to /browse, include only
  production files, update tests as needed


1.1.8
======
`PR 524: fix: update uuids to match prod <https://github.com/smaht-dac/smaht-portal/pull/524>`_

* Fix uuids for the pages and static sections below in order to prevent uuid mismatches causing reindex crash


1.1.7
=====
`PR 511: SN Sample Nomenclature doc <https://github.com/smaht-dac/smaht-portal/pull/511>`_

* Update page to match newest version of the documentation
* Add newest version of the pdf document to the page


1.1.6
=====
`PR 526: feat: release tracker CRAM warning callout <https://github.com/smaht-dac/smaht-portal/pull/526>`_

* Add support for CRAM warning in release tracker items


1.1.5
=====
`PR 525: Fix: Re-include ingestion_processors in app config <https://github.com/smaht-dac/smaht-portal/pull/525>`_

* Re-include ingestion_processors in app config


1.1.4
=====
`PR 521: Modify production tissues in Submission Status page <https://github.com/smaht-dac/smaht-portal/pull/521>`_

* Adjust production tissues in Submission Status page


1.1.3
=====
`PR 499: WF Fix ingesting identical items <https://github.com/smaht-dac/smaht-portal/pull/499>`_

* Add diff check for ingested metadata


1.1.2
=====
`PR 520: Add tag filtering for release tracker and improve notifications panel UX <https://github.com/smaht-dac/smaht-portal/pull/520>`_

* Released files can now be excluded from the release tracker by adding the tag `exclude_from_release_tracker`
* Only show the last 3 months in the release tracker
* In the notification panel UX, handle the case correctly when there are no released files.


1.1.1
=====
`PR 513: feat: QC Tab update <https://github.com/smaht-dac/smaht-portal/pull/513>`_

* Show placeholder for QC Tab when user does not have access to related QC Items for that file


>>>>>>> main
1.1.0
=====
`PR 508: SN Fibroblast tissue type  <https://github.com/smaht-dac/smaht-portal/pull/508>`_

* Update the `get_sample_summary` function in File to return "Fibroblast" for `sample_summary.tissues` if the linked tissues have a 3AC protocol ID, otherwise use the linked OntologyTerms


1.0.2
=====
`PR 517: Improve Submission Status page file display logic <https://github.com/smaht-dac/smaht-portal/pull/517>`_

* Show CRAM file on the Submission Status page if they were generated from a BAM to CRAM conversion workflow.
* Hide obsolete files from the Submission Status page.
* Make sure MetaWorkflowRuns are sorted by date created (oldest first) on the Submission Status page.


1.0.1
=====
`PR 498: SN Update manifest documentation <https://github.com/smaht-dac/smaht-portal/pull/498>`_

* Update the Interpreting Manifest Files page to include new columns added to the File Manifest and information on the multiple manifest files containing full file metadata.


1.0.0
=====

* Major version - introduction of public-restricted status, usability
  of data portal with expanded permissions for restricted metadata
* Adds two new ACLs for restricted and public-restricted that allows
  metadata items to be permissions via presence of the dbgap and
  public-dbgap
groups
* Expands the restricted status to apply a global block on dbGaP permission
  for certain metadata items
* Allow the public-restricted status to function similarly to how restricted
  functions for non-file items ie: anyone can view, only protected users can
  download
* Tests for protected donor and medical history using the restricted and
  public-restricted statuses, along with tests for files as well utilizing
  the new groups


0.195.3
=======
`PR 512: feat: remove quantity field from protected donor view <https://github.com/smaht-dac/smaht-portal/pull/512>`_

* Remove the quantity field from the Protected Donor view


0.195.2
=======
`PR 510: Cypress tests for protected/public donor views <https://github.com/smaht-dac/smaht-portal/pull/510>`_

* Add Cypress tests for protected and public donor views
* Move data matrix utility functions into `dataMatrixUtils`` file to use in multiple tests


0.195.1
=======
`PR 509: SN Fix donor metadata release <https://github.com/smaht-dac/smaht-portal/pull/509>`_

* Fix patching of release status to not ignore patching if the status is `released`


0.195.0
=======
`PR 503: feat: public donor view <https://github.com/smaht-dac/smaht-portal/pull/503>`_

* Implement Public Donor view


0.194.2
=======
`PR 506: feat: add tooltip to values column header <https://github.com/smaht-dac/smaht-portal/pull/506>`_

* Add tooltip for values column in Submission Data Dictionary


0.194.1
=======
`PR 504: feat: updates to portal for CRAM releases <https://github.com/smaht-dac/smaht-portal/pull/504>`_

* Update portal to reflect CRAM files being released


0.194.0
=======
`PR 496: Data matrix popover and style updates <https://github.com/smaht-dac/smaht-portal/pull/496>`_

* Move DataMatrix components to the Viz folder, enhance tab styles, and simplify data aggregation processes.
* Adjust visual elements and update tests to reflect the redesigned data matrix popover
* Add total coverage, tissue, and donor counts into the data matrix popover


0.193.2
=======
`PR 505: Handle Aorta correctly in tissue classification table <https://github.com/smaht-dac/smaht-portal/pull/505>`_

* Treat Aorta as a special case in the tissue classification table, as GTEX only has Blood Vessel.


0.193.1
=======
`PR 500: fix: update master inserts <https://github.com/smaht-dac/smaht-portal/pull/500>`_

* Correct master-inserts for data retraction and data QC


0.193.0
=======
`PR 491: SN Donor manifest embeds <https://github.com/smaht-dac/smaht-portal/pull/491>`_

* Create revlinks on ProtectedDonor and MedicalHistory for donor metadata items
* Embed all donor metadata properties on ProtectedDonor
* Create TSV columns in `metadata.py` for the Donor Manifest


0.192.8
=======
`PR 493: AV Updates to QC metrics and Submission Status page <http://github.com/smaht-dac/smaht-portal/pull/493>`_

* Update thresholds in the QC overview generation script
* Remove table from sample identity tab in QC metrics page
* Indictate retracted files on the Submission Status page
* Add copy button for group coverage on the Submission Status page
* Add retry logic when getting the QC overview data


0.192.7
=======
`PR 492: feat: add new announcement to homepage <https://github.com/smaht-dac/smaht-portal/pull/492>`_

* Add announcement for switching to CRAM files


0.192.6
=======
`PR 490: feat: benchmarking page updates <https://github.com/smaht-dac/smaht-portal/pull/490>`_

* Make benchmarking page titles clickable
* Remove Data Retraction Alerts in COLO829


0.192.5
=======
`PR 494: SN Somatic VCF access status <http://github.com/smaht-dac/smaht-portal/pull/494>`_

* In `commands/release_file.py`, update the `access_status` for somatic variant calls from tissues to be "Protected" instead of "Open"


0.192.4
=======
`PR 484: SN Donor metadata release <http://github.com/smaht-dac/smaht-portal/pull/484>`_

* Creates the script `commands/donor_metadata_release.py` which takes in one or multiple Donor accession IDs and releases the Donor item and all other donor metadata, tissue, and TPC-submitted tissue sample items associated with it
Includes the constants `PUBLIC_DONOR_RELEASE_STATUS` (currently set to `released`, but will later be changed to `public`) and `PROTECTED_DONOR_RELEASE_STATUS` (currently set to `released`, but will later be changed to `public-restricted`) to ensure only Donor, Tissue, and TissueSample items are made publicly viewable, and ProtectedDonor and all other downstream donor metadata items are only visible if users have dbGaP access


0.192.3
=======
`PR 486: SN Sequencing center patching for submitted files <http://github.com/smaht-dac/smaht-portal/pull/486>`_

* In `commands/release_file.py`, update the initial patch of the file to include the `sequencing center` as the `submission center` for SubmittedFiles (not OutputFiles)
* In `commands/create_annotated_filenames.py`, for SubmittedFiles use the `submission center` as the `sequencing center` for the center code


0.192.2
=======
`PR 489: feat: remove benchmarking QC button <https://github.com/smaht-dac/smaht-portal/pull/489>`_

* Remove benchmarking QC button


0.192.1
=======
`PR 488: fix: update qc-page content uuid <https://github.com/smaht-dac/smaht-portal/pull/488>`_

* Fix for updating the uuid in the qc-metrics content field in master-inserts


0.192.0
=======
`PR 458: Cypress tests for home page, documentation, data overview and file overview <https://github.com/smaht-dac/smaht-portal/pull/458>`_

* Various new Cypress tests to increase the test coverage for home page, documentation, data overview and file overview
* Update commands to support multi-roles with different permissions


0.191.0
=======
`PR 485: feat: add values column for enums and suggested values <https://github.com/smaht-dac/smaht-portal/pull/485>`_

* Add column for enums in Submission Data Dictionary


0.190.9
=======
`PR 487: SN Fix ResourceFile data_category <http://github.com/smaht-dac/smaht-portal/pull/487>`_

* Fix the `data_category` enums in ResourceFile to include "Donor Supplement" and set to `default`


0.190.8
=======
`PR 482: SN Revert RIN minimum <http://github.com/smaht-dac/smaht-portal/pull/482>`_

* Revert the minimum for `rna_integrity_number` to 1


0.190.7
=======
`PR 481: fix: update QC page/static section uuids to match portals <https://github.com/smaht-dac/smaht-portal/pull/481>`_

* Update master-inserts uuids to match portals


0.190.6
=======
`PR 480: SN File data type and data category <http://github.com/smaht-dac/smaht-portal/pull/480>`_

* Add enum "Fingerprint" to `data_type` for VariantCalls
* Add enum "Consensus Reads" to `data_category` in UnalignedReads


0.190.5
=======
`PR 475: fix: update name for coverage <http://github.com/smaht-dac/smaht-portal/pull/475>`_

* Update title for Dataset Per BAM Coverage in File Overview page


0.190.4
=======
`PR 478: fix: update breadcrumbs on File Overview page <https://github.com/smaht-dac/smaht-portal/pull/478>`_

* Update breadcrumbs on file overview page


0.190.3
=======
`PR 465 feat: protected donor view updates <https://github.com/smaht-dac/smaht-portal/pull/465>`_

* Update donor view following annual meeting feedback


0.190.2
=======
`PR 477: feat: add ST001 and ST002 skin to benchmarking <https://github.com/smaht-dac/smaht-portal/pull/477>`_

* Add ST001 and ST002 skin to benchmarking


0.190.1
=======
`PR 472: SN Add search columns <https://github.com/smaht-dac/smaht-portal/pull/472>`_

* Add columns to Tissue (`uberon_id.identifier`) and OntologyTerm (`valid_protocol_ids`) search views


0.190.0
=======
`PR 471: SN Update file merge group <https://github.com/smaht-dac/smaht-portal/pull/471>`_

* Update `generate_sample_source_part` in FileSet so that the sample source part of the `file_group` is Tissue, rather than TissueSample for single tissue samples with spatial information


0.189.1
=======
`PR 476: Add RIN and tissue types to Submission Status <https://github.com/smaht-dac/smaht-portal/pull/476>`_

* Add RIN values of the analyte and tissue types of a fileset to the Submission Status page
* Exclude Single-Cell PTA data from generating warnings in the sample identity check on the QC metrics page


0.189.0
=======
`PR 473: SN Add additional notes to exp manifest file <https://github.com/smaht-dac/smaht-portal/pull/473>`_

* Adds `sequencing.additional_notes` to the Experimental Manifest file


0.188.3
=======
`PR 474: SN Release preparation items <https://github.com/smaht-dac/smaht-portal/pull/474>`_

* Update the `release_file` script to also patch AnalytePreparation, LibraryPreparation, PreparationKit, and Treatment items to `released`


0.188.2
=======
`PR 466 feat: add estimated average coverage to file overview <https://github.com/smaht-dac/smaht-portal/pull/466>`_

* Add a new property to average coverage in file overview page


0.188.1
=======
`PR 467 feat: update bulk donor metadata download button <https://github.com/smaht-dac/smaht-portal/pull/467>`_

* Update download link for bulk donor metadata download link


0.188.0
=======
`PR 468: SN File QC notes <https://github.com/smaht-dac/smaht-portal/pull/468>`_

* Add `qc_notes` calc prop to QualityMetrics which uses `flag` to identify key metrics and build a concatenated string of Warn/Fail QC metrics
* Embed `quality_metrics.qc_notes` on File
* Add `quality_metrics.qc_notes` as column in File Manifest


0.187.3
=======
`PR 470: Bulk file release <https://github.com/smaht-dac/smaht-portal/pull/470>`_

* Modified the release script to allow multiple files to be released at once.
* Added a button to the Submission Status page, that will let you copy the accessions of all output files displayed, so that it can be used in the release script.
* Minor adjustments to the QC overview script.


0.187.2
=======
`PR 457 feat: update nomenclature doc table <https://github.com/smaht-dac/smaht-portal/pull/457>`_

* Update table 3A on nomenclature page


0.187.1
=======
`PR 469: SN RIN minimum to zero <https://github.com/smaht-dac/smaht-portal/pull/469>`_

* Change the minimum value for `rna_integrity_number` in Analyte to 0


0.187.0
=======
`PR 463: SN File average coverage <https://github.com/smaht-dac/smaht-portal/pull/463>`_

* Add `average_coverage` to the `data_generation_summary` calc prop on File, grabbed from `quality_metrics.coverage`
* Add property `override_average_coverage` to File, which can override the `average_coverage` value if present


0.186.2
=======
`PR 464 SN Add pluralize relatives <https://github.com/smaht-dac/smaht-portal/pull/464>`_

* For relatives in FamilyHistory, add plural options to enums


0.186.1
=======
`PR 456 feat: update status of FAQ, Submission Schema Dictionary, and other static pages <https://github.com/smaht-dac/smaht-portal/pull/456>`_

* Add released status to page items
* Update status of FAQ and Submission Schema Dictionary page items
* Update status of other static pages


0.186.0
=======
`PR 440: SN file merge group tag <https://github.com/smaht-dac/smaht-portal/pull/440>`_

* Add an optional part to the `file_group` calcprop in FileSet that is set by the property `group_tag`. If present, it is added to the `file_group` so that the FileSet is put in a different File Merge Group than other file sets.
* Adjust `generate_assay_part` of `file_group` to only a return a value if `cell_isolation_method` is "Bulk"
* Make `cell_isolation_method` a required property for Assay
* Adjust `generate_sample_source_part` to return the sample source for multiple tissues (regardless of if they contain spatial information)


0.185.0
=======
`PR 422 SN Upgrade treatment <https://github.com/smaht-dac/smaht-portal/pull/422>`_

* Add description property to Treatment
* Make `dependentRequired` for `concentration` and `concentration_units` in Treatment


0.184.8
=======
`PR 455 Cypress updates <https://github.com/smaht-dac/smaht-portal/pull/455>`_

* Updates: 03a_browse_views_basic via selectorVars, 04a_search_views_local, 06_benchmarking, 08_documentation


0.184.7
=======
`PR 454 SN Fix manifest file <https://github.com/smaht-dac/smaht-portal/pull/454>`_

* Prevent tissue histology placeholder image overflow


0.184.6
=======
`PR 453 fix: prevent tissue histology placeholder image overflow <https://github.com/smaht-dac/smaht-portal/pull/453>`_

* Prevent tissue histology placeholder image overflow


0.184.5
=======
`PR 452 fix: filter files for statistics by released <https://github.com/smaht-dac/smaht-portal/pull/452>`_

* fix donor view statistics counts


0.184.4
=======
`PR 451 fix: update status for embedded data matrix <https://github.com/smaht-dac/smaht-portal/pull/451>`_

* fix status for embedded data matrix


0.184.3
=======
`PR 449 feat: fix: update manifest download button text <https://github.com/smaht-dac/smaht-portal/pull/449>`_

* update manifest download button text


0.184.2
=======
`PR 448 feat: donor view updates <https://github.com/smaht-dac/smaht-portal/pull/448>`_

* Update Donor View


0.184.1
=======
`PR 447 Add missing mappings into donor page's data matrix <https://github.com/smaht-dac/smaht-portal/pull/447>`_

* Update mappings


0.184.0
=======

* Support multiple manifest files - analyte, sequencing, sample


0.183.0
=======
`PR 426 feat: Donor View page <https://github.com/smaht-dac/smaht-portal/pull/426>`_

* Implement Donor View


0.182.3
=======
`PR 445 Data matrix and top bar navigation updates <https://github.com/smaht-dac/smaht-portal/pull/445>`_

* Fixed assay and tissue mappings
* Fixed navigation URL in popover of benchmarking data rows summary
* Add Data Overview section into Data menu in top bar


0.182.2
=======
`PR 446 SN Fix tissue facet <https://github.com/smaht-dac/smaht-portal/pull/446>`_

* Remove outer grouping from tissue facet in File


0.182.1
=======
`PR 444 feat: fix: update suggestedFilename for additional manifests <https://github.com/smaht-dac/smaht-portal/pull/444>`_

* Replaces the suggestedFilename in the additional manifest download


0.182.0
=======
`PR 443: SN Update protected donor <https://github.com/smaht-dac/smaht-portal/pull/443>`_

* Embed `donors.protected_donor` on File
* Move `tissues` revlink from AbstractDonor to Donor
* Add embeds from MedicalHistory to ProtectedDonor


0.181.0
=======
`PR 438 feat: static page updates <https://github.com/smaht-dac/smaht-portal/pull/438>`_

* Add page for submission schema reference
* Implement FAQ documentation page


0.180.0
=======
`PR 441: feat: support download for multiple manifest files <https://github.com/smaht-dac/smaht-portal/pull/441>`_

* Support collection specific metadata download


0.179.0
=======
`PR 439: SN Ontology term germ layer <https://github.com/smaht-dac/smaht-portal/pull/439>`_

* Change the ontology_term function `get_top_grouping_term` to `get_grouping_term_from_tag`, which will recursively search links of OntologyTerm items by `grouping_term` to find the item with tags that contain tag (`tissue_type`,`germ_layer`)
* Add calculated property `category` to Tissue which uses OntologyTerm to classify tissue as a germ layer (Mesoderm, Ectoderm, Endoderm), Germ Cells, or Clinically Accessible
* Add `category` to the `sample_summary` calculated property to be accessible from File


0.178.0
=======
`PR 437: Data Matrix <https://github.com/smaht-dac/smaht-portal/pull/437>`_

* DataMatrix is a highly configurable React component for visualizing tabular data (like a matrix or heatmap), with support for grouping, aggregation, color ranges, and dynamic configuration.


0.177.0
=======
`PR 442: SN Add coverage calc prop <https://github.com/smaht-dac/smaht-portal/pull/442>`_

* Add `coverage` calculated property to QualityMetric and embed it on File


0.176.0
=======
`PR 429: QC metrics page improvements <https://github.com/smaht-dac/smaht-portal/pull/429>`_

* Improved warnings
* Adjusted colors for tags
* Fixed bug were contents of "Metrics By File" tab contents would not be correctly displayed when preselected tab was not "Metrics By File"
* Added grouping by donor


0.175.0
=======
`PR 427: SN Add protected donor item <https://github.com/smaht-dac/smaht-portal/pull/427>`_

* Create new item type ProtectedDonor and new abstract item type AbstractDonor, with both Donor and ProtectedDonor as children
* Adjust `linkTo` in schema of protected donor items (e.g. MedicalHistory, DeathCircumstances) to be for AbstractDonor temporarily. These will later be changed to `"linkTo": "ProtectedDonor"`` after item links have been patched.
* Add revlinks to MedicalHistory from ProtectedDonor and to Exposure (for alcohol and tobacco exposure only) from MedicalHistory
* Add necessary embeds to ProtectedDonor for generation of Donor Overview page


0.174.0
=======
`PR 436: SN Donor study calcprop <https://github.com/smaht-dac/smaht-portal/pull/436>`_

* Add `study` calculated property to Donor which uses the pattern of `external_id` to determine if the donor is Benchmarking or Production


0.173.0
=======
`PR 434: SN Reference genome preferred_name <https://github.com/smaht-dac/smaht-portal/pull/434>`_

* Update the `meta_workflow_run_inputs` calcprop in File to ignore ReferenceFile items
* Add the property `submitter_comments` to FileSet for display in Submission Status page


0.172.3
=======
`PR 433: fix: update status of pages <https://github.com/smaht-dac/smaht-portal/pull/433>`_

* Update status of pages


0.172.2
=======
`PR 430: Cypress tests for experimental assay terms grouping <https://github.com/smaht-dac/smaht-portal/pull/430>`_

* Updates for 06_benchmarking and 04a_search_views_local upon updates in facet terms grouping
* Add new steps into 03a_browse_view_basic for facet terms grouping for the Experimental Assay facet for both Include Properties and Exclude Properties


0.172.1
=======
`PR 423: feat: update consortium table and data matrix <https://github.com/smaht-dac/smaht-portal/pull/423>`_

* Add codes to the Consortium table
* Adjust data matrix styles


0.172.0
=======
`PR 425 SN Update schema properties <https://github.com/smaht-dac/smaht-portal/pull/425>`_

* In TissueSample, change the `enum` in `category` from "Aliquot" to "Tissue Aliquot"
* In File, add "Sequencing Supplement" to `data_category` and "Sequencing Information" to `data_type` and remove barcode values
* In File, add property `qc_comments` to be included in the file manifest
* In ResourceFile, add the `enum` "Donor Supplement" to `data_category` and "Donor Information" to `data_typ`e for the downloadable donor manifest file


0.171.1
=======
`PR 424 style: update text in sample category popover <https://github.com/smaht-dac/smaht-portal/pull/424>`_

* Updates category popover in File View


0.171.0
=======
`PR 421 SN DSA code <https://github.com/smaht-dac/smaht-portal/pull/421>`_

* Make `code` in DonorSpecificAssembly not a unique key. The expected value for these will now be "DSA"


0.170.1
=======
`PR 417 fix: update capitalization for retraction_reason property <https://github.com/smaht-dac/smaht-portal/pull/417>`_

* Update retraction table to capitalize reason
* Update alert banner on file overview page to not lowercase


0.170.0
=======
`PR 413 SN Generic Config item <https://github.com/smaht-dac/smaht-portal/pull/413>`

* Add new item, GenericConfig, that can be used to hold JSON objects


0.169.0
=======
`PR 419: Update MWFR inputs calcprop <https://github.com/smaht-dac/smaht-portal/pull/419>`_

* Only show MWFRs that are not deleted on the file
* Adjust the QC metrics page JSON script to use the new tissue_types property on Fileset


0.168.5
=======
`PR 418: style: update QC tab <https://github.com/smaht-dac/smaht-portal/pull/418>`_

* Adjust column widths
* Update button colors


0.168.4
=======
`PR 415 SN Fix validator error message <https://github.com/smaht-dac/smaht-portal/pull/415>`

* Fix the TissueSample custom validator for valid combination of `external_id` and `category` to print out the expected `category` value in the error message
* Add `link_related_validator` decorator to the custom validator for fastq read pairs being linked to the same FileSet


0.168.3
=======
`PR 416: Add file set accession copy button to Submission Status page <https://github.com/smaht-dac/smaht-portal/pull/416>`_

* Add file set accession copy button to Submission Status page


0.168.2
=======
`PR 410 fix: use retraction_reason in file view alert <https://github.com/smaht-dac/smaht-portal/pull/410>`_

* Use retraction_reason property to create file overview alert string instead of notes_to_tsv


0.168.1
=======
`PR 414 fix: adjust status icon in file overview page <https://github.com/smaht-dac/smaht-portal/pull/414>`_

* Capitalize status title in file overview page
* Organize status icon colors for item pages


0.168.0
=======
`PR 379: feat: implement QC Overview Tab <https://github.com/smaht-dac/smaht-portal/pull/384>`_

* Populate quality metrics tab in QC overview tab


0.167.0
=======
`PR 412 Submission Status page: Add Donor and Tissue select fields <https://github.com/smaht-dac/smaht-portal/pull/412>`

* Replace the Sample Source select field with a Tissue select field
* Add Donor select field
* Embed donor display title into `file_set`


0.166.0
=======
`PR 411 SN Diagnosis age maximum <https://github.com/smaht-dac/smaht-portal/pull/411>`

* Set maximum to 89 for `age_at_diagnosis` and `age_at_resolution` to protect donor privacy


0.165.0
=======
`PR 334 feat: tooltip for sample information definitions <https://github.com/smaht-dac/smaht-portal/pull/334>`

* Adds popover for sample description definitions


0.164.1
=======
`PR 409: fix: update browse view tissue statistic <https://github.com/smaht-dac/smaht-portal/pull/409>`_

* Update Browse View statistics to correct tissue count


0.164.0
=======
`PR 408: SN Add additional_notes <https://github.com/smaht-dac/smaht-portal/pull/408>`_

* Add property `additional_notes` to Sequencing


0.163.0
=======
`PR 407: SN upgradeAnalytePrep <https://github.com/smaht-dac/smaht-portal/pull/407>`_

* Add upgrader changing property `cell_sorting_method` to `cell_selection_method` in AnalytePreparation and update enums
* Add enums to File data_category and data_type for STORM-Seq metadata files


0.162.2
=======
`PR 400: feat: add tissue codes to benchmarking page titles <https://github.com/smaht-dac/smaht-portal/pull/400>`_

* Add tissue code to the benchmarking page titles


0.162.1
=======
`PR 392: Add tissue type calc prop to filesets <https://github.com/smaht-dac/smaht-portal/pull/392>`_

* Adds a calculated property to filesets that contains the higher level tissue type.


0.162.0
=======
`PR 406: SN Add AlignedReads enum <https://github.com/smaht-dac/smaht-portal/pull/406>`_

* Add "Consensus Reads" enum to data_category for AlignedReads
* Fix loadxl order for `external_quality_metric`


0.161.0
=======
`PR 397 feat: implement bulk donor metadata download button <https://github.com/smaht-dac/smaht-portal/pull/397>`_

* Implement bulk donor metadata download button
* Update bootstrap button style overrides


0.160.3
=======
`PR 405: SN Update release MWFR check <https://github.com/smaht-dac/smaht-portal/pull/405>`_

* In `commands/release_file.py` , adjust `get_output_meta_workflow_run` to only throw an error if the file type is OutputFile, as submitted files won't be the output of a MWFR


0.160.2
=======
`PR 402 feat: about page visualization updates <https://github.com/smaht-dac/smaht-portal/pull/402>`_

* Update copy for About page
* Fix assay table descriptions


0.160.1
=======
`PR 404: QC metrics: Support preselected files in Sample Integrity tab <https://github.com/smaht-dac/smaht-portal/pull/404>`_

* Support preselected files in the Sample Integrity and Metrics by File tab


0.160.0
=======
`PR 394: SN Update RNA fileset validator <https://github.com/smaht-dac/smaht-portal/pull/394>`_

* Update the Sequencing validator on FileSet so that it only enforces for RNA and not DNA
* Add a skip validation option, `force_pass` for custom validators
* Minor changes: remove "Not Applicable" as an enum for `strand` and embed assay `category` on File


0.159.0
=======
`PR 399: feat: update links to existing data doc <https://github.com/smaht-dac/smaht-portal/pull/399>`_

* Update Links to Existing Data doc


0.158.0
=======
`PR 398: SN Create resource file <https://github.com/smaht-dac/smaht-portal/pull/398>`_

* Create new file item type, ResourceFile, for DAC-generated files not used in analysis pipelines


0.157.0
=======
`PR 403: Retracted files page <https://github.com/smaht-dac/smaht-portal/pull/403>`_

* Add `/retracted-files` path and master-inserts for listing the retracted data
* Add footer to home page announcements
* Export SVG arrow icon component to reuse in timeline item, data release tracker, and announcement item footer in home page


0.156.2
=======
`PR 401: Submission Status page improvement <https://github.com/smaht-dac/smaht-portal/pull/401>`_

* Add copy button for MetaworkflowRuns on Submission Status page
* Add submission status page to master inserts


0.156.1
=======
`PR 396: SN Fix donor sex facet <https://github.com/smaht-dac/smaht-portal/pull/396>`_

* Fix facet for "Donor Sex" in File


0.156.0
=======
`PR 314 feat: about page updates <https://github.com/smaht-dac/smaht-portal/pull/314>`_

* Update the About page Alluvial plot and data matrix
* Refactor showHideInformationToggle component for additional customization


0.155.0
=======
`PR 395: SN Update MWFR outputs calcprop <https://github.com/smaht-dac/smaht-portal/pull/395>`_

* In the revlink calcprop `meta_workflow_run_outputs`, filter out MetaWorkflowRun items with `status` "deleted"


0.154.2
=======
`PR 390: feat: add tissue details and tissue subtype to File Overview page <https://github.com/smaht-dac/smaht-portal/pull/390>`_

* Add tissue details and tissue subtype to File Overview page


0.154.1
=======
`PR 361: fix: comment out unused Submissions page <https://github.com/smaht-dac/smaht-portal/pull/361>`_

* Comment out the submissions page calculated property


0.154.0
=======
`PR 389: SN Update treatment <https://github.com/smaht-dac/smaht-portal/pull/389>`_

* Update the Treatment item so that `agent` is a string, rather than a linkTo to OntologyTerm, and add enum values to `concentration_unit`


0.153.2
=======
`PR 393: chore: update footer text <https://github.com/smaht-dac/smaht-portal/pull/393>`_

* Update text in footer


0.153.1
=======
`PR 391: SN Fix pathology report <https://github.com/smaht-dac/smaht-portal/pull/391>`_

* Fix enum typo for percentage in PathologyReport
* Reformat and reorder properties in BrainPathologyReport and NonBrainPathologyReport


0.153.0
=======
`PR 385: SN Fix release tracker calcprop <https://github.com/smaht-dac/smaht-portal/pull/385>`_

* Fix the `release_tracker_title` and `release_tracker_description` calcprops to have the override property function in the case of having multiple values from `file_sets`
* Make `file_sets` a required property for SupplementaryFile, as it is for all other SubmittedFile types, so that the File Overview display and Manifest File generation work properly


0.152.0
=======
`PR 387: QC metrics page improvements <https://github.com/smaht-dac/smaht-portal/pull/387>`_

* Redesign of the Key metrics tab
* Added Tissue classification table for RNA-Seq data under Key metrics tab
* Add "Metrics by file" tab, that can be linked from the file overview page
* Alerts on the sample contamination heatmap are now determined on a file (and not donor) level. Retracted files do not generate a warning.


0.151.0
=======
`PR 388: SN Add retraction_reason <https://github.com/smaht-dac/smaht-portal/pull/388>`_

* Add property `retraction_reason` to File for display in the Data Retraction page and File Manifest


0.150.1
=======
`PR 386: Fix page title registry for /browse <https://github.com/smaht-dac/smaht-portal/pull/386>`_

* Fix broken page title in Browse View


0.150.0
=======
`PR 375: SN gpu upgrade <https://github.com/smaht-dac/smaht-portal/pull/375>`_

* Change the property `gpu` to `gpu_architecture` in Software
* Include upgrader with test


0.149.0
=======
`PR 381: Home and Search Page Updates <https://github.com/smaht-dac/smaht-portal/pull/381>`_

* Enables the previously disabled data release tracker links on the home page
* Adds date for announcements on the home page when applicable
* Fixes overflow/overlapping issues in the facet date range
* Replaces erroneously displayed date_created under the Released column with file_tracking_status.released_date in file tables
* Updates data retraction notice in the COLO829 benchmarking page
* Makes the released files title in file search view more prominent


0.148.2
=======
`PR 382: Add file_status_tracking.retracted <https://github.com/smaht-dac/smaht-portal/pull/382>`_

* Adds `file_status_tracking.retracted` and `file_status_tracking.retracted_date`` into File item


0.148.1
=======
`PR 380: File release: Check required QC runs and support RNA-Seq <https://github.com/smaht-dac/smaht-portal/pull/380>`_

* Prevent files (BAMs) from being released if certain QC metaworkflows have not been run on them
* Search for associated final output files and releases them together with the targeted file. Currently implemented for RNA-Seq datasets.


0.148.0
=======
* Update to dcicutils 8.18.3 for fix for smaht-submitr (to respect the custom column mappings
  even when using, for example, XYZY_ExternalQualityMetric style sheet names.


0.147.0
=======
`PR 370: SN Add liquid category check <https://github.com/smaht-dac/smaht-portal/pull/370>`_

* Add check to TissueSample ensuring that items with `external_id `values with protocol id for blood or buccal swab (3A or 3B) have category of "Liquid" and fibroblasts (3AC) have category of "Cells"


0.146.1
=======
`PR 376: SN search columns facets <https://github.com/smaht-dac/smaht-portal/pull/376>`_

* Add columns and facets to items frequently used for searching during submission


0.146.0
=======
`PR 378: SN Move ONT validator <https://github.com/smaht-dac/smaht-portal/pull/378>`_

* Move custom validator for basecalling software for ONT files to UnalignedReads from SubmittedFile, as this does not need to be applied to every file item type, just raw sequencing reads

0.145.0
=======
`PR 373: SN Add property replaced_by <https://github.com/smaht-dac/smaht-portal/pull/373>`_

* Add property `replaced_by` to File to link to replacement files for files that are retracted or obsolete

0.144.0
=======
`PR 371: SN Add uberon_id check for tissue <https://github.com/smaht-dac/smaht-portal/pull/371>`_

* Add property `valid_protocol_ids` to OntologyTerm that is a list of protocol IDs (e.g. 1D, 3A), the portion of `external_id` indicating tissue types
* Add a check to Tissue ensuring that the protocol ID in `external_id` is among the `valid_protocol_ids` for the OntologyTerm linked with uberon_id
* Add checks to Donor and Tissue ensuring that `external_id` matches expected format for Benchmarking and Production
* Makes `external_id` a required property for Donor


0.143.3
=======
`PR 377: Add not logged in alerts while navigating <https://github.com/smaht-dac/smaht-portal/pull/377>`_

* Adds "Not Logged In" alert to /search and /qc-metrics pages when navigated from another page like home page notifications or documentation pages
* Adds login popup link to logging in text in "Access was denied to this resource" alert


0.143.2
=======
`PR 374: Cypress Test.04 - search view updates <https://github.com/smaht-dac/smaht-portal/pull/374>`_

* Updates 04a_search_views_local.cy.js upon recent file search view and other search view changes


0.143.1
=======
`PR 372: chore: update text in data retraction alert <https://github.com/smaht-dac/smaht-portal/pull/372>`_

* Change "The" to "This"
* Remove hyperlink on file


0.143.0
=======
`PR 367: feat: COLO829BLT50 bam file retraction announcement <https://github.com/smaht-dac/smaht-portal/pull/367>`_

* Implement default warning banner for retracted files
* Add retraction announcement


0.142.3
=======
`PR 369: fix: file size NaN bug <https://github.com/smaht-dac/smaht-portal/pull/369>`_

* Prevent file size from rendering as NaN when undefined


0.142.2
=======
`PR 368: fix: prevent version tag bug <https://github.com/smaht-dac/smaht-portal/pull/368>`_

* style: keep version on one line
* fix: don't append "v" to version if already present


0.142.1
=======
`PR 359: feat: release tracker updates <https://github.com/smaht-dac/smaht-portal/pull/359>`_

* Enable release tracker Links


0.142.0
=======
`PR 309: SN validate external_id <https://github.com/smaht-dac/smaht-portal/pull/309>`_

* Add a custom validator to TissueSample that ensures the `external_id` for items from benchmarking and production Donors matches the pattern expected for category (currently only applied to TPC submitted items)
* Make `tpc_submitted` a required property for Donor


0.141.2
=======
`PR 366: SN reference genome facet <https://github.com/smaht-dac/smaht-portal/pull/366>`_

* Add `reference_genome.display_title` facet to all file types with a `reference_genome` property (AlignedReads, OutputFile, SupplementaryFile, and VariantCalls) so that the facet shows up in File Search view


0.141.1
=======
`PR 365: SN relatives enums <https://github.com/smaht-dac/smaht-portal/pull/365>`_

* Add enums to `relatives` in FamilyHistory


0.141.0
=======
`PR 349: SN OntologyTerm update <https://github.com/smaht-dac/smaht-portal/pull/349>`_

* Change `uberon_id`` in Tissue from a string to a linkTo to OntologyTerm
* Add upgrader for tissue
* Update File `sample_summary` to include tissue information from OntologyTerm


0.140.2
=======
`PR 362: page title and search table style updates <https://github.com/smaht-dac/smaht-portal/pull/362>`_

* Adds background and breadcrumb to Search View, My Profile, and Impersonate a User page titles
* Left aligns all search result table column's content unless it is explicitly defined (e.g. Benchmarking, Browse View, and File Search Views)
* Fixes missing File Search View registration with SubmittedFile
* Fixes LoadMoreAsYouScroll bug


0.140.1
=======
`PR 364: SN Release Tracker title <https://github.com/smaht-dac/smaht-portal/pull/364>`_

* Add "Consensus Reads" to `data_category` enums for File


0.140.0
=======
`PR 354: SN Release Tracker title <https://github.com/smaht-dac/smaht-portal/pull/354>`_
* 2025-02-21 / dmichaels
  - Branch: dmichaels-20250221-release-tracker-api-title | PR-355
    - Derived from branch: sn_release_tracker_title (commit: d202c1c55b69389d031070ada85ce180b1ed603d)
  - Changes to the release tracker API (i.e. /recent_files_summary) to use the new (calculated)
    property release_tracker_title (created by Sarah in branch: sn_release_tracker_title);
    old way of doing it can be accessed using the legacy=true URL query argument.
* Add calcprop to File, `release_tracker_title`, which displays in order of priority `override_release_tracker_title`, `CellCultureMixture.code`, `CellLine.code`, or `Tissue.display_title` for use as a header in the Release Tracker on the home page

0.139.0
=======
`PR 360: fix: add resources to hard-coded disabled breadcrumbs <https://github.com/smaht-dac/smaht-portal/pull/360>`_

* Disable breadcrumbs for resources pages


0.138.0
=======
`PR 351: FileSearchView for type=File search <https://github.com/smaht-dac/smaht-portal/pull/351>`

* New FileSearchView component to handle type=File searches
* Refactoring and improvements to BrowseView


0.137.4
=======
`PR 358: Cypress homepage and benchmarking facets test updates <https://github.com/smaht-dac/smaht-portal/pull/358>`

* Homepage: Test for timeline items and below-figure button clicks were improved
* Benchmarking: Bug fix for Exclude Properties test
* Browse view: Quick Info Bar test is skipped until data is available


0.137.3
=======
`PR 356: fix: correct existing data link <https://github.com/smaht-dac/smaht-portal/pull/356>`_

* fix: update link in doc


0.137.2
=======
`PR 353: fix: remove "DAC_DONOR_" from sample group title <https://github.com/smaht-dac/smaht-portal/pull/353>`_

* Remove "DAC_DONOR_" from sample group title


0.137.1
=======
`PR 352: SN Fix release date facet <https://github.com/smaht-dac/smaht-portal/pull/352>`_

* Fix facet for `file.json` so Release Date shows `file_status_tracking.released_date`


0.137.0
=======
`PR 350: SN Release tracker description <https://github.com/smaht-dac/smaht-portal/pull/350>`_

* Add property `override_release_tracker_description` to file.json that can set the calcprop `release_tracker_description` to desired value
* In `release-file.py`, require that a file has `release_tracker_description` set prior to release
* Make reference_genome `code` non-unique


0.136.0
=======
`PR 308 SN Pathology report <https://github.com/smaht-dac/smaht-portal/pull/308>`

* Add items PathologyReport, NonBrainPathologyReport, BrainPathologyReport, and HistologyImage


0.135.2
=======
`PR 343: feat: iPSC alert <https://github.com/smaht-dac/smaht-portal/pull/343>`_

* Add alert banner for iPSC


0.135.1
=======
`PR 347 feat: remove release tracker links <https://github.com/smaht-dac/smaht-portal/pull/347>`

* Remove links from release tracker


0.135.0
=======
* 2025-02-05 / dmichaels
  - Branch: dmichaels-20250130-release-tracker-api-add-submitted-file | PR-337
    - Derived from branch: main (commit: 8616c891bb93001d756f5a7eb6cbe0910d74780c)
    - With merged in branch: sn_dsa_embed -> NEVERMIND -> BACKED OUT THIS MERGE FOR THIS BRANCH
  - Added support for additional SubmittedFile type to release tracker API i.e. /recent_released_files.
    This requires that the new File.override_release_tracker_description property be populated for affected types;
    the calculated property release_tracker_description will depend on this (TODO: how is that populated).
  - Added support for qc_values "psuedo-columns" for smaht-submitr; and also for multiple sheets of same type.
    This is by virtue of using dcicutils.submitr.custom_excel.CustomExcel in ingestion_processor.py.
  - In ingestion/submission_folio.py no longer assume consortia comes through from submitr;
    this was causing problems for non-admin users; but actually changed it back to let it come through;
    went back/forth on this; in the end removed restricted_fields designation for consortia in mixins.json.
  - In ingestion/load_extensions.py use  noset_last_modified=True for loadxl call;
    this was causing problems for non-admin users; requires dcicsnovault 11.24.0+.
  - Updated the smaht-submitr spreadsheet template version;
    see SUBMITR_METADATA_TEMPLATE_SHEET_ID and METADATA_TEMPLATE_VERSION_SHEET in metadata_template.py


0.134.1
=======
`PR 329 SN Add Kinnex enums <https://github.com/smaht-dac/smaht-portal/pull/329>`

* Add enums to `data_category` and `data_type` in File schema for Kinnex file types


0.134.0
=======
`PR227: feat: VCF comparator and software information  <https://github.com/smaht-dac/smaht-portal/pull/227>`_

* Provide comparator information for VCFs in the file overview page


0.133.8
=======
`PR 312: BM submission doc fix<https://github.com/smaht-dac/smaht-portal/pull/312>`_

* Swap the "Validation" and "Submission" sections
* Slight text edit for first line in Validation section to remove reference to Submission paragraph


0.133.7
=======
`PR 338: Browse view 2 <https://github.com/smaht-dac/smaht-portal/pull/338>`_

* Add link to browse view from production data arrow
* Enlarge size of file data modal image
* Rework statistics data components to use new search method; pull more accurate data


0.133.6
=======
`PR 327: chore: add month back to latest header <https://github.com/smaht-dac/smaht-portal/pull/327>`_

* Update the notifications panel latest release item header to show month and year


0.133.5
=======
`PR 341 feat: add title row to top of detail page <https://github.com/smaht-dac/smaht-portal/pull/341>`_

- Remove title from excluded keys
- Add title row to top of details


0.133.4
=======
`PR 339 Embedd Metaworflow name into file <https://github.com/smaht-dac/smaht-portal/pull/339>`_

* Minor changes to the script that creates the input for the QC overview page
* Embedd Metaworflow name into file, so that we can query if a file has been the input to a specific MWF


0.133.3
=======
`PR 336 Cypress test updates <https://github.com/smaht-dac/smaht-portal/pull/336>`_

* Home page: added new tests for Data Release Tracker and Announcements feeds
* Home page: updated benchmarking/broduction expand/collapse panels
* Benchmarking: updated traversing tabs, sidebar navigation
* Benchmarking: added COLO829 SNV/Indel Detection Challenge tests
* Browse View: added new tests for results table and quick info bar


0.133.2
=======
* 2025-02-04 / dmichaels
  - Branch: dmichaels-20250204-fix-types-file | from main (94e6200508ee4116fefd54134eb24cd1a56fdf33) | PR-335
  - Fixed typo (missing comma in array list) in types/file.py.


0.133.1
=======
`PR 330 chore: update PI information for UW <https://github.com/smaht-dac/smaht-portal/pull/330>`_

* Update PI information in awardees page


0.133.0
=======
* 2025-02-03 / dmichaels
  - Branch: dmichaels-20250203-non-admin-view-raw | from main (54b86b7c6cd0910daafbe9c31c1be90d9120dcd3) | PR-333
  - Changed to allow non-admin users to use frame=raw; for smaht-submitr which relies on this.


0.132.2
=======
`PR 332 feat: add animation to sidebar <https://github.com/smaht-dac/smaht-portal/pull/332>`_

* Add animation to sliding sidebar


0.132.1
=======
`PR 328 fix: update broken link in error page <https://github.com/smaht-dac/smaht-portal/pull/328>`_

* Correct broken link to account creation doc


=======
0.132.0
=======
`PR 323 SN Ontology terms <https://github.com/smaht-dac/smaht-portal/pull/323>`_

* Update properties for OntologyTerm item to be implemented with Tissue `uberon_id`
* Add parent item Ontology


0.131.1
=======

* Show archival status of Unaligned Reads on Submission Status page


0.131.0
=======
`PR 319 SN Reference file columns <https://github.com/smaht-dac/smaht-portal/pull/319>`

* Remove `height`, `weight`, and `body_mass_index` from Donor, as these properties have been transferred to MedicalHistory;  remove `hardy_scale` from DeathCircumstances, as this property has been transferred to Donor

0.130.1
=======
`PR 325: feat: updates to notifications panel <https://github.com/smaht-dac/smaht-portal/pull/325>`

* Refactor Notifications Panel component


0.130.0
=======
* 2025-01-25 / dmichaels / branch: dmichaels-20250125-recent-files-summary-fix / PR-??
* Fix in endpoints/recent_files_summary/recent_files_summary.py/hoist_items_additional_value_up_one_level;
  was not checking existence first for: del item[additional_value_property_name]


0.129.0
=======
`Submissions statistics updates  <https://github.com/smaht-dac/smaht-portal/pull/317>`_

* New GCC-only, TTD-only etc. filtering options for the submission statistics page
* New hide empty columns setting in the usage statistics page
* New high contrast setting for the usage statistics page
* New date histogram interval options for the submission statistics page
* Change file item type to SubmittedFile for the submission statistics page
* Refactor cumulative sum calculation


0.128.2
=======

* Add key metrics to QC metrics


0.128.1
=======
`PR 307: fix: adjust data release date on safari <https://github.com/smaht-dac/smaht-portal/pull/307>`

* Adjust release date to prevent safari "Invalid date" bug


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
