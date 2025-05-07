#!/usr/bin/env python3

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import googleapiclient
import googleapiclient.discovery
import openpyxl
import structlog
from dcicutils import ff_utils
from dcicutils.creds_utils import SMaHTKeyManager
from dcicutils.misc_utils import to_camel_case, to_snake_case
from dcicutils import schema_utils
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from snovault.schema_views import SubmissionSchemaConstants

from encoded.item_utils.constants import item as item_constants
from encoded.item_utils.utils import RequestHandler
from encoded.project.loadxl import ITEM_INDEX_ORDER

from encoded.commands import write_submission_spreadsheets as wss

log = structlog.getLogger(__name__)

GOOGLE_SHEET_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
GOOGLE_CREDENTIALS_LOCATION = "~/google_sheets_creds.json"
GOOGLE_CREDENTIALS_PATH = Path.expanduser(Path(GOOGLE_CREDENTIALS_LOCATION))
GOOGLE_TOKEN_PATH = Path.expanduser(Path("~/google_sheets_token.json"))

FONT = "Arial"
FONT_SIZE = 10

GCC_SUBMISSION_LINKS = {
    "Tissue": [
        {
            "linked_sheet": "Donor",
            "link_property": "donor" 
        }
    ],
    "TissueSample": [
        {
            "linked_sheet": "Samples",
            "link_property": "sample_sources"
        }
    ],
    "CellCulture": [
        {
            "linked_sheet": "CellLine",
            "link_property": "cell_line"
        },
    ],
    "CellCultureSample": [
        {
            "linked_sheet": "SampleSources",
            "link_property": "sample_sources"
        },
    ],
    "CellSample": [
        {
            "linked_sheet": "SampleSources",
            "link_property": "sample_sources"
        },
    ],
    "Analyte": [
        {
            "linked_sheet": "Samples",
            "link_property": "samples"
        },
        {
            "linked_sheet": "AnalytePreparation",
            "link_property": "analyte_preparation"
        },
    ],
    "AnalytePreparation": [
        {
            "linked_sheet": "PreparationKit",
            "link_property": "preparation_kits"
        },
        {
            "linked_sheet": "Treatment",
            "link_property": "treatments"
        },
    ],
    "Library": [
        {
            "linked_sheet": "Analyte",
            "link_property": "analytes"
        },
        {
            "linked_sheet": "LibraryPreparation",
            "link_property": "library_preparation"
        },
    ],
    "LibraryPreparation": [
        {
            "linked_sheet": "PreparationKit",
            "link_property": "preparation_kits"
        },
        {
            "linked_sheet": "Treatment",
            "link_property": "treatments"
        },
    ],
    "FileSet": [
        {
            "linked_sheet": "Library",
            "link_property": "libraries"
        },
        {
            "linked_sheet": "Sequencing",
            "link_property": "sequencing"
        },
    ],
    "UnalignedReads": [
        {
            "linked_sheet": "FileSet",
            "link_property": "file_sets"
        },
        {
            "linked_sheet": "Software",
            "link_property": "software"
        },
    ],
    "AlignedReads": [
        {
            "linked_sheet": "FileSet",
            "link_property": "file_sets"
        },
        {
            "linked_sheet": "Software",
            "link_property": "software"
        },
    ],
    "VariantCalls": [
        {
            "linked_sheet": "FileSet",
            "link_property": "file_sets"
        },
        {
            "linked_sheet": "Software",
            "link_property": "software"
        },
    ],
    "SupplementaryFile": [
        {
            "linked_sheet": "FileSet",
            "link_property": "file_sets"
        },
        {
            "linked_sheet": "Software",
            "link_property": "software"
        },
    ]
}


@dataclass(frozen=True)
class SheetsClient(wss.SheetsClient):
    client: googleapiclient.discovery.Resource
    sheet_id: str
    link_dict: Dict[str, Any]
    sheet_id_dict: Optional[Dict[str, Any]]

    def get_sheet_id_dict(self) -> Dict[str, Any]:
        """Build dictionary of sheetId indexes for individual sheets in the Google sheet."""
        for sheet in self.get_worksheets():
            sheet_name = get_worksheet_title(sheet)
            self.sheet_id_dict[sheet_name]=get_worksheet_sheet_id(sheet)

    def get_link_column_indexes(self) -> List[Dict[str, Any]]:
        """Get the index of linked_columns from Google Sheets."""
        for sheet in self.get_worksheets():
            sheet_name = get_worksheet_title(sheet)
            if sheet_name in self.link_dict.keys():
                column_names = self.get_sheet_column_names(sheet)
                for linked_property in self.link_dict[sheet_name]:
                    linked_property['index'] = get_column_index(column_names, linked_property['link_property'])
    

    def get_sheet_column_names(self, sheet) -> List[str]:
        """Get request for column names in spreadsheet sheet."""
        sheet_name = sheet["properties"]["title"]
        data = self.client.values().get(spreadsheetId = self.sheet_id, range = f"{sheet_name}!A1:AZ1").execute()
        return data['values'][0]


def get_google_sheet_client(sheet_id: str) -> SheetsClient:
    """Get Google Sheet to write/update."""
    credentials = wss.get_google_credentials()
    service = build("sheets", "v4", credentials=credentials)
    return SheetsClient(client=service.spreadsheets(), sheet_id=sheet_id, link_dict=GCC_SUBMISSION_LINKS, sheet_id_dict={})


def update_google_sheets(
    sheets_client: SheetsClient,
    request_handler: RequestHandler,
    gcc: bool = False,
    tpc: bool = False,
    items: List[str] = None,
    eqm: Union[Dict[str, Any], None] = None,
    example: bool = False,
) -> None:
    """Update Google Sheets with the latest submission schemas."""
    sheets_client.get_sheet_id_dict()
    log.info("Creating hidden link sheets.")
    try:
        add_hidden_sheet("Samples", sheets_client)
    except Exception:
        log.info("Samples sheet already exists. Continuing with update.")
        pass
    populate_samples_sheet(sheets_client)
    try:
        add_hidden_sheet("SampleSources", sheets_client)
    except Exception:
        log.info("SampleSources sheet already exists. Continuing with update.")
        pass
    populate_sample_sources_sheet(sheets_client)
    sheets_client.get_link_column_indexes()
    log.info("Updating Google sheets with dropdowns.")
    add_dropdowns(sheets_client)
    log.info("Google sheets updated.")


def add_hidden_sheet(
    sheet_name: str,
    sheets_client: SheetsClient
) -> None:
    """Add hidden linking Samples spreadsheet to Google Sheets."""
    sheet_id = get_sheet_id(sheet_name, sheets_client)
    max_col = 15
    requests = []
    requests.append(get_add_sheet_request(sheet_name, sheet_id, max_col))
    sheets_client.sheet_id_dict[sheet_name] = sheet_id
    sheets_client.submit_requests(requests)


def populate_samples_sheet(sheets_client: SheetsClient):
    """Add columns and values to Samples spreadsheet."""
    requests = []
    sheet_id = get_sheet_id("Samples", sheets_client)
    column_names = ["TissueSample","CellCultureSample","CellSample"]
    requests.append(get_update_columns_request(sheet_id, get_values(column_names), 0, 0))
    for idx, name in enumerate(column_names):
        for i in range(2,1001):
            value = [f'=IF({name}!$A{i}="", "", {name}!$A{i})']
            requests.append(get_update_columns_request(sheet_id, get_values(value,func=True), row=i-1, col=idx))
    sheets_client.submit_requests(requests)


def get_sheet_id(sheet_name: str, sheets_client: SheetsClient):
    """Get sheetId of sheet."""
    sheet_id = 0
    if sheet_name in sheets_client.sheet_id_dict:
        sheet_id = sheets_client.sheet_id_dict[sheet_name]
    elif sheet_name == "Samples":
        sheet_id = get_max_sheet_id(sheets_client)+1
    elif sheet_name == "SampleSources":
        sheet_id = get_max_sheet_id(sheets_client)+1
    return sheet_id


def get_max_sheet_id(sheets_client: SheetsClient):
    """Get maximum sheetId."""
    max = 0
    for key, value in sheets_client.sheet_id_dict.items():
        if value > max:
            max = value
    return value


def populate_sample_sources_sheet(sheets_client: SheetsClient):
    """Add columns and values to SampleSources spreadsheet."""
    requests = []
    sheet_id = get_sheet_id("SampleSources", sheets_client)
    column_names = ["Tissue","CellCulture","CellCultureMixture"]
    requests.append(get_update_columns_request(sheet_id, get_values(column_names), 0, 0))
    for idx, name in enumerate(column_names):
        for i in range(2,1001):
            value = [f'=IF({name}!$A{i}="", "", {name}!$A{i})']
            requests.append(get_update_columns_request(sheet_id, get_values(value,func=True), row=i-1, col=idx))
    sheets_client.submit_requests(requests)


def get_add_sheet_request(sheet_name:str, sheet_id: int, max_col: int) -> Dict[str, Any]:
    """Get request to add a new sheet."""
    return {
        "addSheet": {
            "properties": {
                "title": sheet_name,
                "sheetId": sheet_id,
                "gridProperties": {
                    "columnCount": max_col
                },
                "hidden": "true"
            },
        }
    }


def get_values(values,func: Optional[bool]=False) -> List[Dict[str, Any]]:
    """Get values for the spreadsheet."""
    return [{"values": [get_cell_value(value,func) for value in values]}]


def get_cell_value(value, func: Optional[bool]=False) -> Dict[str, Any]:
    """Get the cell value."""
    value_type="stringValue"
    if func:
        value_type="formulaValue"
    return {
        "userEnteredValue": {value_type: value},
        "userEnteredFormat": {
            "textFormat":  {"fontFamily": FONT, "fontSize": FONT_SIZE}
        },
    }


def get_update_columns_request(sheet_id: int, values: List[str], row: int, col: int) -> Dict[str, Any]:
    """Get request to update cells with properties."""
    return {
        "updateCells": {
            "rows": values,
            "fields": "*",
            "start": {"sheetId": sheet_id, "rowIndex": row, "columnIndex": col},
        }
    }


def get_worksheet_title(sheet: Dict[str, Any]) -> int:
    """Get the worksheet title."""
    return sheet["properties"]["title"]


def get_worksheet_sheet_id(sheet: Dict[str, Any]) -> int:
    """Get the worksheet sheetId."""
    return sheet["properties"]["sheetId"]


def get_column_index(columns: List[str], link_property:str ) -> int:
    """Get index of link property in list of sheet column names."""
    return columns.index(link_property)


def add_dropdowns(sheets_client: SheetsClient):
    requests = []
    for key, value in sheets_client.link_dict.items():
        for linked_property in value:
            requests.append(get_data_validation_request(sheets_client.sheet_id_dict[key], linked_property['index'], linked_property['linked_sheet']))
    sheets_client.submit_requests(requests)


def get_data_validation_request(sheet_id: int, column_index: int, linked_sheet: str) -> Dict[str, Any]:
    """Get request to update columns with a data validation dropdown using range from linked sheet."""
    range_name = f"={linked_sheet}!A2:A1000"
    if linked_sheet in ["Samples", "SampleSources"]:
        range_name = f"={linked_sheet}!A2:C1000"
    return {
        "setDataValidation": {
            "range": {
                "sheetId": sheet_id,
                "startRowIndex": 1,
                "endRowIndex": 1000,
                "startColumnIndex": column_index,
                "endColumnIndex": column_index+1
            },
            "rule": {
                "condition": {
                    "type": 'ONE_OF_RANGE',
                    "values": [
                        {
                            "userEnteredValue": range_name
                        }
                    ],
                },
            "strict": False,
            'showCustomUi': True
            }
        }
    }


def main():
    parser = argparse.ArgumentParser(description="Write submission spreadsheets")
    parser.add_argument("--env", help="Environment", default="data")
    parser.add_argument(
        "--google",
        help=(
            f"Google Sheets ID to write."
            f" Expects credentials in {GOOGLE_CREDENTIALS_PATH}."
            f" Token will be saved to {GOOGLE_TOKEN_PATH}."
            f" For more information, see docstring within the script."
        ),
    ),
    args = parser.parse_args()

    keys = SMaHTKeyManager().get_keydict_for_env(args.env)
    log.info(f"Found keys for {args.env}")
    request_handler = RequestHandler(auth_key=keys)
    if args.google:
        log.info(f"Google Sheet ID: {args.google}")
        log.info(f"Google Token Path: {GOOGLE_TOKEN_PATH}")
        spreadsheet_client = get_google_sheet_client(args.google)
        log.info("Writing GCC submission Google sheet")
        update_google_sheets(spreadsheet_client, request_handler)
    else:
        parser.error("No items specified to write or update Google spreadsheets for")


if __name__ == "__main__":
    main()