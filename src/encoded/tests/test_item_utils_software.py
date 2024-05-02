from typing import Any, Dict

import pytest

from ..item_utils.software import get_title_with_version


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, ""),
        ({"code": "Foo"}, "Foo"),
        ({"code": "Foo", "version": "1.0"}, "Foo (1.0)"),
        ({"title": "Bar"}, "Bar"),
        ({"title": "Bar", "version": "1.0"}, "Bar (1.0)"),
        ({"code": "Foo", "title": "Bar", "version": "1.0"}, "Foo (1.0)"),
    ],
)
def test_get_title_with_version(properties: Dict[str, Any], expected: str) -> None:
    """Test software name for file overview."""
    assert get_title_with_version(properties) == expected
