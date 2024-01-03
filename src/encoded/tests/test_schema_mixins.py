from typing import Any, Dict, Optional

import pytest
from jsonschema import validate, ValidationError
from snovault import load_schema


def get_mixins_schema() -> Dict[str, Any]:
    """Load mixins from file."""
    return load_schema("encoded:schemas/mixins.json")


def get_mixins_field(key: str, nested_key: Optional[str] = None) -> Dict[str, Any]:
    """Get designated field from mixins.

    Mixin field is typically object of object, so use primary key twice
    or primary key then secondary key to get schema.
    """
    mixins = get_mixins_schema()
    primary_key_field = mixins.get(key, {})
    if nested_key:
        return primary_key_field.get(nested_key, {})
    return primary_key_field.get(key, {})


def validate_schema(schema: Dict[str, Any], to_validate: Any) -> str:
    """Validate value against schema."""
    try:
        validate(instance=to_validate, schema=schema)
    except ValidationError as e:
        return str(e)
    else:
        return ""


@pytest.mark.parametrize(
    "identifier,expected_errors",
    [
        ("", True),
        ("g", True),
        ("foo", False),
        ("foo-bar", False),
        ("FOO_BAR", False),
    ]
)
def test_identifier(identifier: str, expected_errors: bool) -> None:
    """Ensure identifier schema validating as expected."""
    schema = get_mixins_field("identifier")
    errors = validate_schema(schema, identifier)
    if expected_errors is False:
        assert not errors
    else:
        assert errors


@pytest.mark.parametrize(
    "name,expected_errors",
    [
        ("", True),
        ("g", True),
        ("foo", False),
        ("foo-bar", False),
        ("FOO_BAR", False),
    ]
)
def test_name(name: str, expected_errors: bool) -> None:
    """Ensure name schema validating as expected."""
    schema = get_mixins_field("name")
    errors = validate_schema(schema, name)
    if expected_errors is False:
        assert not errors
    else:
        assert errors


@pytest.mark.parametrize(
    "version,expected_errors",
    [
        ("", True),
        ("foo", True),
        ("1", False),
        ("1.4", False),
        ("1.4.", True),
        ("1.4.5.6", False),
    ]
)
def test_version(version: str, expected_errors: bool) -> None:
    """Ensure version schema validating as expected."""
    schema = get_mixins_field("version")
    errors = validate_schema(schema, version)
    if expected_errors is False:
        assert not errors
    else:
        assert errors
