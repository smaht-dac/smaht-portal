from typing import Any, Callable, Dict, Union

import pytest
from encoded_core.upgrade import run_finalizer
from pyramid.registry import Registry
from snovault.typeinfo import TypeInfo
from snovault.upgrader import (
    DEFAULT_VERSION, UPGRADER, SchemaUpgrader, Upgrader, parse_version
)

from .utils import get_functional_item_type_info


def get_upgrader(registry: Registry) -> Union[Upgrader, None]:
    """Return upgrader from registry, if present."""
    return registry.get(UPGRADER)


def get_upgrader_for_type(
    upgrader: Upgrader,
    type_info: TypeInfo,
) -> SchemaUpgrader:
    """Return upgrader for type."""
    return upgrader[type_info.name]


def test_upgrader_in_registry(registry: Registry) -> None:
    """Ensure upgrader is registered so upgrades run."""
    assert get_upgrader(registry)


def test_default_finalizer_registered(registry: Registry) -> None:
    """Ensure default finalizer is registered."""
    upgrader = get_upgrader(registry)
    assert upgrader.default_finalizer
    assert isinstance(upgrader.default_finalizer, Callable)


def test_schema_upgraders_registered(registry: Registry) -> None:
    """Ensure schema upgraders are registered.

    All non-abstract schemas should have an upgrader registered.
    """
    upgrader = get_upgrader(registry)
    for type_info in get_functional_item_type_info(registry):
        type_name = type_info.name
        assert type_name in upgrader


@pytest.mark.parametrize(
    "value,version,expected",
    [
        ({}, "1", {"schema_version": "1"}),
        ({"schema_version": "1"}, "2", {"schema_version": "2"}),
    ]
)
def test_default_finalizer_action(
    value: Dict[str, Any],
    version: str,
    expected: Dict[str, Any],
    registry: Registry,
) -> None:
    """Ensure default finalizer adds given schema version to property."""
    upgrader = get_upgrader(registry)
    default_finalizer = upgrader.default_finalizer
    system = None
    default_finalizer(value, system, version)
    assert value == expected


def test_schema_versions_have_upgraders(registry: Registry) -> None:
    """Ensure all schema versions have upgraders registered.

    All non-abstract schemas should have an upgrader registered for each
    schema version > 1.
    """
    upgrader = get_upgrader(registry)
    for type_info in get_functional_item_type_info(registry):
        schema_version = type_info.schema_version
        type_upgrader = get_upgrader_for_type(upgrader, type_info)
        assert_upgrader_and_type_info_versions_match(type_upgrader, type_info)
        assert_expected_upgraders_for_schema_version(type_upgrader, schema_version)


def assert_upgrader_and_type_info_versions_match(
    schema_upgrader: SchemaUpgrader,
    type_info: TypeInfo,
) -> None:
    """Ensure upgrader and type info schema versions match."""
    assert schema_upgrader.version == type_info.schema_version


def assert_expected_upgraders_for_schema_version(
    schema_upgrader: SchemaUpgrader,
    schema_version: str,
) -> None:
    """Ensure schema upgrader has expected upgrader steps.

    If schema version is 1, only a single default step expected. If
    schema version > 1, expect steps for each version from 2 to the
    schema version.

    Assumes schema version is a string of a positive integer.
    """
    if schema_version == "1":
        assert_schema_version_1_upgrader_step(schema_upgrader)
    else:
        assert_all_upgrader_steps_to_current_version(
            schema_upgrader,
            schema_version,
        )


def assert_schema_version_1_upgrader_step(
    schema_upgrader: SchemaUpgrader,
) -> None:
    """Ensure schema upgrader has expected default step only."""
    assert len(schema_upgrader.upgrade_steps) == 1
    for version, upgrade_step in schema_upgrader.upgrade_steps.items():
        assert version == DEFAULT_VERSION
        assert upgrade_step.step == run_finalizer


def assert_all_upgrader_steps_to_current_version(
    schema_upgrader: SchemaUpgrader,
    schema_version: str,
) -> None:
    """Ensure schema upgrader has expected upgrader steps.

    Expect steps for each version from 2 to the schema version.
    """
    for version in range(1, int(schema_version)):
        assert_upgrader_has_step(schema_upgrader, version)


def assert_upgrader_has_step(
    schema_upgrader: SchemaUpgrader,
    version: int,
) -> None:
    """Ensure schema upgrader has step for given version."""
    source_version = str(version)
    target_version = str(version + 1)
    parsed_version = parse_version(source_version)
    assert parsed_version in schema_upgrader.upgrade_steps
    upgrade_step = schema_upgrader.upgrade_steps[parsed_version]
    assert upgrade_step.step != run_finalizer
    assert isinstance(upgrade_step.step, Callable)
    assert upgrade_step.source == source_version
    assert upgrade_step.dest == target_version
