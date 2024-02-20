============
smaht-portal
============


----------
Change Log
----------

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
