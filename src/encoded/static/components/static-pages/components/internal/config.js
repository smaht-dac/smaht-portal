'use strict';

export const PAGE_SIZE = 30;

export const ANALYSIS_RUN_TAGS = ['ready_to_release', 'run_complete'];

export const ANALYSIS_RUN_DEFAULT_FILTER = {
    analysis_type: 'all',
    include_tags: [],
    exclude_tags: [],
};

export const TAG_REVIEWED = 'reviewed';
export const TAG_READY_TO_RELEASE = 'ready_to_release';

export const SUBMISSION_STATUS_TAGS = [
    TAG_READY_TO_RELEASE,
    TAG_REVIEWED,
];

// Automated fileset QC review (the "Review" button on the submission status table)
export const AUTO_REVIEW_COMMENT_PREFIX = '[auto-review]';
export const AUTO_REVIEW_COVERAGE_THRESHOLD = 0.75;
// Must match COVERAGE_DERIVED_FROM in src/encoded/types/quality_metric.py
export const COVERAGE_QC_METRIC = 'mosdepth:total';

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
