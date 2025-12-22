/**
 * Mapping of germ layer names to their associated tissue types.
 * Some tissue types are repeating - please do not remove duplicates since it may affect data-matrix visualizations.
 */
const germLayerTissueMapping = {
    Ectoderm: {
        values: [
            'Brain',
            '3AK - Brain',
            '3AL - Brain',
            '3AM - Brain',
            '3AN - Brain',
            '3AO - Brain',
            'Skin',
            'Non-exposed Skin',
            '3AF - Non-exposed Skin',
            'Sun-exposed Skin',
            '3AD - Sun-exposed Skin',
            '3AD - Skin',
            '3AF - Skin',
        ],
    },
    Mesoderm: {
        values: [
            'Aorta',
            '3O - Aorta',
            'Fibroblast',
            '3AC - Fibroblast',
            'Heart',
            '3S - Heart',
            'Muscle',
            '3AH - Muscle',
            'Adrenal Gland',
            '3K - Adrenal Gland',
            '3M - Adrenal Gland',
        ],
    },
    Endoderm: {
        values: [
            'Colon',
            'Colon - Ascending',
            'Colon - Descending',
            'Ascending Colon',
            '3E - Ascending Colon',
            'Descending Colon',
            '3G - Descending Colon',
            'Esophagus',
            '3C - Esophagus',
            'Liver',
            '3I - Liver',
            'Lung',
            '3Q - Lung',
        ],
    },
    'Germ cells': {
        values: [
            'Ovary',
            '3Y - Ovary',
            '3AA - Ovary',
            'Testis',
            '3U - Testis',
            '3W - Testis',
        ],
    },
    'Clinically accessible': {
        values: [
            'Blood',
            '3A - Blood',
            'Buccal swab',
            'Buccal Swab',
            '3B - Buccal Swab',
        ],
    },
};

/**
 * Reverse look up map for tissue names to their respective categories.
 */
const tissueToCategory = new Map();

for (const [category, { values }] of Object.entries(germLayerTissueMapping)) {
    for (const tissue of values) {
        tissueToCategory.set(tissue, category);
    }
}

export { germLayerTissueMapping, tissueToCategory };
