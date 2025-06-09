import pytest
import io
import csv
from ..metadata import descend_field


class TestMetadataTSVHelper:

    TSV_WIDTH = 26

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
    def check_type_length(cls, es_testapp, item_type, expected_count):
        res = es_testapp.post_json('/metadata/', {'type': item_type})
        tsv = res._app_iter[0]
        parsed = cls.read_tsv_from_bytestream(tsv)
        assert len(parsed[3:]) == expected_count


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
        }, ['simple.simple2'], {'dict': 1}),  # this behavior, while generally undesirable, is easily spotted
        ({
             'simple': {
                 'simple2': ['array']
             }
         }, ['simple.simple2'], 'array'),
        ({
             'simple': {
                 'simple2': ['array1', 'array2']
             }
         }, ['simple.simple2'], 'array1,array2'),
        ({
             'simple': {
                 'simple2': [{'key': 'val1'}]
             }
         }, ['simple.simple2.key'], 'val1'),
        ({
             'simple': {
                 'simple2': [{'key': 'val1'}, {'key': 'val2'}]
             }
         }, ['simple.simple2.key'], 'val1,val2'),
        ({
             'simple': {
                 'simple2': {
                     'simple3': [{'key': 'val1'}, {'key': 'val2'}]
                 }
             }
         }, ['simple.simple2.simple3.key'], 'val1,val2'),
    ])
    def test_descend_field(field_dict, list_of_names, expected):
        """ Helper that tests that we can retrieve fields in various expected scenarios """
        assert descend_field(DummyRequest, field_dict, list_of_names) == expected

    @pytest.mark.workbook
    def test_metadata_tsv_workbook2(self, workbook, es_testapp):
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
        for row in parsed:  # check all rows got populated
            assert len(row) == TestMetadataTSVHelper.TSV_WIDTH
        TestMetadataTSVHelper.check_key_and_length(header1, 'Metadata TSV Download')
        TestMetadataTSVHelper.check_key_and_length(header2, 'Suggested command to download: ')
        TestMetadataTSVHelper.check_key_and_length(header3, 'FileDownloadURL')
        assert len(parsed[3:]) == 23  # there are 23 entries in the workbook right now, including extra files
        # test for various types
        TestMetadataTSVHelper.check_type_length(es_testapp, 'AlignedReads', 3)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'UnalignedReads', 6)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'VariantCalls', 2)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'ReferenceFile', 2)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'OutputFile', 2)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'SupplementaryFile', 2)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'HistologyImage', 1)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'ResourceFile', 1)

        res = es_testapp.post_json('/metadata/', {'type': 'OutputFile', 'include_extra_files': True})
        tsv = res._app_iter[0]
        parsed = TestMetadataTSVHelper.read_tsv_from_bytestream(tsv)
        last_extra_file_name = parsed[-1][6]  # filename in 7th position in tsv
        assert last_extra_file_name == 'a_second_bam_bai.bai'
        # check an entire row that is mostly representative
        for row in parsed:
            if '303985cf-f1db-4dea-9782-2e68092d603d' in row[0]:  # this is the row
                assert row[6] == 'SMHT-FOO-BAR-M45-B003-DAC_SMAURF3ETDQJ_bwamem0.1.2_GRCh38.aligned.sorted.bam'
                assert row[9] == '1000'  # size
                assert row[11] == 'Aligned Reads'  # category
                assert row[12] == 'BAM'  # format
                assert row[13] == 'SMHT-0001'  # sample
                assert row[14] == 'Production'  # data set
                assert row[15] == 'Liver'  # tissue type
                assert row[16] == 'SMHT001'  # sample
                assert row[17] == 'Core'
                assert row[18] == 'DNA'
                assert row[19] == 'Illumina NovaSeq X'  # sequencing
                assert row[20] == 'Bulk WGS'  # assay
                assert row[21] == 'VEP (3.1.1)'  # software
                assert row[22] == 'GRCh38'  # reference genome
                assert row[25] == 'smaht-TEST_TISSUE_LIVER-illumina_novaseqx-Paired-end-150-R9-bulk_wgs'  # merge grp
                break

        # check download links are now download_cli
        res = es_testapp.post_json(
            "/metadata/", {"type": "File", "include_extra_files": True, "cli": True}
        )
        tsv = res._app_iter[0]
        assert b"Metadata TSV Download" in tsv
        assert (
            b"/output-files/cca15caa-bc11-4a6a-8998-ea0c69df8b9d/@@download_cli" in tsv
        )
        assert not (  # check that all URLs are @@download_cli
            b"/@@download/" in tsv
        )
        parsed = TestMetadataTSVHelper.read_tsv_from_bytestream(tsv)
        header_command_part = 'jq -r ".download_credentials | {AccessKeyId'
        assert header_command_part in parsed[1][3]  # this is where suggested command is

        # Manifest expansions
        # These rely on the same mechanisms as the file manifest, but
        # should probably still be tested more carefully...
        es_testapp.post_json('/metadata/', {
            'type': 'File',
            'include_extra_files': False,
            'manifest_enum': 2
        })
        es_testapp.post_json('/metadata/', {
            'type': 'File',
            'include_extra_files': False,
            'manifest_enum': 4
        })
        es_testapp.post_json('/metadata/', {
            'type': 'File',
            'include_extra_files': False,
            'manifest_enum': 5
        })

    @pytest.mark.workbook
    def test_peak_metadata_workbook(self, workbook, es_testapp):
        """ Tests we can peak at metadata for files and get facet information (just file size for now) """
        es_testapp.post_json('/index', {})  # index the files
        # check all types
        res = es_testapp.post_json('/peek-metadata/',
                                   {'type': 'File', 'include_extra_files': False}).json
        for facet in res:
            if facet['field'] == 'file_size':
                assert facet['count'] == 11
                assert facet['min'] == 1000.0
                assert facet['max'] == 100000.0
                assert facet['sum'] == 286000.0
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