FRESH_PRESERVATION_TYPES = ["Fresh", "Frozen", "Snap Frozen"]
FIXED_PRESERVATION_TYPE = "Fixed"

# Because linking is "all fixed <-> all fresh in the same tissue block" rather than
# spatially adjacent aliquots, brain and non-brain tissue collapse into one flat map --
# each hippocampus hemisphere already has its own protocol code, so laterality is
# enforced by the map itself with no special-case code needed.
FRESH_TO_FIXED_PROTOCOL_MAP = {
    # Non-brain solid tissues
    "3C": "3D",    # Esophagus
    "3E": "3F",    # Colon, Ascending
    "3G": "3H",    # Colon, Descending
    "3I": "3J",    # Liver
    "3K": "3L",    # Adrenal Gland, Left
    "3M": "3N",    # Adrenal Gland, Right
    "3O": "3P",    # Aorta, Abdominal
    "3Q": "3R",    # Lung
    "3S": "3T",    # Heart, LV
    "3U": "3V",    # Testis, Left
    "3W": "3X",    # Testis, Right
    "3Y": "3Z",    # Ovary, Left
    "3AA": "3AB",  # Ovary, Right
    "3AD": "3AE",  # Skin, Calf
    "3AF": "3AG",  # Skin, Abdomen
    "3AH": "3AI",  # Muscle
    # Benchmarking
    "1A": "1C",    # Liver
    "1D": "1F",    # Lung
    "1G": "1I",    # Colon
    "1J": "1L",    # Skin (specimen)
    "1K": "1L",    # Skin (core)
    # Brain subregions (laterality enforced by distinct protocol codes)
    "3AK": "3AP",  # Frontal Lobe
    "3AL": "3AQ",  # Temporal Lobe
    "3AM": "3AR",  # Cerebellum
    "3AN": "3AS",  # Hippocampus, Left hemisphere
    "3AO": "3AT",  # Hippocampus, Right hemisphere
}
