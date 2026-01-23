/**
 * Mapping of germ layer names to their associated tissue types.
 * Some tissue types are repeating - please do not remove duplicates since it may affect data-matrix visualizations.
 */
const germLayerTissueMapping = {
    Ectoderm: {
        values: [
            'Brain',
            'Skin',
        ],
    },
    Mesoderm: {
        values: [
            'Aorta', 
            'Fibroblast', 
            'Heart', 
            'Muscle', 
            'Adrenal Gland'],
    },
    Endoderm: {
        values: [
            'Colon',
            'Esophagus',
            'Liver',
            'Lung',
        ],
    },
    'Germ cells': {
        values: [
            'Ovary', 
            'Testis'
        ],
    },
    'Clinically accessible': {
        values: [
            'Blood', 
            'Buccal Swab'
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
