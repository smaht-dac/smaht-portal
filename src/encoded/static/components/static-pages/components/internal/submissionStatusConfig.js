'use strict';

export const PAGE_SIZE = 30;

export const SUBMISSION_STATUS_TAGS = [
    'ready_to_release',
    'reviewed',
    'submitted_files_copied',
    'output_files_copied',
];

export const DEFAULT_FILTER = {
    submission_center: 'all_gcc',
    fileset_status: 'in review',
    include_tags: [],
    exclude_tags: [],
};
