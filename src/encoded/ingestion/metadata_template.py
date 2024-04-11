from googleapiclient.discovery import build as google_sheets_build
from pyramid.view import view_config
from structlog import getLogger as get_logger
from typing import Optional
from dcicutils.misc_utils import get_error_message
from snovault.util import debug_log
from encoded.utils import get_configuration_value

# This endpoint is to support the retrieval of the HMS smaht-submitr metadata template
# spreadsheet version; used by smaht-submitr to check if the user's metadata file,
# if it was based on this HMS template, is up to date with the latest HMS version.
#
# This "version" of which we speak is simply a convention we use of putting
# a string like "version: 1.2.3" in the first row of the second column of
# the main "(Overview/Guidelines)" sheet of this spreadsheet.
#
# This is here and not in smaht-submitr really only because we use the Google Sheets API
# to get this and we would rather not expose the required associated Google API key,
# even though it (the key) is only useful for accessing public documents.

METADATA_TEMPLATE_ID = "1sEXIA3JvCd35_PFHLj2BC-ZyImin4T-TtoruUe6dKT4"
GOOGLE_API_KEY = None  # Defined in application .ini file (via AWS Secrets Manager)
GOOGLE_SHEETS_BASE_URL = f"https://docs.google.com/spreadsheets/d"
# These are hardcoded for now; probably fine/wont-change; dont want to create too much config clutter.
METADATA_TEMPLATE_VERSION_SHEET = "(Overview/Guidelines)"
METADATA_TEMPLATE_VERSION_CELL = "B1:B1"
METADATA_TEMPLATE_VERSION_LOCATION = f"{METADATA_TEMPLATE_VERSION_SHEET}!{METADATA_TEMPLATE_VERSION_CELL}"


def includeme(config):
    config.add_route("submitr_metadata_template", "/submitr-metadata-template/{arg}")
    # config.add_route("ingestion_status", "/ingestion-status/{submission_uuid}")
    config.scan(__name__)


@view_config(route_name="submitr_metadata_template", request_method=["GET"])
@debug_log
def submitr_metadata_template(context, request):
    if (not isinstance(arg := request.matchdict.get("arg"), str)) or (arg.lower() != "version"):
        return {}
    if not (google_api_key := get_configuration_value("google_api_key", context, GOOGLE_API_KEY)):
        _log_warning("No Google Sheets API key found; for getting submitr metadata template version.")
        return {}
    metadata_template_id = get_configuration_value("submitr_metadata_template_id", context, METADATA_TEMPLATE_ID)
    metadata_template_url = f"{GOOGLE_SHEETS_BASE_URL}/{METADATA_TEMPLATE_ID}"
    try:
        service = google_sheets_build("sheets", "v4", developerKey=google_api_key)
        command = service.spreadsheets().values().get(spreadsheetId=metadata_template_id,
                                                      range=METADATA_TEMPLATE_VERSION_LOCATION)
        response = command.execute()
        if version := response.get("values", [])[0][0]:
            metadata_template_version = _parse_metadata_template_version(version)
            return {
                "version": metadata_template_version,
                "url": metadata_template_url
            }
    except Exception as e:
        _log_error(f"Cannot get metadata template version\n{get_error_message(e)} from: {metadata_template_url}")
    return {}


def _parse_metadata_template_version(value: str) -> Optional[str]:
    """
    Parses and returns the version from a string like "version: 1.2.3".
    """
    if value.strip().lower().startswith("version:"):
        return value.replace("version:", "").strip()
    return None


_log = get_logger(__name__)

def _log_error(message: str, exception: Optional[Exception] = None) -> None:
    _log.error(f"ERROR: {message}")
    if isinstance(exception, Exception):
        _log.error(get_error_message(exception, full=True))


def _log_warning(message: str, exception: Optional[Exception] = None) -> None:
    _log.error(f"WARNING-ONLY: {message}")
    if isinstance(exception, Exception):
        _log.error(get_error_message(exception, full=True))  # sic: warning not error
