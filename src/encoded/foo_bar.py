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

class FooBarViews:
    def __init__(self, request):
        self.request = request

    @view_config(route_name="foo_bar", request_method=['GET'])
    @debug_log
    def foo_bar(self):
        """Gets appropriate foo_bar response based on request"""
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
    

    @view_config(route_name="foo_bar2", request_method=['POST'])
    @debug_log
    def foo_bar_post(self,post_item):
        """Accepts a POST body containing the keys “foo” and “bar”,
        both of whose values must be integers, and returns their
        sum if positive and otherwise returns an invalid response"""
        post_body = post_item
        foo = post_body['foo']
        bar = post_body['bar']
        # Check if integers
        try:
            if isinstance(foo, int) and isinstance(bar,int):
                foobar_sum = foo + bar
                # Check if positive
                try:
                    if foobar_sum > 0:
                        return Response(
                            content_type='text/plain',
                            body=foobar_sum
                        )
                except:
                    return "Invalid Response: Sum of foo and bar is negative."
        except TypeError:
            return "Invalid Response: Values must be integers"