from pyramid.view import view_config
from encoded.ingestion.ingestion_status_cache import IngestionStatusCache
from snovault.util import debug_log

# This endpoint is to support progress tracking of the server-side ingester validation/submission
# process by smaht-submitr.  We use IngestionStatusCache, which is a Redis wrapper, to store
# various snovault.loadxl event counts, by submission_uuid, and expose them here.
# See loadxl_extensions.define_progress_tracker for details.

def includeme(config):
    config.add_route("ingestion_status", "/ingestion-status/{uuid}")
    config.scan(__name__)


@view_config(route_name="ingestion_status", request_method=["GET"])
@debug_log
def ingestion_status(context, request):
    if submission_uuid := request.matchdict.get("uuid"):
        ingestion_status = IngestionStatusCache.connection(submission_uuid, context)
        if submission_uuid.lower() == "list":
            sort = isinstance(sort := request.GET.get("sort"), str) and ((sort := sort.lower()) in ["true", "1"])
            return {"keys": ingestion_status.keys(sort=sort)}
        return ingestion_status.get(sort=True)
    return {}
