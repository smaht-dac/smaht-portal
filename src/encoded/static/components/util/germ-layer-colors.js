'use strict';

// Single source of truth for germ-layer/category display colors, mirroring
// item_utils/tissue.py's get_category() return values. Shared by
// viz/Matrix/DataMatrix.js and browse-view/BrowseTissueHeatmapTable.js so the
// palette isn't hardcoded in two places.
export const GERM_LAYER_COLORS = {
    Ectoderm: { backgroundColor: '#367151', textColor: '#ffffff' },
    Mesoderm: { backgroundColor: '#30975e', textColor: '#ffffff' },
    Endoderm: { backgroundColor: '#53b27e', textColor: '#ffffff' },
    'Germ Cells': { backgroundColor: '#80c4a0', textColor: '#ffffff' },
    'Clinically Accessible': { backgroundColor: '#70a588', textColor: '#ffffff' },
};
