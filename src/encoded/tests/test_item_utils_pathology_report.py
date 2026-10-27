from typing import Any, Dict, Optional

import pytest

from ..item_utils.pathology_report import get_tissue_autolysis_score


BRAIN_REPORT = {
    "tissue_name": "Brain",
    "brain_subregions": [
        {"subregion": "Cerebellum Left Hemisphere", "is_present": "Yes", "tissue_autolysis_score": 1},
        {"subregion": "Frontal Lobe Left Hemisphere", "is_present": "Yes", "tissue_autolysis_score": 3},
        {"subregion": "Hippocampus Left Hemisphere", "is_present": "No"},
        {"subregion": "Hippocampus Right Hemisphere", "is_present": "Yes", "tissue_autolysis_score": 0},
        {"subregion": "Temporal Lobe Left Hemisphere", "is_present": "Yes", "tissue_autolysis_score": 2},
    ],
}


@pytest.mark.parametrize(
    "properties, tissue_code, expected",
    [
        # NonBrainPathologyReport: its own report-level score, code ignored.
        ({"tissue_autolysis_score": 2}, None, 2),
        ({"tissue_autolysis_score": 2}, "3S", 2),
        # BrainPathologyReport, no region given: max across present subregions.
        (BRAIN_REPORT, None, 3),
        # Each brain region's Tissue: only its own subregion's score.
        (BRAIN_REPORT, "3AM", 1),  # BRCE - Cerebellum
        (BRAIN_REPORT, "3AK", 3),  # BRFL - Frontal Lobe
        (BRAIN_REPORT, "3AO", 0),  # BRHR - Hippocampus, R
        (BRAIN_REPORT, "3AL", 2),  # BRTL - Temporal Lobe
        # Region recorded as not present: no score for it, not the brain max.
        (BRAIN_REPORT, "3AN", None),  # BRHL - Hippocampus, L
        # A code with no subregion entry (e.g. generic Brain): brain-wide max.
        (BRAIN_REPORT, "3S", 3),
        ({"brain_subregions": []}, "3AL", None),
        ({}, None, None),
    ],
)
def test_get_tissue_autolysis_score(
    properties: Dict[str, Any], tissue_code: Optional[str], expected: Optional[int]
) -> None:
    """Test autolysis score is per-region for brain-region tissues."""
    assert get_tissue_autolysis_score(properties, tissue_code=tissue_code) == expected
