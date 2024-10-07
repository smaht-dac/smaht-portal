from pyramid.exceptions import HTTPForbidden
from pyramid.request import Request
from pyramid.security import Authenticated
from pyramid.view import view_config
from dcicutils.misc_utils import is_uuid
from snovault.util import debug_log, is_admin_request
from encoded.ingestion.ingestion_status_cache import IngestionStatusCache

# This endpoint is to support progress tracking of the server-side ingester validation/submission
# process by smaht-submitr. We use IngestionStatusCache, which is a Redis wrapper, to store
# various snovault.loadxl event counts, by submission_uuid, and expose them here.
# See loadxl_extensions.define_progress_tracker for details.

def includeme(config):
    config.add_route("ingestion_status", "/ingestion-status/{submission_uuid}")
    config.scan(__name__)


@view_config(route_name="ingestion_status", request_method=["GET"], effective_principals=Authenticated)
@debug_log
def ingestion_status(context, request):
    if value := request.matchdict.get("submission_uuid"):
        if is_uuid(value):
            return IngestionStatusCache.connection(value, context).get(sort=_get_arg_bool("sort", request))
        # These are only for troubleshooting/testing (admin only).
        if not is_admin_request(request):
            raise HTTPForbidden("The /ingestion-status API is restricted.")
        if (lvalue := value.lower()) == "info":
            return IngestionStatusCache.instance(context).info()
        elif lvalue == "keys":
            return IngestionStatusCache.instance(context).keys(sort=_get_arg_bool("sort", request))
        elif lvalue == "keys_sorted":
            return IngestionStatusCache.instance(context).keys_sorted()
        elif lvalue == "flush":
            IngestionStatusCache.instance(context).flush()
            return {"flush": True}
        return {}


def _get_arg_bool(name: str, request: Request) -> bool:
    return isinstance(arg := request.GET.get(name), str) and ((arg := arg.lower()) in ["true", "1"])
