'use strict';

export const PAGE_SIZE = 30;

export const ANALYSIS_RUN_TAGS = ['ready_to_release', 'run_complete'];

export const ANALYSIS_RUN_DEFAULT_FILTER = {
    analysis_type: 'all',
    include_tags: [],
    exclude_tags: [],
};

export const SUBMISSION_STATUS_TAGS = [
    'ready_to_release',
    'reviewed',
    'submitted_files_copied',
    'output_files_copied',
];

export const SUBMISSION_STATUS_DEFAULT_FILTER = {
    submission_center: 'all_gcc',
    fileset_status: 'in review',
    include_tags: [],
    exclude_tags: [],
};

export const EXTERNAL_RELEASE_STATUSES = ['open', 'protected'];
export const INTERNAL_RELEASE_STATUSES = [
    'open-early',
    'open-network',
    'protected-early',
    'protected-network',
];

export const CELL_CULTURE_MIXTURES = ['HAPMAP6', 'COLO829BLT50'];

export const ANALYSIS_TYPES = [
    'Germline SNV calling',
    'Somatic SNV calling',
    'Somatic SNV calling (core specific)',
    'Somatic SV calling',
];
