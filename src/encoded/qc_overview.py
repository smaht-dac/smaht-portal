from pyramid.view import view_config
from snovault.util import debug_log
from snovault.search.search import search
from snovault.search.search_utils import make_search_subreq
from encoded.types.file import validate_user_has_protected_access
from urllib.parse import urlencode
from boto3 import client as boto_client
import json

# This refers to the version of the JSON file that contains the QC overview data.
# This needs to be bumped when there is a breaking change in the Front/Backend
JSON_VERSION = "v4"

# Portal constants
REFERENCE_FILE = "ReferenceFile"
METAWORKFLOW_RUN = "MetaWorkflowRun"


def includeme(config):
    config.add_route("get_qc_overview", "/get_qc_overview/")
    config.add_route("get_somalier_overview", "/get_somalier_overview/")
    config.scan(__name__)


def _get_reference_file_json(context, request, tag):
    """Fetch the JSON content of the most recent ReferenceFile with the given tag from S3."""
    response = {"error": True, "error_msg": "", "data": None}

    if not validate_user_has_protected_access(request):
        response["error_msg"] = "User does not have access to protected data."
        return response

    try:
        search_params = {
            "type": REFERENCE_FILE,
            "limit": 1,
            "sort": "-date_created",
            "tags": tag,
            "version": JSON_VERSION,
        }
        subreq = make_search_subreq(
            request, f"/search?{urlencode(search_params, True)}", inherit_user=True
        )
        search_res = search(context, subreq)["@graph"]

        if len(search_res) != 1:
            response["error_msg"] = f"Reference file not found for tag '{tag}'."
            return response

        upload_key = search_res[0]["upload_key"]
        upload_bucket = request.registry.settings.get("file_upload_bucket")

        #For local testing purposes
        # if tag == "somalier_data":
        #     upload_key = (
        #         "2d1e6abc-22ce-4db0-9a8f-cc09a810aac7/SMAFI55NZZKE.json"
        #     )
        # elif tag == "qc_metrics_data":
        #     upload_key = (
        #         "cf683b4b-832f-46df-bd59-7dde5c4945ba/SMAFISSLEHWK.json"
        #     )

        if upload_bucket:
            s3 = boto_client("s3")
            try:
                s3_response = s3.get_object(Bucket=upload_bucket, Key=upload_key)
                content = s3_response["Body"].read().decode("utf-8")
                response["data"] = json.loads(content)
                response["error"] = False
                return response
            except Exception:
                response["error_msg"] = f"Reference file for tag '{tag}' could not be loaded from S3."
                return response

    except Exception as e:
        response["error_msg"] = f"Error when trying to get data for tag '{tag}': {str(e)}"
        request.response.status_code = 500
        return response


@view_config(route_name="get_qc_overview", request_method="POST")
@debug_log
def get_qc_overview(context, request):
    return _get_reference_file_json(context, request, "qc_metrics_data")


@view_config(route_name="get_somalier_overview", request_method="POST")
@debug_log
def get_somalier_overview(context, request):
    return _get_reference_file_json(context, request, "somalier_data")
