import pytest
import io
import csv


class TestMetadataTSVHelper:

    TSV_WIDTH = 6

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
        res = es_testapp.post_json('/metadata',
                                   {'type': t})
        tsv = res._app_iter[0]
        parsed = cls.read_tsv_from_bytestream(tsv)
        assert len(parsed[3:]) == expected_count  # there is 1 file of this type


class TestMetadataTSVWorkbook:

    @pytest.mark.workbook
    def test_metadata_tsv_workbook(self, workbook, es_testapp):
        """ Tests we can process regular files in multiples in the workbook """
        es_testapp.post_json('/index', {})  # index the files
        res = es_testapp.post_json('/metadata',
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
        assert len(parsed[3:]) == 7  # there are 7 entries in the workbook right now
        # test for various types
        TestMetadataTSVHelper.check_type_length(es_testapp, 'AlignedReads', 1)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'UnalignedReads', 1)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'VariantCalls', 1)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'ReferenceFile', 1)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'UnalignedReads', 1)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'OutputFile', 1)
