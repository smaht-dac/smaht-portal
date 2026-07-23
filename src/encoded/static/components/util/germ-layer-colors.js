'use strict';

// Single source of truth for germ-layer/category display colors, mirroring
// item_utils/tissue.py's get_category() return values ("Ectoderm", "Mesoderm",
// "Endoderm", "Germ Cells", "Clinically Accessible"). Shared by
// viz/Matrix/DataMatrix.js's DEFAULT_ROW_GROUPS_EXTENDED and
// browse/browse-view/BrowseTissueHeatmapTable.js's column-group headers, so
// the same palette isn't hardcoded in two places.
export const GERM_LAYER_COLORS = {
    Ectoderm: { backgroundColor: '#367151', textColor: '#ffffff' },
    Mesoderm: { backgroundColor: '#30975e', textColor: '#ffffff' },
    Endoderm: { backgroundColor: '#53b27e', textColor: '#ffffff' },
    'Germ Cells': { backgroundColor: '#80c4a0', textColor: '#ffffff' },
    'Clinically Accessible': { backgroundColor: '#70a588', textColor: '#ffffff' },
};
