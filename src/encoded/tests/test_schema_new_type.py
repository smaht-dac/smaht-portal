from typing import Any, Dict

import pytest
from webtest import TestApp
from dcicutils.schema_utils import get_property
from .utils import load_schema, validate_schema, post_item


@pytest.fixture
def new_type(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "consortia": [test_consortium["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "identifier": "NT2",
        "last_modified": {
            "date_modified": "2018-11-13T20:20:39+00:00"
        },
        "date": "2024-05-17",
        "foo_or_bar": "Bar",
        "integer_4_to_50": 31,
        "object_with_add_properties": {
            "key1" : 1,
            "key2" : "2"
        },
        "object_without_add_properties": {
            "key1" : 1,
            "key2" : "2"
        },
        "number_string": "1234",
        "unique_array": ["a","b","c"],
        "urls": ["https://github.com/smaht-dac/smaht-portal"],
    }
    return post_item(testapp, item, "New Type")


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
def test_number_string_pattern(number_string_value: str, error_expected: bool):
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
def test_integer_4_to_50_range(integer_value: int, error_expected: bool):
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
def test_object_without_add_properties(object_properties: dict, error_expected: bool):
    """Test object_without_add_properties does not accept additional properties"""
    schema = load_schema("new_type")
    object_without_add_property = get_property(schema, "object_without_add_properties")
    validation_error = validate_schema(object_without_add_property, object_properties)
    if error_expected:
        assert validation_error
    else:
        assert not validation_error


# @pytest.mark.parametrize(
#     "foobar_value,error_expected",
#     [
#         ({"is_it_bar": "Bar", "how_bar": "very"}, False),
#         ({"is_it_bar": "Foo", "how_bar": "very"}, True),
#     ]
# )
# def test_foo_or_bar_conditional(foobar_value: dict, error_expected: bool):
#     """Tests foo_or_bar conditional property how_bar only accepted with Bar"""
#     schema = load_schema("new_type")
#     foo_or_bar_property = get_property(schema, "foo_or_bar")
#     validation_error = validate_schema(foo_or_bar_property, foobar_value)
#     if error_expected:
#         assert validation_error
#     else:
#         assert not validation_error

# For new_type.json
        # "how_bar_null": {
        #     "title": "How Bar",
        #     "description": "If Bar, how bar?",
        #     "type": null
        # },
        # "how_bar": {
        #     "title": "Check How Bar",
        #     "description": "Object property finds out how bar if Bar is value",
        #     "type": "object",
        #     "properties": {
        #         "is_it_bar": {"$ref": "#/foo_or_bar"},
        #         "how_bar": {"$ref": "#/how_bar_null"}
        #     },
        #     "if": {
        #         "properties": {
        #             "is_it_bar": {"const": "Bar"}
        #         },
        #         "required": ["is_it_bar"]
                
        #     },
        #     "then": {
        #         "properties": {
        #             "how_bar": {
        #                 "enum": ["very","not that much"]
        #             }
        #         }
        #     },
        # },