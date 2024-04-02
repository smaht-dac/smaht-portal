from pyramid.view import view_config
from dcicutils.misc_utils import is_uuid
from snovault.util import debug_log
from encoded.ingestion.ingestion_status_cache import IngestionStatusCache

# This endpoint is to support progress tracking of the server-side ingester validation/submission
# process by smaht-submitr.  We use IngestionStatusCache, which is a Redis wrapper, to store
# various snovault.loadxl event counts, by submission_uuid, and expose them here.
# See loadxl_extensions.define_progress_tracker for details.

def includeme(config):
    config.add_route("ingestion_status", "/ingestion-status/{submission_uuid}")
    config.scan(__name__)


@view_config(route_name="ingestion_status", request_method=["GET"])
@debug_log
def ingestion_status(context, request):
    if value := request.matchdict.get("submission_uuid"):
        sort = isinstance(sort := request.GET.get("sort"), str) and ((sort := sort.lower()) in ["true", "1"])
        if is_uuid(value):
            return IngestionStatusCache.connection(value, context).get(sort=sort)
        elif (lvalue := value.lower()) == "info":
            return IngestionStatusCache.instance(context).info()
        elif lvalue == "keys":
            return IngestionStatusCache.instance(context).keys(sort=sort)
        elif lvalue == "flush":
            IngestionStatusCache.instance(context).flush()
            return {"flushed": True}
        return {}
