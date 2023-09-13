import contextlib
import re
import structlog
import tempfile
from typing import Dict, List, Optional
import zipfile
from dcicutils.misc_utils import VirtualApp
from dcicutils.sheet_utils import InsertsDirectoryItemManager, load_items
from snovault.ingestion.common import get_parameter
from snovault.ingestion.ingestion_processors import ingestion_processor
from snovault.loadxl import get_identifying_value, load_all_gen as loadxl_load_data
from snovault.types.ingestion import SubmissionFolio
from snovault.util import s3_local_file
from .data_validation import validate_data_against_schemas


LoadedDataType = Dict[str, List[dict]]
log = structlog.getLogger(__name__)


def includeme(config):
    config.scan(__name__)


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
def load_data(submission: SmahtSubmissionFolio) -> LoadedDataType:
    with s3_local_file(submission.s3,
                       bucket=submission.s3_data_bucket,
                       key=submission.s3_data_key,
                       local_filename=submission.data_file) as data_file_name:
        yield load_data_via_sheet_utils(data_file_name, submission.portal_vapp)


def load_data_via_sheet_utils(data_file_name: str, portal_vapp: VirtualApp) -> LoadedDataType:
    if data_file_name.endswith(".zip"):
        # TODO: Note that sheet_utils does not yet support zip files so we do it here.
        tmp_data_directory = tempfile.mkdtemp()
        with zipfile.ZipFile(data_file_name, "r") as zipf:
            zipf.extractall(tmp_data_directory)
            # TODO: Want to pass a portal_vapp to get schemas but not yet supported by sheet_utils.
            data = InsertsDirectoryItemManager(filename=tmp_data_directory).load_content()
    else:
        data = load_items(data_file_name, portal_vapp=portal_vapp)
    return data


def upload_summary_to_s3(submission: SmahtSubmissionFolio,
                         load_data_response: Optional[dict] = None,
                         data_validation_problems: Optional[dict] = None) -> None:
    if load_data_response:
        validation_output = [
            f"Ingestion summary:",
            f"Created: {len(load_data_response['create'])}",
            f"Updated: {len(load_data_response['update'])}",
            f"Skipped: {len(load_data_response['skip'])}",
            f"Checked: {len(load_data_response['validate'])}",
            f"Errored: {len(load_data_response['error'])}",
            f"Uniques: {load_data_response['unique']}",
            f"Details: s3://{submission.s3_data_bucket}/{submission.id}/submission.json"
        ]
    elif data_validation_problems:
        validation_output = [
            f"Data validation problems:",
            f"Items missing identifying property: {len(data_validation_problems.get('unidentified', []))}",
            f"Items missing required properties: {len(data_validation_problems.get('missing', []))}",
            f"Items with extraneous properties: {len(data_validation_problems.get('extraneous', []))}",
            f"Other errors: {len(data_validation_problems.get('errors', []))}",
            f"Details: s3://{submission.s3_data_bucket}/{submission.id}/submission.json"
        ]
    result = {"result": load_data_response or data_validation_problems, "validation_output": validation_output}
    submission.note_additional_datum("validation_output", from_dict=result)
    submission.process_result(result)


def load_data_into_database(data: LoadedDataType, portal_vapp: VirtualApp, validate_only: bool = False) -> None:

    def summarize_loadxl_response(loadxl_response) -> dict:
        LOADXL_RESPONSE_PATTERN = re.compile(r"^([A-Z]+):\s*(.*)$")
        ACTION_NAME = {"POST": "create", "PATCH": "update", "SKIP": "skip", "CHECK": "validate", "ERROR": "error"}
        response = {"create": [], "update": [], "skip": [], "validate": [], "error": []}
        unique_identifying_values = set()
        for item in loadxl_response:
            # ASSUME each item in the loadxl response looks something like one of (string or bytes):
            # POST: cafebeef-01ce-4e61-be5d-cd04401dff29
            # PATCH: feedcafe-7b4f-4923-824b-d0864a689bb
            # SKIP: deadbabe-eb17-4406-adb8-060ea2ae2180
            # CHECK: cafebabe-eb17-4406-adb8-0eacafebabe
            # ERROR: deadbeef-483e-4a08-96b9-3ce85ce8bf8c
            # Note that SKIP means skip POST (create); it still may do PATCH (update), if overwrite.
            if isinstance(item, bytes):
                item = item.decode("ascii")
            elif not isinstance(item, str):
                log.warning(f"smaht-ingester: skipping response item of unexpected type ({type(item)}): {item!r}")
                continue
            match = LOADXL_RESPONSE_PATTERN.match(item)
            if not match or match.re.groups != 2:
                log.warning(f"smaht-ingester: skipping response item in unexpected form: {item!r}")
                continue
            action = ACTION_NAME[match.group(1).upper()]
            identifying_value = match.group(2)
            if not response.get(action):
                response[action] = []
            response[action].append(identifying_value)
            unique_identifying_values.add(identifying_value)
        # Items flagged as SKIP in loadxl could ultimately be a PATCH (update),
        # so remove from the skip list any items which are also in the update list. 
        response["skip"] = [item for item in response["skip"] if item not in response["update"]]
        # Items flagged as POST (create) in loadxl typically also are flagged as PATCH (update), due to the
        # way they are written, so remove from the update list any items which are also in the create list.
        response["update"] = [item for item in response["update"] if item not in response["create"]]
        response["unique"] = len(unique_identifying_values)
        return {"loaded": response}

    loadxl_load_data_response = loadxl_load_data(
        testapp=portal_vapp,
        inserts=data,
        docsdir=None,
        overwrite=True,
        itype=None,
        from_json=True,
        patch_only=False,
        validate_only=validate_only)

    return summarize_loadxl_response(loadxl_load_data_response)
