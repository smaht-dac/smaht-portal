from contextlib import contextmanager
from typing import Dict, List, Generator, Union
from dcicutils.bundle_utils import load_items as load_via_sheet_utils
from snovault.ingestion.ingestion_processors import ingestion_processor
from snovault.types.ingestion import SubmissionFolio
from ..project.loadxl import ITEM_INDEX_ORDER
from .data_validation import summary_of_data_validation_errors
from .loadxl_extensions import load_data_into_database, summary_of_load_data_results
from .structured_data import StructuredDataSet
from .submission_folio import SmahtSubmissionFolio

USE_STRUCTURED_DATA = True


def includeme(config):
    config.scan(__name__)


@ingestion_processor("metadata_bundle")
@ingestion_processor("family_history")  # TODO: Do we need this?
def handle_metadata_bundle(submission: SubmissionFolio) -> None:
    with submission.processing_context():
        _process_submission(SmahtSubmissionFolio(submission))


def _process_submission(submission: SmahtSubmissionFolio) -> None:
    with _parse_data(submission) as data_tuple:
        data = data_tuple[0]
        validate_data_errors = data_tuple[1]
        # validate_data_errors = validate_data_against_schemas(data, portal_vapp=submission.portal_vapp)
        if validate_data_errors:
            validate_data_summary = summary_of_data_validation_errors(validate_data_errors, submission)
            submission.record_results(validate_data_errors, validate_data_summary)
            # If there are data validation errors then trigger an exception so that a traceback.txt
            # file gets written to the S3 ingestion submission bucket to indicate that there is an error;
            # this is an exceptional situation that we just happened to have caught programmatically;
            # this (traceback.txt) is done in snovault.types.ingestion.SubmissionFolio.processing_context.
            raise Exception(validate_data_summary)
        load_data_response = load_data_into_database(data, submission.portal_vapp,
                                                     post_only=submission.post_only,
                                                     patch_only=submission.patch_only,
                                                     validate_only=submission.validate_only)
        load_data_summary = summary_of_load_data_results(load_data_response, submission)
        submission.record_results(load_data_response, load_data_summary)


@contextmanager
def _parse_data(submission: SmahtSubmissionFolio) -> Generator[Union[Dict[str, List[Dict]], Exception], None, None]:
    with submission.s3_file() as file:
        if USE_STRUCTURED_DATA:
            yield StructuredDataSet.load(file, portal=submission.portal_vapp, order=ITEM_INDEX_ORDER)
        else:
            yield load_via_sheet_utils(file, portal_vapp=submission.portal_vapp,
                                       validate=True, apply_heuristics=True,
                                       sheet_order=ITEM_INDEX_ORDER)
