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
    config.add_route('metadata', '/metadata/')
    config.scan(__name__)


# For now, use enum code 0 for Files
FILE = 0


class TSVDescriptor:
    """ Dataclass that holds the structure """
    def __init__(self, *, field_type, field_name, deduplicate=True):
        self.field_type = field_type
        self.field_name = field_name
        self.deduplicate = deduplicate

    def field_type(self):
        return self.field_type

    def field_name(self):
        return self.field_name

    def deduplicate(self):
        return self.deduplicate


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
def metadata_tsv(request):
    """
    In Fourfront, there is custom structure looking for what is referred to as 'accession_triples', which is essentially
    a 3-tuple containing lists of accesions that are either experiment sets, experiments or files

    In SMaHT, in order to preserve similar structure, we eliminate logic for the first two (ExpSet and Exp) presuming
    we will want to use those slots later, and provide only the files slot for now.

    Alternatively, can accept a GET request wherein all files from ExpSets matching search query params are included.
    """

    header = []

    file_cache = {}  # Exclude URLs of prev-encountered file(s).
    summary = {
        'counts': {
            'Files Selected for Download': len(accession_triples) if accession_triples else None,
            'Total Files': 0,
            'Total Unique Files to Download': 0
        },
        'lists': {
            'Not Available': [],
            'Duplicate Files': [],
            'Extra Files': [],
            'Reference Files': []
        }
    }

    if filename_to_suggest is None:
        filename_to_suggest = 'metadata_' + datetime.utcnow().strftime('%Y-%m-%d-%Hh-%Mm') + '.tsv'

    def get_values_for_field(item, field, remove_duplicates=True):
        c_value = []

        if remove_duplicates:
            for value in simple_path_ids(item, field):
                if str(value) not in c_value:
                    c_value.append(str(value))
            return list(set(c_value))
        else:
            for value in simple_path_ids(item, field):
                c_value.append(str(value))
            return c_value

    def get_value_for_column(item, col):
        temp = []
        for c in TSV_MAPPING[col][1]:
            c_value = get_values_for_field(item, c, TSV_MAPPING[col][2])
            if len(temp):
                if len(c_value):
                    temp = [x + ' ' + c_value[0] for x in temp]
            else:
                temp = c_value

        if TSV_MAPPING[col][2]:
            return ', '.join(list(set(temp)))
        else:
            return ', '.join(temp)

    def format_file(f, exp, exp_row_vals, exp_set, exp_set_row_vals):
        '''
        :returns List of dictionaries which represent File item rows, with column headers as keys.
        '''
        files_returned = []  # Function output
        f['href'] = request.host_url + f.get('href', '')
        f_row_vals = {}
        file_cols = [col for col in header if TSV_MAPPING[col][0] == FILE]
        for column in file_cols:
            f_row_vals[column] = get_value_for_column(f, column)

        all_row_vals = dict(exp_set_row_vals,
                            **dict(exp_row_vals, **f_row_vals))  # Combine data from ExpSet, Exp, and File

        # Some extra fields to decide whether to include exp's reference files or not
        #
        # IMPORTANT: since we add the Supplementary Files download option in Exp Set, users can download reference files directly.
        # So directly downloaded reference files should not be considered as 'reference file for' of an experiment)
        if not any(triple[2] == f.get('accession', '') for triple in accession_triples) and 'reference_file_for' in f:
            all_row_vals['Related File Relationship'] = 'reference file for'
            all_row_vals['Related File'] = 'Experiment - ' + f.get('reference_file_for', '')
        if not all_row_vals.get('File Classification'):
            all_row_vals['File Classification'] = f.get('file_classification', '')

        # If we do not have any publication info carried over from ExpSet, list out lab.correspondence instead
        if not all_row_vals.get('Publication'):
            lab_correspondence = exp_set.get('lab', {}).get('correspondence', [])
            if len(lab_correspondence) > 0:
                contact_emails = []
                for contact in lab_correspondence:
                    decoded_email = b64decode(contact['contact_email'].encode('utf-8')).decode('utf-8') if contact.get(
                        'contact_email') else None
                    if decoded_email:
                        contact_emails.append(decoded_email)
                all_row_vals['Publication'] = "Correspondence: " + ", ".join(contact_emails)

        # Add file to our return list which is to be bubbled upwards to iterable.
        files_returned.append(all_row_vals)

        # Add attached secondary files, if any; copies most values over from primary file & overrides distinct File Download URL, md5sum, etc.
        if f.get('extra_files') and len(f['extra_files']) > 0:
            for xfile in f['extra_files']:
                if xfile.get('use_for') == 'visualization':
                    continue
                xfile_vals = all_row_vals.copy()
                xfile_vals['File Download URL'] = request.host_url + xfile['href'] if xfile.get('href') else None
                xfile_vals['File Format'] = xfile.get('file_format', {}).get('display_title')
                xfile_vals['md5sum'] = xfile.get('md5sum')
                xfile_vals['Size (MB)'] = xfile.get('file_size')
                xfile_vals['Related File Relationship'] = 'secondary file for'
                xfile_vals['Related File'] = all_row_vals.get('File Accession')
                files_returned.append(xfile_vals)

        return files_returned

    def post_process_file_row_dict(file_row_dict_tuple):
        idx, file_row_dict = file_row_dict_tuple

        if file_row_dict['Related File Relationship'] == 'secondary file for':
            summary['lists']['Extra Files'].append(
                ('Secondary file for ' + file_row_dict.get('Related File', 'unknown file.'), file_row_dict))
        elif file_row_dict['Related File Relationship'] == 'reference file for':
            summary['lists']['Reference Files'].append(
                ('Reference file for ' + file_row_dict.get('Related File', 'unknown exp.'), file_row_dict))

        if not file_row_dict['File Type']:
            file_row_dict['File Type'] = 'other'

        if file_row_dict['File Download URL'] is None:
            file_row_dict['File Download URL'] = '### No URL currently available'
            summary['counts']['Total Files'] += 1
            summary['lists']['Not Available'].append(('No URL available', file_row_dict))
            return file_row_dict

        if file_cache.get(file_row_dict['File Download URL']) is not None:
            row_num_duplicated = file_cache[file_row_dict['File Download URL']] + 3
            file_row_dict['File Download URL'] = '### Duplicate of row ' + str(row_num_duplicated) + ': ' + \
                                                 file_row_dict['File Download URL']
            summary['counts']['Total Files'] += 1
            summary['lists']['Duplicate Files'].append(('Duplicate of row ' + str(row_num_duplicated), file_row_dict))
            return file_row_dict

        # remove repeating/redundant lab info in Contributing Lab
        if (file_row_dict['Contributing Lab'] is not None and file_row_dict['Contributing Lab'] != '' and
                (file_row_dict['Contributing Lab'] == file_row_dict['Experimental Lab'] or
                 file_row_dict['Contributing Lab'] == file_row_dict['Generating Lab'])):
            file_row_dict['Contributing Lab'] = ''

        file_cache[file_row_dict['File Download URL']] = idx
        if ('Size (MB)' in file_row_dict and file_row_dict['Size (MB)'] != None and file_row_dict['Size (MB)'] != ''):
            file_row_dict['Size (MB)'] = format(
                float(file_row_dict['Size (MB)']) / (1024 * 1024), '.2f')
        if file_row_dict['File Status'] in ['uploading', 'to be uploaded', 'upload failed']:
            file_row_dict['File Download URL'] = '### Not Yet Uploaded: ' + file_row_dict['File Download URL']
            summary['counts']['Total Files'] += 1
            summary['lists']['Not Available'].append(('Not yet uploaded', file_row_dict))
            return file_row_dict

        if file_row_dict['File Status'] == 'restricted':
            file_row_dict['File Download URL'] = '### Restricted: ' + file_row_dict['File Download URL']
            summary['counts']['Total Files'] += 1
            summary['lists']['Not Available'].append(('Restricted', file_row_dict))
            return file_row_dict

        summary['counts']['Total Unique Files to Download'] += 1
        summary['counts']['Total Files'] += 1

        return file_row_dict

    def format_filter_resulting_file_row_dicts(file_row_dict_iterable):
        return map(
            post_process_file_row_dict,
            enumerate(filter(lambda x: True, file_row_dict_iterable))
        )

    def generate_summary_lines():
        ret_rows = [
            ['###',   '',         ''],
            ['###',   'Summary',  ''],
            ['###',   '',         ''],
            ['###',   'Files Selected for Download:', '', '',            str(summary['counts']['Files Selected for Download'] or 'All'), ''],
            ['###',   'Total File Rows:', '', '',            str(summary['counts']['Total Files']), ''],
            ['###',   'Unique Downloadable Files:', '', '', str(summary['counts']['Total Unique Files to Download']), '']
        ]

        def gen_mini_table(file_tuples):
            for idx, file_tuple in enumerate(file_tuples[0:5]):
                ret_rows.append(['###', '    - Details:' if idx == 0 else '', file_tuple[1]['File Accession'] + '.' + file_tuple[1]['File Format'], file_tuple[0] ])
            if len(file_tuples) > 5:
                ret_rows.append(['###', '', 'and ' + str(len(file_tuples) - 5) + ' more...', ''])

        if len(summary['lists']['Extra Files']) > 0:
            ret_rows.append(['###', '- Added {} extra file{} which {} attached to a primary selected file (e.g. pairs_px2 index file with a pairs file):'.format(str(len(summary['lists']['Extra Files'])), 's' if len(summary['lists']['Extra Files']) > 1 else '', 'are' if len(summary['lists']['Extra Files']) > 1 else 'is'), '', '', '', ''])
            gen_mini_table(summary['lists']['Extra Files'])
        if len(summary['lists']['Reference Files']) > 0:
            ret_rows.append(['###', '- Added {} reference file{} which {} attached to an experiment:'.format(str(len(summary['lists']['Reference Files'])), 's' if len(summary['lists']['Reference Files']) > 1 else '', 'are' if len(summary['lists']['Reference Files']) > 1 else 'is'), '', '', '', ''])
            gen_mini_table(summary['lists']['Reference Files'])
        if len(summary['lists']['Duplicate Files']) > 0:
            ret_rows.append(['###', '- Commented out {} duplicate file{} (e.g. a raw file shared by two experiments):'.format(str(len(summary['lists']['Duplicate Files'])), 's' if len(summary['lists']['Duplicate Files']) > 1 else ''), '', '', '', ''])
            gen_mini_table(summary['lists']['Duplicate Files'])
        if len(summary['lists']['Not Available']) > 0:
            ret_rows.append(['###', '- Commented out {} file{} which are currently not available (i.e. file restricted, or not yet finished uploading):'.format(str(len(summary['lists']['Not Available'])), 's' if len(summary['lists']['Not Available']) > 1 else ''), '', '', '', ''])
            gen_mini_table(summary['lists']['Not Available'])

        # add unauthenticated download is not permitted warning
        ret_rows.append(['###', '', '', '', '', '', ''])
        ret_rows.append(['###', 'IMPORTANT: As of October 15, 2020, you must include an access key in your cURL command for bulk downloads. You can configure the access key in your profile. If you do not already have an account, you can log in with your Google or GitHub credentials.', '', '', '', ''])

        return ret_rows

    def stream_tsv_output(file_row_dictionaries):
        '''
        Generator which converts file-metatada dictionaries into a TSV stream.
        :param file_row_dictionaries: Iterable of dictionaries, each containing TSV_MAPPING keys and values from a file in ExperimentSet.
        '''
        line = DummyFileInterfaceImplementation()
        writer = csv.writer(line, delimiter='\t')

        # Initial 2 lines: Intro, Headers
        writer.writerow([
            '###', 'N.B.: File summary located at bottom of TSV file.', '', '', '', '',
            'Suggested command to download: ', '', '', 'cut -f 1 ./{} | tail -n +3 | grep -v ^# | xargs -n 1 curl -O -L --user <access_key_id>:<access_key_secret>'.format(filename_to_suggest)
        ])
        yield line.read().encode('utf-8')
        writer.writerow([column.strip() for column in header])
        yield line.read().encode('utf-8')

        for file_row_dict in file_row_dictionaries:
            writer.writerow([ file_row_dict.get(column) or 'N/A' for column in header ])
            yield line.read().encode('utf-8')

        for summary_line in generate_summary_lines():
            writer.writerow(summary_line)
            yield line.read().encode('utf-8')

    # not clear why this is necessary - Will Dec 4 2023
    # if not endpoints_initialized['metadata']: # For some reason first result after bootup returns empty, so we do once extra for first request.
    #     initial_path = '{}?{}'.format(search_path, urlencode(dict(search_params, limit=10), True))
    #     endpoints_initialized['metadata'] = True
    #     request.invoke_subrequest(make_search_subreq(request, initial_path), False)

    # Prep - use dif functions if different type requested.
    if search_params['type'][0:4] == 'File' and search_params['type'][4:7] != 'Set':
        iterable_pipeline = format_filter_resulting_file_row_dicts(
            chain.from_iterable(
                map(
                    lambda f: format_file(f, {}, {}, {}, {}),
                    get_iterable_search_results(request, search_path, search_params)
                )
            )
        )
    else:
        raise HTTPBadRequest("Metadata can only be retrieved currently for Experiment Sets or Files. Received \"" + search_params['type'] + "\"")

    return Response(
        content_type='text/tsv',
        app_iter = stream_tsv_output(iterable_pipeline),
        content_disposition='attachment;filename="%s"' % filename_to_suggest
    )
