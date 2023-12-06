from typing import Optional, Union
from webtest.app import TestApp
from dcicutils.misc_utils import VirtualApp
from dcicutils.structured_data import Portal, StructuredDataSet
from snovault.ingestion.ingestion_processors import ingestion_processor
from snovault.types.ingestion import SubmissionFolio
from ..project.loadxl import ITEM_INDEX_ORDER
from .loadxl_extensions import load_data_into_database, summary_of_load_data_results
from .submission_folio import SmahtSubmissionFolio


def includeme(config):
    config.scan(__name__)


@ingestion_processor("metadata_bundle")
@ingestion_processor("family_history")  # TODO: Do we need this?
def handle_metadata_bundle(submission: SubmissionFolio) -> None:
    with submission.processing_context():
        _process_submission(SmahtSubmissionFolio(submission))


def _process_submission(submission: SmahtSubmissionFolio) -> None:
    with submission.s3_file() as file:
        structured_data_set = parse_structured_data(file, portal=submission.portal_vapp)
        data = structured_data_set.data
        if (validation_errors := structured_data_set.issues_validation):
            submission.record_results(validation_errors, validation_errors)
            # If there are data validation errors then trigger an exception so that a traceback.txt
            # file gets written to the S3 ingestion submission bucket to indicate that there is an error;
            # this is an exceptional situation that we just happened to have caught programmatically;
            # this (traceback.txt) is done in snovault.types.ingestion.SubmissionFolio.processing_context.
            raise Exception(validation_errors)
        load_data_response = load_data_into_database(data=data,
                                                     portal_vapp=submission.portal_vapp,
                                                     post_only=submission.post_only,
                                                     patch_only=submission.patch_only,
                                                     validate_only=submission.validate_only)
        load_data_summary = summary_of_load_data_results(load_data_response, submission)
        submission.record_results(load_data_response, load_data_summary)


def parse_structured_data(file: str, portal: Optional[Union[VirtualApp, TestApp, Portal]],
                          novalidate: bool = False, prune: bool = True) -> StructuredDataSet:
    structured_data = StructuredDataSet.load(file=file, portal=portal, order=ITEM_INDEX_ORDER, prune=prune)
    if not novalidate:
        structured_data.validate()
    return structured_data
#   return (structured_data.data, structured_data.validate() if not novalidate else [], structured_data)
