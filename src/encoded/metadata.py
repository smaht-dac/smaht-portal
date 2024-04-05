from pyramid.view import view_config
from pyramid.response import Response
from snovault.util import debug_log
from dcicutils.misc_utils import ignored
from snovault.search.search import (
    get_iterable_search_results, search
)
from snovault.search.search_utils import make_search_subreq
from typing import Tuple, NamedTuple, List
from urllib.parse import urlencode
import csv
import json
from datetime import datetime

import structlog


log = structlog.getLogger(__name__)


def includeme(config):
    config.add_route('peek_metadata', '/peek-metadata/')
    config.add_route('metadata', '/metadata/')
    config.add_route('metadata_redirect', '/metadata/{search_params}/{tsv}')
    config.scan(__name__)


# For now, use enum code 0 for Files (this will expand greatly later to adapt support
# for other types - Will 3 Jan 2023
FILE = 0


class MetadataArgs(NamedTuple):
    """ NamedTuple that holds all the args passed to the /metadata and /peek-metadata endpoints """
    accessions: List[str]
    sort_param: str
    type_param: str
    include_extra_files: bool
    download_file_name: str
    header: Tuple[List[str], List[str], List[str]]
    tsv_mapping: dict


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
# TODO: move to another file or write in JSON
TSV_MAPPING = {
    FILE: {
        'File Download URL': TSVDescriptor(field_type=FILE,
                                           field_name=['href']),
        'File Accession': TSVDescriptor(field_type=FILE,
                                        field_name=['accession']),
        'File Name': TSVDescriptor(field_type=FILE,
                                   field_name=['annotated_filename', 'display_title', 'filename']),
        'Size (MB)': TSVDescriptor(field_type=FILE,
                                   field_name=['file_size']),
        'md5sum': TSVDescriptor(field_type=FILE,
                                field_name=['md5sum']),
        'File Type': TSVDescriptor(field_type=FILE,
                                   field_name=['file_type']),
        'File Format': TSVDescriptor(field_type=FILE,
                                     field_name=['file_format.display_title']),
    }
}


def generate_file_download_header(download_file_name: str):
    """ Helper function that generates a suitable header for the File download """
    header1 = ['###', 'Metadata TSV Download', '', '', '', '', '']
    header2 = ['Suggested command to download: ', '', '',
               "cut -f 1,3 ./{} | tail -n +4 | grep -v ^# | xargs -n 2 -L 1 sh -c 'curl -L "
               "--user <access_key_id>:<access_key_secret> $0 --output $1'".format(download_file_name), '', '', '']
    header3 = list(TSV_MAPPING[FILE].keys())
    return header1, header2, header3


def descend_field(request, prop, field_names):
    """ Helper to grab field values if we reach a terminal field ie: not dict or list """
    for possible_field in field_names:
        current_prop = prop  # store a reference to the original object
        fields = possible_field.split('.')
        for field in fields:
            current_prop = current_prop.get(field)
        if current_prop is None or isinstance(current_prop, dict) or isinstance(current_prop, list):
            continue
        elif possible_field == 'href':
            return f'{request.scheme}://{request.host}{current_prop}'
        else:
            return current_prop
    return None


def generate_tsv(header: Tuple, data_lines: list):
    """ Helper function that actually generates the TSV """
    line = DummyFileInterfaceImplementation()
    writer = csv.writer(line, delimiter='\t')
    # write the header
    for header_row in header:
        writer.writerow(
            header_row
        )
        yield line.read().encode('utf-8')

    # write the data
    for entry in data_lines:
        writer.writerow(entry)
        yield line.read().encode('utf-8')


def handle_metadata_arguments(context, request):
    """ Helper function that processes arguments for the metadata.tsv related API endpoints """
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
        accessions = json.loads(post_params.get('accessions', ''))
        type_param = post_params.get('type')
        sort_param = post_params.get('sort')
        download_file_name = post_params.get('download_file_name')
        include_extra_files = post_params.get('include_extra_files', False)
    else:
        return Response("Unsupported media type", status=415)

    # One of type param or accessions must be passed
    if not type_param and 'accessions' not in post_params:
        return Response("Invalid parameters", status=400)

    if download_file_name is None:
        download_file_name = 'smaht_manifest_' + datetime.utcnow().strftime('%Y-%m-%d-%Hh-%Mm') + '.tsv'

    # Generate a header, resolve mapping
    # Note that this will become more complex as we add additional header types
    header = generate_file_download_header(download_file_name)
    tsv_mapping = TSV_MAPPING[FILE]
    return MetadataArgs(accessions, sort_param, type_param, include_extra_files, download_file_name, header, tsv_mapping)


@view_config(route_name='peek_metadata', request_method=['GET', 'POST'])
@debug_log
def peek_metadata(context, request):
    """ Helper for the UI that will retrieve faceting information about data retrieved from /metadata """
    # get arguments from helper
    args = handle_metadata_arguments(context, request)

    # Generate search
    search_param = {}
    if not args.type_param:
        search_param['type'] = 'File'
    else:
        search_param['type'] = args.type_param
    if args.accessions:
        search_param['accession'] = args.accessions
    if args.sort_param:
        search_param['sort'] = args.sort_param
    search_param['limit'] = [1]  # we don't care about results, just the facets
    search_param['additional_facet'] = ['file_size']
    if args.include_extra_files:
        search_param['additional_facet'].append('extra_files.file_size')
    subreq = make_search_subreq(request, '{}?{}'.format('/search', urlencode(search_param, True)), inherit_user=True)
    result = search(context, subreq)
    return result['facets']


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
    # get arguments from helper
    args = handle_metadata_arguments(context, request)

    # Generate search
    search_param = {}
    if not args.type_param:
        search_param['type'] = 'File'
    else:
        search_param['type'] = args.type_param
    if args.accessions:
        search_param['accession'] = args.accessions
    if args.sort_param:
        search_param['sort'] = args.sort_param
    search_iter = get_iterable_search_results(request, param_lists=search_param)

    # Process search iter
    data_lines = []
    for file in search_iter:
        line = []
        for _, tsv_descriptor in args.tsv_mapping.items():
            field = descend_field(request, file, tsv_descriptor.field_name()) or ''
            line.append(field)
        data_lines += [line]
        if args.include_extra_files and 'extra_files' in file:
            efs = file.get('extra_files')
            for ef in efs:
                ef_line = []
                for _, tsv_descriptor in args.tsv_mapping.items():
                    field = descend_field(request, ef, tsv_descriptor.field_name()) or ''
                    ef_line.append(field)
                data_lines += [ef_line]

    return Response(
        content_type='text/tsv',
        app_iter=generate_tsv(args.header, data_lines),
        content_disposition=f'attachment;filename={args.download_file_name}'
    )
