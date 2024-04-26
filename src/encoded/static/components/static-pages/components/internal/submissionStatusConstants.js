'use strict';

export const PAGE_SIZE = 30;

// Status tags
const REVIEWED = 'reviewed';
const STATUS_TAGS = [REVIEWED];

// O2 tags
const DOWNLOAD_SUBMITTED_FILES_COMPLETE = 'submitted_files_copied';
const DOWNLOAD_OUTPUT_FILES_COMPLETE = 'output_files_copied';
const O2_TAGS = [
    DOWNLOAD_SUBMITTED_FILES_COMPLETE,
    DOWNLOAD_OUTPUT_FILES_COMPLETE,
];

export const SUBMISSION_STATUS_TAGS = STATUS_TAGS.concat(O2_TAGS);

export const DEFAULT_FILTER = {
    submission_center: 'all_gcc',
    fileset_status: 'in review',
    include_tags: [],
    exclude_tags: [],
};
