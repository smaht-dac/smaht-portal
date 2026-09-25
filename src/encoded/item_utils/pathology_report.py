from typing import Any, Dict, List, Optional


# Ascending order of `target_tissue_percentage` bands, as defined in
# schemas/non_brain_pathology_report.json. Used to pick the highest band
# present across a report's target_tissues entries.
TARGET_TISSUE_PERCENTAGE_ORDER = ["0", "[0-10]", "[11-25]", "[26-49]", "[50-100]"]

# Ascending order of `non_target_tissue_percentage` bands, as defined in
# schemas/non_brain_pathology_report.json -- no "0" option, unlike
# TARGET_TISSUE_PERCENTAGE_ORDER above (non_target_tissues entries are only
# ever reported when actually present, so there's no "0% present" band to
# represent).
NON_TARGET_TISSUE_PERCENTAGE_ORDER = ["[0-10]", "[11-25]", "[26-49]", "[50-100]"]

# (present_field, description_field, display label) for each `*_present`/
# `*_description` field pair on BrainPathologyReport that don't share a
# single array shape (unlike NonBrainPathologyReport.pathologic_findings),
# so presence has to be checked field-by-field. Fixed display order used by
# get_brain_findings below to turn these scattered pairs into one uniform
# list, the same shape NonBrainPathologyReport's own pathologic_findings
# array already has. Includes `artifacts_present`/`artifacts_description`
# (last entry) too -- see its own inline comment below for why.
BRAIN_FINDING_CATEGORIES = [
    ("developmental_neuropathology_present", "developmental_neuropathology_description", "Developmental"),
    ("infectious_neuropathology_present", "infectious_neuropathology_description", "Infectious"),
    ("inflammatory_neuropathology_present", "inflammatory_neuropathology_description", "Inflammatory"),
    ("neoplastic_neuropathology_present", "neoplastic_neuropathology_description", "Neoplastic"),
    ("tbi_neuropathology_present", "tbi_neuropathology_description", "TBI"),
    ("vascular_neuropathology_present", "vascular_neuropathology_description", "Vascular"),
    ("neurodegenerative_neuropathology_present", "neurodegenerative_neuropathology_description", "Neurodegenerative"),
    ("metabolic_neuropathology_present", "metabolic_neuropathology_description", "Metabolic"),
    ("other_pathology_present", "other_pathology_description", "Other"),
    # Not a neuropathologic finding per se (it flags specimen/staining
    # quality issues, not a disease process) but real submissions report it
    # via the exact same present/description field-pair shape as every
    # category above, and curators are used to seeing it alongside them in
    # the source spreadsheet -- included here (last) so the portal's own
    # Neuropathology Findings tab shows the same full column set.
    ("artifacts_present", "artifacts_description", "Artifacts"),
]

# Just the `*_present` fields from BRAIN_FINDING_CATEGORIES above, EXCLUDING
# `artifacts_present` -- has_pathologic_finding below treats this as "is
# there a real pathologic finding", and an artifact is a specimen/staining
# quality issue, not a disease process (see BRAIN_FINDING_CATEGORIES' own
# inline comment on it), so it must not flip Tissue.pathology_summary's
# existing pathologic_finding_present to true on its own.
BRAIN_FINDING_PRESENT_FIELDS = [
    present_field
    for present_field, _desc, _label in BRAIN_FINDING_CATEGORIES
    if present_field != "artifacts_present"
]

# Ordinal (enum-string) BrainPathologyReport staging fields, each with its
# own fixed severity scale (schemas/brain_pathology_report.json) -- used by
# _staging_value_sort_key below to compare 2 values of the same field by
# scale position rather than lexicographically (e.g. "II" > "I", not
# string-sorted). Every other BRAIN_STAGING_FIELDS entry is a plain integer
# score, which compares directly with no lookup needed.
BRAIN_STAGING_ORDINAL_ORDERS: Dict[str, List[str]] = {
    "ad_neuropathologic_change_level": ["None", "Low", "Intermediate", "High"],
    "small_vessel_disease": ["None", "Mild", "Moderate", "Severe"],
    "braak_and_braak_ad": ["0", "I", "II", "III", "IV", "V", "VI"],
}

# Every BrainPathologyReport neurodegenerative disease staging/severity
# score field, in a fixed display order -- (field, display label).
BRAIN_STAGING_FIELDS = [
    ("abc_score_A", "ABC Score A"),
    ("abc_score_B", "ABC Score B"),
    ("abc_score_C", "ABC Score C"),
    ("cerad_score", "CERAD"),
    ("ad_neuropathologic_change_level", "AD Neuropathologic Change"),
    ("braak_pd", "Braak PD"),
    ("small_vessel_disease", "Small Vessel Disease"),
    ("braak_and_braak_ad", "Braak & Braak AD"),
    ("thal", "Thal"),
    ("caa_vonsattel", "CAA VonSattel"),
    ("mckeith", "McKeith"),
    ("vonsattel_hd", "VonSattel HD"),
]


def get_tissue_samples(properties: Dict[str, Any]) -> List[str]:
    """Get tissue_samples from properties."""
    return properties.get("tissue_samples", [])


def get_histology_images(properties: Dict[str, Any]) -> List[str]:
    """Get histology_images (rev link) from properties."""
    return properties.get("histology_images", []) or []


def get_tissue_autolysis_score(properties: Dict[str, Any]) -> Optional[int]:
    """Get autolysis score from a pathology report.

    NonBrainPathologyReport carries a single report-level score.
    BrainPathologyReport instead scores per brain_subregions entry, so take
    the max across present subregions as the report-level summary.
    """
    if "tissue_autolysis_score" in properties:
        return properties.get("tissue_autolysis_score")
    subregions = properties.get("brain_subregions") or []
    scores = [
        subregion.get("tissue_autolysis_score")
        for subregion in subregions
        if subregion.get("is_present") == "Yes"
        and subregion.get("tissue_autolysis_score") is not None
    ]
    return max(scores) if scores else None


def has_non_target_tissue_presence(properties: Dict[str, Any]) -> Optional[bool]:
    """Check if any non-target tissue was present in a pathology report.

    Only NonBrainPathologyReport has this concept; BrainPathologyReport has
    no equivalent field, so this returns None (not applicable) for it.
    """
    if "non_target_tissues" not in properties:
        return None
    return any(
        entry.get("non_target_tissue_present") == "Yes"
        for entry in properties.get("non_target_tissues") or []
    )


def get_target_tissue_percentage(properties: Dict[str, Any]) -> Optional[str]:
    """Get the highest target_tissue_percentage band across a report's target tissues.

    Only NonBrainPathologyReport has this concept (`target_tissues` array);
    BrainPathologyReport has no equivalent field, so this returns None (not
    applicable) for it.
    """
    if "target_tissues" not in properties:
        return None
    bands = [
        entry.get("target_tissue_percentage")
        for entry in properties.get("target_tissues") or []
        if entry.get("target_tissue_present") == "Yes"
        and entry.get("target_tissue_percentage") in TARGET_TISSUE_PERCENTAGE_ORDER
    ]
    if not bands:
        return None
    return max(bands, key=TARGET_TISSUE_PERCENTAGE_ORDER.index)


def get_target_tissue_subtypes(properties: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Get the un-collapsed list of present target-tissue subtype entries from one report.

    Only NonBrainPathologyReport has this concept (`target_tissues` array);
    BrainPathologyReport has no equivalent field, so this returns [] for it.
    Unlike get_target_tissue_percentage, this does NOT collapse multiple
    entries down to a single value -- each present subtype (e.g. Endocardium,
    Myocardium, Epicardium for a Heart report) is returned separately so a
    caller can aggregate per-subtype instead of per-report.
    """
    if "target_tissues" not in properties:
        return []
    return [
        {
            "subtype": entry.get("target_tissue_subtype"),
            "percentage": entry.get("target_tissue_percentage"),
            "autolysis_score": entry.get("target_tissue_autolysis_score"),
        }
        for entry in properties.get("target_tissues") or []
        if entry.get("target_tissue_present") == "Yes" and entry.get("target_tissue_subtype")
    ]


def get_non_target_tissue_percentage(properties: Dict[str, Any]) -> Optional[str]:
    """Get the highest non_target_tissue_percentage band across a report's non-target tissues.

    Only NonBrainPathologyReport has this concept (`non_target_tissues` array);
    BrainPathologyReport has no equivalent field, so this returns None (not
    applicable) for it.
    """
    if "non_target_tissues" not in properties:
        return None
    bands = [
        entry.get("non_target_tissue_percentage")
        for entry in properties.get("non_target_tissues") or []
        if entry.get("non_target_tissue_present") == "Yes"
        and entry.get("non_target_tissue_percentage") in NON_TARGET_TISSUE_PERCENTAGE_ORDER
    ]
    if not bands:
        return None
    return max(bands, key=NON_TARGET_TISSUE_PERCENTAGE_ORDER.index)


def get_non_target_tissue_subtypes(properties: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Get the un-collapsed list of present non-target-tissue subtype entries from one report.

    Only NonBrainPathologyReport has this concept (`non_target_tissues` array);
    BrainPathologyReport has no equivalent field, so this returns [] for it.
    Unlike get_non_target_tissue_percentage, this does NOT collapse multiple
    entries down to a single value -- each present subtype (e.g. Fibroadipose,
    Lymphoid) is returned separately so a caller can aggregate per-subtype
    instead of per-report. Unlike target_tissues, a non_target_tissues entry
    has no per-subtype autolysis_score field at all (see the schema), so
    there's nothing equivalent to include here.
    """
    if "non_target_tissues" not in properties:
        return []
    return [
        {
            "subtype": entry.get("non_target_tissue_subtype"),
            "percentage": entry.get("non_target_tissue_percentage"),
        }
        for entry in properties.get("non_target_tissues") or []
        if entry.get("non_target_tissue_present") == "Yes" and entry.get("non_target_tissue_subtype")
    ]


def has_pathologic_finding(properties: Dict[str, Any]) -> Optional[bool]:
    """Check if any unexpected/pathologic finding was present in a pathology report.

    NonBrainPathologyReport uses a `pathologic_findings` array; BrainPathologyReport
    spreads the same concept across several discrete `*_present` fields.
    """
    if "pathologic_findings" in properties:
        return any(
            entry.get("finding_present") == "Yes"
            for entry in properties.get("pathologic_findings") or []
        )
    if any(field in properties for field in BRAIN_FINDING_PRESENT_FIELDS):
        return any(
            properties.get(field) == "Yes" for field in BRAIN_FINDING_PRESENT_FIELDS
        )
    return None


def get_brain_findings(properties: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Get the per-category neuropathology finding list from a pathology report.

    Only BrainPathologyReport has this concept (a fixed set of discrete
    `*_present`/`*_description` field pairs, see BRAIN_FINDING_CATEGORIES);
    NonBrainPathologyReport's equivalent concept is the single
    `pathologic_findings` array (see has_pathologic_finding), so this
    returns [] for it. A category is only included when its `*_present`
    field was actually submitted -- one BrainPathologyReport submission
    needn't address every category, and an omitted one isn't the same as an
    explicit "No".
    """
    return [
        {
            "category": label,
            "present": properties.get(present_field) == "Yes",
            "description": properties.get(description_field),
        }
        for present_field, description_field, label in BRAIN_FINDING_CATEGORIES
        if present_field in properties
    ]


def get_merged_brain_findings(
    reports_findings: List[List[Dict[str, Any]]]
) -> List[Dict[str, Any]]:
    """Collapse several reports' own get_brain_findings() lists into one, one entry per category.

    A Tissue can rev-link more than 1 TissueSample (e.g. Fixed + Frozen),
    each with its own PathologyReport -- `present` is OR'd across reports
    (present in any report -> present overall, same "worth flagging" bias
    autolysis_score's own max-across-reports collapsing uses); `description`
    keeps the first non-empty description seen for that category.
    """
    merged: Dict[str, Dict[str, Any]] = {}
    for findings in reports_findings:
        for entry in findings:
            category = entry.get("category")
            if not category:
                continue
            bucket = merged.setdefault(
                category, {"category": category, "present": False, "description": None}
            )
            if entry.get("present"):
                bucket["present"] = True
            if not bucket["description"] and entry.get("description"):
                bucket["description"] = entry.get("description")
    return list(merged.values())


def _staging_value_sort_key(field: str, value: Any) -> Any:
    """Order key for comparing 2 values of one BrainPathologyReport staging field.

    Integer fields compare directly; the 3 ordinal (enum-string) fields in
    BRAIN_STAGING_ORDINAL_ORDERS compare by position in their own fixed
    scale instead (e.g. "II" > "I", not a lexicographic string comparison).
    """
    order = BRAIN_STAGING_ORDINAL_ORDERS.get(field)
    if order is None:
        return value
    return order.index(value) if value in order else -1


def get_brain_staging_scores(properties: Dict[str, Any]) -> Dict[str, Any]:
    """Get the neurodegenerative disease staging/severity scores from a pathology report.

    Only BrainPathologyReport has this concept; NonBrainPathologyReport has
    none of these fields at all, so this returns {} for it. A field is only
    included when it was actually submitted with a value.
    """
    return {
        field: properties[field]
        for field, _label in BRAIN_STAGING_FIELDS
        if properties.get(field) is not None
    }


def get_max_brain_staging_scores(reports_staging: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Collapse several reports' own get_brain_staging_scores() dicts into one, taking the max value per field.

    A Tissue can rev-link more than 1 TissueSample (e.g. Fixed + Frozen),
    each with its own PathologyReport -- same max-across-reports convention
    autolysis_score/target_tissues subtype aggregation in types/tissue.py's
    pathology_summary already use.
    """
    result: Dict[str, Any] = {}
    for report_scores in reports_staging:
        for field, value in report_scores.items():
            if field not in result or (
                _staging_value_sort_key(field, value) > _staging_value_sort_key(field, result[field])
            ):
                result[field] = value
    return result


def get_brain_diagnosis_summary(properties: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Get the free-text review outcome/diagnosis/notes summary from a pathology report.

    `outcome`/`additional_notes`/`unacceptable_description` are on the
    shared PathologyReport base (both Brain and NonBrain reports have
    them), but `final_neuropathological_diagnosis` is BrainPathologyReport-
    only -- gated the same way get_tissue_autolysis_score does (checking
    for `brain_subregions`, a field only BrainPathologyReport has) so this
    only ever fires for a brain report, not because the other fields
    themselves are brain-specific. `unacceptable_description` is only ever
    submitted alongside `outcome: "Unacceptable"` (schemas/pathology_report.json),
    so it's typically null here.
    """
    if "brain_subregions" not in properties:
        return None
    return {
        "outcome": properties.get("outcome"),
        "final_neuropathological_diagnosis": properties.get("final_neuropathological_diagnosis"),
        "additional_notes": properties.get("additional_notes"),
        "unacceptable_description": properties.get("unacceptable_description"),
    }
