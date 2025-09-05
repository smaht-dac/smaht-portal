import re
from typing import Optional
from dcicutils.submitr.custom_excel import CustomExcel
from dcicutils.submitr.progress_constants import PROGRESS_INGESTER
from dcicutils.structured_data import Portal, StructuredDataSet
from snovault.ingestion.ingestion_processors import ingestion_processor
from snovault.types.ingestion import SubmissionFolio
from encoded.project.loadxl import ITEM_INDEX_ORDER
from encoded.ingestion.ingestion_status_cache import IngestionStatusCache
from encoded.ingestion.loadxl_extensions import load_data_into_database, summary_of_load_data_results
from encoded.ingestion.submission_folio import SmahtSubmissionFolio
# from ..schema_formats import is_accession  # TODO: Problem with circular dependencies.


def includeme(config):
    config.scan(__name__)


@ingestion_processor("metadata_bundle")
@ingestion_processor("family_history")  # TODO: Do we need this?
def handle_metadata_bundle(submission: SubmissionFolio) -> None:
    ingestion_status = IngestionStatusCache.connection(submission.submission_id, submission.vapp)
    ingestion_status.update({PROGRESS_INGESTER.INITIATE: PROGRESS_INGESTER.NOW()})
    with submission.processing_context():
        submission = SmahtSubmissionFolio(submission)
        ingestion_status.update({"file": submission.data_file_name,
                                 "file_size": submission.data_file_size,
                                 "file_checksum": submission.data_file_checksum,
                                 "bucket": submission.s3_bucket,
                                 "user": submission.user.get("name") if submission.user else None,
                                 "user_email": submission.user.get("email") if submission.user else None,
                                 "user_uuid": submission.user.get("uuid") if submission.user else None,
                                 "consortium": submission.consortium,
                                 "submission_center": submission.submission_center})
        _process_submission(submission)
        ingestion_status.update({PROGRESS_INGESTER.CLEANUP: PROGRESS_INGESTER.NOW()})
    ingestion_status.update({PROGRESS_INGESTER.OUTCOME: submission.outcome})
    ingestion_status.update({PROGRESS_INGESTER.DONE: PROGRESS_INGESTER.NOW()})
    ingestion_status.flush()


def _process_submission(submission: SmahtSubmissionFolio) -> None:
    with submission.s3_file() as file:
        structured_data = parse_structured_data(file, portal=submission.portal_vapp,
                                                submission=submission,
                                                ref_nocache=submission.ref_nocache,
                                                novalidate=submission.validate_skip)
        if (errors := structured_data.errors):
            submission.record_results(errors, _summarize_errors(structured_data, submission))
            # If there are data validation errors then trigger an exception so that a traceback.txt
            # file gets written to the S3 ingestion submission bucket to indicate that there is an error;
            # this is an exceptional situation that we just happened to have caught programmatically;
            # this (traceback.txt) is done in snovault.types.ingestion.SubmissionFolio.processing_context.
            # raise Exception(validation_errors)
            return
        load_data_response = load_data_into_database(
            submission_uuid=submission.id,
            nrows=structured_data.nrows,
            data=structured_data.data,
            portal_vapp=submission.portal_vapp,
            post_only=submission.post_only,
            patch_only=submission.patch_only,
            validate_only=submission.validate_only,
            resolved_refs=(structured_data.resolved_refs if submission.validate_only else None))
        load_data_summary = summary_of_load_data_results(load_data_response, submission)
        submission.record_results(load_data_response, load_data_summary)


def parse_structured_data(file: str,
                          submission: SubmissionFolio,
                          ref_nocache: bool = False,
                          prune: bool = True,
                          novalidate: bool = False,
                          portal: Optional[Portal] = None) -> StructuredDataSet:

    def structured_data_set_progress(status: dict) -> None:
        nonlocal ingestion_status
        ingestion_status.update(status)
        # structured_data_set_status = {"ingester_parse_" + key: value for key, value in status.items()}
        # ingestion_status.update(structured_data_set_status)

    ingestion_status = IngestionStatusCache.connection(submission.id, submission.portal_vapp)
    ingestion_status.update({PROGRESS_INGESTER.PARSE_LOAD_INITIATE: PROGRESS_INGESTER.NOW()})

    structured_data = StructuredDataSet.load(file=file,
                                             portal=submission.portal_vapp,
                                             autoadd=submission.autoadd,
                                             ref_lookup_nocache=ref_nocache,
                                             order=ITEM_INDEX_ORDER, prune=prune,
                                             merge=submission.merge,
                                             excel_class=CustomExcel,
                                             progress=structured_data_set_progress,
                                             debug_sleep=submission.debug_sleep if submission else None)

    # Check for diffs and remove any items without any substantial changes
    no_diff_items = get_no_diff_items(structured_data)    
    for object_type in structured_data.data:
        structured_data.data[object_type] = [
            item for item in structured_data.data[object_type]
            if item.get('submitted_id') not in no_diff_items
        ]

    ingestion_status.update({PROGRESS_INGESTER.PARSE_LOAD_DONE: PROGRESS_INGESTER.NOW()})

    if not novalidate:
        ingestion_status.update({PROGRESS_INGESTER.VALIDATE_LOAD_INITIATE: PROGRESS_INGESTER.NOW()})
        structured_data.validate()
        ingestion_status.update({PROGRESS_INGESTER.VALIDATE_LOAD_DONE: PROGRESS_INGESTER.NOW()})

    return structured_data


def get_no_diff_items(structured_data: StructuredDataSet) -> set:
    '''
    Return a set of items that are not being changed in a given StructureDataSet
    '''
    diffs = structured_data.compare()
    no_diff_items = set()
    for object_type in diffs:
        for object_info in diffs[object_type]:
            if object_info.uuid:
                if not object_info.diffs:
                    no_diff_items.add(object_info.path.split("/")[2])
    return no_diff_items


def _summarize_errors(structured_data: StructuredDataSet, submission: SmahtSubmissionFolio) -> dict:
    def truncated_info(issues: list) -> dict:
        return {"truncated": True, "total": len(issues),
                "more": len(issues) - max_issues_per_group, "details": submission.s3_details_location}
    max_issues_per_group = 10
    result = {}
    if (reader_warnings := structured_data.reader_warnings):
        result["reader"] = reader_warnings[:max_issues_per_group]
        if len(reader_warnings) > max_issues_per_group:
            result["reader"].append(truncated_info(reader_warnings))
    if (validation_errors := structured_data.validation_errors):
        result["validation"] = validation_errors[:max_issues_per_group]
        if len(validation_errors) > max_issues_per_group:
            result["validation"].append(truncated_info(validation_errors))
    if (ref_errors := structured_data.ref_errors):
        result["ref"] = ref_errors[:max_issues_per_group]
        if len(ref_errors) > max_issues_per_group:
            result["ref"].append(truncated_info(ref_errors))
        ref_errors_grouped = []
        for ref_error in ref_errors:
            if ref_error_path := ref_error.get("error"):
                if ref_error_group := [r for r in ref_errors_grouped if r.get("ref") == ref_error_path]:
                    ref_error_group[0]["count"] += 1
                else:
                    ref_errors_grouped.append({"ref": ref_error_path, "count": 1})
        result["ref_grouped"] = ref_errors_grouped
    result["file"] = submission.data_file_name
    result["s3_file"] = submission.s3_data_file_location
    result["details"] = submission.s3_details_location
    return result


def _is_accession_id(value: str) -> bool:
    # See schema_formats.py
    # TODO: Problem with circular dependencies.
    return isinstance(value, str) and re.match(r"^SMA[1-9A-Z]{9}$", value) is not None
