from pyramid.httpexceptions import (
    HTTPBadRequest,
)
from base64 import b64decode
from pyramid.view import view_config
from pyramid.response import Response
from snovault.util import simple_path_ids, debug_log
from itertools import chain

from snovault.search.search import (
    get_iterable_search_results,
)

import csv
import json
from datetime import datetime

import structlog


log = structlog.getLogger(__name__)


def includeme(config):
    config.add_route('metadata', '/metadata')
    config.scan(__name__)


# For now, use enum code 0 for Files
FILE = 0


class TSVDescriptor:
    """ Dataclass that holds the structure """
    def __init__(self, *, field_type, field_name, deduplicate=True):
        self._field_type = field_type
        self._field_name = field_name
        self._deduplicate = deduplicate

    def field_type(self):
        return self._field_type

    def field_name(self):
        return self._field_name

    def deduplicate(self):
        return self._deduplicate


class DummyFileInterfaceImplementation(object):
    def __init__(self):
        self._line = None
    def write(self, line):
        self._line = line
    def read(self):
        return self._line


# This dictionary is a key --> 3-tuple mapping that encodes options for the /metadata endpoint
# given a field description
TSV_MAPPING = {
    'File Download URL': TSVDescriptor(field_type=FILE,
                                       field_name=['href']),
    'File Accession': TSVDescriptor(field_type=FILE,
                                    field_name=['accession']),
    'Size (MB)': TSVDescriptor(field_type=FILE,
                               field_name=['file_size']),
    'md5sum': TSVDescriptor(field_type=FILE,
                            field_name=['md5sum']),
    'File Type': TSVDescriptor(field_type=FILE,
                               field_name=['file_type']),
    'File Format': TSVDescriptor(field_type=FILE,
                                 field_name=['file_format.display_title']),
}


# These are extra fields to include
EXTRA_FIELDS = {
    FILE: ['extra_files.href', 'extra_files.file_format', 'extra_files.md5sum', 'extra_files.file_size']
}


@view_config(route_name='metadata', request_method=['GET', 'POST'])
@debug_log
def metadata_tsv(context, request):
    """
    In Fourfront, there is custom structure looking for what is referred to as 'accession_triples', which is essentially
    a 3-tuple containing lists of accesions that are either experiment sets, experiments or files

    In SMaHT, in order to preserve similar structure, we eliminate logic for the first two (ExpSet and Exp) presuming
    we will want to use those slots later, and provide only the files slot for now.

    Alternatively, can accept a GET request wherein all files from ExpSets matching search query params are included.
    """
    post_params = request.json_body
    type_param = request.params.get('type') or post_params.get('type')
    sort_param = request.params.get('sort') or post_params.get('sort')

    # One of type param or accessions must be passed
    if not type_param and 'accessions' not in post_params:
        return Response("Invalid parameters", status=400)

    # Process the data
    accessions = post_params.get('accessions', [])
    download_file_name = post_params.get('download_file_name')
    if download_file_name is None:
        download_file_name = 'metadata_' + datetime.utcnow().strftime('%Y-%m-%d-%Hh-%Mm') + '.tsv'

    # generate search
    search_param = {}
    if not type_param:
        search_param['type'] = 'File'
    else:
        search_param['type'] = type_param
    if accessions:
        search_param['accession'] = accessions
    if sort_param:
        search_param['sort'] = sort_param
    search_iter = get_iterable_search_results(request, param_lists=search_param)

    # process search iter
    data_lines = []
    for file in search_iter:
        line = []
        for _, tsv_descriptor in TSV_MAPPING.items():
            line.append(file.get(tsv_descriptor.field_name()[0], ''))
        if 'extra_files' in file:
            for _, tsv_descriptor in TSV_MAPPING.items():
                line.append(file.get(tsv_descriptor.field_name()[0], ''))
        data_lines += line

    # Set response headers
    response = Response(content_type='text/tsv')

    # Define a header
    header = [
            '###', 'Metadata TSV Download', '', '', '', '',
            'Suggested command to download: ', '', '', 'cut -f 1 ./{} | tail -n +3 | grep -v ^# | xargs -n 1 curl -O -L --user <access_key_id>:<access_key_secret>'.format(download_file_name)
    ]
    header.append([key for key in TSV_MAPPING.keys()])

    # helper to generate the tsv
    def generate_tsv():
        line = DummyFileInterfaceImplementation()
        writer = csv.writer(line, delimiter='\t')
        # write the header
        writer.writerow(
            header
        )
        yield line.read().encode('utf-8')

        # write the data
        #import pdb; pdb.set_trace()
        writer.writerow(data_lines)
        yield line.read().encode('utf-8')

    # Set the app_iter to the generator function
    response.app_iter = generate_tsv()

    return Response(
        content_type='text/tsv',
        app_iter=generate_tsv(),
        content_disposition='attachment;filename="%s"' % download_file_name
    )
