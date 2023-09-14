from contextlib import contextmanager
from typing import Generator, Union
from snovault.ingestion.ingestion_processors import ingestion_processor
from snovault.types.ingestion import SubmissionFolio
from .data_validation import summarize_validate_data_problems, validate_data_against_schemas
from .loadxl_extensions import load_data_into_database, summarize_load_data_into_database_response
from .sheet_utils_extensions import load_data_via_sheet_utils
from .submission_folio import SmahtSubmissionFolio


def includeme(config):
    config.scan(__name__)


@ingestion_processor("metadata_bundle")
@ingestion_processor("family_history")  # TODO: Do we need this?
def handle_metadata_bundle(submission: SubmissionFolio) -> None:
    with submission.processing_context():
        _process_submission(SmahtSubmissionFolio(submission))


def _process_submission(submission: SmahtSubmissionFolio) -> None:
    with _load_data(submission) as data:
        validate_data_problems = validate_data_against_schemas(data, portal_vapp=submission.portal_vapp)
        if validate_data_problems:
            validate_data_summary = summarize_validate_data_problems(validate_data_problems, submission)
            submission.record_results(validate_data_problems, validate_data_summary)
            return
        load_data_response = load_data_into_database(data, submission.portal_vapp, submission.validate_only)
        load_data_summary = summarize_load_data_into_database_response(load_data_response, submission)
        submission.record_results(load_data_response, load_data_summary)


@contextmanager
def _load_data(submission: SmahtSubmissionFolio) -> Generator[Union[dict[str, list[dict]], Exception], None, None]:
    with submission.s3_file() as data_file_name:
        yield load_data_via_sheet_utils(data_file_name, submission.portal_vapp)
