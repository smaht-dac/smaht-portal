from typing import Any, Dict, List

import pytest

from ..item_utils.external_output_file import get_preservation_type


class _FakeRequestHandler:
    """Just enough of RequestHandler to look items up by identifier."""

    def __init__(self, items: Dict[str, Dict[str, Any]]) -> None:
        self._items = items

    def get_items(self, identifiers: List[str]) -> List[Dict[str, Any]]:
        return [self._items[identifier] for identifier in identifiers]


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, []),
        ({"tissues": ["t1"]}, ["Frozen"]),
        ({"tissues": ["t1", "t2", "t3"]}, ["Frozen", "Fixed"]),
        # Reported as recorded: Snap Frozen and Frozen stay distinct.
        ({"tissues": ["t1", "t4"]}, ["Frozen", "Snap Frozen"]),
    ],
)
def test_get_preservation_type(properties: Dict[str, Any], expected: List[str]) -> None:
    tissues = {
        "t1": {"preservation_type": "Frozen"},
        "t2": {"preservation_type": "Fixed"},
        "t3": {"preservation_type": "Frozen"},
        "t4": {"preservation_type": "Snap Frozen"},
    }
    assert get_preservation_type(properties, _FakeRequestHandler(tissues)) == expected
