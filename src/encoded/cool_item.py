import traceback
from datetime import datetime
from pytz import timezone
from pyramid.view import view_config
from pyramid.response import Response
from snovault.util import debug_log
from concurrent.futures import ThreadPoolExecutor
from structlog import getLogger
import re

log = getLogger(__name__)


def includeme(config):
    config.add_route('foo_bar', '/foo_bar')
    config.scan(__name__)

class CoolItem:
    def __init__(self, request):
        self.request = request

    @view_config(route_name="cool", request_method=['GET'])
    @debug_log
    def foo_bar(self):
        """all items accessed via “@@cool” (e.g. “/file/<uuid>/@@cool”)
          that returns the string “Cool-<uuid>” where <uuid> is the item’s 
          UUID"""
        name = self.request.params.get('name', 'No Name Provided')
        if re.search("bar",name) and re.search("foo",name):
            body="You hit the lottery"
        elif re.search("bar",name):
            body="foo"
        elif re.search("foo",name):
            body="bar"
        else:
            body="Neither foo nor bar"
        return Response(
            content_type='text/plain',
            body=body
        )