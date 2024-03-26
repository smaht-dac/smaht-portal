from pyramid.view import view_config
from encoded.ingestion.redis import Redis
from snovault.util import debug_log


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
