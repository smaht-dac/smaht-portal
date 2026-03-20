import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional
from unittest import mock

import openpyxl
import pytest
from dcicutils import schema_utils
from dcicutils.misc_utils import to_camel_case, to_snake_case

from ..commands.write_submission_spreadsheets import (
    FONT,
    FONT_SIZE,
    ITEM_SPREADSHEET_SUFFIX,
    WORKBOOK_FILENAME,
    Property,
    Spreadsheet,
    get_array_subtype,
    get_comment_text,
    get_enum,
    get_font,
    get_ordered_properties,
    get_property,
    get_nested_properties,
    get_spreadsheet,
    is_link,
    write_all_spreadsheets,
    write_item_spreadsheets,
)
from ..item_utils.utils import RequestHandler


@pytest.fixture
def submission_schema() -> Dict[str, Any]:
    """Mock submission schema for tests."""
    return {
        "title": "Foo",
        "properties": {
            "bar": {"title": "Bar", "type": "string"},
            "baz": {"title": "Baz", "type": "number"},
        },
    }


@pytest.fixture
def submission_schemas(
    submission_schema: Dict[str, Any],
) -> Dict[str, Dict[str, Any]]:
    """Mock response from /submission-schemas/ for tests."""
    return {
        "Foo": submission_schema,
        "Qux": {
            "title": "Qux",
            "properties": {
                "quux": {"title": "Quux", "type": "string"},
                "corge": {"title": "Corge", "type": "number"},
            },
        },
    }


def get_mock_request_handler() -> mock.Mock:
    return mock.create_autospec(RequestHandler)


@contextmanager
def patch_get_all_submission_schemas(
    submission_schemas: Dict[str, Dict[str, Any]],
) -> mock.Mock:
    with mock.patch(
        "encoded.commands.write_submission_spreadsheets.get_all_submission_schemas",
        return_value=submission_schemas,
    ) as mock_get_all_submission_schemas:
        yield mock_get_all_submission_schemas


@contextmanager
def patch_get_submission_schemas(
    submission_schemas: Dict[str, Dict[str, Any]],
) -> mock.Mock:
    with mock.patch(
        "encoded.commands.write_submission_spreadsheets.get_submission_schemas",
        return_value=submission_schemas,
    ) as mock_get_submission_schemas:
        yield mock_get_submission_schemas


def get_item_index_order(submission_schemas: Dict[str, Dict[str, Any]]) -> List[str]:
    """Create mock ITEM_INDEX_ORDER based on submission schemas.

    In this case, determined by reverse alphabetical order of item types.
    """
    sorted_order = sorted(
        [to_snake_case(item_type) for item_type in submission_schemas.keys()]
    )
    return sorted_order[::-1]


@contextmanager
def patch_item_index_order(submission_schemas: Dict[str, Dict[str, Any]]) -> mock.Mock:
    new_item_index_order = get_item_index_order(submission_schemas)
    with mock.patch(
        "encoded.commands.write_submission_spreadsheets.ITEM_INDEX_ORDER",
        new_item_index_order,
    ) as mock_item_index_order:
        yield mock_item_index_order


@pytest.mark.parametrize(
    "workbook,separate_comments",
    [
        (False, False),
        (False, True),
        (True, False),
        (True, True),
        (True, False),
    ],
)
def test_write_all_spreadsheets(
    workbook: bool,
    separate_comments: bool,
    submission_schemas: Dict[str, Dict[str, Any]],
) -> None:
    """Test writing all spreadsheets.

    Serves as an integrated test for high-level functionality. Details
    tested in other unit tests.
    """
    request_handler = get_mock_request_handler()
    with tempfile.TemporaryDirectory() as tempdir:
        with patch_get_all_submission_schemas(submission_schemas):
            with patch_item_index_order(submission_schemas):
                write_all_spreadsheets(
                    tempdir,
                    request_handler,
                    workbook=workbook,
                    separate_comments=separate_comments,
                )
        if workbook:
            assert_workbook_written(tempdir, submission_schemas, separate_comments)
        else:
            assert_spreadsheets_written(tempdir, submission_schemas, separate_comments)


@pytest.mark.parametrize(
    "items,workbook,separate_comments,expected_items",
    [
        ([], False, False, []),
        (["Fu"], True, True, []),
        (["Foo"], False, False, ["Foo"]),
        (["Foo"], False, True, ["Foo"]),
        (["Foo"], True, False, ["Foo"]),
        (["Foo"], True, True, ["Foo"]),
        (["Foo", "Qux"], False, False, ["Foo", "Qux"]),
        (["Foo", "Fu"], False, False, ["Foo"]),
    ],
)
def test_write_item_spreadsheets(
    items: List[str],
    workbook: bool,
    separate_comments: bool,
    expected_items: List[str],
    submission_schemas: Dict[str, Dict[str, Any]],
) -> None:
    """Test writing spreadsheets for given item types."""
    request_handler = get_mock_request_handler()
    with tempfile.TemporaryDirectory() as tempdir:
        expected_submission_schemas = get_expected_schemas(
            submission_schemas, expected_items
        )
        with patch_get_submission_schemas(expected_submission_schemas):
            with patch_item_index_order(submission_schemas):
                write_item_spreadsheets(
                    tempdir,
                    items,
                    request_handler,
                    workbook=workbook,
                    separate_comments=separate_comments,
                )
        if not expected_items:
            assert list(Path(tempdir).iterdir()) == []
        else:
            if workbook:
                assert_workbook_written(
                    tempdir, submission_schemas, separate_comments, items=expected_items
                )
            else:
                assert_spreadsheets_written(
                    tempdir, submission_schemas, separate_comments, items=expected_items
                )


def assert_workbook_written(
    tempdir: str,
    submission_schemas: Dict[str, Dict[str, Any]],
    separate_comments: bool,
    items: Optional[List[str]] = None
) -> None:
    """Assert that the workbook was written correctly at a high level."""
    workbook_path = Path(tempdir).joinpath(WORKBOOK_FILENAME)
    assert workbook_path.exists()
    workbook = openpyxl.load_workbook(workbook_path)
    expected_schemas = get_expected_schemas(submission_schemas, items)
    assert_workbook_sheets_ordered(workbook, expected_schemas)
    for item_type, schema in expected_schemas.items():
        sheet = workbook.get_sheet_by_name(item_type)
        assert_sheet_written(sheet, schema, separate_comments)


def get_expected_schemas(
    submission_schemas: Dict[str, Dict[str, Any]],
    items: Optional[List[str]] = None
) -> Dict[str, Dict[str, Any]]:
    """Get the expected schemas for the given items."""
    if items is None:
        return submission_schemas
    return {
        item_type: submission_schemas.get(item_type)
        for item_type in items
        if item_type in submission_schemas
    }


def assert_workbook_sheets_ordered(
    workbook: openpyxl.workbook.workbook.Workbook,
    expected_schemas: Dict[str, Dict[str, Any]],
) -> None:
    """Assert that the workbook sheets are ordered correctly."""
    expected_sheet_names = [
        to_camel_case(item_type) for item_type in get_item_index_order(expected_schemas)
    ]
    assert workbook.sheetnames == expected_sheet_names


def assert_sheet_written(
    sheet: openpyxl.worksheet.worksheet.Worksheet,
    schema: Dict[str, Any],
    separate_comments: bool,
) -> None:
    """Assert that a sheet was written correctly at a high level.

    Not checking cell values here, just the structure.
    """
    expected_properties = schema_utils.get_properties(schema)
    expected_property_names = set(expected_properties.keys())
    first_row_cells = [cell for cell in sheet[1]]
    second_row_cell_values = [cell.value for cell in sheet[2]]
    actual_property_names = set(cell.value for cell in first_row_cells)
    assert actual_property_names == expected_property_names
    if separate_comments:
        assert len(second_row_cell_values) == len(actual_property_names)
        for cell_value in second_row_cell_values:
            assert cell_value
        for cell in first_row_cells:
            assert not cell.comment
    else:
        assert set(second_row_cell_values) == {None}
        for cell in first_row_cells:
            assert cell.comment


def assert_spreadsheets_written(
    tempdir: str,
    submission_schemas: Dict[str, Dict[str, Any]],
    separate_comments: bool,
    items: Optional[List[str]] = None,
) -> None:
    """Assert that spreadsheets were written correctly at a high level."""
    expected_schemas = get_expected_schemas(submission_schemas, items)
    for item_type, schema in expected_schemas.items():
        spreadsheet_path = Path(tempdir).joinpath(
            f"{to_snake_case(item_type)}{ITEM_SPREADSHEET_SUFFIX}"
        )
        assert spreadsheet_path.exists()
        workbook = openpyxl.load_workbook(spreadsheet_path)
        assert workbook.sheetnames == [item_type]
        sheet = workbook.get_sheet_by_name(item_type)
        assert_sheet_written(sheet, schema, separate_comments)


def test_get_spreadsheet(submission_schema: Dict[str, Any]) -> None:
    """Test creation of Spreadsheet class from schema."""
    item = "foo"
    spreadsheet = get_spreadsheet(item, submission_schema)
    assert isinstance(spreadsheet, Spreadsheet)
    assert spreadsheet.item == item
    assert len(spreadsheet.properties) == len(
        schema_utils.get_properties(submission_schema)
    )
    for property_ in spreadsheet.properties:
        assert isinstance(property_, Property)


@pytest.mark.parametrize(
    "property_name,property_schema,expected",
    [
        (  # Simple case with defaults
            "bar",
            {},
            Property(
                name="bar",
                item="Foo",
                description="",
                value_type="",
                required=False,
                link=False,
                enum=[],
                array_subtype="",
                pattern="",
                comment="",
                examples=[],
                format_="",
                requires=[],
                exclusive_requirements=[],
            ),
        ),
        (  # More complicated case with most attributes
            "baz",
            {
                "description": "Baz",
                "type": "number",
                "is_required": True,
                "linkTo": "Bar",
                "enum": [1, 2, 3],
                "pattern": "pattern",
                "submissionComment": "This is a comment.",
                "submissionExamples": [1, 2],
                "format": "format",
                "also_requires": ["foo"],
                "required_if_not_one_of": ["bar"],
            },
            Property(
                name="baz",
                item="Foo",
                description="Baz",
                value_type="number",
                required=True,
                link=True,
                enum=[1, 2, 3],
                array_subtype="",
                pattern="pattern",
                comment="This is a comment.",
                examples=[1, 2],
                format_="format",
                requires=["foo"],
                exclusive_requirements=["bar"],
                search="https://data.smaht.org/search/?type=Bar"
            ),
        ),
        (  # More complicated case with suggested_enum
            "baz",
            {
                "description": "Baz",
                "type": "number",
                "is_required": True,
                "linkTo": "Bar",
                "enum": [1, 2, 3],
                "pattern": "pattern",
                "submissionComment": "This is a comment.",
                "suggested_enum": [1, 2],
                "format": "format",
                "also_requires": ["foo"],
                "required_if_not_one_of": ["bar"],
            },
            Property(
                name="baz",
                item="Foo",
                description="Baz",
                value_type="number",
                required=True,
                link=True,
                enum=[1, 2, 3],
                array_subtype="",
                pattern="pattern",
                comment="This is a comment.",
                examples=[1, 2],
                format_="format",
                requires=["foo"],
                exclusive_requirements=["bar"],
                search="https://data.smaht.org/search/?type=Bar"
            ),
        ),
    ],
)
def test_get_property(
    property_name: str, property_schema: Dict[str, Any], expected: Property
) -> None:
    """Test creation of Property class from schema.

    For more complicated attributes, see respective unit tests.
    """
    property_ = get_property('Foo',property_name, property_schema)
    assert property_ == expected


@pytest.mark.parametrize(
    "property_name,property_schema,expected",
    [
        (
            "baz", # test array of objects
            {
                "description": "Baz",
                "type": "array",
                "is_required": True,
                "items": {
                    "properties": {
                        "foo": {
                            "description": "Foo",
                            "type": "number"
                        }
                    }
                }
            },
            [
                Property(
                    name="baz#0.foo",
                    item="Foo",
                    description="Foo",
                    value_type="number",
                    required=False,
                    link=False,
                    enum=[],
                    array_subtype="",
                    pattern="",
                    comment="",
                    examples=[],
                    format_="",
                    requires=[],
                    exclusive_requirements=[],
                    nested=True
                ),
                Property(
                    name="baz#1.foo",
                    item="Foo",
                    description="Foo",
                    value_type="number",
                    required=False,
                    link=False,
                    enum=[],
                    array_subtype="",
                    pattern="",
                    comment="",
                    examples=[],
                    format_="",
                    requires=[],
                    exclusive_requirements=[],
                    nested=True
                )
            ]
        ),
    ]
)
def test_get_nested_properties(
    property_name: str, property_schema: Dict[str, Any], expected: Property
) -> None:
    """Test get_nested_properties from schema.
    """
    property_ = get_nested_properties("Foo",property_name, property_schema)
    assert property_ == expected


@pytest.mark.parametrize(
    "property_schema,expected",
    [
        ({}, False),
        ({"linkTo": "Foo"}, True),
        ({"type": "array", "items": {"linkTo": "Foo"}}, True),
        ({"type": "array", "items": {"type": "string"}}, False),
    ],
)
def test_is_link(property_schema: Dict[str, Any], expected: bool) -> None:
    """Test determination of whether a property is a link."""
    assert is_link(property_schema) == expected


@pytest.mark.parametrize(
    "property_schema,expected",
    [
        ({}, []),
        ({"enum": [1, 2, 3]}, [1, 2, 3]),
        ({"type": "array", "items": {"enum": [1, 2, 3]}}, [1, 2, 3]),
        ({"type": "array", "items": {"type": "string"}}, []),
    ],
)
def test_get_enum(property_schema: Dict[str, Any], expected: List[str]) -> None:
    """Test retrieval of enum from property schema."""
    assert get_enum(property_schema) == expected


@pytest.mark.parametrize(
    "property_schema,expected",
    [
        ({}, ""),
        ({"type": "array", "items": {"type": "string"}}, "string"),
        ({"type": "array", "items": {"type": "number"}}, "number"),
        (  # Even though not handling arrays of objects currently -DRR 2024-06-10
            {
                "type": "array",
                "items": {"type": "object", "properties": {"foo": {"type": "string"}}},
            },
            "object",
        ),
    ],
)
def test_get_array_subtype(property_schema: Dict[str, Any], expected: str) -> None:
    """Test retrieval of array subtype from property schema."""
    assert get_array_subtype(property_schema) == expected


@pytest.mark.parametrize(
    "properties,expected",
    [
        ([], []),
        (
            [
                Property("bar"),
                Property("baa"),
                Property("tiz", required=True),
                Property("foo", required=True),
                Property("submitted_id", required=True),
                Property("qux", link=True),
                Property("baz", link=True),
                Property("quux", link=True, required=True),
                Property("corge", link=True, required=True),
            ],
            [
                Property("submitted_id", required=True),
                Property("foo", required=True),
                Property("tiz", required=True),
                Property("bar"),
                Property("baa"),
                Property("quux", link=True, required=True),
                Property("corge", link=True, required=True),
                Property("baz", link=True),
                Property("qux", link=True),
            ],
        ),
    ],
)
def test_get_ordered_properties(
    properties: List[Property], expected: List[Property]
) -> None:
    """Test that properties are ordered correctly."""
    assert get_ordered_properties(properties) == expected


@pytest.mark.parametrize(
    "property_,expected",
    [
        (Property("foo"), "Required:  No"),  # Base case
        (  # Most attributes
            Property(
                "foo",
                description="Foo",
                required=True,
                link=True,
                value_type="string",
                enum=["foo", "bar"],
                examples=["fu", "bar"],
                requires=["bar", "bu"],
                pattern="pattern",
                comment="This is a comment.",
            ),
            (
                "Description:  Foo\n"
                "Type:  string\n"
                "Options:  foo | bar\n"
                "Examples:  fu | bar\n"
                "Link:  Yes\n"
                "Required:  Yes\n"
                "Requires:  bar | bu\n"
                "Pattern:  pattern\n"
                "Note:  This is a comment."
            ),
        ),
        (  # Array type
            Property("foo", value_type="array", array_subtype="string"),
            "Type:  string  (Multiple values allowed. Use '|' as a delimiter.)\nRequired:  No",
        ),
        (  # Possibly required
            Property("foo", exclusive_requirements=["bar", "bu"]),
            "Required:  Possibly\n  Not required if present:  bar | bu",
        ),
        (  # Date format without pattern
            Property("foo", format_="date"),
            "Required:  No\nFormat:  YYYY-MM-DD",
        ),
        (  # Most search and nested
            Property(
                "foo",
                description="Foo",
                required=False,
                link=True,
                value_type="string",
                nested=True,
                search="test.url.com",
            ),
            (
                "Description:  Foo\n"
                "Type:  string\n"
                "Link:  Yes\n"
                "Required:  No\n"
                "Use URL to search for the submitted_id or identifer of relevant items:  test.url.com\n"
                "Nested:  Yes"
            ),
        ),
    ],
)
def test_get_comment_text(property_: Property, expected: str) -> None:
    """Test that comments are generated correctly."""
    assert get_comment_text(property_) == expected


@pytest.mark.parametrize(
    "property_,expected_bold,expected_italic",
    [
        (
            Property("foo"),
            False,
            False,
        ),
        (
            Property("foo", required=True),
            True,
            False,
        ),
        (
            Property("foo", link=True),
            False,
            True,
        ),
    ],
)
def test_get_font(
    property_: Property, expected_bold: bool, expected_italic: bool
) -> None:
    """Test that font is generated correctly."""
    result = get_font(property_)
    assert isinstance(result, openpyxl.styles.Font)
    assert result.name == FONT
    assert result.size == FONT_SIZE
    if expected_bold:
        assert result.bold
    else:
        assert not result.bold
    if expected_italic:
        assert result.italic
    else:
        assert not result.italic
