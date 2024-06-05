from pyramid.view import view_config
from pyramid.response import Response
from snovault.util import debug_log
from structlog import getLogger
from encoded.types.base import (
    Item
)
import structlog

log = getLogger(__name__)


def includeme(config):
    config.add_route('cool', '/{type_name}/{uuid}/@@cool')
    config.scan(__name__)


@view_config(route_name="cool", context=Item, request_method=['GET'],
             permission='view')
@debug_log
def cool(context,request):
    """all items accessed via “@@cool” (e.g. “/file/<uuid>/@@cool”)
    that returns the string “Cool-<uuid>” where <uuid> is the items UUID"""
    #rendered_object = request.embed(str(context.uuid), '@@cool', as_user=True)
    # type_name = request.matchdict['type_name']
    # uuid = request.matchdict['uuid']
    # atid = request.resource_path(context)
    uuid = context.properties.get('uuid')
    body='Cool-'+uuid
    # return {
    #     '@graph' : [{
    #         '@id': atid,
    #         'body': resbody
    #     }]
    # }
    return Response(
        content_type='text/plain',
        body=body
    )