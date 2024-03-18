from typing import Any, Dict

import pytest
from pyramid.router import Router

from .utils import get_upgrader


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, {"schema_version": "2"}),
        (
            {"foo": "bar", "assay": "some_link", "schema_version": "1"},
            {"foo": "bar", "schema_version": "2"},
        ),
    ],
)
def test_upgrade_file_set_1_2(
    properties: Dict[str, Any], expected: Dict[str, Any], app: Router
) -> None:
    """Test upgrade file set from version 1 to 2 to remove assay link."""
    upgrader = get_upgrader(app)
    assert (
        upgrader.upgrade(
            "file_set", properties, current_version="1", target_version="2"
        )
        == expected
    )
