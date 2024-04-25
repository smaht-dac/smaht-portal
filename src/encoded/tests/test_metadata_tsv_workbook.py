import pytest
import io
import csv
from ..metadata import descend_field


class TestMetadataTSVHelper:

    TSV_WIDTH = 9

    @staticmethod
    def read_tsv_from_bytestream(bytestream):
        data = []
        bytestream = io.BytesIO(bytestream)
        with io.TextIOWrapper(bytestream, encoding='utf-8', newline='') as f:
            reader = csv.reader(f, delimiter='\t')
            for row in reader:
                data.append(row)
        return data

    @classmethod
    def check_key_and_length(cls, part, expected_key):
        assert expected_key in part
        assert len(part) == cls.TSV_WIDTH

    @classmethod
    def check_type_length(cls, es_testapp, t, expected_count):
        res = es_testapp.post_json('/metadata/',
                                   {'type': t})
        tsv = res._app_iter[0]
        parsed = cls.read_tsv_from_bytestream(tsv)
        assert len(parsed[3:]) == expected_count  # there is 1 file of this type


class DummyRequest:
    scheme = 'http'
    host = 'localhost'


class TestMetadataTSVWorkbook:

    @staticmethod
    @pytest.mark.parametrize('field_dict,list_of_names,expected', [
        ({
            'simple': 1
        }, ['simple'], 1),
        ({
             'href': '/download',
         }, ['href'], 'http://localhost/download'),
        ({
             'simple': 1
         }, ['not_simple', 'simple'], 1),
        ({
             'simple': 1
         }, ['not_simple'], None),
        ({
             'simple': {
                 'simple2': 1
             }
         }, ['simple.simple2'], 1),
        ({
             'simple': {
                 'simple2': 1
             }
         }, ['simple.simple3', 'simple.simple2'], 1),
        ({
            'simple': {
                'simple2': {
                    'dict': 1
                }
            }
        }, ['simple.simple2'], None),
        ({
             'simple': {
                 'simple2': ['array']
             }
         }, ['simple.simple2'], 'array')
    ])
    def test_descend_field(field_dict, list_of_names, expected):
        """ Helper that tests that we can retrieve fields in various expected scenarios """
        assert descend_field(DummyRequest, field_dict, list_of_names) == expected

    @pytest.mark.workbook
    def test_metadata_tsv_workbook(self, workbook, es_testapp):
        """ Tests we can process regular files in multiples in the workbook """
        es_testapp.post_json('/index', {})  # index the files
        res = es_testapp.post_json('/metadata/',
                                   {'type': 'File', 'include_extra_files': True})
        tsv = res._app_iter[0]
        assert b'Metadata TSV Download' in tsv
        assert b'/output-files/cca15caa-bc11-4a6a-8998-ea0c69df8b9d/@@download' in tsv
        # parse and ensure structurally sound
        parsed = TestMetadataTSVHelper.read_tsv_from_bytestream(tsv)
        header1, header2, header3 = parsed[0], parsed[1], parsed[2]
        TestMetadataTSVHelper.check_key_and_length(header1, 'Metadata TSV Download')
        TestMetadataTSVHelper.check_key_and_length(header2, 'Suggested command to download: ')
        TestMetadataTSVHelper.check_key_and_length(header3, 'File Download URL')
        assert len(parsed[3:]) == 12  # there are 12 entries in the workbook right now, including extra files
        # test for various types
        TestMetadataTSVHelper.check_type_length(es_testapp, 'AlignedReads', 1)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'UnalignedReads', 3)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'VariantCalls', 1)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'ReferenceFile', 1)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'OutputFile', 2)
        res = es_testapp.post_json('/metadata/', {'type': 'OutputFile', 'include_extra_files': True})
        tsv = res._app_iter[0]
        parsed = TestMetadataTSVHelper.read_tsv_from_bytestream(tsv)
        last_extra_file_name = parsed[-1][2]  # filename in 3rd position in tsv
        assert last_extra_file_name == 'a_second_bam_bai.bai'

    @pytest.mark.workbook
    def test_peak_metadata_workbook(self, workbook, es_testapp):
        """ Tests we can peak at metadata for files and get facet information (just file size for now) """
        es_testapp.post_json('/index', {})  # index the files
        # check all types
        res = es_testapp.post_json('/peek-metadata/',
                                   {'type': 'File', 'include_extra_files': False}).json
        for facet in res:
            if facet['field'] == 'file_size':
                assert facet['count'] == 8
                assert facet['min'] == 1000.0
                assert facet['max'] == 100000.0
                assert facet['sum'] == 184000.0
            if facet['field'] == 'extra_files.file_size':
                raise AssertionError('Extra files information present when not desired')
        # check an individual type (with extra files)
        res = es_testapp.post_json('/peek-metadata/',
                                   {'type': 'OutputFile', 'include_extra_files': True}).json
        for facet in res:
            if facet['field'] == 'extra_files.file_size':
                assert facet['count'] == 3  # 2 + 1 extra files
                assert facet['min'] == 3000.0
                assert facet['max'] == 6000.0
                assert facet['sum'] == 14000.0
            if facet['field'] == 'file_size':
                assert facet['count'] == 2
                assert facet['min'] == 5000.0
                assert facet['max'] == 10000.0
                assert facet['sum'] == 15000.0
