from typing import Any, Dict

import pytest
from webtest.app import TestApp


pytestmark = [pytest.mark.setone, pytest.mark.working]


DRS_PREFIX = f'/ga4gh/drs/v1/objects'


@pytest.fixture
def bam_file_json(
    file_formats: Dict[str, dict], test_consortium: Dict[str, Any]
) -> Dict[str, Any]:
    """ Duplicating fixture since these live in another file that is not shared """
    item = {
        'file_format': file_formats.get('bam').get('uuid'),
        'md5sum': '00000000000000000000000000000000',
        'content_md5sum': '00000000000000000000000000000000',
        'filename': 'my.bam',
        'status': 'current',
        'consortia': [test_consortium['uuid']],
        'data_category': ['Sequencing Reads'],
        'data_type': ['Aligned Reads'],
    }
    return item


@pytest.fixture
def file(
    testapp: TestApp, file_formats: Dict[str, dict], test_consortium: Dict[str, Any]
) -> Dict[str, Any]:
    """ Duplicating fixture since these live in another file that is not shared """
    item = {
        'file_format': file_formats.get('fastq').get('uuid'),
        'md5sum': '00000000000000000000000000000000',
        'content_md5sum': '00000000000000000000000000000000',
        'filename': 'my.fastq.gz',
        'status': 'current',
        'consortia': [test_consortium['uuid']],
        'data_category': ['Sequencing Reads'],
        'data_type': ['Unaligned Reads'],
    }
    res = testapp.post_json('/output_file', item)
    return res.json['@graph'][0]


def validate_drs_conversion(drs_obj, meta, uri=None):
    """ Validates drs object structure against the metadata in the db """
    assert drs_obj['id'] == meta['@id']
    assert drs_obj['created_time'] == meta['date_created']
    assert drs_obj['drs_id'] == meta['accession']
    assert drs_obj['self_uri'] == f'drs://localhost:80{meta["@id"]}@@drs' if not uri else uri
    assert drs_obj['version'] == meta['md5sum']
    assert drs_obj['name'] == meta['filename']
    assert drs_obj['aliases'] == [meta['uuid']]


def test_processed_file_drs_view(testapp, bam_file_json):
    """ Tests that processed mcool gives a valid DRS response """
    meta = testapp.post_json('/output_file', bam_file_json).json['@graph'][0]
    drs_meta = testapp.get(meta['@id'] + '@@drs').json
    validate_drs_conversion(drs_meta, meta)
    drs_meta = testapp.get(f'{DRS_PREFIX}/{meta["uuid"]}').json
    validate_drs_conversion(drs_meta, meta, uri=f'{DRS_PREFIX}/{meta["uuid"]}')


def test_fastq_file_drs_view(testapp, file):
    """ Tests that a fastq file has valid DRS response """
    drs_meta = testapp.get(file['@id'] + '@@drs').json
    validate_drs_conversion(drs_meta, file)
    drs_meta = testapp.get(f'{DRS_PREFIX}/{file["uuid"]}').json
    validate_drs_conversion(drs_meta, file, uri=f'{DRS_PREFIX}/{file["uuid"]}')


def test_fastq_file_drs_access(testapp, file):
    """ Tests that access URLs are retrieved successfully """
    drs_meta = testapp.get(file['@id'] + '@@drs').json
    drs_object_uri = drs_meta['drs_id']
    drs_object_download = testapp.get(f'/ga4gh/drs/v1/objects/{drs_object_uri}/access/').json
    assert drs_object_download == {
        'url': f'https://localhost:80/{drs_object_uri}/@@download'
    }
