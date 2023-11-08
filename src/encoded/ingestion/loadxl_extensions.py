import re
from typing import Dict, List, Generator, Optional, Union
from dcicutils.misc_utils import VirtualApp
from snovault.loadxl import load_all_gen as loadxl_load_data
from .submission_folio import SmahtSubmissionFolio


def load_data_into_database(data: Dict[str, List[Dict]], portal_vapp: VirtualApp, validate_only: bool = False) -> Dict:

    def package_loadxl_response(loadxl_response: Generator[bytes, None, None]) -> Dict:
        LOADXL_RESPONSE_PATTERN = re.compile(r"^([A-Z]+):\s*(.*)$")
        LOADXL_ACTION_NAME = {"POST": "created", "PATCH": "updated", "SKIP": "skipped", "CHECK": "validated", "ERROR": "errors"}
        response = {value: [] for value in LOADXL_ACTION_NAME.values()}
        for item in loadxl_response:
            # ASSUME each item in the loadxl response looks something like one of (string or bytes):
            # POST: beefcafe-01ce-4e61-be5d-cd04401dff29
            # PATCH: deadbabe-7b4f-4923-824b-d0864a689bb
            # SKIP: feedbeef-eb17-4406-adb8-060ea2ae2180
            # CHECK: cafebabe-eb17-4406-adb8-0eacafebabe
            # ERROR: deadbeef-483e-4a08-96b9-3ce85ce8bf8c
            # Note that SKIP means skip POST (create); it still may do PATCH (update), if overwrite.
            item = _maybe_decode_bytes(item)
            if not item:
                continue
            match = LOADXL_RESPONSE_PATTERN.match(item)
            if not match or match.re.groups != 2:
                continue
            action = LOADXL_ACTION_NAME[match.group(1).upper()]
            identifying_value = match.group(2)
            if not response.get(action):
                response[action] = []
            response[action].append(identifying_value)
        # Items flagged as SKIP in loadxl could ultimately be a PATCH (update),
        # so remove from the skip list any items which are also in the update list. 
        response["skipped"] = [item for item in response["skipped"] if item not in response["updated"]]
        # Items flagged as POST (create) in loadxl typically also are flagged as PATCH (update), due to the
        # way they are written, so remove from the update list any items which are also in the create list.
        response["updated"] = [item for item in response["updated"] if item not in response["created"]]
        response["types"] = list(data.keys())
        return response

    loadxl_load_data_response = loadxl_load_data(
        testapp=portal_vapp,
        inserts=data,
        docsdir=None,
        overwrite=True,
        itype=None,
        from_json=True,
        patch_only=False,
        validate_only=validate_only)

    return package_loadxl_response(loadxl_load_data_response)


def summary_of_load_data_results(load_data_response: Optional[Dict],
                                 submission: SmahtSubmissionFolio) -> List[str]:
    """
    Summarize the given load data results into a simple short list of English phrases;
    this will end up going into the additional_properties of the IngestionSubmission
    object in the Portal database (see SubmissionFolio.record_results); this is what will
    get displayed, by default, by the submitr tool when it detects processing has completed.
    """
    return [
        f"Successful ingestion summary:",
        f"In File: {submission.data_file_name}",
        f"S3 File: {submission.s3_data_file_location}",
        f"Details: {submission.s3_details_location}",
        f"N Types: {len(load_data_response['types'])}",
        f"Created: {len(load_data_response['created'])}",
        f"Updated: {len(load_data_response['updated'])}",
        f"Skipped: {len(load_data_response['skipped'])}",
        f"Checked: {len(load_data_response['validated'])}",
        f"Errored: {len(load_data_response['errors'])}"
    ]


def _maybe_decode_bytes(str_or_bytes: Union[str, bytes], *, encoding: str = "utf-8") -> str:
    if not isinstance(encoding, str):
        encoding = "utf-8"
    if isinstance(str_or_bytes, bytes):
        return str_or_bytes.decode(encoding)
    elif isinstance(str_or_bytes, str):
        return str_or_bytes
    else:
        return ""
