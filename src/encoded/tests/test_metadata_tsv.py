import pytest
import csv
import io
from uuid import uuid4
from typing import Dict, Any
from .datafixtures import (
    OUTPUT_FILE_UUID,
    TestApp,
    post_item_and_return_location
)


@pytest.fixture
def test_consortium(es_testapp: TestApp):
    """ Tests the posting of a consortium (in ES mode) """
    item = {
        'identifier': 'SMaHTConsortium',
        'title': 'SMaHT Test Consortium'
    }
    return post_item_and_return_location(es_testapp, item, 'consortium')


@pytest.fixture
def file_formats(es_testapp, test_consortium):
    """ Stripped down file formats for ES unit testing """
    formats = {}
    format_info = {
      'fastq': {'standard_file_extension': 'fastq.gz',
                'other_allowed_extensions': ['fq.gz']}
    }
    for ff, info in format_info.items():
        info['identifier'] = ff
        info['uuid'] = str(uuid4())
        info['consortia'] = [test_consortium['@id']]
        formats[ff] = es_testapp.post_json('/file_format', info, status=201).json['@graph'][0]
    return formats


@pytest.fixture
def output_file_with_extra_file(
    es_testapp: TestApp,
    test_consortium: Dict[str, Any],
    file_formats: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    """ Same fixture as in datafixtures but in ES mode """
    item = {
        "uuid": OUTPUT_FILE_UUID,
        "file_format": file_formats.get("fastq", {}).get("uuid", ""),
        "md5sum": "00000000000000000000000000000001",
        "filename": "my.fastq.gz",
        "status": "uploaded",
        "data_category": ["Sequencing Reads"],
        "data_type": ["Unaligned Reads"],
        "consortia": [test_consortium["uuid"]],
        "extra_files": [
            {
                "filename": "special_extra_file.fastq.gz",
                "file_format": file_formats.get("fastq", {}).get("uuid", ""),
                "href": f"/output-files/{OUTPUT_FILE_UUID}@@download/special_extra_file.fastq.gz",
                "md5sum": "00000000000000000000000000000002",
                "file_size": 100,
                "status": "uploaded"
            }

        ]
    }
    return post_item_and_return_location(es_testapp, item, "output_file")


class TestMetadataTSV:

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

    def check_key_and_length(self, part, expected_key):
        assert expected_key in part
        assert len(part) == self.TSV_WIDTH

    def test_metadata_tsv_with_extra_file(self, es_testapp, output_file_with_extra_file):
        """ Tests we can process both a regular and an extra file """
        es_testapp.post_json('/index', {})  # index the file
        res = es_testapp.post_json('/metadata',
                                   {'type': 'OutputFile'})
        tsv = res._app_iter[0]
        assert b'Metadata TSV Download' in tsv
        assert b'/output-files/f99fe12f-79f9-4c2c-b0b5-07fc20d7ce1d/@@download' in tsv
        # parse and ensure structurally sound
        parsed = self.read_tsv_from_bytestream(tsv)
        header1, header2, header3 = parsed[0], parsed[1], parsed[2]
        self.check_key_and_length(header1, 'Metadata TSV Download')
        self.check_key_and_length(header2, 'Suggested command to download: ')
        self.check_key_and_length(header3, 'File Download URL')
        file_meta = parsed[3]
        self.check_key_and_length(file_meta, '00000000000000000000000000000001')
        file2_meta = parsed[4]
        self.check_key_and_length(file2_meta, '00000000000000000000000000000002')

    # TODO: enable, expand this test in particular
    # def test_metadata_tsv_workbook(self, es_testapp, workbook):
    #     """ Tests we can process regular files in multiples in the workbook """
    #     es_testapp.post_json('/index', {})  # index the file
    #     res = es_testapp.post_json('/metadata',
    #                                {'type': 'File'})
    #     tsv = res._app_iter[0]
    #     import pdb; pdb.set_trace()
    #     assert b'Metadata TSV Download' in tsv
    #     assert b'/output-files/f99fe12f-79f9-4c2c-b0b5-07fc20d7ce1d/@@download' in tsv
    #     # parse and ensure structurally sound
    #     parsed = self.read_tsv_from_bytestream(tsv)
    #     header1, header2, header3 = parsed[0], parsed[1], parsed[2]
    #     self.check_key_and_length(header1, 'Metadata TSV Download')
    #     self.check_key_and_length(header2, 'Suggested command to download: ')
    #     self.check_key_and_length(header3, 'File Download URL')
