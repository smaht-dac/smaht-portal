from typing import Any, Dict, Optional

import pytest
from pyramid.registry import Registry
from pyramid.request import Request

from ..utils import (
    get_configuration_value,
    get_datastore_add_on,
    get_environ_remote_user,
    get_formatted_collection_resource_path,
    get_formatted_resource_path,
    get_frame_add_on,
    get_kebab_formatted_collection,
    get_remote_user,
    get_resource_path,
    get_resource_path_with_add_on,
    pluralize_collection,
)


@pytest.mark.parametrize(
    "collection,expected",
    [
        # Simple default: append "s"
        ("file", "files"),
        ("donor", "donors"),
        # Underscores are converted to dashes
        ("cell_line", "cell-lines"),
        # "ry"/"gy"/"ly" -> "ies"
        ("library", "libraries"),
        ("History", "Histories"),
        ("assembly", "assemblies"),
        ("pathology", "pathologies"),
        ("family", "families"),
        # "sis" -> "ses"
        ("analysis", "analyses"),
        # "ium" -> "a"
        ("consortium", "consortia"),
        ("medium", "media"),
        # trailing "s" -> "es"
        ("series", "serieses"),
        # CamelCase collection names are pluralized without special casing
        ("OntologyTerm", "OntologyTerms"),
        # Explicit special cases that opt out of the suffix rules
        ("aligned-reads", "aligned-reads"),
        ("aligned_reads", "aligned-reads"),
        ("basecalling", "basecalling"),
        ("death-circumstances", "death-circumstances"),
        ("sequencing", "sequencing"),
        ("software", "software"),
        ("unaligned-reads", "unaligned-reads"),
        ("variant-calls", "variant-calls"),
        ("variant_calls", "variant-calls"),
    ],
)
def test_pluralize_collection(collection: str, expected: str) -> None:
    """Pluralization mixes special-cased names with suffix-based rules."""
    assert pluralize_collection(collection) == expected


@pytest.mark.parametrize(
    "collection,expected",
    [
        ("CellLine", "cell-line"),
        ("cell_line", "cell-line"),
        ("unaligned_reads", "unaligned-reads"),
        ("File", "file"),
    ],
)
def test_get_kebab_formatted_collection(collection: str, expected: str) -> None:
    assert get_kebab_formatted_collection(collection) == expected


@pytest.mark.parametrize(
    "identifier,collection,expected",
    [
        ("abc", None, "abc"),
        ("abc", "CellLine", "/cell-lines/abc/"),
        ("abc", "cell_line", "/cell-lines/abc/"),
    ],
)
def test_get_resource_path(
    identifier: str, collection: Optional[str], expected: str
) -> None:
    assert get_resource_path(identifier, collection) == expected


def test_get_formatted_collection_resource_path() -> None:
    assert (
        get_formatted_collection_resource_path("abc", "CellLine")
        == "/cell-lines/abc/"
    )


@pytest.mark.parametrize(
    "identifier,collection,add_on,expected",
    [
        ("abc", None, None, "abc"),
        ("abc", None, "frame=object", "abc?frame=object"),
        ("abc", "CellLine", None, "/cell-lines/abc/"),
        ("abc", "CellLine", "frame=object", "/cell-lines/abc/?frame=object"),
    ],
)
def test_get_resource_path_with_add_on(
    identifier: str,
    collection: Optional[str],
    add_on: Optional[str],
    expected: str,
) -> None:
    assert (
        get_resource_path_with_add_on(identifier, collection, add_on) == expected
    )


@pytest.mark.parametrize(
    "identifier,collection,add_on,expected",
    [
        # A bare identifier gets a leading slash added
        ("abc", None, None, "/abc"),
        # A path that already starts with "/" is left alone
        ("/abc", None, None, "/abc"),
        ("abc", "CellLine", "frame=object", "/cell-lines/abc/?frame=object"),
    ],
)
def test_get_formatted_resource_path(
    identifier: str,
    collection: Optional[str],
    add_on: Optional[str],
    expected: str,
) -> None:
    assert (
        get_formatted_resource_path(identifier, collection, add_on) == expected
    )


@pytest.mark.parametrize(
    "frame,expected",
    [
        (None, ""),
        ("", ""),
        ("object", "frame=object"),
        ("embedded", "frame=embedded"),
    ],
)
def test_get_frame_add_on(frame: Optional[str], expected: str) -> None:
    assert get_frame_add_on(frame) == expected


@pytest.mark.parametrize(
    "datastore,expected",
    [
        (None, ""),
        ("", ""),
        ("database", "datastore=database"),
        ("elasticsearch", "datastore=elasticsearch"),
    ],
)
def test_get_datastore_add_on(datastore: Optional[str], expected: str) -> None:
    assert get_datastore_add_on(datastore) == expected


@pytest.mark.parametrize(
    "environ,expected",
    [
        ({}, ""),
        ({"REMOTE_USER": "alice"}, "alice"),
        ({"OTHER": "x"}, ""),
    ],
)
def test_get_environ_remote_user(
    environ: Dict[str, Any], expected: str
) -> None:
    assert get_environ_remote_user(environ) == expected


def test_get_remote_user_from_request() -> None:
    request = Request.blank("/")
    request.environ["REMOTE_USER"] = "alice"
    assert get_remote_user(request) == "alice"


def test_get_remote_user_missing_returns_empty() -> None:
    request = Request.blank("/")
    assert get_remote_user(request) == ""


def test_get_remote_user_unexpected_type_raises() -> None:
    with pytest.raises(TypeError):
        get_remote_user(object())


class _ContextWithRegistry:
    """Stand-in for an object exposing a ``registry`` attribute.

    Matches the final ``hasattr(context, "registry")`` branch of
    ``get_configuration_value`` (e.g. a request or root object).
    """

    def __init__(self, registry: Any) -> None:
        self.registry = registry


def _registry_with_settings(settings: Dict[str, Any]) -> Registry:
    registry = Registry()
    registry.settings = settings
    return registry


def test_get_configuration_value_from_dict() -> None:
    assert get_configuration_value("my.key", {"my.key": "value"}) == "value"


def test_get_configuration_value_dict_missing_uses_fallback() -> None:
    assert (
        get_configuration_value("missing", {"my.key": "value"}, fallback="fb")
        == "fb"
    )


def test_get_configuration_value_from_object_with_registry() -> None:
    context = _ContextWithRegistry(_registry_with_settings({"my.key": "value"}))
    assert get_configuration_value("my.key", context) == "value"


def test_get_configuration_value_object_registry_missing_uses_fallback() -> None:
    context = _ContextWithRegistry(_registry_with_settings({"my.key": "value"}))
    assert get_configuration_value("missing", context, fallback="fb") == "fb"


def test_get_configuration_value_registry_not_a_registry_uses_fallback() -> None:
    # ``context.registry`` is present but not a pyramid Registry -> fallback.
    context = _ContextWithRegistry(object())
    assert get_configuration_value("my.key", context, fallback="fb") == "fb"


def test_get_configuration_value_none_context_uses_fallback() -> None:
    assert get_configuration_value("my.key", None, fallback="fb") == "fb"


@pytest.mark.parametrize("property_name", ["", None])
def test_get_configuration_value_bad_property_name_uses_fallback(
    property_name: Any,
) -> None:
    assert (
        get_configuration_value(property_name, {"": "x"}, fallback="fb") == "fb"
    )


def test_get_configuration_value_registry_treated_as_dict() -> None:
    """A pyramid ``Registry`` is a ``dict`` subclass.

    It is therefore caught by the ``isinstance(context, dict)`` branch and
    looked up via ``Registry.get`` (the component registry), *not* via
    ``registry.settings``. This pins that subtle-but-real behavior so a
    reordering of the branches would be caught.
    """
    registry = _registry_with_settings({"my.key": "in-settings"})
    # The key lives in ``.settings``, not in the registry-as-dict, so the
    # settings value is not returned; the fallback is used instead.
    assert get_configuration_value("my.key", registry, fallback="fb") == "fb"
