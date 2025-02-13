import re
from typing import Callable, Dict, List, Generator, Optional, Tuple, Union
from dcicutils.misc_utils import VirtualApp
from dcicutils.submitr.progress_constants import PROGRESS_INGESTER, PROGRESS_LOADXL
from dcicutils.structured_data import Portal
from snovault.loadxl import load_all_gen as loadxl
from encoded.ingestion.submission_folio import SmahtSubmissionFolio
from encoded.ingestion.ingestion_status_cache import IngestionStatusCache


def load_data_into_database(submission_uuid: str,
                            data: Dict[str, List[Dict]],
                            portal_vapp: VirtualApp,
                            nrows: Optional[int] = None,
                            post_only: bool = False,
                            patch_only: bool = False,
                            validate_only: bool = False,
                            resolved_refs: List[str] = None) -> Dict:

    ingestion_status = IngestionStatusCache.connection(submission_uuid, portal_vapp)
    ingestion_status.update({PROGRESS_INGESTER.LOADXL_INITIATE: PROGRESS_INGESTER.NOW()})

    def package_loadxl_response(loadxl_response: Generator[bytes, None, None]) -> Dict:
        nonlocal portal_vapp
        portal = None
        upload_info = []
        LOADXL_RESPONSE_PATTERN = re.compile(r"^([A-Z]+):\s*([a-zA-Z\/\d_-]+)\s*(\S+)\s*(\S+)?\s*(.*)$")
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
                # If we are in validate_only mode, and if this is a reference (linkTo)
                # error/exception, and if the given resolved_refs (from ingestion_processors/structured_data),
                # contains the reference to which this error refers, then no error after all; this is because
                # in validate_only  mode we may well get false reference errors, and/but
                # we already did referential integrity checking in the structured_data processing, so we
                # can regard that as the source of truth for referential ingegrity.
                if resolved_refs:
                    instance_type, instance_identifying_value, ref_error_path = (
                        _get_ref_error_info_from_exception_string(response_value))
                    if instance_type and instance_identifying_value and (ref_error_path in resolved_refs):
                        # Here we have a reference (linkTo) error/exception, but because we are in
                        # validate_only  mode, and because the reference was
                        # actually resolved via structured_data referential ingegrity checking 
                        # in ingestion_processors, then this is a false error; so ignore it;
                        # and/but include this object (which refers to the reference in
                        # question in the "validated" section of the results.
                        if not [r for r in response["validated"]
                                if r.get("type") == instance_type and r.get("uuid") == instance_identifying_value]:
                            response["validated"].append({"uuid": instance_identifying_value, "type": instance_type})
                        continue
            else:
                identifying_value = match.group(2)
                item_type = match.group(3)
                response_value = {"uuid": identifying_value, "type": item_type}
                if match.re.groups >= 4 and (file := match.group(4)) and (action in ["updated", "created"]):
                    # Get filename info if applicable (i.e if this is a File type or sub-type).
                    try:
                        if not portal:
                            portal = Portal(portal_vapp)
                        if portal.is_schema_file_type(item_type):
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

    def define_progress_tracker(submission_uuid: str, validation: bool, total: int,
                                vapp: Optional[VirtualApp] = None) -> Optional[Callable]:
        nonlocal ingestion_status
        progress_status_datetime_values = [PROGRESS_LOADXL.START,
                                           PROGRESS_LOADXL.START_SECOND_ROUND,
                                           PROGRESS_LOADXL.DONE]
        progress_status_string_values = [PROGRESS_LOADXL.MESSAGE,
                                         PROGRESS_LOADXL.MESSAGE_VERBOSE,
                                         PROGRESS_LOADXL.MESSAGE_DEBUG]
        progress_status = {}
        for progress_status_enum in PROGRESS_LOADXL.values():
            if ((progress_status_enum in progress_status_datetime_values) or
                (progress_status_enum in progress_status_string_values)):  # noqa
                progress_status[progress_status_enum] = None
            else:
                progress_status[progress_status_enum] = 0
        progress_status = {**progress_status,
                           PROGRESS_LOADXL.TOTAL: total,
                           PROGRESS_INGESTER.VALIDATION: validation}
        def progress_tracker(progress: PROGRESS_LOADXL) -> None:  # noqa
            nonlocal progress_status
            def progress_message() -> None:  # noqa
                # Just a convenience/courtesy so the consumer (smaht-submitr) doesn't have to cobble
                # together a status message; but the data is still there of course if they want/need to.
                nonlocal progress_status, total, validate_only
                processed = progress_status[PROGRESS_LOADXL.ITEM]
                gets = progress_status[PROGRESS_LOADXL.GET]
                posts = progress_status[PROGRESS_LOADXL.POST]
                patches = progress_status[PROGRESS_LOADXL.PATCH]
                errors = progress_status[PROGRESS_LOADXL.ERROR]
                started_second_round = progress_status[PROGRESS_LOADXL.START_SECOND_ROUND]
                processed_second_round = progress_status[PROGRESS_LOADXL.ITEM_SECOND_ROUND]
                done = progress_status[PROGRESS_LOADXL.DONE]
                message = f"Items: {total}"
                if started_second_round is not None:
                    # We call the first round verified/preprocessed and the second validated/processed.
                    if done is not None:
                        message += (f" | {'Validated' if validate_only else 'Processed'}:"
                                    f" {max(processed, processed_second_round)}")
                    else:
                        message += f" | {'Validated' if validate_only else 'Processed'}: {processed_second_round}"
                elif processed > 0:
                    message += f" | {'Verified' if validate_only else 'Preprocessed'}: {processed}"
                message_verbose = message
                if posts > 0:
                    message_verbose += f" | {'Posts' if validate_only else 'Creates'}: {posts}"
                if patches > 0:
                    message_verbose += f" | {'Patches' if validate_only else 'Updates'}: {patches}"
                if gets > 0:
                    message_verbose += f" | Lookups: {gets}"
                if errors > 0:
                    message += (message_errors := f" | Errors: {errors}")
                    message_verbose += message_errors
                message_debug = message_verbose  # TODO
                return message, message_verbose, message_debug
            # Here is the actual count increment for the loadxl event.
            if progress in progress_status_datetime_values:
                progress_status[progress] = PROGRESS_LOADXL.NOW()
            elif progress not in progress_status_string_values:
                progress_status[progress] += 1
            message, message_verbose, message_debug = progress_message()
            ingestion_status.update({**progress_status,
                                     PROGRESS_LOADXL.MESSAGE: message,
                                     PROGRESS_LOADXL.MESSAGE_VERBOSE: message_verbose,
                                     PROGRESS_LOADXL.MESSAGE_DEBUG: message_debug})
        return progress_tracker

    loadxl_response = loadxl(
        testapp=portal_vapp,
        inserts=data,
        docsdir=None,
        overwrite=True,
        itype=None,
        from_json=True,
        continue_on_exception=True,
        verbose=True,
        post_only=post_only,
        patch_only=patch_only,
        validate_only=validate_only,
        skip_links=True,
        # 2025-02-12: Added noset_last_modified; non-admin user error on setting last_modified (willr confirmed).
        noset_last_modified=True,
        progress=define_progress_tracker(submission_uuid, validation=validate_only, total=nrows, vapp=portal_vapp))

    loadxl_response = package_loadxl_response(loadxl_response)

    ingestion_status.update({PROGRESS_INGESTER.LOADXL_DONE: PROGRESS_INGESTER.NOW()})

    return loadxl_response


def summary_of_load_data_results(load_data_response: Optional[Dict],
                                 submission: SmahtSubmissionFolio = None) -> List[str]:
    """
    Summarize the given load data results into a simple short list of English phrases;
    this will end up going into the additional_properties of the IngestionSubmission
    object in the Portal database (see SubmissionFolio.record_results); this is what will
    get displayed, by default, by the submitr tool when it detects processing has completed.
    """
    if (errors := load_data_response.get("errors")) and (errors := [error for error in errors if error]):
        status = "FAILED"
    else:
        status = "OK"
    summary = [
        f"Submission UUID: {submission.id}" if submission else None,
        f"Status: {status}",
        f"File: {submission.data_file_name}" if submission else None,
        f"S3 File: {submission.s3_data_file_location}" if submission else None,
        f"Details: {submission.s3_details_location}" if submission else None,
        f"Total: {load_data_response['total']}",
        f"Types: {len(load_data_response['types'])}",
        f"Created: {len(load_data_response['created'])}",
        f"Updated: {len(load_data_response['updated'])}",
        f"Skipped: {len(load_data_response['skipped'])}",
        f"Checked: {len(load_data_response['validated'])}"
    ]
    if errors:
        summary.append(f"Errored: {len(errors)}")
        for error in errors:
            if error.startswith("ERROR: "):
                error = error[7:]
            summary.append(f"Error: {error}")
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


def _get_ref_error_info_from_exception_string(exception: str) -> Optional[Tuple[str, str, str]]:
    """"
    See if the given exception string represents a reference (linkTo) error, and if so, returns
    a 3-tuple with the Portal path to the offending instance type and identifying value, and the
    problematic reference, otherwise return a 3-tuple of None. This exception is constructed in
    snovault.schema_validation.normalize_links. Here is an example of what we are trying to parse:

    'ERROR: /Analyte/UWSC_ANALYTE_COLO Exception encountered on VirtualAppURL: /Analyte?skip_indexing=true&check_only=trueBODY: {\'submitted_id\': \'UWSC_ANALYTE_COLO\', \'submission_centers\': [\'uwsc_gcc\'], \'molecule\': [\'RNA\'], \'components\': [\'Total DNA\'], \'samples\': [\'UWSC_CELL-CULTURE-SAMPLE_UWSC\']}MSG: HTTP POST failed.Raw Exception: Bad response: 422 Unprocessable Entity (not 200 OK or 3xx redirect for http://localhost/Analyte?skip_indexing=true&check_only=true)b\'{"@type": ["ValidationFailure", "Error"], "status": "error", "code": 422, "title": "Unprocessable Entity", "description": "Failed validation", "errors": [{"location": "body", "name": "Schema: ", "description": "Unable to resolve link: /Sample/UWSC_CELL-CULTURE-SAMPLE_UWSC"}, {"location": "body", "name": "Schema: samples.0", "description": "\\\'UWSC_CELL-CULTURE-SAMPLE_UWSC\\\' not found"}]}\''
    """

    REF_ERROR_PATTERN = re.compile(r"^\s*ERROR\s*:\s*([^\s]+)\s+Exception\s+encountered\s+on\s+VirtualApp\s*URL\s*:\s*\/.*?"
                                   r"\?skip_indexing=true.*Unable\s+to\s+resolve\s+link\s*:\s*(.*?)\".*$")
    match = REF_ERROR_PATTERN.match(exception.replace("\n", " "))
    if match and (match.re.groups == 2) and (instance_path := match.group(1)) and (ref_error_path := match.group(2)):
        # N.B. The part of the exception message matching this ref_error_path, which comes from
        # code snovault.schema_validation.normalize_links (after "Unable to resolve link:", used to
        # just have the identifying value path, without the initial path (i.e. the schema/type name);
        # and, the part of the exception containing the offending instance path (after "ERROR:")
        # used to not be there at all; these changes were made to snovault circa 2024-02-13.
        if instance_path[0] == "/":
            instance_type = instance_path[1:]
            if (slash := instance_type.find("/")) > 0:
                instance_identifying_value = instance_type[slash + 1:]
                instance_type = instance_type[:slash]
                return instance_type, instance_identifying_value, ref_error_path
    return None, None, None
