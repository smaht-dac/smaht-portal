import pytest
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
def output_file(
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
    }
    return post_item_and_return_location(es_testapp, item, "output_file")


class TestMetadataTSV:

    @staticmethod
    def test_metadata_tsv_basic(es_testapp, output_file):
        es_testapp.post_json('/index', {})  # index the file
        res = es_testapp.post_json('/metadata',
                                   {'type': 'OutputFile'})
        import pdb; pdb.set_trace()
