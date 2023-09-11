import contextlib
import json
import structlog
import tempfile
from typing import Any, Dict, List
import zipfile
from dcicutils.misc_utils import ignored, VirtualApp
from dcicutils.sheet_utils import ItemManager, InsertsDirectoryItemManager, load_items
from snovault.util import s3_local_file
from snovault.ingestion.common import get_parameter
from snovault.ingestion.ingestion_processors import ingestion_processor
from snovault.loadxl import load_all_gen
import snovault.loadxl
from snovault.types.ingestion import SubmissionFolio


SpreadsheetType = Dict[str, List[Any]]
log = structlog.getLogger(__name__)


def includeme(config):
    config.scan(__name__)


@ingestion_processor('metadata_bundle')
@ingestion_processor('family_history')
def handle_metadata_bundle(submission: SubmissionFolio):

    with submission.processing_context():

        submission_id = submission.submission_id
        consortium = get_parameter(submission.parameters, 'consortium')
        submission_center = get_parameter(submission.parameters, 'submission_center')
        data_file_name = get_parameter(submission.parameters, "datafile")
        if data_file_name.endswith(".json"):
            data_type = data_file_name[:-5]
        else:
            data_type = data_file_name
        ignored(submission_id, consortium, submission_center)  # TODO
        with loaded_spreadsheet(submission, data_file_name=data_file_name) as data:
            do_something_with_this_loaded_spreadsheet(data, data_type, submission)


@contextlib.contextmanager
def loaded_spreadsheet(submission: SubmissionFolio, data_file_name: str = None) -> SpreadsheetType:
    s3_client = submission.s3_client
    s3_bucket = submission.bucket
    s3_key = submission.object_name
    with s3_local_file(s3_client, bucket=s3_bucket, key=s3_key, local_filename=data_file_name) as filename:
        #yield ItemManager.load(filename, portal_env="http://localhost:8000")
        #yield ItemManager.load(filename, portal_env="data")
        #yield load_items(filename, portal_env="data", portal_vapp=submission.vapp)
        if filename.endswith(".zip"):
            tmp_directory = tempfile.mkdtemp()
            with zipfile.ZipFile(filename, "r") as zipf:
                zipf.extractall(tmp_directory)
                loader = InsertsDirectoryItemManager(filename=tmp_directory)
                # TODO: Want to pass portal_vapp to get schemas.
                data = loader.load_content()
                yield data
        else:
            data = load_items(filename, portal_vapp=submission.vapp)
            yield data


def do_something_with_this_loaded_spreadsheet(data: SpreadsheetType, data_type: str, submission: SubmissionFolio) -> None:
    print("TODO: Here are the submitted items to the smaht-portal ingestion:")
    try:
        app = submission.vapp
        validate_only = get_parameter(submission.parameters, 'validate_only', as_type=bool, default=False)
        load_spreadsheet_into_database(data, data_type, app, validate_only)
        print(json.dumps(data, indent=4))
    except Exception as e:
        print("ERROR: Exception while doing something with the smaht-portal ingestion data!")
        print(e)


def load_spreadsheet_into_database(data: SpreadsheetType, data_type: str, app: VirtualApp, validate_only: bool = False) -> None:
    response = load_all_gen(app, data, None, overwrite=True, itype=data_type, from_json=True, patch_only=False, validate_only=validate_only)
    for item in response:
        x = item
