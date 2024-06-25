from typing import Any, Dict

import pytest
from pyramid.router import Router

from .utils import get_upgrader


@pytest.mark.parametrize(
    "library,expected",
    [
        ({"schema_version": "1"}, {"schema_version": "2"}),
        (
            {"schema_version": "1", "analyte": "analyte_link"},
            {"schema_version": "2", "analytes": ["analyte_link"]},
        ),
    ],
)
def test_upgrade_library_1_2(
    library: Dict[str, Any], expected: Dict[str, Any], app: Router
) -> None:
    """Test library upgrader from version 1 to 2."""
    upgrader = get_upgrader(app)
    assert (
        upgrader.upgrade("library", library, current_version="1", target_version="2")
        == expected
    )


@pytest.mark.parametrize(
    "library,expected",
    [
        ({}, {"schema_version": "3"}),
        (
            {
                "library": "SOME_LIBRARY_XYZ",
                "fragment_minimum_length": 110,
                "fragment_maximum_length": 200,
                "fragment_standard_deviation_length": 25,
                "insert_standard_deviation_length": 20,
                "target_insert_mean_length": 150,
                "schema_version": "2",
            },
            {
                "library": "SOME_LIBRARY_XYZ",
                "target_fragment_size": 150,
                "schema_version": "3",
            },
        ),
    ],
)
def test_upgrade_library_2_3(
    library: Dict[str, Any], expected: Dict[str, Any], app: Router
) -> None:
    """Test library upgrader from version 2 to 3."""
    upgrader = get_upgrader(app)
    assert (
        upgrader.upgrade("library", library, current_version="2", target_version="3")
        == expected
    )
