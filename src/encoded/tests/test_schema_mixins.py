from typing import Any, Dict, Optional

import pytest
from webtest import TestApp

from .utils import get_search, load_schema, patch_item, validate_schema


def get_mixins_schema() -> Dict[str, Any]:
    """Load mixins from file."""
    return load_schema("mixins")


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


@pytest.mark.parametrize(
    "identifier,expected_errors",
    [
        ("", True),
        ("g", True),
        ("foo", False),
        ("foo-bar", False),
        ("FOO_BAR", False),
    ],
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
    ],
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
    ],
)
def test_version(version: str, expected_errors: bool) -> None:
    """Ensure version schema validating as expected."""
    schema = get_mixins_field("version")
    errors = validate_schema(schema, version)
    if expected_errors is False:
        assert not errors
    else:
        assert errors


@pytest.mark.parametrize(
    "meta_workflow_input,expected_errors",
    [
        ({}, True),  # Missing requirements
        ({"argument_name": "foo"}, True),  # Missing requirements
        ({"argument_type": "file"}, True),  # Missing requirements
        ({"argument_name": "foo", "argument_type": "file"}, False),
        (  # Additional properties
            {"argument_name": "foo", "argument_type": "file", "foo": "bar"},
            True,
        ),
        (  # 'value' not required per if/then
            {"argument_name": "foo", "argument_type": "QC ruleset"},
            False,
        ),
        (  # 'value' wrong type per if/then
            {"argument_name": "foo", "argument_type": "QC ruleset", "value": 15},
            True,
        ),
        (  # 'value' missing requirements per if/then
            {"argument_name": "foo", "argument_type": "QC ruleset", "value": {}},
            True,
        ),
        (  # 'value' missing requirements per if/then
            {
                "argument_name": "foo",
                "argument_type": "QC ruleset",
                "value": {"overall_quality_status_rule": "foo"},
            },
            True,
        ),
        (  # 'qc_thresholds' missing requirements per anyOf
            {
                "argument_name": "foo",
                "argument_type": "QC ruleset",
                "value": {
                    "overall_quality_status_rule": "foo",
                    "qc_thresholds": [{"id": "bar", "metric": "baz", "operator": ">"}],
                },
            },
            True,
        ),
        (  # 'qc_thresholds' with additional properties
            {
                "argument_name": "foo",
                "argument_type": "QC ruleset",
                "value": {
                    "overall_quality_status_rule": "foo",
                    "qc_thresholds": [
                        {
                            "id": "bar",
                            "metric": "baz",
                            "operator": ">",
                            "pass_target": 52.7,
                            "fu": "bur",
                        }
                    ],
                },
            },
            True,
        ),
        (  # Invalid 'value_type' per if/then
            {
                "argument_name": "foo",
                "argument_type": "QC ruleset",
                "value": {
                    "overall_quality_status_rule": "foo",
                    "qc_thresholds": [
                        {
                            "id": "bar",
                            "metric": "baz",
                            "operator": ">",
                            "pass_target": 52.7,
                        }
                    ],
                },
                "value_type": "string",
            },
            True,
        ),
        (
            {
                "argument_name": "foo",
                "argument_type": "QC ruleset",
                "value": {
                    "overall_quality_status_rule": "foo",
                    "qc_thresholds": [
                        {
                            "id": "bar",
                            "metric": "baz",
                            "operator": ">",
                            "pass_target": 52.7,
                        }
                    ],
                },
            },
            False,
        ),
    ],
)
def test_meta_workflow_input(meta_workflow_input: str, expected_errors: bool) -> None:
    """Ensure meta_workflow_input schema validating as expected.

    Note: This is a complex schema including if/then validation.
    """
    schema = get_mixins_field("meta_workflow_input")
    errors = validate_schema(schema, [meta_workflow_input])
    if expected_errors is False:
        assert not errors
    else:
        assert errors


@pytest.mark.workbook
@pytest.mark.parametrize(
    "accession,expected_errors",
    [
        ("", True),
        ("GAPFI1234567", True),  # Invalid prefix
        ("SMA4L1234567", True),  # Numbers in item-type section
        ("SMALLABCDEFGH", True),  # Too long
        ("SMALLABCdEFG", True),  # Lowercase
        ("SMALLAB34N60", True),  # Zero not allowed
        ("SMALLABCDEFG", False),
        ("SMALLAB34N6Y", False),
        ("SMALL1234567", False),
        ("SMAFI025LKA6", True),  # invalid, has a zero
        ("SMAFIO25LKA6", False)  # valid, has an O
    ],
)
def test_accession(
    es_testapp: TestApp, workbook: None, accession: str, expected_errors: bool
) -> None:
    """Ensure accession schema validating pattern as expected."""
    item_with_accession = get_item_with_an_accession(es_testapp)
    identifier = item_with_accession["@id"]
    patch_body = {"accession": accession}
    if expected_errors is False:
        patch_item(es_testapp, patch_body, identifier, status=200)
    else:
        response = patch_item(es_testapp, patch_body, identifier, status=422)
        assert_is_invalid_accession_response(response)


def assert_is_invalid_accession_response(response: Dict[str, Any]) -> bool:
    """Check if response indicates invalid accession."""
    assert "ValidationFailure" in response.get("@type", [])
    errors = response.get("errors", [])
    assert len(errors) == 1
    error = errors[0]
    assert "accession" in error.get("name", "")


def get_item_with_an_accession(es_testapp: TestApp) -> Dict[str, Any]:
    """Pull any item with an accession for testing."""
    search = get_search(es_testapp, "?type=Item&accession!=No+value")
    assert len(search) > 0
    return search[0]


@pytest.mark.workbook
@pytest.mark.parametrize(
    "accession,expected_errors",
    [
        ("", True),
        ("GAPFI1234567", True),  # Invalid prefix
        ("SMA4L1234567", True),  # Numbers in item-type section
        ("SMALLABCDEFGH", True),  # Too long
        ("SMALLABCdEFG", True),  # Lowercase
        ("SMALLAB34N60", True),  # Zero not allowed
        ("SMALLABCDEFG", False),
        ("SMALLAB34N6Y", False),
        ("SMALL1234567", False),
    ],
)
def test_alternate_accessions(
    es_testapp: TestApp, workbook: None, accession: str, expected_errors: bool
) -> None:
    """Ensure alternate_accessions schema validating pattern as expected."""
    item_with_accession = get_item_with_an_accession(es_testapp)
    identifier = item_with_accession["@id"]
    patch_body = {"accession": accession}
    if expected_errors is False:
        patch_item(es_testapp, patch_body, identifier, status=200)
    else:
        response = patch_item(es_testapp, patch_body, identifier, status=422)
        assert_is_invalid_accession_response(response)
