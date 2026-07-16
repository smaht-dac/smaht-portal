from typing import Any, Dict, List, Optional


# `finding_present`-style fields on BrainPathologyReport that don't share a
# single array shape (unlike NonBrainPathologyReport.pathologic_findings),
# so presence has to be checked field-by-field.
BRAIN_FINDING_PRESENT_FIELDS = [
    "developmental_neuropathology_present",
    "infectious_neuropathology_present",
    "inflammatory_neuropathology_present",
    "neoplastic_neuropathology_present",
    "tbi_neuropathology_present",
    "vascular_neuropathology_present",
    "neurodegenerative_neuropathology_present",
    "metabolic_neuropathology_present",
    "other_pathology_present",
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
