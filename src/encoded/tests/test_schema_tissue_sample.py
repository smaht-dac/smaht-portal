from typing import Any, Dict

import pytest
from webtest import TestApp

from .utils import (
    patch_item,
    delete_field,
    get_insert_identifier_for_item_type,
)


def test_tissue_sample_revision_history_is_tracked(
    testapp: TestApp, test_tissue_sample: Dict[str, Any]
) -> None:
    """TissueSample retains Postgres revision-history tracking (the captain
    decided Tissue/TissueSample history may be needed in the future, so -
    unlike the other eight types this PR opts out of tracking -
    TissueSample does not set track_revisions = False). Proves this against
    actual edit behavior, not just the absence of a class attribute: each
    edit produces one more accessible revision, and none of them ever 404.
    """
    uuid = test_tissue_sample["uuid"]
    testapp.patch_json(f"/{uuid}", {"processing_notes": "first note"}, status=200)
    revisions = testapp.get(f"/{uuid}/@@revision-history", status=200).json["revisions"]
    revision_count_after_first_edit = len(revisions)
    assert revision_count_after_first_edit >= 1

    testapp.patch_json(f"/{uuid}", {"processing_notes": "second note"}, status=200)
    revisions = testapp.get(f"/{uuid}/@@revision-history", status=200).json["revisions"]
    assert len(revisions) == revision_count_after_first_edit + 1


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,delete_fields,expected_status",
    [
        ({"category": "Homogenate","external_id": "SMHT001-1A-101X", "core_size": "1.5"}, "", 422),
        ({"category": "Core", "external_id": "SMHT001-1A-101A1"}, "core_size", 200), # We'll eventually want to make this invalid
        ({"category": "Specimen", "external_id": "SMHT001-1A-101S1"}, "core_size", 200),
        (
            {
                "external_id": "SMHT001-1A-101A1",
                "category": "Core",
                "core_size": "1.5",
            },
            "", 200,
        ),
    ],
)
def test_core_size_requirements(
    patch_body: Dict[str, Any],
    delete_fields: str,
    expected_status: int,
    es_testapp: TestApp,
    workbook: None,
) -> None:
    """Ensure mutual requirements for category "Core" and core_size."""
    uuid = get_insert_identifier_for_item_type(es_testapp, "TissueSample")
    delete_field(
        es_testapp,
        uuid,
        delete_fields,
        patch_body=patch_body,
        status=expected_status,
    )
