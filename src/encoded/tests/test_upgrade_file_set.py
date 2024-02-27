from typing import Any, Dict

import pytest
from pyramid.router import Router

from .utils import get_upgrader


@pytest.mark.parametrize(
    "file_set,expected",
    [
        ({}, {"schema_version": "2"}),
        (
            {"schema_version": "1", "libraries": []},
            {"schema_version": "2"},
        ),
        (
            {"schema_version": "1", "libraries": ["foo"]},
            {"schema_version": "2", "library": "foo"},
        ),
        (
            {"schema_version": "1", "libraries": ["foo", "bar"]},
            {"schema_version": "2", "library": "foo"},
        ),
    ]
)
def test_upgrade_file_set(
    file_set: Dict[str, Any], expected: Dict[str, Any], app: Router
) -> None:
    """Test file set upgrader from version 1 to 2."""
    upgrader = get_upgrader(app)
    assert upgrader.upgrade(
        "file_set", file_set, current_version="1", target_version="2"
    ) == expected
