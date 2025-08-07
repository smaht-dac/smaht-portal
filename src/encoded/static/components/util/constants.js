export const TISSUE_CATEGORIES = {
    Ectoderm: {
        values: [
            'Brain',
            'Brain - Cerebellum',
            'Brain - Frontal lobe',
            'Brain - Hippocampus',
            'Brain - Temporal lobe',
            'Skin',
            'Skin - Abdomen (non-exposed)',
            'Skin - Calf (sun-exposed)',
        ],
        backgroundColor: '#367151',
        textColor: '#ffffff',
        shortName: 'Ecto',
    },
    Mesoderm: {
        values: ['Aorta', 'Fibroblast', 'Heart', 'Muscle', 'Adrenal Gland'],
        backgroundColor: '#30975e',
        textColor: '#ffffff',
        shortName: 'Meso',
    },
    Endoderm: {
        values: [
            'Colon',
            'Colon - Ascending',
            'Colon - Descending',
            'Esophagus',
            'Liver',
            'Lung',
        ],
        backgroundColor: '#53b27e',
        textColor: '#ffffff',
        shortName: 'Endo',
    },
    'Germ cells': {
        values: ['Ovary', 'Testis'],
        backgroundColor: '#80c4a0',
        textColor: '#ffffff',
        shortName: 'Germ',
    },
    'Clinically accessible': {
        values: ['Blood', 'Buccal swab', 'Buccal Swab'],
        backgroundColor: '#70a588',
        textColor: '#ffffff',
        shortName: 'Clin',
    },
};

/**
 * Reverse look up map for tissue names to their respective categories.
 */
export const TISSUE_TO_CATEGORY = new Map();

for (const [category, { values }] of Object.entries(TISSUE_CATEGORIES)) {
    for (const tissue of values) {
        TISSUE_TO_CATEGORY.set(tissue, category);
    }
}
