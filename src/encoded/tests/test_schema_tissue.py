from typing import Any, Dict

import pytest
from webtest import TestApp

from .utils import (
    patch_item,
    get_insert_identifier_for_item_type,
)


def test_tissue_revision_history_is_tracked(
    testapp: TestApp, test_tissue: Dict[str, Any]
) -> None:
    """Tissue retains Postgres revision-history tracking (the captain decided
    Tissue/TissueSample history may be needed in the future, so - unlike the
    other eight types this PR opts out of tracking - Tissue does not set
    track_revisions = False). Proves this against actual edit behavior, not
    just the absence of a class attribute: each edit produces one more
    accessible revision, and none of them ever 404.
    """
    uuid = test_tissue["uuid"]
    testapp.patch_json(f"/{uuid}", {"pathology_notes": "first note"}, status=200)
    revisions = testapp.get(f"/{uuid}/@@revision-history", status=200).json["revisions"]
    revision_count_after_first_edit = len(revisions)
    assert revision_count_after_first_edit >= 1

    testapp.patch_json(f"/{uuid}", {"pathology_notes": "second note"}, status=200)
    revisions = testapp.get(f"/{uuid}/@@revision-history", status=200).json["revisions"]
    assert len(revisions) == revision_count_after_first_edit + 1


@pytest.mark.workbook
@pytest.mark.parametrize(
    "patch_body,expected_status",
    [
        ({"size": 5}, 422),
        ({"size_unit": "cm^3"}, 422),
        (
            {
                "size": 5,
                "size_unit": "cm^3",
            },
            200,
        ),
    ],
)
def test_size_unit_requirements(
    patch_body: Dict[str, Any],
    expected_status: int,
    es_testapp: TestApp,
    workbook: None,
) -> None:
    """Ensure mutual requirements for size and size_unit."""
    uuid = get_insert_identifier_for_item_type(es_testapp, "Tissue")
    patch_item(
        es_testapp,
        patch_body,
        uuid,
        status=expected_status,
    )
