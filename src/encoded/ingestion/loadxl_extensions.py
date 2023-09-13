import re
from typing import Optional
from dcicutils.misc_utils import VirtualApp
from snovault.loadxl import load_all_gen as loadxl_load_data
from .submission_folio import SmahtSubmissionFolio


def load_data_into_database(data: dict[str, list[dict]], portal_vapp: VirtualApp, validate_only: bool = False) -> None:

    def package_loadxl_response(loadxl_response) -> dict:
        LOADXL_RESPONSE_PATTERN = re.compile(r"^([A-Z]+):\s*(.*)$")
        ACTION_NAME = {"POST": "create", "PATCH": "update", "SKIP": "skip", "CHECK": "validate", "ERROR": "error"}
        response = {"create": [], "update": [], "skip": [], "validate": [], "error": []}
        unique_identifying_values = set()
        for item in loadxl_response:
            # ASSUME each item in the loadxl response looks something like one of (string or bytes):
            # POST: cafebeef-01ce-4e61-be5d-cd04401dff29
            # PATCH: feedcafe-7b4f-4923-824b-d0864a689bb
            # SKIP: deadbabe-eb17-4406-adb8-060ea2ae2180
            # CHECK: cafebabe-eb17-4406-adb8-0eacafebabe
            # ERROR: deadbeef-483e-4a08-96b9-3ce85ce8bf8c
            # Note that SKIP means skip POST (create); it still may do PATCH (update), if overwrite.
            if isinstance(item, bytes):
                item = item.decode("ascii")
            elif not isinstance(item, str):
                continue
            match = LOADXL_RESPONSE_PATTERN.match(item)
            if not match or match.re.groups != 2:
                continue
            action = ACTION_NAME[match.group(1).upper()]
            identifying_value = match.group(2)
            if not response.get(action):
                response[action] = []
            response[action].append(identifying_value)
            unique_identifying_values.add(identifying_value)
        # Items flagged as SKIP in loadxl could ultimately be a PATCH (update),
        # so remove from the skip list any items which are also in the update list. 
        response["skip"] = [item for item in response["skip"] if item not in response["update"]]
        # Items flagged as POST (create) in loadxl typically also are flagged as PATCH (update), due to the
        # way they are written, so remove from the update list any items which are also in the create list.
        response["update"] = [item for item in response["update"] if item not in response["create"]]
        response["unique"] = len(unique_identifying_values)
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


def summary_from_load_data_into_database_response(load_data_response: Optional[dict],
                                                  submission: SmahtSubmissionFolio) -> list[str]:
    return [
        f"Ingestion summary:",
        f"Created: {len(load_data_response['create'])}",
        f"Updated: {len(load_data_response['update'])}",
        f"Skipped: {len(load_data_response['skip'])}",
        f"Checked: {len(load_data_response['validate'])}",
        f"Errored: {len(load_data_response['error'])}",
        f"Uniques: {load_data_response['unique']}",
        f"Details: {submission.s3_details_location}"
    ]
