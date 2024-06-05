from pyramid.view import view_config
from pyramid.response import Response
from snovault.util import debug_log
from structlog import getLogger
from encoded.types.base import (
    Item
)
from encoded_core.file_views import build_drs_object_from_props

log = getLogger(__name__)


def includeme(config):
    config.add_route('cool', '/{type}/{uuid}/@@cool')
    config.scan(__name__)


@view_config(route_name="cool", context=Item, request_method=['GET'],
             permission='view', subpath_segments=[0,1])
@debug_log
def cool(context,request):
    """all items accessed via “@@cool” (e.g. “/file/<uuid>/@@cool”)
    that returns the string “Cool-<uuid>” where <uuid> is the items UUID"""
    #at_id =  request.matchdict['@id']
    uuid = context.properties.get('uuid')
    body='Cool-'+uuid
    return Response(
        content_type='text/plain',
        body=body
    )