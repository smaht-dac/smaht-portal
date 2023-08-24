import io
import json
import structlog
from dcicutils.misc_utils import ignored
from snovault.util import debuglog, s3_local_file
from snovault.ingestion.common import get_parameter
from snovault.ingestion.ingestion_processors import ingestion_processor
from snovault.types.ingestion import SubmissionFolio
from dcicutils.sheet_utils import ItemManager


log = structlog.getLogger(__name__)


def includeme(config):
    config.scan(__name__)


@ingestion_processor('metadata_bundle')
@ingestion_processor('family_history')
def handle_metadata_bundle(submission: SubmissionFolio):

    with submission.processing_context():

        s3_client = submission.s3_client
        submission_id = submission.submission_id
        consortium = get_parameter(submission.parameters, 'consortium')
        submission_center = get_parameter(submission.parameters, 'submission_center')
        validate_only = get_parameter(
            submission.parameters,
            'validate_only',
            as_type=bool,
            default=False
        )
        s3_bucket = submission.bucket
        s3_key = submission.object_name
        with s3_local_file(s3_client, bucket=s3_bucket, key=s3_key) as filename:
            file_items = ItemManager.load_workbook(filename)
            do_something_with_this_loaded_spreadsheet(file_items)


def do_something_with_this_loaded_spreadsheet(items: dict) -> None:
    print("TODO: Here are the submitted items to the smaht-portal ingestion:")
    print(json.dumps(items, indent=4))
