from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Union

import openpyxl
import structlog
from dcicutils.creds_utils import SMaHTKeyManager
from dcicutils.misc_utils import to_camel_case, to_snake_case
from dcicutils import schema_utils
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from snovault.schema_views import SubmissionSchemaConstants

from encoded.item_utils import constants as item_constants
from encoded.item_utils.utils import RequestHandler
from encoded.project.loadxl import ITEM_INDEX_ORDER


log = structlog.getLogger(__name__)

GOOGLE_SHEET_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
GOOGLE_SHEET_ID = "12jMDCOaKJyvR1CZ8oR-47xoXJPM0XqkCwANbAoJJHPE"
GOOGLE_CREDENTIALS_PATH = Path.expanduser(Path("~/google_sheets_creds.json"))
GOOGLE_TOKEN_PATH = Path.expanduser(Path("~/google_sheets_token.json"))

SUBMISSION_SCHEMAS_ENDPOINT = "/submission-schemas/"


def update_google_sheets(request_handler: RequestHandler) -> None:
    """Update Google Sheets with the latest submission schemas."""
    submission_schemas = get_all_submission_schemas(request_handler)
    for item, submission_schema in submission_schemas.items():
        spreadsheet = get_spreadsheet(item, submission_schema)
        update_google_sheet(spreadsheet)


def update_google_sheet(spreadsheet: Spreadsheet) -> None:
    """Update Google Sheet with the latest submission schema."""
    log.info(f"Updating Google Sheet for {spreadsheet.item}")


def write_all_spreadsheets(
    output: Path,
    request_handler: RequestHandler,
    workbook: bool = False,
    separate_comments: bool = False,
) -> None:
    """Write all submission spreadsheets"""
    submission_schemas = get_all_submission_schemas(request_handler)
    log.info(f"Writing submission spreadsheets to: {output}")
    if workbook:
        write_workbook(output, submission_schemas, separate_comments=separate_comments)
    else:
        write_spreadsheets(
            output, submission_schemas, separate_comments=separate_comments
        )


def get_all_submission_schemas(
    request_handler: RequestHandler,
) -> Dict[str, Dict[str, Any]]:
    """Get all submission schemas"""
    return request_handler.get_item(SUBMISSION_SCHEMAS_ENDPOINT)


def write_item_spreadsheets(
    output: Path,
    items: List[str],
    request_handler: RequestHandler,
    workbook: bool = False,
    separate_comments: bool = False,
) -> None:
    """Write submission spreadsheets for specified items"""
    submission_schemas = get_submission_schemas(items, request_handler)
    log.info(f"Writing submission spreadsheets to: {output}")
    if workbook:
        write_workbook(output, submission_schemas, separate_comments=separate_comments)
    else:
        write_spreadsheets(
            output, submission_schemas, separate_comments=separate_comments
        )


def get_submission_schemas(
    items: List[str], request_handler: RequestHandler
) -> Dict[str, Dict[str, Any]]:
    """Get submission schemas for items."""
    return {
        to_snake_case(item): request_handler.get_item(
            get_submission_schema_endpoint(item)
        )
        for item in items
    }


def get_submission_schema_endpoint(item: str) -> Dict[str, Any]:
    """Get the submission schema for the item"""
    return f"{SUBMISSION_SCHEMAS_ENDPOINT}{to_snake_case(item)}.json"


def write_workbook(
    output: Path, submission_schemas: Dict[str, Any], separate_comments: bool = False
) -> None:
    """Write a single workbook containing all submission spreadsheets."""
    workbook = openpyxl.Workbook()
    ordered_submission_schemas = get_ordered_submission_schemas(submission_schemas)
    for index, (item, submission_schema) in enumerate(
        ordered_submission_schemas.items()
    ):
        spreadsheet = get_spreadsheet(item, submission_schema)
        if index == 0:
            worksheet = workbook.active
            set_sheet_name(worksheet, spreadsheet)
            write_properties(worksheet, spreadsheet.properties, separate_comments)
        else:
            worksheet = workbook.create_sheet(title=spreadsheet.item)
            write_properties(worksheet, spreadsheet.properties, separate_comments)
    file_path = Path(output, "submission_workbook.xlsx")
    save_workbook(workbook, file_path)
    log.info(f"Workbook written to: {file_path}")


def get_ordered_submission_schemas(
    submission_schemas: Dict[str, Any]
) -> Dict[str, Any]:
    """Order submission schemas."""
    result = {}
    for item in ITEM_INDEX_ORDER:
        camel_case_item = to_camel_case(item)
        if camel_case_item in submission_schemas:
            result[camel_case_item] = submission_schemas[camel_case_item]
    return result


def write_spreadsheets(
    output: Path, submission_schemas: Dict[str, Any], separate_comments: bool = False
) -> None:
    """Write submission spreadsheets."""
    for item, submission_schema in submission_schemas.items():
        spreadsheet = get_spreadsheet(item, submission_schema)
        write_spreadsheet(output, spreadsheet, separate_comments)


@dataclass(frozen=True)
class Property:
    """Struct to hold property info required for spreadsheet.

    Note: No effort to handle nested properties "well" here, i.e. no
    recursion; specifically no attempt to handle array of objects or
    nested objects. However, arrays of strings are handled by
    bringing select info to top level.
    """

    name: str
    description: str
    value_type: str
    required: bool
    link: bool
    enum: List[str]
    array_subtype: str
    pattern: str

    def is_required(self) -> bool:
        """Check if property is required"""
        return self.required

    def is_link(self) -> bool:
        """Check if property is a link"""
        return self.link


@dataclass(frozen=True)
class Spreadsheet:

    item: str
    properties: List[Property]


def get_spreadsheet(item: str, submission_schema: Dict[str, Any]) -> Spreadsheet:
    """Get spreadsheet information for item."""
    properties = get_properties(submission_schema)
    return Spreadsheet(
        item=item,
        properties=properties,
    )


def get_properties(submission_schema: Dict[str, Any]) -> List[Property]:
    """Get property information from the submission schema"""
    properties = schema_utils.get_properties(submission_schema)
    return [get_property_info(key, value) for key, value in properties.items()]


def get_property_info(key: str, value: Dict[str, Any]) -> Property:
    """Get property information"""
    return Property(
        name=key,
        description=schema_utils.get_description(value),
        value_type=schema_utils.get_schema_type(value),
        required=is_required(value),
        link=is_link(value),
        enum=get_enum(value),
        array_subtype=get_array_subtype(value),
        pattern=schema_utils.get_pattern(value),
    )


def is_required(property_schema: Dict[str, Any]) -> bool:
    """Check if property is required"""
    return property_schema.get(SubmissionSchemaConstants.IS_REQUIRED, False)


def is_link(property_schema: Dict[str, Any]) -> bool:
    """Check if property is a link to another item"""
    return schema_utils.is_link(property_schema) or is_array_of_links(property_schema)


def is_array_of_links(property_schema: Dict[str, Any]) -> bool:
    """Check if property is an array of links"""
    return schema_utils.is_link(schema_utils.get_items(property_schema))


def get_enum(property_schema: Dict[str, Any]) -> List[str]:
    """Get the enum values"""
    return schema_utils.get_enum(property_schema) or get_nested_enum(property_schema)


def get_nested_enum(property_schema: Dict[str, Any]) -> List[str]:
    """Get the enum values from a nested schema"""
    return schema_utils.get_enum(schema_utils.get_items(property_schema))


def get_array_subtype(property_schema: Dict[str, Any]) -> str:
    """Get the array subtype"""
    return schema_utils.get_schema_type(schema_utils.get_items(property_schema))


def write_spreadsheet(
    output: Path, spreadsheet: Spreadsheet, separate_comments: bool = False
) -> None:
    """Write spreadsheet to file"""
    file_path = get_output_file_path(output, spreadsheet)
    workbook = generate_workbook(spreadsheet, separate_comments=separate_comments)
    save_workbook(workbook, file_path)
    log.info(f"Spreadsheet written to: {file_path}")


def get_output_file_path(output: Path, spreadsheet: Spreadsheet) -> Path:
    """Get the output file path"""
    return Path(output, f"{spreadsheet.item}_submission.xlsx")


def generate_workbook(
    spreadsheet: Spreadsheet, separate_comments: bool = False
) -> openpyxl.Workbook:
    """Generate the workbook"""
    workbook = openpyxl.Workbook()
    worksheet = workbook.active
    set_sheet_name(worksheet, spreadsheet)
    write_properties(
        worksheet, spreadsheet.properties, separate_comments=separate_comments
    )
    return workbook


def set_sheet_name(
    worksheet: openpyxl.worksheet.worksheet.Worksheet, spreadsheet: Spreadsheet
) -> None:
    """Set the sheet name"""
    worksheet.title = spreadsheet.item


def write_properties(
    worksheet: openpyxl.worksheet.worksheet.Worksheet,
    properties: List[Property],
    separate_comments: bool = False,
) -> None:
    """Write properties to the worksheet"""
    ordered_properties = get_ordered_properties(properties)
    for index, property_ in enumerate(ordered_properties, start=1):  # cells 1-indexed
        if separate_comments:
            write_property(worksheet, index, property_, comments=False)
            write_comment_cells(worksheet, index, property_)
        else:
            write_property(worksheet, index, property_)


def get_ordered_properties(properties: List[Property]) -> List[Property]:
    """Order properties to write.

    Rank via:
       - Required non-links (~alphabetically)
       - Non-required non-links (alphabetically)
       - Required links (alphabetically)
       - Non-required links (alphabetically)
    """
    return [
        *get_required_non_links(properties),
        *get_non_required_non_links(properties),
        *get_required_links(properties),
        *get_non_required_links(properties),
    ]


def sort_properties_alphabetically(properties: List[Property]) -> List[Property]:
    """Sort properties alphabetically."""
    return sorted(properties, key=lambda property_: property_.name)


def get_required_non_links(properties: List[Property]) -> List[Property]:
    """Get required non-link properties.

    Separate out `submitted_id` if present as first property, and sort
    the rest alphabetically.
    """
    required_non_links = [
        property_
        for property_ in properties
        if property_.is_required() and not property_.is_link()
    ]
    submitted_id = [
        property_ for property_ in required_non_links if is_submitted_id(property_)
    ]
    non_submitted_id = sort_properties_alphabetically(
        [
            property_
            for property_ in required_non_links
            if not is_submitted_id(property_)
        ]
    )
    return [*submitted_id, *non_submitted_id]


def get_non_required_non_links(properties: List[Property]) -> List[Property]:
    """Get non-required non-link properties."""
    return sort_properties_alphabetically(
        [
            property_
            for property_ in properties
            if not property_.is_required() and not property_.is_link()
        ]
    )


def get_required_links(properties: List[Property]) -> List[Property]:
    """Get required link properties."""
    return sort_properties_alphabetically(
        [
            property_
            for property_ in properties
            if property_.is_required() and property_.is_link()
        ]
    )


def get_non_required_links(properties: List[Property]) -> List[Property]:
    """Get non-required link properties."""
    return sort_properties_alphabetically(
        [
            property_
            for property_ in properties
            if not property_.is_required() and property_.is_link()
        ]
    )


def is_submitted_id(property_: Property) -> bool:
    """Check if property is `submitted_id`."""
    return property_.name == item_constants.SUBMITTED_ID


def write_property(
    worksheet: openpyxl.worksheet.worksheet.Worksheet,
    index: int,
    property_: Property,
    comments: bool = True,
) -> None:
    """Write property to the worksheet"""
    row = 1  # cells 1-indexed
    cell = worksheet.cell(row=row, column=index, value=property_.name)
    set_cell_font(cell, property_)
    set_cell_width(worksheet, index, property_)
    if comments:
        write_comment(worksheet, index, property_)


def set_cell_font(cell: openpyxl.cell.cell.Cell, property_: Property) -> None:
    """Set the font for the cell."""
    font = get_font(property_)
    cell.font = font


def set_cell_width(
    worksheet: openpyxl.worksheet.worksheet.Worksheet, index: int, property_: Property
) -> None:
    """Set the width of the cell."""
    width = len(property_.name) + 2
    worksheet.column_dimensions[openpyxl.utils.get_column_letter(index)].width = width


def write_comment(
    worksheet: openpyxl.worksheet.worksheet.Worksheet, index: int, property_: Property
) -> None:
    """Write comment to the worksheet."""
    row = 1
    comment = get_comment(property_)
    if comment:
        worksheet.cell(row=row, column=index).comment = comment


def write_comment_cells(
    worksheet: openpyxl.worksheet.worksheet.Worksheet, index: int, property_: Property
) -> None:
    """Write comment to separate cells under properties."""
    row = 2
    comment = get_comment_text(property_)
    if comment:
        worksheet.cell(row=row, column=index, value=comment)


def get_font(property_: Property) -> openpyxl.styles.Font:
    """Get font for the property."""
    font = openpyxl.styles.Font(name="Arial", size=10)
    if property_.is_required():
        font.bold = True
    if property_.is_link():
        font.italic = True
    return font


def get_comment(property_: Property) -> Union[openpyxl.comments.Comment, None]:
    """Get comment for the property."""
    comment_text = get_comment_text(property_)
    if comment_text:
        height = get_comment_height(comment_text)
        width = get_comment_width(comment_text)
        return openpyxl.comments.Comment(comment_text, "", height=height, width=width)
    return None


def get_comment_text(property_: Property) -> str:
    """Get comment text for the property."""
    comment_lines = []
    indent = "  "
    if property_.description:
        comment_lines.append(f"Description:{indent}{property_.description}")
    if property_.value_type:
        if property_.array_subtype:
            comment_lines.append(
                f"Type:{indent}{property_.array_subtype}"
                f"{indent}(Multiple values allowed)"
            )
        else:
            comment_lines.append(f"Type:{indent}{property_.value_type}")
    if property_.enum:
        comment_lines.append(f"Options:{indent}{' | '.join(property_.enum)}")
    if property_.is_required():
        comment_lines.append(f"Required:{indent}Yes")
    else:
        comment_lines.append(f"Required:{indent}No")
    if property_.pattern:
        comment_lines.append(f"Pattern:{indent}{property_.pattern}")
    if comment_lines:
        return "\n\n".join(comment_lines)
    return ""


def get_comment_height(comment_text: str) -> int:
    """Get comment height based on number of lines.

    Note: Pixels per line chosen based on trial and error.
    """
    lines = [line for line in comment_text.split("\n")]
    pixels_per_line = 20
    return len(lines) * pixels_per_line


def get_comment_width(comment_text: str) -> int:
    """Get comment width based on longest line.

    Note: Pixels per character chosen based on trial and error.
    """
    lines = [line for line in comment_text.split("\n")]
    pixels_per_char = 6
    return max(len(line) for line in lines) * pixels_per_char


def save_workbook(workbook: openpyxl.Workbook, file_path: Path) -> None:
    """Save the workbook to the file path"""
    workbook.save(filename=file_path)


def main():
    parser = argparse.ArgumentParser(description="Write submission spreadsheets")
    parser.add_argument("--output", help="Output file directory", type=dir_path)
    parser.add_argument("--env", help="Environment", default="data")
    parser.add_argument("--item", help="Item name", nargs="+")
    parser.add_argument("--all", help="All items", action="store_true")
    parser.add_argument(
        "--workbook",
        help="Bundle all items into a single workbook",
        action="store_true",
    )
    parser.add_argument(
        "--separate", help="Add comments as separate cells", action="store_true"
    )
    parser.add_argument(
        "--google", help="Write to/update Google Sheets", action="store_true"
    )
    args = parser.parse_args()

    keys = SMaHTKeyManager().get_keydict_for_env(args.env)
    request_handler = RequestHandler(auth_key=keys)
    if not args.output and not args.google:
        parser.error("No output specified")
    if args.all and args.item:
        parser.error("Cannot specify both all and item")
    if args.google:
        log.info(f"Google Sheet ID: {GOOGLE_SHEET_ID}")
        log.info(f"Google Token Path: {GOOGLE_TOKEN_PATH}")
        google_sheet = get_google_sheet()
        update_google_sheets(request_handler)
    if args.all:
        log.info("Writing all submission spreadsheets")
        write_all_spreadsheets(
            args.output,
            request_handler,
            workbook=args.workbook,
            separate_comments=args.separate,
            google=args.google,
        )
    elif args.item:
        log.info(f"Writing submission spreadsheets for item(s): {args.item}")
        write_item_spreadsheets(
            args.output,
            args.item,
            request_handler,
            workbook=args.workbook,
            separate_comments=args.separate,
            google=args.google,
        )
    elif not args.google:
        parser.error("No items specified to write or update spreadsheets for")


def dir_path(path: str) -> Path:
    """Check if the path is a directory"""
    if Path(path).is_dir():
        return Path(path)
    raise NotADirectoryError(path)


def get_google_sheet() -> Any:
    """Get Google Sheet to write/update."""
    credentials = get_google_credentials()
    service = build("sheets", "v4", credentials=credentials)
    spreadsheets = service.spreadsheets()
    import pdb; pdb.set_trace()
    return result


def get_google_credentials() -> Dict[str, Any]:
    """Get Google creds from secrets file."""
    creds = get_google_creds_from_token()
    if not creds:
        creds = get_google_creds_from_flow()
        write_google_token(creds)
    return creds


def get_google_creds_from_token() -> Union[Credentials, None]:
    """Get Google creds from token file."""
    if GOOGLE_TOKEN_PATH.exists():
        credentials = Credentials.from_authorized_user_file(
            GOOGLE_TOKEN_PATH, GOOGLE_SHEET_SCOPES
        )
        if not credentials.valid:
            credentials.refresh(Request())
            write_google_token(credentials)
        return credentials
    return None


def get_google_creds_from_flow() -> Credentials:
    """Get Google creds from flow via credentials file."""
    flow = InstalledAppFlow.from_client_secrets_file(
        GOOGLE_CREDENTIALS_PATH, GOOGLE_SHEET_SCOPES
    )
    return flow.run_local_server(port=0)


def write_google_token(creds: Credentials) -> None:
    """Write Google token to file."""
    with open(GOOGLE_TOKEN_PATH, "w") as file:
        file.write(creds.to_json())


if __name__ == "__main__":
    main()
