from pyramid.httpexceptions import HTTPBadRequest, HTTPFound
from pyramid.security import Authenticated
from pyramid.view import view_config
import structlog
from webob.multidict import MultiDict
from urllib.parse import urlencode
from snovault.search.search import search
from snovault.util import debug_log
from encoded.recent_files_summary import recent_files_summary

log = structlog.getLogger(__name__)

# 2024-11-19/dmichaels: Adapted from fourfront for C4-1184.

def includeme(config):
    config.add_route('browse', '/browse{slash:/?}')
    config.add_route("recent_files_summary_endpoint", "/recent_files_summary")
    config.scan(__name__)


# DEFAULT_BROWSE_TYPE = "FileSet"
# DEFAULT_BROWSE_TYPE = "UnalignedReads"
# DEFAULT_BROWSE_TYPE = "OutputFile"

DEFAULT_BROWSE_TYPE = "File"
DEFAULT_BROWSE_FACETS = ["file_size"]

DEFAULT_BROWSE_PARAM_LISTS = {
    "type": [DEFAULT_BROWSE_TYPE],
    "additional_facet": DEFAULT_BROWSE_FACETS
}

@view_config(route_name='browse', request_method='GET', permission='search')
@debug_log
def browse(context, request, search_type=DEFAULT_BROWSE_TYPE, return_generator=False):
    """
    Simply use search results for browse view
    Redirect to proper URL w. params if needed
    """
    orig_params = request.params
    for k,vals in DEFAULT_BROWSE_PARAM_LISTS.items():
        if k not in orig_params or orig_params[k] not in vals:
            # Redirect to DEFAULT_BROWSE_PARAM_LISTS URL
            next_qs = MultiDict()
            for k2, v2list in DEFAULT_BROWSE_PARAM_LISTS.items():
                for v2 in v2list:
                    next_qs.add(k2, v2)
            # Preserve other keys that arent in DEFAULT_BROWSE_PARAM_LISTS
            for k2, v2 in orig_params.items():
                if k2 not in DEFAULT_BROWSE_PARAM_LISTS:
                    next_qs.add(k2, v2)
            # next_qs.add("redirected_from", str(request.path_qs))
            return HTTPFound(
                location=str(request.path) + '?' +  urlencode(next_qs),
                detail="Redirected from " + str(request.path_info)
            )

    # TODO
    # No real /browse specific UI yet; initially just basically copied static/components/SearchView.js to BrowseView.js.
    return search(context, request, search_type, return_generator, forced_type="Browse")


@view_config(route_name="recent_files_summary_endpoint", request_method=["GET"], effective_principals=Authenticated)
@debug_log
def recent_files_summary_endpoint(context, request):
    from encoded.endpoint_utils import request_arg_bool
    text = request_arg_bool(request, "text")
    results = recent_files_summary(request, troubleshooting=text)
    if text:
        import json
        import os
        from pyramid.response import Response
        import sys
        from encoded.recent_files_summary import print_normalized_aggregation_results
        with capture_output_to_html_string() as captured_output:
            print_normalized_aggregation_results(results, uuids=True, uuid_details=True)
            text = captured_output.getvalue() 
            text = ansi_to_html(text)
        return Response(f"<pre>{text}</pre>", content_type='text/html')
    return results


from contextlib import contextmanager
@contextmanager
def capture_output_to_html_string():
    from io import StringIO
    from unittest.mock import patch as patch
    print_original = print
    captured_output = StringIO()
    def captured_print(*args, **kwargs):
        nonlocal captured_output
        print_original(*args, **kwargs, file=captured_output)
    with patch("builtins.print", captured_print):
        yield captured_output


def ansi_to_html(text):
    import re
    ANSI_ESCAPE_RE = re.compile(r'\x1b\[(\d+)m')
    ANSI_COLOR_MAP = {
        '30': 'black',
        '31': 'red',
        '32': 'green',
        '33': 'yellow',
        '34': 'blue',
        '35': 'magenta',
        '36': 'cyan',
        '37': 'white',
        '90': 'bright_black',
        '91': 'bright_red',
        '92': 'bright_green',
        '93': 'bright_yellow',
        '94': 'bright_blue',
        '95': 'bright_magenta',
        '96': 'bright_cyan',
        '97': 'bright_white',
    }
    def replace_ansi(match):
        code = match.group(1)  # Extract ANSI code
        color = ANSI_COLOR_MAP.get(code)
        if color:
            return f'<span style="color: {color};">'
        elif code == '0':  # Reset code
            return '</span>'
        return ''  # Ignore unsupported codes
    html_text = ANSI_ESCAPE_RE.sub(replace_ansi, text)
    if html_text.count('<span') > html_text.count('</span>'):
        html_text += '</span>'
    return f'<pre>{html_text}</pre>'
