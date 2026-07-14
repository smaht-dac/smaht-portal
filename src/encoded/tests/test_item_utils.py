from typing import Any, Callable, Dict, List

import pytest

from ..item_utils.utils import (
    RequestHandler,
    dedupe_identifiers,
    get_unique_values,
    unravel_lists,
)


@pytest.mark.parametrize(
    "values,expected",
    [
        ([], []),
        (["a", 2, 3], ["a", 2, 3]),
        ([[1, 2, 3], [4, 5, 6]], [1, 2, 3, 4, 5, 6]),
        (["a", 2, 3, [4, 5, 6]], ["a", 2, 3, 4, 5, 6]),
        (["a", 2, 3, [2, 3]], ["a", 2, 3, 2, 3]),  # Repeats remain
        (["a", 2, 3, [[2, 3]]], ["a", 2, 3, [2, 3]]),  # Nested list not handled
    ],
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
    ],
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


@pytest.mark.parametrize(
    "values,expected",
    [
        # Empty input
        ([], []),
        # Strings deduped, first-occurrence order preserved
        (["b", "a", "b", "c", "a"], ["b", "a", "c"]),
        # Dicts deduped by uuid
        (
            [{"uuid": "u1"}, {"uuid": "u1"}, {"uuid": "u2"}],
            [{"uuid": "u1"}, {"uuid": "u2"}],
        ),
        # Dicts fall back to @id when uuid is absent
        (
            [{"@id": "/x/"}, {"@id": "/x/"}, {"@id": "/y/"}],
            [{"@id": "/x/"}, {"@id": "/y/"}],
        ),
        # uuid takes precedence over @id for the dedup key
        (
            [{"uuid": "u1", "@id": "/x/"}, {"uuid": "u1", "@id": "/y/"}],
            [{"uuid": "u1", "@id": "/x/"}],
        ),
        # A string and a dict that share the same key value are deduped together
        (["u1", {"uuid": "u1"}], ["u1"]),
        # Non-str/non-Mapping values are skipped entirely
        ([5, None, "a", ["nested"], "a"], ["a"]),
        # Dicts without a usable key (no uuid or @id) are dropped
        ([{"foo": "bar"}, "a"], ["a"]),
        # Empty-string key is treated as falsy and dropped
        (["", "a"], ["a"]),
    ],
)
def test_dedupe_identifiers(values: List[Any], expected: List[Any]) -> None:
    assert dedupe_identifiers(values) == expected


def test_request_handler_requires_a_source() -> None:
    with pytest.raises(ValueError):
        RequestHandler()


@pytest.mark.parametrize("frame", ["bad", "", "OBJECT"])
def test_request_handler_rejects_invalid_frame(frame: str) -> None:
    with pytest.raises(ValueError):
        RequestHandler(auth_key={"key": "secret"}, frame=frame)


@pytest.mark.parametrize("datastore", ["bad", "", "ES"])
def test_request_handler_rejects_invalid_datastore(datastore: str) -> None:
    with pytest.raises(ValueError):
        RequestHandler(auth_key={"key": "secret"}, datastore=datastore)


@pytest.mark.parametrize("frame", ["raw", "object", "embedded"])
def test_request_handler_accepts_valid_frames(frame: str) -> None:
    handler = RequestHandler(auth_key={"key": "secret"}, frame=frame)
    assert handler.frame == frame


@pytest.mark.parametrize("datastore", ["elasticsearch", "database"])
def test_request_handler_accepts_valid_datastores(datastore: str) -> None:
    handler = RequestHandler(auth_key={"key": "secret"}, datastore=datastore)
    assert handler.datastore == datastore


def test_request_handler_hashed_auth_key_is_hashable_tuple() -> None:
    handler = RequestHandler(auth_key={"key": "secret", "server": "example"})
    hashed = handler.hashed_auth_key
    assert dict(hashed) == {"key": "secret", "server": "example"}
    # Must be hashable so it can be used as an lru_cache key
    hash(hashed)


def test_request_handler_hashed_auth_key_empty_without_auth_key() -> None:
    handler = RequestHandler(request=object())
    assert handler.hashed_auth_key == tuple()


@pytest.mark.parametrize(
    "identifier,expected",
    [
        ("some-uuid", "some-uuid"),
        ({"uuid": "some-uuid"}, "some-uuid"),
        ({"uuid": "some-uuid", "@id": "/x/"}, "some-uuid"),
    ],
)
def test_request_handler_get_identifier(
    identifier: Any, expected: str
) -> None:
    handler = RequestHandler(auth_key={"key": "secret"})
    assert handler._get_identifier(identifier) == expected


@pytest.mark.parametrize("identifier", ["", None, {}])
def test_request_handler_get_item_empty_identifier(identifier: Any) -> None:
    handler = RequestHandler(auth_key={"key": "secret"})
    assert handler.get_item(identifier) == {}
