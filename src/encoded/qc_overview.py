from pyramid.view import view_config
from snovault.util import debug_log
from dcicutils.misc_utils import ignored
from snovault.search.search import search
from snovault.search.search_utils import make_search_subreq
from .schema_formats import is_accession_for_server
from urllib.parse import urlencode
from boto3 import client as boto_client
from .utils import get_item
import json

# This refers to the version of the JSON file that contains the QC overview data.
# This needs to be bumped when there is a breaking change in the Front/Backend
JSON_VERSION = "v2"

# Portal constants
REFERENCE_FILE = "ReferenceFile"
METAWORKFLOW_RUN = "MetaWorkflowRun"


def includeme(config):
    config.add_route("get_qc_overview", "/get_qc_overview/")
    config.scan(__name__)



@view_config(route_name="get_qc_overview", request_method="POST")
@debug_log
def get_qc_overview(context, request):
    response = {"error": True, "error_msg": "", "data": None}
    try:
        # Search for fileset with same file group
        search_params = {}
        search_params["type"] = REFERENCE_FILE
        search_params["limit"] = 1
        search_params["sort"] = "-date_created"
        search_params["tags"] = f"qc_overview_data:{JSON_VERSION}"

        # subreq = make_search_subreq(
        #     request, f"/search?{urlencode(search_params, True)}", inherit_user=True
        # )
        # search_res = search(context, subreq)["@graph"]

        # if len(search_res) != 1:
        #     response["error_msg"] = "Reference file not found."
        #     return response

        # reference_file = search_res[0]
        # reference_file_upload_key = reference_file["upload_key"]
        reference_file_upload_key = (
            "25d09e18-2f77-4541-a32c-0f1d99defbd3/SMAFILZCEQ1X.json"
        )

        upload_bucket = request.registry.settings.get("file_upload_bucket")

        if upload_bucket:
            s3 = boto_client("s3")
            try:
                # Load the JSON file from S3
                s3_response = s3.get_object(
                    Bucket=upload_bucket, Key=reference_file_upload_key
                )
                content = s3_response["Body"].read().decode("utf-8")
                response["data"] = json.loads(content)
                response["error"] = False
                return response

            except Exception:
                response["error_msg"] = "Reference file could not be loaded from S3."
                return response

    except Exception as e:
        response["error_msg"] = f"Error when trying to get QC overview data: {str(e)}"
        return response
