from typing import Any, Dict

import pytest
from pyramid.router import Router

from .utils import get_upgrader


@pytest.mark.parametrize(
    "analyte,expected",
    [
        ({}, {"schema_version": "2"}),
        (
            {"components": [], "schema_version": "1"},
            {"schema_version": "2"},
        ),
        (
            {"components": ["Genomic DNA"], "schema_version": "1"},
            {"molecule_detail": ["Genomic DNA"], "schema_version": "2"},
        ),
    ],
)
def test_upgrade_analyte_1_2(
    analyte: Dict[str, Any], expected: Dict[str, Any], app: Router
) -> None:
    """Test analyte upgrader from version 1 to 2."""
    upgrader = get_upgrader(app)
    assert (
        upgrader.upgrade("analyte", analyte, current_version="1", target_version="2")
        == expected
    )
