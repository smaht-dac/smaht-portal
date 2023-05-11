import pytest
from .datafixtures import remote_user_testapp


@pytest.fixture
def submission_center_user_app(testapp, test_submission_center, smaht_gcc_user):
    return remote_user_testapp(testapp.app, smaht_gcc_user['uuid'])


@pytest.fixture
def file(testapp):
    res = testapp.post_json('/smaht_file_format', {
        'file_format': 'fastq',
        'standard_file_extension': 'fastq.gz',
        'other_allowed_extensions': ['fq.gz'],
        'valid_item_types': ["SMAHTFileSubmitted"]
    }, status=201).json['@graph'][0]
    item = {
        'file_format': res['uuid'],
        'md5sum': '00000000000000000000000000000000',
        'filename': 'my.fastq.gz',
        'status': 'uploaded',
    }
    res = testapp.post_json('/smaht_file_submitted', item)
    return res.json['@graph'][0]


def test_submission_center_user_permissions(submission_center_user_app, file):
    pass
