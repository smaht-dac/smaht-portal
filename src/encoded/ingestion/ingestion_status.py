from pyramid.request import Request
from pyramid.view import view_config
from typing import Optional
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
        if is_uuid(value):
            return IngestionStatusCache.connection(value, context).get(sort=_get_arg_bool("sort", request))
        # These are only for troublshooting/testing.
        elif (lvalue := value.lower()) == "info":
            return IngestionStatusCache.instance(context).info()
        elif lvalue == "keys":
            return IngestionStatusCache.instance(context).keys(sort=_get_arg_bool("sort", request))
        elif lvalue == "flush":
            IngestionStatusCache.instance(context).flush()
            return {"flush": True}
        elif lvalue == "set_update_interval":
            if (update_interval := _get_arg_int("seconds", request)) is not None:
                IngestionStatusCache.instance(context).set_update_interval(update_interval)
                return {"set_update_interval": update_interval}
        return {}


def _get_arg_bool(name: str, request: Request) -> bool:
    return isinstance(arg := request.GET.get(name), str) and ((arg := arg.lower()) in ["true", "1"])


def _get_arg_int(name: str, request: Request) -> Optional[int]:
    return int(arg) if isinstance(arg := request.GET.get(name), str) and arg.isdigit() else None
