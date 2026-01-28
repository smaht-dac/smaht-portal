/**
 * Mapping of germ layer names to their associated tissue types.
 * Some tissue types are repeating - please do not remove duplicates since it may affect data-matrix visualizations.
 */
const germLayerTissueMapping = {
    Ectoderm: {
        values: [
            "Brain",
            "Brain, FL 3AK",
            "Brain, TL 3AL",
            "Brain, CB 3AM",
            "Brain, HL 3AN",
            "Brain, HR 3AO",
            "Skin",
            "Non-exposed Skin",
            "Sun-exposed Skin",
            "Skin, SE 3AD",
            "Skin, NE 3AF",
        ],
    },
    Mesoderm: {
        values: [
            "Aorta",
            "Aorta 3O",
            "Fibroblast",
            "Fibroblast 3AC",
            "Heart",
            "Heart 3S",
            "Muscle",
            "Muscle 3AH",
            "Adrenal Gland",
            "Adrenal Gland, L 3K",
            "Adrenal Gland, R 3M",
        ],
    },
    Endoderm: {
        values: [
            "Colon",
            "Colon - Ascending",
            "Colon - Descending",
            "Ascending Colon",
            "Descending Colon",
            "Colon, Asc 3E",
            "Colon, Desc 3G",
            "Esophagus",
            "Esophagus 3C",
            "Liver",
            "Liver 3I",
            "Lung",
            "Lung 3Q",
        ],
    },
    'Germ cells': {
        values: [
            "Ovary",
            "Ovary, L 3Y",
            "Ovary, R 3AA",
            "Testis",
            "Testis, L 3U",
            "Testis, R 3W",
        ],
    },
    'Clinically accessible': {
        values: [
            "Blood",
            "Blood 3A",
            "Buccal swab",
            "Buccal Swab",
            "Buccal Swab 3B",
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
