from pyramid.view import view_config
from encoded.ingestion.redis import Redis
from snovault.util import debug_log

# This endpoint /ingestion-status/{submission_uuid} is to support progress tracking 
# of the server-side ingester validation/submission process by smaht-submitr.
# We use Redis to store various snovault.loadxl event counts (by submission_uuid),
# and expose them here. See loadxl_extensions.define_progress_tracker for details.

def includeme(config):
    config.add_route("ingestion_status", "/ingestion-status/{uuid}")
    config.scan(__name__)


@view_config(route_name="ingestion_status", request_method=["GET"])
@debug_log
def ingestion_status(context, request):
    if submission_uuid := request.matchdict.get("uuid"):
        redis = Redis.connection()
        if submission_info := redis.get_json(submission_uuid):
            return submission_info
    return {}
