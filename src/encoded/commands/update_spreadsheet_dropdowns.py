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
            "link_property": "cell_line"
        },
    ],
    "CellSample": [
        {
            "linked_sheet": "SampleSources",
            "link_property": "cell_line"
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

    def get_link_column_indexes(self) -> List[Dict[str, Any]]:
        """Get the index of linked_columns from Google Sheets."""
        for sheet in self.get_worksheets():
            sheet_name = sheet["properties"]["title"]
            if sheet_name in self.link_dict.keys():
                column_names = self.get_sheet_column_names(sheet)
                for linked_property in self.link_dict[sheet_name]:
                    self.link_dict[sheet_name]['index'] = get_column_index(column_names, linked_property['link_property'])
    

    def get_sheet_column_names(self, sheet) -> List[str]:
        """Get request for column names in spreadsheet sheet."""
        sheet_name = sheet["properties"]["title"]
        data = self.client.values().get(spreadsheetId = self.sheet_id, range = f"{sheet_name}!A1:AZ1").execute()
        return data['values'][0]


def get_google_sheet_client(sheet_id: str) -> SheetsClient:
    """Get Google Sheet to write/update."""
    credentials = wss.get_google_credentials()
    service = build("sheets", "v4", credentials=credentials)
    return SheetsClient(service.spreadsheets(), sheet_id, GCC_SUBMISSION_LINKS)


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
    log.info("Updating Google sheets with tabs.")
    sheets_client.get_link_column_indexes()
    import pdb; pdb.set_trace()
    #update_or_add_spreadsheets(sheets_client, spreadsheets)
    log.info("Writing properties to Google sheets.")
    #write_values_to_sheets(sheets_client, spreadsheets)
    log.info("Google sheets updated.")


def add_samples_sheet():
    pass


def add_sample_sources_sheet():
    pass



def get_worksheet_title(sheet: Dict[str, Any]) -> int:
    """Get the worksheet title."""
    return sheet["properties"]["title"]


def get_data_validation_request(spreadsheet: wss.Spreadsheet, sheet_id: int) -> Dict[str, Any]:
    """Get request to update columns with a data validation."""
    column_index = 0
    linked_sheet = None
    range_name = f"{linked_sheet}!A2:A1000"
    return {
        "setDataValidation": {
            "range": {
            "sheetId": sheet_id,
            "startRowIndex": 2,
            "endRowIndex": 2,
            "startColumnIndex": column_index,
            "endColumnIndex": column_index+1
            },
            "rule": {
            "condition": {
                "type": 'ONE_OF_RANGE',
                "values": [
                    range_name
                ],
            },
            "strict": False
            }
        }
    }




def get_column_index(columns: List[str], link_property:str ) -> int:
    """Get index of link property in list of sheet column names."""
    return columns.index(link_property)


def main():
    parser = argparse.ArgumentParser(description="Write submission spreadsheets")
    parser.add_argument("--env", help="Environment", default="data")
    parser.add_argument("--gcc", help="GCC Submission items", action="store_true")
    parser.add_argument("--all", help="All items", action="store_true")
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
        update_google_sheets(spreadsheet_client, request_handler,gcc=True)
    else:
        parser.error("No items specified to write or update Google spreadsheets for")


if __name__ == "__main__":
    main()