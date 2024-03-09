import re
from typing import Optional, Tuple, Union
from webtest.app import TestApp
from dcicutils.misc_utils import VirtualApp
from dcicutils.structured_data import Portal, StructuredDataSet
from snovault.ingestion.ingestion_processors import ingestion_processor
from snovault.types.ingestion import SubmissionFolio
from ..project.loadxl import ITEM_INDEX_ORDER
from .loadxl_extensions import load_data_into_database, summary_of_load_data_results
from .submission_folio import SmahtSubmissionFolio
# from ..schema_formats import is_accession  # TODO: Problem with circular dependencies.

def includeme(config):
    config.scan(__name__)


@ingestion_processor("metadata_bundle")
@ingestion_processor("family_history")  # TODO: Do we need this?
def handle_metadata_bundle(submission: SubmissionFolio) -> None:
    with submission.processing_context():
        _process_submission(SmahtSubmissionFolio(submission))


def _process_submission(submission: SmahtSubmissionFolio) -> None:
    with submission.s3_file() as file:
        structured_data = parse_structured_data(file, portal=submission.portal_vapp,
                                                autoadd=submission.autoadd,
                                                ref_nocache=submission.ref_nocache)
        if (errors := structured_data.errors):
            submission.record_results(errors, _summarize_errors(structured_data, submission))
            # If there are data validation errors then trigger an exception so that a traceback.txt
            # file gets written to the S3 ingestion submission bucket to indicate that there is an error;
            # this is an exceptional situation that we just happened to have caught programmatically;
            # this (traceback.txt) is done in snovault.types.ingestion.SubmissionFolio.processing_context.
            # raise Exception(validation_errors)
            return
        load_data_response = load_data_into_database(
            data=structured_data.data,
            portal_vapp=submission.portal_vapp,
            post_only=submission.post_only,
            patch_only=submission.patch_only,
            validate_only=submission.validate_only,
            validate_first=submission.validate_first,
            resolved_refs=(structured_data.resolved_refs
                           if submission.validate_only or submission.validate_first else None))
        load_data_summary = summary_of_load_data_results(load_data_response, submission)
        submission.record_results(load_data_response, load_data_summary)


def parse_structured_data(file: str, portal: Optional[Union[VirtualApp, TestApp, Portal]], novalidate: bool = False,
                          autoadd: Optional[dict] = None, prune: bool = True,
                          ref_nocache: bool = False) -> StructuredDataSet:

    def ref_lookup_strategy(type_name: str, schema: dict, value: str) -> Tuple[int, Optional[str]]:
        #
        # Note this situation WRT object lookups ...
        #
        # /{submitted_id}                # NOT FOUND
        # /UnalignedReads/{submitted_id} # OK
        # /SubmittedFile/{submitted_id}  # OK
        # /File/{submitted_id}           # NOT FOUND
        #
        # /{accession}                   # OK
        # /UnalignedReads/{accession}    # NOT FOUND
        # /SubmittedFile/{accession}     # NOT FOUND
        # /File/{accession}              # OK
        #
        not_an_identifying_property = "filename"
        if schema_properties := schema.get("properties"):
            if schema_properties.get("accession") and _is_accession_id(value):
                # Case: lookup by accession (only by root).
                return StructuredDataSet.REF_LOOKUP_ROOT, not_an_identifying_property
            elif schema_property_info_submitted_id := schema_properties.get("submitted_id"):
                if schema_property_pattern_submitted_id := schema_property_info_submitted_id.get("pattern"):
                    if re.match(schema_property_pattern_submitted_id, value):
                        # Case: lookup by submitted_id (only by specified type).
                        return StructuredDataSet.REF_LOOKUP_SPECIFIED_TYPE, not_an_identifying_property
        return StructuredDataSet.REF_LOOKUP_DEFAULT, not_an_identifying_property

    structured_data = StructuredDataSet.load(file=file, portal=portal,
                                             autoadd=autoadd, order=ITEM_INDEX_ORDER, prune=prune,
                                             ref_lookup_strategy=ref_lookup_strategy,
                                             ref_lookup_nocache=ref_nocache)
    if not novalidate:
        structured_data.validate()
    return structured_data


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
    result["file"] = submission.data_file_name
    result["s3_file"] = submission.s3_data_file_location
    result["details"] = submission.s3_details_location
    return result


def _is_accession_id(value: str) -> bool:
    # See schema_formats.py
    # TODO: Problem with circular dependencies.
    return isinstance(value, str) and re.match(r"^SMA[1-9A-Z]{9}$", value) is not None
