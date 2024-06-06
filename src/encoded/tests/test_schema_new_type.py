from typing import Any, Dict

import pytest
from webtest import TestApp
from dcicutils.schema_utils import get_property
from .utils import (
    load_schema,
    validate_schema,
    patch_item,
    get_item,
    post_item,
)


@pytest.mark.parametrize(
    "number_string_value,error_expected",
    [
        ("1234", False),
        ("58483721209", False),
        ("1", False),
        ("12e4", True),
        ("12-34", True),
        (" 1234 ", True),
    ]
)
def test_number_string_pattern(
    number_string_value: str,
    error_expected: bool
    ) -> None:
    """Test number_string pattern only accepts a string of numbers."""
    schema = load_schema("new_type")
    number_string_property = get_property(schema, "number_string")
    validation_error = validate_schema(number_string_property, number_string_value)
    if error_expected:
        assert validation_error
    else:
        assert not validation_error


@pytest.mark.parametrize(
    "integer_value,error_expected",
    [
        (25, False),
        (50, False),
        (-3, False),
        (-4, True),
        (51, True),
        (-23, True),
    ]
)
def test_integer_4_to_50_range(
    integer_value: int,
    error_expected: bool
    ) -> None:
    """Test integer_4_to_50 only accepts integers >-4 and <=50."""
    schema = load_schema("new_type")
    integer_4_to_50_property = get_property(schema, "integer_4_to_50")
    validation_error = validate_schema(integer_4_to_50_property, integer_value)
    if error_expected:
        assert validation_error
    else:
        assert not validation_error


@pytest.mark.parametrize(
    "object_properties,error_expected",
    [
        ({"key1": 5, "key2": "a"}, False),
        ({"key1": 5, "key2": "a", "key3": 7}, True),
    ]
)
def test_object_without_add_properties(
    object_properties: dict,
    error_expected: bool
    ) -> None:
    """Test object_without_add_properties does not accept additional properties"""
    schema = load_schema("new_type")
    object_without_add_property = get_property(schema, "object_without_add_properties")
    validation_error = validate_schema(object_without_add_property, object_properties)
    if error_expected:
        assert validation_error
    else:
        assert not validation_error


@pytest.mark.parametrize(
    "foobar_instance,expected_status",
    [
        ({
        "foo_or_bar": "Foo",
        }, 200),
        ({
        "foo_or_bar": "Foo",
        "how_bar": 'very',}, 422),
        ({
        "foo_or_bar": "Bar",
        }, 200),
        ({
        "foo_or_bar": "Bar",
        "how_bar": 'very'
        }, 200),   
    ]
)
@pytest.mark.workbook
def test_foo_or_bar_conditional(
    es_testapp: TestApp,
    workbook: None,
    foobar_instance: dict,
    expected_status: int
    ) -> None:
    """Tests foo_or_bar conditional property how_bar only accepted with Bar"""
    #schema = load_schema("new_type")
    item = get_item(es_testapp,
                    "NT1",
                    "NewType")
    item_uuid=item.get("uuid","")
    patch_item(es_testapp,
               foobar_instance,
               item_uuid,status=expected_status)

