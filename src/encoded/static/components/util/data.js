/**
 * Mapping of germ layer names to their associated tissue types.
 * Some tissue types are repeating - please do not remove duplicates since it may affect data-matrix visualizations.
 */
const germLayerTissueMapping = {
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
            'Non-exposed Skin',
            'Sun-exposed Skin',
        ],
    },
    Mesoderm: {
        values: ['Aorta', 'Fibroblast', 'Heart', 'Muscle', 'Adrenal Gland'],
    },
    Endoderm: {
        values: [
            'Colon',
            'Colon - Ascending',
            'Colon - Descending',
            'Ascending Colon',
            'Descending Colon',
            'Esophagus',
            'Liver',
            'Lung',
        ],
    },
    'Germ cells': {
        values: ['Ovary', 'Testis'],
    },
    'Clinically accessible': {
        values: ['Blood', 'Buccal swab', 'Buccal Swab'],
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

/**
 * Parse a tissue facet term into a short code (if present).
 */
const parseTissueTermForSort = (termKey) => {
    const raw = String(termKey || '').trim();
    if (!raw) {
        return { code: '', hasCode: false };
    }
    const parts = raw.split(' - ');
    if (parts.length >= 2) {
        const code = parts.shift().trim();
        return { code, hasCode: code.length > 0 };
    }
    return { code: '', hasCode: false };
};

const compareFacetTermsByTissueAndCode = (a, b) => {
    const aKey = a?.key || a?.props?.term?.key || '';
    const bKey = b?.key || b?.props?.term?.key || '';
    if (!aKey && !bKey) return 0;
    if (!aKey) return 1;
    if (!bKey) return -1;

    const aParsed = parseTissueTermForSort(aKey);
    const bParsed = parseTissueTermForSort(bKey);
    if (aParsed.hasCode !== bParsed.hasCode) {
        return aParsed.hasCode ? -1 : 1;
    }
    if (aParsed.hasCode && bParsed.hasCode) {
        const codeCmp = aParsed.code.localeCompare(bParsed.code, undefined, {
            numeric: true,
            sensitivity: 'base',
        });
        if (codeCmp !== 0) {
            return codeCmp;
        }
    }
    return String(aKey).localeCompare(String(bKey));
};

export {
    germLayerTissueMapping,
    tissueToCategory,
    compareFacetTermsByTissueAndCode,
};
