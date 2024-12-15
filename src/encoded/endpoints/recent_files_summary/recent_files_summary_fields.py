# These are all the possible fields on which the /recent_files_summary endpoint can aggregate by.
# Various flags modify the specifics, for experimentation, troubleshooting, and possible future changes.

AGGREGATION_FIELD_RELEASE_DATE = "file_status_tracking.released"
# FYI FWIW: There is also file_sets.libraries.analytes.samples.sample_sources.display_title;
# and that sometimes file_sets.libraries.analytes.samples.sample_sources.code does not exist.
AGGREGATION_FIELD_CELL_MIXTURE = "file_sets.libraries.analytes.samples.sample_sources.code"
AGGREGATION_FIELD_CELL_LINE = "file_sets.libraries.analytes.samples.sample_sources.cell_line.code"
AGGREGATION_FIELD_DONOR = "donors.display_title"
AGGREGATION_FIELD_FILE_DESCRIPTOR = "release_tracker_description"

AGGREGATION_FIELD_GROUPING_CELL_OR_DONOR = [
    AGGREGATION_FIELD_CELL_MIXTURE,
    AGGREGATION_FIELD_CELL_LINE,
    AGGREGATION_FIELD_DONOR
]
