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


# This field is special because it is a transformation applied from other fields
FILE_MERGE_GROUP = 'File Merge Group'


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
    def __init__(self, *, field_type: int, field_name: List[str],
                 deduplicate: bool = True, use_base_metadata: bool = False):
        """ field_type is str, int or float, field_name is a list of possible
            paths when searched can retrieve the field value, deduplicate is unused,
            use_base_metadata means to rely on top level object instead of sub object
            (only used for extra files)
        """
        self._field_type = field_type
        self._field_name = field_name
        self._deduplicate = deduplicate
        self._use_base_metadata = use_base_metadata

    def field_type(self) -> int:
        """ Note this is an int enum """
        return self._field_type

    def field_name(self) -> List[str]:
        """ Field name in this case is a list of possible paths to search """
        return self._field_name

    def deduplicate(self) -> bool:
        return self._deduplicate

    def use_base_metadata(self) -> bool:
        return self._use_base_metadata


class DummyFileInterfaceImplementation(object):
    """ This is used to simulate a file interface for streaming the TSV output """
    def __init__(self):
        self._line = None
    def write(self, line):
        self._line = line
    def read(self):
        return self._line


# This dictionary is a key --> 3-tuple mapping that encodes options for the /metadata/ endpoint
# given a field description. This also describes the order that fields show up in the TSV.
# VERY IMPORTANT NOTE WHEN ADDING FIELDS - right now support for arrays generally is limited.
# The limitations are: array of terminal values are fine, but arrays of dictionaries will only
# traverse one additional level of depth ie:
# item contains dictionary d1, where d1 has property that is array of object
#   --> d1.arr --> d1.array.dict --> d1.array.dict.value
# TODO: move to another file or write in JSON
TSV_MAPPING = {
    FILE: {
        'File Download URL': TSVDescriptor(field_type=FILE,
                                           field_name=['href']),
        'File Accession': TSVDescriptor(field_type=FILE,
                                        field_name=['accession']),
        'File Name': TSVDescriptor(field_type=FILE,
                                   field_name=['annotated_filename', 'display_title', 'filename']),
        'Size (B)': TSVDescriptor(field_type=FILE,
                                   field_name=['file_size']),
        'md5sum': TSVDescriptor(field_type=FILE,
                                field_name=['md5sum']),
        'Data Category': TSVDescriptor(field_type=FILE,
                                       field_name=['data_type'],
                                       use_base_metadata=True),  # do not traverse extra_files for this
        'File Format': TSVDescriptor(field_type=FILE,
                                     field_name=['file_format.display_title']),
        'Sample Name': TSVDescriptor(field_type=FILE,
                                     field_name=['sample_summary.sample_names'],
                                     use_base_metadata=True),  # do not traverse extra_files for this
        'Sample Studies': TSVDescriptor(field_type=FILE,
                                        field_name=['sample_summary.studies'],
                                        use_base_metadata=True),  # do not traverse extra_files for this
        'Sample Tissues': TSVDescriptor(field_type=FILE,
                                        field_name=['sample_summary.tissues'],
                                        use_base_metadata=True),  # do not traverse extra_files for this
        'Sample Donors': TSVDescriptor(field_type=FILE,
                                       field_name=['sample_summary.donor_ids'],
                                       use_base_metadata=True),  # do not traverse extra_files for this
        'Sample Source': TSVDescriptor(field_type=FILE,
                                       field_name=['sample_summary.sample_descriptions'],
                                       use_base_metadata=True),  # do not traverse extra_files for this
        'Analytes': TSVDescriptor(field_type=FILE,
                                  field_name=['sample_summary.analytes'],
                                  use_base_metadata=True),
        'Sequencer': TSVDescriptor(field_type=FILE,
                                   field_name=['sequencing.sequencer.display_title'],
                                   use_base_metadata=True),
        'Assay': TSVDescriptor(field_type=FILE,
                               field_name=['assays.display_title'],
                               use_base_metadata=True),
        'Software Name/Version': TSVDescriptor(field_type=FILE,
                                               field_name=['analysis_summary.software'],
                                               use_base_metadata=True),
        'Reference Genome': TSVDescriptor(field_type=FILE,
                                          field_name=['analysis_summary.reference_genome'],
                                          use_base_metadata=True),
        FILE_MERGE_GROUP: TSVDescriptor(field_type=FILE,
                                        field_name=['file_sets.file_merge_group'],
                                        use_base_metadata=True)   # do not traverse extra_files for this
    }
}


def generate_file_download_header(download_file_name: str):
    """ Helper function that generates a suitable header for the File download, generating 18 columns"""
    header1 = ['###', 'Metadata TSV Download', ] + ([''] * 16)  # length 18
    header2 = ['Suggested command to download: ', '', '',
               "cut -f 1,3 ./{} | tail -n +4 | grep -v ^# | xargs -n 2 -L 1 sh -c 'curl -L "
               "--user <access_key_id>:<access_key_secret> $0 --output $1'".format(download_file_name)] + ([''] * 14)
    header3 = list(TSV_MAPPING[FILE].keys())
    return header1, header2, header3


def extract_array(array: list, i: int, fields: list) -> str:
    """ Extracts field_name values from array of dicts, or the value itself if a terminal field """
    if isinstance(array[0], dict):
        if isinstance(array[0][fields[i]], dict):  # go one level deeper
            field1, field2 = fields[i], fields[i+1]
            return '|'.join([ele[field1][field2] for ele in array])
        else:
            return '|'.join(ele[fields[i]] for ele in array)
    else:
        return '|'.join(array)


def descend_field(request, prop, field_names):
    """ Helper to grab field values if we reach a terminal field ie: not dict or list """
    for possible_field in field_names:
        current_prop = prop  # store a reference to the original object
        fields = possible_field.split('.')
        for i, field in enumerate(fields):
            current_prop = current_prop.get(field)
            if isinstance(current_prop, list) and possible_field != 'file_sets.file_merge_group':
                return extract_array(current_prop, i+1, fields)
            elif current_prop and possible_field == 'file_sets.file_merge_group':
                return current_prop[0].get('file_merge_group')
            elif not current_prop:
                break
        # this hard code is necessary because in this select case we are processing an object field,
        # and we want all other object fields to be ignored - Will 1 May 2024
        if isinstance(current_prop, dict) and possible_field == 'file_sets.file_merge_group':
            return current_prop
        elif current_prop is None or isinstance(current_prop, dict):
            continue
        elif possible_field == 'href':
            return f'{request.scheme}://{request.host}{current_prop}'
        else:
            return current_prop
    return None


def handle_file_merge_group(field: dict) -> str:
    """ Transforms the file_merge_group into a single string """
    if field:
        sc_part = field['submission_center']
        sample_source_part = field['sample_source']
        sequencing_part = field['sequencing']
        assay_part = field['assay']
        return f'{sc_part}-{sample_source_part}-{sequencing_part}-{assay_part}'
    return ''


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
        for field_name, tsv_descriptor in args.tsv_mapping.items():
            traversal_path = tsv_descriptor.field_name()
            if field_name == FILE_MERGE_GROUP:
                field = descend_field(request, file, traversal_path) or ''
                if field:  # requires special care
                    field = handle_file_merge_group(field)
            else:
                field = descend_field(request, file, traversal_path) or ''
            line.append(field)
        data_lines += [line]

        # Repeat the above process for extra files
        # This requires extra care - most fields we take from extra_files directly,
        # but some must be taken from the parent metadata, such as anything related to library/assay/sample
        # or the file merge group
        if args.include_extra_files and 'extra_files' in file:
            efs = file.get('extra_files')
            for ef in efs:
                ef_line = []
                for field_name, tsv_descriptor in args.tsv_mapping.items():
                    traversal_path = tsv_descriptor.field_name()
                    if tsv_descriptor.use_base_metadata():
                        field = descend_field(request, file, traversal_path) or ''
                        if field_name == FILE_MERGE_GROUP:  # requires special care
                            field = handle_file_merge_group(field)
                    else:
                        field = descend_field(request, ef, traversal_path) or ''
                    ef_line.append(field)
                data_lines += [ef_line]

    return Response(
        content_type='text/tsv',
        app_iter=generate_tsv(args.header, data_lines),
        content_disposition=f'attachment;filename={args.download_file_name}'
    )
