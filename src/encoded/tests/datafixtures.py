from webtest import TestApp
from uuid import uuid4
import pytest


@pytest.fixture
def file_formats(testapp, test_consortium):
    """ Consortia attribute file formats taken from fourfront, could be pared down eventually """
    formats = {}
    ef_format_info = {
        'pairs_px2': {'standard_file_extension': 'pairs.gz.px2',
                      "valid_item_types": ["FileProcessed"]},
        'pairsam_px2': {'standard_file_extension': 'sam.pairs.gz.px2',
                        "valid_item_types": ["FileProcessed"]},
        'bai': {'standard_file_extension': 'bam.bai',
                "valid_item_types": ["FileProcessed"]},
        'beddb': {"standard_file_extension": "beddb",
                  "valid_item_types": ["FileProcessed", "FileReference"]},
    }
    format_info = {
        'fastq': {'standard_file_extension': 'fastq.gz',
                  'other_allowed_extensions': ['fq.gz'],
                  "valid_item_types": ["FileSubmitted"]},
        'pairs': {'standard_file_extension': 'pairs.gz',
                  "extrafile_formats": ['pairs_px2', 'pairsam_px2'],
                  "valid_item_types": ["FileProcessed"]},
        'bam': {'standard_file_extension': 'bam',
                'extrafile_formats': ['bai'],
                "valid_item_types": ["FileProcessed", "FileSubmitted"]},
        'mcool': {'standard_file_extension': 'mcool',
                  "valid_item_types": ["FileProcessed"]},
        'zip': {'standard_file_extension': 'zip',
                "valid_item_types": ["FileProcessed"]},
        'chromsizes': {'standard_file_extension': 'chrom.sizes',
                       "valid_item_types": ["FileReference"]},
        'other': {'standard_file_extension': '',
                  "valid_item_types": ["FileProcessed", "FileReference",]},
        'bw': {'standard_file_extension': 'bw',
               "valid_item_types": ["FileProcessed"]},
        'bg': {'standard_file_extension': 'bedGraph.gz',
               "valid_item_types": ["FileProcessed"]},
        'bigbed': {'standard_file_extension': 'bb',
                   "valid_item_types": ["FileProcessed", "FileReference"]},
        'bed': {"standard_file_extension": "bed.gz",
                "extrafile_formats": ['beddb'],
                "valid_item_types": ["FileProcessed", "FileReference"]}
    }

    for eff, info in ef_format_info.items():
        info['file_format'] = eff
        info['uuid'] = str(uuid4())
        info['consortia'] = [test_consortium['@id']]
        formats[eff] = testapp.post_json('/file_format', info, status=201).json['@graph'][0]
    for ff, info in format_info.items():
        info['file_format'] = ff
        info['uuid'] = str(uuid4())
        if info.get('extrafile_formats'):
            eff2add = []
            for eff in info.get('extrafile_formats'):
                eff2add.append(formats[eff].get('@id'))
            info['extrafile_formats'] = eff2add
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


def post_item_and_return_location(testapp: TestApp, item: dict, resource_path: str) -> dict:
    """ Posts item metadata to resource_path using testapp and return a dict response containing the location """
    res = testapp.post_json(f'/{resource_path}', item)
    return testapp.get(res.location).json


@pytest.fixture
def test_submission_center(testapp):
    """ Tests the posting of a submission center """
    item = {
        'name': 'SMaHTTestGCC',
        'title': 'SMaHT Test GCC'
    }
    return post_item_and_return_location(testapp, item, 'submission_center')


@pytest.fixture
def test_second_submission_center(testapp):
    """ Tests the posting of a submission center """
    item = {
        'name': 'SecondSMaHTTestGCC',
        'title': 'Second SMaHT Test GCC'
    }
    return post_item_and_return_location(testapp, item, 'submission_center')


@pytest.fixture
def test_consortium(testapp):
    """ Tests the posting of a consortium """
    item = {
        'name': 'SMaHTConsortium',
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
