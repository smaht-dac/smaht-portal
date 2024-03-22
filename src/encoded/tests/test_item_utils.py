from typing import Any, Callable, Dict, List

import pytest

from ..item_utils.utils import get_unique_values, unravel_lists


@pytest.mark.parametrize(
    "values,expected",
    [
        ([], []),
        (["a", 2, 3], ["a", 2, 3]),
        ([[1, 2, 3], [4, 5, 6]], [1, 2, 3, 4, 5, 6]),
        (["a", 2, 3, [4, 5, 6]], ["a", 2, 3, 4, 5, 6]),
        (["a", 2, 3, [2, 3]], ["a", 2, 3, 2, 3]),  # Repeats remain
        (["a", 2, 3, [[2, 3]]], ["a", 2, 3, [2, 3]]),  # Nested list not handled
    ]
)
def test_unravel_lists(values: List[Any], expected: List[Any]) -> None:
    assert unravel_lists(values) == expected



def get_foo(item: Dict[str, Any]) -> Any:
    return item.get("foo")


@pytest.mark.parametrize(
    "items,retriever,exclude_null,expected",
    [
        ([], get_foo, True, []),
        ([{"foo": "a"}, {"foo": "b"}], get_foo, True, ["a", "b"]),
        ([{"foo": "a"}, {"foo": "b"}], get_foo, False, ["a", "b"]),
        ([{"foo": "a"}, {"foo": []}], get_foo, False, ["a"]),
        ([{"foo": "a"}, {"fu": "b"}], get_foo, True, ["a"]),
        ([{"foo": "a"}, {"fu": "b"}], get_foo, False, ["a", None]),
        ([{"foo": "a"}, {"foo": "b"}, {"foo": "a"}], get_foo, True, ["a", "b"]),
    ]
)
def test_get_unique_values(
    items: List[Dict[str, Any]],
    retriever: Callable,
    exclude_null: bool,
    expected: List[Any],
) -> None:
    result = get_unique_values(items, retriever, exclude_null)
    assert isinstance(result, list)
    assert len(result) == len(expected)
    assert all([x in result for x in expected])
    assert all([x in expected for x in result])
