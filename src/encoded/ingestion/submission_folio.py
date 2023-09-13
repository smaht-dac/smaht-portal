from contextlib import contextmanager
from snovault.ingestion.common import get_parameter
from snovault.types.ingestion import SubmissionFolio
from snovault.util import s3_local_file


class SmahtSubmissionFolio:

    def __init__(self, submission: SubmissionFolio) -> None:
        self.submission = submission
        self.data_file_name = get_parameter(submission.parameters, "datafile")
        self.s3_details_location = f"s3://{submission.bucket}/{submission.submission_id}/submission.json"
        self.validate_only = get_parameter(submission.parameters, "validate_only", as_type=bool, default=False)
        self.consortium = get_parameter(submission.parameters, "consortium")
        self.submission_center = get_parameter(submission.parameters, "submission_center")
        self.portal_vapp = submission.vapp

    @contextmanager
    def s3_file(self) -> str:
        with s3_local_file(self.submission.s3_client,
                           bucket=self.submission.bucket,
                           key=self.submission.object_name,
                           local_filename=self.data_file_name) as data_file_name:
            yield data_file_name

    def record_results(self, results: dict, summary: list) -> None:
        results = {"result": results, "validation_output": summary}
        # This note_additional_datum call causes the "validation_output" key (a list) of
        # given results to go into the additional_data property of the IngestionSubmission
        # object in the Portal database, accessible, for example, like this:
        # http://localhost:8000/ingestion-submissions/7da2f985-a6f7-4184-9544-b7439957617e?format=json
        self.submission.note_additional_datum("validation_output", from_dict=results)
        # This process_result call causes the "result" key (a dict) of the results
        # above to go into the submission.json key of the submission S3 bucket.
        # All possible results keys and associated target S3 keys are:
        # results["result"]      -> s3://<submission-bucket>/submission.json
        # results["post_output"] -> s3://<submission-bucket>/submission_response
        # results["upload_info"] -> s3://<submission-bucket>/upload_info
        # results["upload_info"] -> s3://<submission-bucket>/upload_info
        # This is done in: in snovault.types.ingestion.SubmissionFolio.process_standard_bundle_results
        # If the s3_only argument is False then then this also this info is not only
        # written to the associated S3 key as described above but also to the additional_data
        # property of the IngestionSubmission object, as described above for note_additional_datum.
        self.submission.process_standard_bundle_results(results, s3_only=True)
