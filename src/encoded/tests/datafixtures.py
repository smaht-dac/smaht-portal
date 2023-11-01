from typing import Any, Dict
from uuid import uuid4

from webtest import TestApp
import pytest

from .utils import post_item_and_return_location


@pytest.fixture
def file_formats(testapp, test_consortium):
    """ Consortia attribute file formats taken from fourfront, could be pared down eventually """
    formats = {}
    ef_format_info = {
        'pairs_px2': {'standard_file_extension': 'pairs.gz.px2'},
        'pairsam_px2': {'standard_file_extension': 'sam.pairs.gz.px2'},
        'bai': {'standard_file_extension': 'bam.bai'},
        'beddb': {"standard_file_extension": "beddb"},
    }
    format_info = {
        'fastq': {'standard_file_extension': 'fastq.gz',
                  'other_allowed_extensions': ['fq.gz']},
        'pairs': {'standard_file_extension': 'pairs.gz',
                  "extra_file_formats": ['pairs_px2', 'pairsam_px2']},
        'bam': {'standard_file_extension': 'bam',
                'extra_file_formats': ['bai']},
        'mcool': {'standard_file_extension': 'mcool'},
        'zip': {'standard_file_extension': 'zip'},
        'chromsizes': {'standard_file_extension': 'chrom.sizes'},
        'other': {'standard_file_extension': ''},
        'bw': {'standard_file_extension': 'bw'},
        'bg': {'standard_file_extension': 'bedGraph.gz'},
        'bigbed': {'standard_file_extension': 'bb'},
        'bed': {"standard_file_extension": "bed.gz",
                "extra_file_formats": ['beddb']},
    }

    for eff, info in ef_format_info.items():
        info['identifier'] = eff
        info['uuid'] = str(uuid4())
        info['consortia'] = [test_consortium['@id']]
        formats[eff] = testapp.post_json('/file_format', info, status=201).json['@graph'][0]
    for ff, info in format_info.items():
        info['identifier'] = ff
        info['uuid'] = str(uuid4())
        if info.get('extra_file_formats'):
            eff2add = []
            for eff in info.get('extra_file_formats'):
                eff2add.append(formats[eff].get('@id'))
            info['extra_file_formats'] = eff2add
        info['consortia'] = [test_consortium['@id']]
        formats[ff] = testapp.post_json('/file_format', info, status=201).json['@graph'][0]
    return formats


def remote_user_testapp(app, remote_user: str) -> TestApp:
    '''Use this to generate testapp fixtures acting as different users (pass uuid) '''
    environ = {
        'HTTP_ACCEPT': 'application/json',
        'REMOTE_USER': str(remote_user),
    }
    return TestApp(app, environ)


@pytest.fixture
def test_submission_center(testapp):
    """ Tests the posting of a submission center """
    item = {
        'identifier': 'SMaHTTestGCC',
        'title': 'SMaHT Test GCC'
    }
    return post_item_and_return_location(testapp, item, 'submission_center')


@pytest.fixture
def test_second_submission_center(testapp):
    """ Tests the posting of a submission center """
    item = {
        'identifier': 'SecondSMaHTTestGCC',
        'title': 'Second SMaHT Test GCC'
    }
    return post_item_and_return_location(testapp, item, 'submission_center')


@pytest.fixture
def test_consortium(testapp):
    """ Tests the posting of a consortium """
    item = {
        'identifier': 'SMaHTConsortium',
        'title': 'SMaHT Test Consortium'
    }
    return post_item_and_return_location(testapp, item, 'consortium')


@pytest.fixture
def admin(testapp):
    item = {
        'first_name': 'Test',
        'last_name': 'Admin',
        'email': 'admin@example.org',
        'groups': ['admin'],
        'status': 'current'
    }
    return post_item_and_return_location(testapp, item, 'user')


@pytest.fixture
def smaht_admin(testapp):
    item = {
        'first_name': 'Test',
        'last_name': 'Admin',
        'email': 'smaht_admin@example.org',
        'groups': ['admin'],
        'status': 'current'
    }
    # User @@object view has keys omitted.
    return post_item_and_return_location(testapp, item, 'user')


@pytest.fixture
def smaht_gcc_user(testapp, test_submission_center):
    item = {
        'first_name': 'Test',
        'last_name': 'User',
        'email': 'user@example.org',
        'status': 'current',
        'submission_centers': [
            test_submission_center['uuid']
        ],
        'uuid': '47be2cf5-4e19-47ff-86cb-b7b3c4188308'
    }
    return post_item_and_return_location(testapp, item, 'user')


@pytest.fixture
def smaht_consortium_user(testapp, test_consortium):
    item = {
        'first_name': 'Test',
        'last_name': 'User',
        'email': 'user@example.org',
        'status': 'current',
        'consortia': [
            test_consortium['uuid']
        ],
        'uuid': '47be2cf5-4e19-47ff-86cb-b7b3c4188309'
    }
    return post_item_and_return_location(testapp, item, 'user')


@pytest.fixture
def workflow(testapp: TestApp, test_consortium: Dict[str, Any]) -> Dict[str, Any]:
    item = {
        "name": "simply-the-best",
        "title": "A Great Workflow",
        "category": ["Annotation"],
        "consortia": [test_consortium["uuid"]],
    }
    return post_item_and_return_location(testapp, item, "workflow")


@pytest.fixture
def output_file(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    file_formats: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    item = {
        "uuid": "f99fe12f-79f9-4c2c-b0b5-07fc20d7ce1d",
        "file_format": file_formats.get("fastq", {}).get("uuid", ""),
        "md5sum": "00000000000000000000000000000001",
        "filename": "my.fastq.gz",
        "status": "in review",
        "data_category": "Sequencing Reads",
        "data_type": "Unaligned Reads",
        "consortia": [test_consortium["uuid"]],
    }
    return post_item_and_return_location(testapp, item, "output_file")


@pytest.fixture
def access_key(testapp: TestApp) -> Dict[str, Any]:
    item = {
        "access_key_id": "abcd1234",
        "expiration_date": "2024-01-11T10:00:33.554416",
    }
    return post_item_and_return_location(testapp, item, "AccessKey")
