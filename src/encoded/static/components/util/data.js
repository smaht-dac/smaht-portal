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

const tissueInternalCodeByTpcCode = {
    '3A': 'BLOO',
    '3B': 'BUCC',
    '3C': 'ESOP',
    '3E': 'COAS',
    '3G': 'CODS',
    '3I': 'LIVR',
    '3K': 'ADGL',
    '3M': 'ADGR',
    '3O': 'AORT',
    '3Q': 'LUNG',
    '3S': 'HART',
    '3U': 'TESL',
    '3W': 'TESR',
    '3Y': 'OVAL',
    '3AA': 'OVAR',
    '3AC': 'FBRO',
    '3AD': 'SKSE',
    '3AF': 'SKNE',
    '3AH': 'MUSC',
    '3AK': 'BRFL',
    '3AL': 'BRTL',
    '3AM': 'BRCE',
    '3AN': 'BRHL',
    '3AO': 'BRHR',
};

const tissueInternalCodeByTissueName = {
    Fibroblast: 'FBRO',
};

// this mapping is for fallback case when File item has missing tissue category (sample_summary.category)
// it will be removed when all items have tissue category, but for now it is needed to categorize items without tissue category
const tissueCategoryByTpcCode = {
    '3A': 'Clinically accessible',
    '3B': 'Clinically accessible',
    '3C': 'Endoderm',
    '3E': 'Endoderm',
    '3G': 'Endoderm',
    '3I': 'Endoderm',
    '3K': 'Mesoderm',
    '3M': 'Mesoderm',
    '3O': 'Mesoderm',
    '3Q': 'Endoderm',
    '3S': 'Mesoderm',
    '3U': 'Germ cells',
    '3W': 'Germ cells',
    '3Y': 'Germ cells',
    '3AA': 'Germ cells',
    '3AC': 'Mesoderm',
    '3AD': 'Ectoderm',
    '3AF': 'Ectoderm',
    '3AH': 'Mesoderm',
    '3AK': 'Ectoderm',
    '3AL': 'Ectoderm',
    '3AM': 'Ectoderm',
    '3AN': 'Ectoderm',
    '3AO': 'Ectoderm',
};

const tissueCategoryByTissueName = {
    Fibroblast: 'Mesoderm',
};

/**
 * Parse a tissue facet term into a short code (if present).
 * E.g. 3AK - Brain, Frontal Lobe =>  { code: '3AK', tissue: 'Brain, Frontal Lobe', hasCode: true }
 * E.g. 3Y - Ovary, L =>  { code: '3Y', tissue: 'Ovary, L', hasCode: true }
 * E.g. 3I - Liver =>  { code: '3I', tissue: 'Liver', hasCode: true }
 */
const parseTissueTermForSort = (termKey) => {
    const raw = String(termKey || '').trim();
    if (!raw) {
        return { tissue: '', code: '', hasCode: false };
    }
    const parts = raw.split(' - ');
    if (parts.length >= 2) {
        const code = parts.shift().trim();
        const tissuePart = parts.join(' - ').trim();
        const tissue = tissuePart.split(',')[0].trim();
        return { tissue, code, hasCode: code.length > 0 };
    }
    const tissue = raw.split(',')[0].trim();
    return { tissue, code: '', hasCode: false };
};

/**
 * Currently, we only use tissue code for the comparison/sorting of tissue facet terms.
 * @param {*} a - First tissue facet term to compare.
 * @param {*} b - Second tissue facet term to compare.
 * @returns {number} Comparison result for sorting.
 */
const compareTissueFacetTerms = (a, b) => {
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

/**
 * Returns internal tissue code for a tissue facet term if available.
 * Prioritizes TPC code mapping and then falls back to tissue name mapping.
 */
const getTissueInternalCodeFromFacetTerm = (termKey) => {
    const { tissue, code, hasCode } = parseTissueTermForSort(termKey);
    if (hasCode) {
        const mappedByCode = tissueInternalCodeByTpcCode[String(code).toUpperCase()];
        if (mappedByCode) return mappedByCode;
    }
    return tissueInternalCodeByTissueName[tissue] || null;
};

/**
 * Returns tissue category for a tissue facet term if available.
 * Prioritizes TPC code mapping and then falls back to tissue name mapping.
 */
const getTissueCategoryFromFacetTerm = (termKey) => {
    const { tissue, code, hasCode } = parseTissueTermForSort(termKey);
    if (hasCode) {
        const mappedByCode = tissueCategoryByTpcCode[String(code).toUpperCase()];
        if (mappedByCode) return mappedByCode;
    }
    return tissueCategoryByTissueName[tissue] || null;
};

export {
    germLayerTissueMapping,
    tissueToCategory,
    compareTissueFacetTerms,
    getTissueInternalCodeFromFacetTerm,
    getTissueCategoryFromFacetTerm,
};
