import contextlib
from typing import Optional
from snovault.ingestion.ingestion_processors import ingestion_processor
from snovault.types.ingestion import SubmissionFolio
from snovault.util import s3_local_file
from .data_validation import summary_from_data_validation_problems, validate_data_against_schemas
from .loadxl_extensions import load_data_into_database, summary_from_load_data_into_database_response
from .sheet_utils_extensions import load_data_via_sheet_utils
from .submission_folio import SmahtSubmissionFolio


def includeme(config):
    config.scan(__name__)


@ingestion_processor("metadata_bundle")
@ingestion_processor("family_history")
def handle_metadata_bundle(submission: SubmissionFolio):
    with submission.processing_context():
        process_submission(SmahtSubmissionFolio(submission))


def process_submission(submission: SmahtSubmissionFolio):
    with load_data(submission) as data:
        data_validation_problems = validate_data_against_schemas(data, portal_vapp=submission.portal_vapp)
        if data_validation_problems:
            upload_summary_to_s3(submission, data_validation_problems=data_validation_problems)
        else:
            load_data_response = load_data_into_database(data, submission.portal_vapp, submission.validate_only)
            upload_summary_to_s3(submission, load_data_response=load_data_response)


@contextlib.contextmanager
def load_data(submission: SmahtSubmissionFolio) -> dict[str, list[dict]]:
    with s3_local_file(submission.s3,
                       bucket=submission.s3_data_bucket,
                       key=submission.s3_data_key,
                       local_filename=submission.data_file) as data_file_name:
        yield load_data_via_sheet_utils(data_file_name, submission.portal_vapp)


def upload_summary_to_s3(submission: SmahtSubmissionFolio,
                         load_data_response: Optional[dict] = None,
                         data_validation_problems: Optional[dict] = None) -> None:
    if load_data_response:
        validation_output = summary_from_load_data_into_database_response(load_data_response, submission)
    elif data_validation_problems:
        validation_output = summary_from_data_validation_problems(data_validation_problems, submission)
    result = {"result": load_data_response or data_validation_problems, "validation_output": validation_output}
    submission.note_additional_datum("validation_output", from_dict=result)
    submission.process_result(result)
