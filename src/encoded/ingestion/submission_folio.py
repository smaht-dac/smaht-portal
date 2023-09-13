from snovault.ingestion.common import get_parameter
from snovault.types.ingestion import SubmissionFolio


class SmahtSubmissionFolio:
    def __init__(self, submission: SubmissionFolio):
        self.id = submission.submission_id
        self.data_file = get_parameter(submission.parameters, "datafile")
        self.s3_data_bucket = submission.bucket
        self.s3_data_key = submission.object_name
        self.s3 = submission.s3_client
        self.validate_only = get_parameter(submission.parameters, "validate_only", as_type=bool, default=False)
        self.consortium = get_parameter(submission.parameters, "consortium")
        self.submission_center = get_parameter(submission.parameters, "submission_center")
        self.portal_vapp = submission.vapp
        self.note_additional_datum = submission.note_additional_datum
        self.process_result = lambda result: submission.process_standard_bundle_results(result, s3_only=True)
