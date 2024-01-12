from urllib.parse import parse_qs
from pyramid.view import view_config
from pyramid.response import Response
from snovault.util import debug_log
from dcicutils.misc_utils import ignored
from snovault.search.search import (
    get_iterable_search_results,
)

import csv
import json
from datetime import datetime

import structlog


log = structlog.getLogger(__name__)


def includeme(config):
    config.add_route('metadata', '/metadata/')
    config.add_route('metadata_redirect', '/metadata/{search_params}/{tsv}')
    config.scan(__name__)


# For now, use enum code 0 for Files (this will expand greatly later to adapt support
# for other types - Will 3 Jan 2023
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


# This dictionary is a key --> 3-tuple mapping that encodes options for the /metadata/ endpoint
# given a field description. This also describes the order that fields show up in the TSV.
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
    ignored(context)
    # Process arguments
    if request.content_type == 'application/json':
        try:
            post_params = request.json_body
            accessions = post_params.get('accessions', [])
            type_param = post_params.get('type')
            sort_param = post_params.get('sort')
            download_file_name = post_params.get('download_file_name')
            include_extra_files = post_params.get('include_extra_files', False)
        except json.JSONDecodeError:
            return Response("Invalid JSON format", status=400)
    elif request.content_type == 'application/x-www-form-urlencoded':
        post_params = request.POST
        accessions = parse_qs(post_params.get('accessions')).get('accessions', [])
        type_param = post_params.get('type')
        sort_param = post_params.get('sort')
        download_file_name = post_params.get('download_file_name')
        include_extra_files = post_params.get('include_extra_files', False)
    else:
        return Response("Unsupported media type", status=415)

    # One of type param or accessions must be passed
    if not type_param and 'accessions' not in post_params:
        return Response("Invalid parameters", status=400)

    # Process the data
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

    # Helper to grab field values if we reach a terminal field ie: not dict or list
    def descend_field(d, field_name):
        fields = field_name.split('.')
        for field in fields:
            d = d.get(field)
        if isinstance(d, dict) or isinstance(d, list):  # we did not get a terminal field
            return None
        return d

    # Process search iter
    data_lines = []
    for file in search_iter:
        line = []
        for _, tsv_descriptor in TSV_MAPPING.items():
            field = descend_field(file, tsv_descriptor.field_name()[0])
            if field:
                line.append(descend_field(file, tsv_descriptor.field_name()[0]))
        data_lines += [line]
        if include_extra_files and 'extra_files' in file:
            efs = file.get('extra_files')
            for ef in efs:
                ef_line = []
                for _, tsv_descriptor in TSV_MAPPING.items():
                    field = descend_field(ef, tsv_descriptor.field_name()[0])
                    if field:
                        line.append(descend_field(ef, tsv_descriptor.field_name()[0]))
                data_lines += [ef_line]

    # Define a header
    def generate_header():
        header1 = ['###', 'Metadata TSV Download', '', '', '', '']
        header2 = ['Suggested command to download: ', '', '',
                   'cut -f 1 ./{} | tail -n +3 | grep -v ^# | xargs -n 1 curl -O -L '
                   '--user <access_key_id>:<access_key_secret>'.format(download_file_name), '', '']
        header3 = list(TSV_MAPPING.keys())
        return header1, header2, header3

    # Helper to generate the tsv
    def generate_tsv():
        line = DummyFileInterfaceImplementation()
        writer = csv.writer(line, delimiter='\t')
        # write the header
        for header in generate_header():
            writer.writerow(
                header
            )
            yield line.read().encode('utf-8')

        for entry in data_lines:
            writer.writerow(entry)
            yield line.read().encode('utf-8')

    return Response(
        content_type='text/tsv',
        app_iter=generate_tsv(),
        content_disposition=f'attachment;filename={download_file_name}'
    )
