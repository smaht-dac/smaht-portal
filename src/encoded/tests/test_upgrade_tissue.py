from typing import Any, Dict

import pytest
from pyramid.router import Router

from .utils import get_upgrader

@pytest.mark.parametrize(
    "tissue,expected",
    [
        ({}, {"schema_version": "3"}),
        ({"recovery_interval": 123}, {"schema_version": "3"}),
    ],
)
def test_upgrade_tissue_2_3(
    app: Router, tissue: Dict[str, Any], expected: Dict[str, Any]
) -> None:
    """Test tissue upgrader from version 2 to 3."""
    upgrader = get_upgrader(app)
    assert (
        upgrader.upgrade(
            "tissue", tissue, current_version="2", target_version="3"
        )
        == expected
    )


@pytest.mark.parametrize(
    "tissue,expected",
    [
        ({}, {"schema_version": "4"}),
        ({"recovery_datetime": "2024-12-01"}, {"schema_version": "4"}),
    ],
)
def test_upgrade_tissue_3_4(
    app: Router, tissue: Dict[str, Any], expected: Dict[str, Any]
) -> None:
    """Test tissue upgrader from version 3 to 4."""
    upgrader = get_upgrader(app)
    assert (
        upgrader.upgrade(
            "tissue", tissue, current_version="3", target_version="4"
        )
        == expected
    )


@pytest.fixture
def test_tissue(
    testapp,
    test_submission_center,
    donor):
    return{
        "uuid": "4e92d8b9-e0ad-4469-8e8c-01a0a5d7b313",
        "submission_centers": [
            test_submission_center["uuid"]
        ],
        "submitted_id": "TEST_TISSUE_LUNG",
        "external_id": "ST001-1D",
        "donor": donor["uuid"],
        "uberon_id": "UBERON:0008952"
    }


def test_upgrade_tissue_4_5(
    app: Router, test_tissue: Dict[str, Any], test_ontology_term: Dict[str, Any], registry
) -> None:
    """Test tissue upgrader from version 4 to 5."""
    upgrader = get_upgrader(app)
    value = upgrader.upgrade(
            "tissue", test_tissue, registry=registry, current_version="4", target_version="5"
        )
    assert value['schema_version'] == '5'
    assert value["uberon_id"] == test_ontology_term["uuid"]


