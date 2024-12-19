from typing import Any, Dict

import pytest
from webtest import TestApp

from .utils import delete_field, get_item_from_search


BRAIN_SPECIFIC_FIELDS = [
    "infectious_neuropathology_pattern_type",
    "infectious_neuropathology_infection_type",
    "inflammatory_neuropathology_type",
    "metabolic_neuropathology_type",
    "neoplastic_neuropathology_type",
    "neoplastic_neuropathology_details",
    "neoplastic_neuropathology_origin_location",
    "neurodegenerative_neuropathology_type",
    "neuropathology_onset",
    "neuropathology_artifact_type",
    "tbi_type",
    "tbi_hemorrhage_present",
    "tbi_edema_present",
    "tbi_herniation_present",
    "tbi_chronic_type",
    "tbi_stage",
    "tbi_location",
    "vascular_neuropathology_infarct_type",
    "vascular_neuropathology_details",
]

@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,delete_fields,expected_status",
    [
        ({}, ",".join(BRAIN_SPECIFIC_FIELDS), 200),
        (
            {
                "tissue_name": "Liver",          
                "infectious_neuropathology_pattern_type": "Focal",
                "infectious_neuropathology_infection_type": "Viral",
                "inflammatory_neuropathology_type": "Meningitis",
                "metabolic_neuropathology_type": "Hepatic Encephalopathy",
                "neoplastic_neuropathology_type": "Primary",
                "neoplastic_neuropathology_details": "Intra-axial",
                "neoplastic_neuropathology_origin_location": "Cerebellum",
                "neurodegenerative_neuropathology_type": "Primary Age-Related Taupath",
                "neuropathology_artifact_type": ["Underfixed"],
                "neuropathology_onset": "Acute",
                "tbi_type": "Blunt",
                "tbi_hemorrhage_present": "No",
                "tbi_edema_present": "No",
                "tbi_herniation_present": "No",
                "tbi_chronic_type": "Chronic Traumatic Brain Injury",
                "tbi_stage": "Low",
                "tbi_location": "Brainstem",
                "vascular_neuropathology_infarct_type": "Microinfarcts",
                "vascular_neuropathology_details": "Remote"
            },
            "", 422),
        (
            {
                "tissue_name": "Brain",
                "infectious_neuropathology_pattern_type": "Focal",
                "infectious_neuropathology_infection_type": "Viral",
                "inflammatory_neuropathology_type": "Meningitis",
                "metabolic_neuropathology_type": "Hepatic Encephalopathy",
                "neoplastic_neuropathology_type": "Primary",
                "neoplastic_neuropathology_details": "Intra-axial",
                "neoplastic_neuropathology_origin_location": "Cerebellum",
                "neurodegenerative_neuropathology_type": "Primary Age-Related Taupath",
                "neuropathology_artifact_type": ["Underfixed"],
                "neuropathology_onset": "Acute",
                "tbi_type": "Blunt",
                "tbi_hemorrhage_present": "No",
                "tbi_edema_present": "No",
                "tbi_herniation_present": "No",
                "tbi_chronic_type": "Chronic Traumatic Brain Injury",
                "tbi_stage": "Low",
                "tbi_location": "Brainstem",
                "vascular_neuropathology_infarct_type": "Microinfarcts",
                "vascular_neuropathology_details": "Remote"
            },
            "", 200),
        (
            {},
            ",".join(BRAIN_SPECIFIC_FIELDS),
            200
        ),
        (
            {"tissue_name": "Liver"},
            "",
            200
        ),
    ],
)
def test_brain_conditional(
    patch_body: Dict[str, Any],
    delete_fields: str,
    expected_status: int,
    es_testapp: TestApp,
    workbook: None,
) -> None:
    """Ensure brain-specific properties are only allowed when tissue name is "Brain"."""
    path_report_item = get_item_from_search(es_testapp, "pathology_report")
    delete_field(
        es_testapp,
        path_report_item["uuid"],
        delete_fields,
        patch_body=patch_body,
        status=expected_status,
    )