from typing import Any, Dict

import pytest

from ..item_utils.item import get_type


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, ""),
        ({"@type": ["Item", "Foo"]}, "Item"),
        ({"@type": ["Foo", "Item"]}, "Foo"),
    ]
)
def test_get_type(properties: Dict[str, Any], expected: str) -> None:
    assert get_type(properties) == expected
