from json import JSONDecodeError
from urllib.parse import urlencode
from pyramid.view import view_config
from pyramid.response import Response
from snovault.util import debug_log
from snovault.search.search_utils import make_search_subreq
from snovault.search.search import search
from dcicutils.misc_utils import ignored
from structlog import getLogger


log = getLogger(__name__)


def includeme(config):
    config.add_route('search_total', '/search_total')
    config.scan(__name__)


@view_config(route_name='search_total', request_method=['POST'])
@debug_log
def search_total(context, request):
    """ Reads search params and executes a search total """
    ignored(context)
    if request.content_type == 'application/json':
        try:
            search_params = request.json_body
        except JSONDecodeError:
            return Response("Invalid JSON format", status=400)
    else:
        return Response("Invalid (non-JSON) format", status=400)

    # Ensure this is always the case to prevent unintended slowness
    if 'limit' not in search_params:
        search_params['limit'] = 0

    # This one we want consistent with what the user can see
    subreq = make_search_subreq(request, f'/search?{urlencode(search_params, True)}',
                                inherit_user=True)
    result = search(context, subreq)['total']
    return {
        '@context': '/search_total',
        '@id': '/search_total',
        'total': result
    }
