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

// There is currently no good way to get these from the portal.
// Since this is a set list, we will hardcode them for now.
export const PRIMARY_PRODUCTION_TISSUES = [
    'Adrenal Gland',
    'Aorta',
    'Blood',
    'Brain',
    'Buccal Swab',
    'Colon',
    'Esophagus',
    'Heart',
    'Liver',
    'Lung',
    'Muscle',
    'Ovary',
    'Skin',
    'Testis',
];

export const CELL_CULTURE_MIXTURES = [
    'HAPMAP6',
    'COLO829BLT50',
];
