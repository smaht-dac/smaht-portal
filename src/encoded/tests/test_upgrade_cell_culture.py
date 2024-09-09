from typing import Any, Dict

import pytest
from pyramid.router import Router

from .utils import get_upgrader


@pytest.mark.parametrize(
    "cell_culture,expected",
    [
        ({}, {"schema_version": "2"}),
        ({"lot_number": "123"}, {"lot_number": ["123"], "schema_version": "2"}),
        (
            {"lot_number": "123", "schema_version": "1"},
            {"lot_number": ["123"], "schema_version": "2"},
        ),
        (
            {"lot_number": "", "schema_version": "1"},
            {"schema_version": "2"},
        ),
    ],
)
def test_upgrade_cell_culture_1_2(
    app: Router, cell_culture: Dict[str, Any], expected: Dict[str, Any]
) -> None:
    """Test cell culture upgrader from version 1 to 2."""
    upgrader = get_upgrader(app)
    assert (
        upgrader.upgrade(
            "cell_culture", cell_culture, current_version="1", target_version="2"
        )
        == expected
    )


@pytest.mark.parametrize(
    "cell_culture,expected",
    [
        ({}, {"schema_version": "3"}),
        (
            {
                "cell_line": "SOME_CELL-LINE_XYZ",
                "doubling_time": 25,
                "doubling_number": 4,
                "schema_version": "2",
            },
            {"cell_line": "SOME_CELL-LINE_XYZ", "schema_version": "3"},
        ),
    ],
)
def test_upgrade_cell_culture_2_3(
    app: Router, cell_culture: Dict[str, Any], expected: Dict[str, Any]
) -> None:
    """Test cell culture upgrader from version 2 to 3."""
    upgrader = get_upgrader(app)
    assert (
        upgrader.upgrade(
            "cell_culture", cell_culture, current_version="2", target_version="3"
        )
        == expected
    )


@pytest.mark.parametrize(
    "cell_culture,expected",
    [
        ({}, {"schema_version": "4"}),
        (
            {
                "cell_line": "SOME_CELL-LINE_XYZ",
                "schema_version": "3",
            },
            {"cell_line": ["SOME_CELL-LINE_XYZ"], "schema_version": "4"},
        ),
    ],
)
def test_upgrade_cell_culture_3_4(
    app: Router, cell_culture: Dict[str, Any], expected: Dict[str, Any]
) -> None:
    """Test cell culture upgrader from version 3 to 4."""
    upgrader = get_upgrader(app)
    assert (
        upgrader.upgrade(
            "cell_culture", cell_culture, current_version="3", target_version="4"
        )
        == expected
    )
