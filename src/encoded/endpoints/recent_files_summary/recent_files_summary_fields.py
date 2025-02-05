# These are all the possible fields on which the /recent_files_summary endpoint can aggregate by.
# Various flags modify the specifics, for experimentation, troubleshooting, and possible future changes.
# N.B. AGGREGATION_FIELD_CELL_LINE is actually not used by default (see nocells in recent_files_summary.py).
# FYI FWIW: There is also file_sets.libraries.analytes.samples.sample_sources.display_title;
# and that sometimes file_sets.libraries.analytes.samples.sample_sources.code does not exist.

AGGREGATION_FIELD_RELEASE_DATE = "file_status_tracking.released"
AGGREGATION_FIELD_CELL_MIXTURE = "file_sets.libraries.analytes.samples.sample_sources.code"
AGGREGATION_FIELD_DONOR = "donors.display_title"
AGGREGATION_FIELD_DSA_DONOR = "donor_specific_assembly.donors,display_title"  # 2025-02-04
AGGREGATION_FIELD_CELL_LINE = "file_sets.libraries.analytes.samples.sample_sources.cell_line.code"  # unused by default
AGGREGATION_FIELD_FILE_DESCRIPTOR = "release_tracker_description"

AGGREGATION_FIELD_GROUPING_CELL_OR_DONOR = [
    AGGREGATION_FIELD_CELL_MIXTURE,
    AGGREGATION_FIELD_DONOR
]
