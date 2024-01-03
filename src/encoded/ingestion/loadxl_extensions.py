import re
from typing import Dict, List, Generator, Optional, Union
from dcicutils.misc_utils import VirtualApp
from dcicutils.structured_data import Portal
from snovault.loadxl import load_all_gen as loadxl_load_data
from .submission_folio import SmahtSubmissionFolio


def load_data_into_database(data: Dict[str, List[Dict]], portal_vapp: VirtualApp,
                            post_only: bool = False,
                            patch_only: bool = False,
                            validate_only: bool = False) -> Dict:

    def package_loadxl_response(loadxl_response: Generator[bytes, None, None]) -> Dict:
        nonlocal portal_vapp
        portal = None
        upload_info = []
        LOADXL_RESPONSE_PATTERN = re.compile(r"^([A-Z]+):\s*([a-zA-Z\d_-]+)\s*(\S+)\s*(\S+)?\s*(.*)$")
        LOADXL_ACTION_NAME = {"POST": "created", "PATCH": "updated", "SKIP": "skipped", "CHECK": "validated", "ERROR": "errors"}
        response = {value: [] for value in LOADXL_ACTION_NAME.values()}
        for item in loadxl_response:
            # ASSUME each item in the loadxl response looks something like one of (string or bytes):
            # POST: beefcafe-01ce-4e61-be5d-cd04401dff29 FileFormat
            # PATCH: deadbabe-7b4f-4923-824b-d0864a689bb Software
            # SKIP: feedbeef-eb17-4406-adb8-060ea2ae2180 Workflow
            # CHECK: cafebabe-eb17-4406-adb8-0eacafebabe ReferenceFile
            # ERROR: deadbeef-483e-4a08-96b9-3ce85ce8bf8c OutputFile
            # Note that SKIP means skip POST (create); it still may do PATCH (update), if overwrite.
            item = _maybe_decode_bytes(item)
            if not item:
                continue
            match = LOADXL_RESPONSE_PATTERN.match(item)
            if not match or match.re.groups < 3:
                continue
            if (action := LOADXL_ACTION_NAME[match.group(1).upper()]) == "errors":
                response_value = match.group(0)
            else:
                identifying_value = match.group(2)
                item_type = match.group(3)
                response_value = {"uuid": identifying_value, "type": item_type}
                if match.re.groups >= 4 and (file := match.group(4)) and (action in ["updated", "created"]):
                    # Get filename info if applicable (i.e if this is a File type or sub-type).
                    try:
                        if not portal:
                            portal = Portal(portal_vapp)
                        if portal.is_file_schema(item_type):
                            existing_item = [item for item in upload_info
                                             if item["uuid"] == identifying_value and item["filename"] == file]
                            if not existing_item:
                                upload_info.append({"uuid": identifying_value, "filename": file})
                    except Exception:
                        pass
            if not response.get(action):
                response[action] = []
            response[action].append(response_value)
        # Items flagged as SKIP in loadxl could ultimately be a PATCH (update),
        # so remove from the skip list any items which are also in the update list. 
        response["skipped"] = [item for item in response["skipped"] if item not in response["updated"]]
        # Items flagged as POST (create) in loadxl typically also are flagged as PATCH (update), due to the
        # way they are written, so remove from the update list any items which are also in the create list.
        response["updated"] = [item for item in response["updated"] if item not in response["created"]]
        response["types"] = list(data.keys())
        if upload_info:
            response["upload_info"] = upload_info
        response["total"] = (
            len(response["created"]) +
            len(response["updated"]) +
            len(response["skipped"]) +
            len(response["validated"]) +
            len(response["errors"])
        )
        return response

    loadxl_load_data_response = loadxl_load_data(
        testapp=portal_vapp,
        inserts=data,
        docsdir=None,
        overwrite=True,
        itype=None,
        from_json=True,
        verbose=True,
        post_only=post_only,
        patch_only=patch_only,
        validate_only=validate_only)

    return package_loadxl_response(loadxl_load_data_response)


def summary_of_load_data_results(load_data_response: Optional[Dict],
                                 submission: SmahtSubmissionFolio = None) -> List[str]:
    """
    Summarize the given load data results into a simple short list of English phrases;
    this will end up going into the additional_properties of the IngestionSubmission
    object in the Portal database (see SubmissionFolio.record_results); this is what will
    get displayed, by default, by the submitr tool when it detects processing has completed.
    """
    summary = [
        f"Successful ingestion summary:",
        f"File:    {submission.data_file_name}" if submission else None,
        f"S3 File: {submission.s3_data_file_location}" if submission else None,
        f"Details: {submission.s3_details_location}" if submission else None,
        f"Total:   {load_data_response['total']}",
        f"Created: {len(load_data_response['created'])}",
        f"Updated: {len(load_data_response['updated'])}",
        f"Skipped: {len(load_data_response['skipped'])}",
        f"Checked: {len(load_data_response['validated'])}",
        f"Errored: {len(load_data_response['errors'])}",
        f"Types:   {len(load_data_response['types'])}"
    ]
    return [item for item in summary if item is not None]


def _maybe_decode_bytes(str_or_bytes: Union[str, bytes], *, encoding: str = "utf-8") -> str:
    if not isinstance(encoding, str):
        encoding = "utf-8"
    if isinstance(str_or_bytes, bytes):
        return str_or_bytes.decode(encoding)
    elif isinstance(str_or_bytes, str):
        return str_or_bytes
    else:
        return ""
