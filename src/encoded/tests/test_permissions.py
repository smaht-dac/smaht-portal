import pytest
from .datafixtures import remote_user_testapp


@pytest.fixture
def submission_center_user_app(testapp, test_submission_center, smaht_gcc_user):
    return remote_user_testapp(testapp.app, smaht_gcc_user['uuid'])


@pytest.fixture
def file(testapp, test_submission_center):
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
        'submission_centers': [
            test_submission_center['uuid']
        ]
    }
    res = testapp.post_json('/smaht_file_submitted', item)
    return res.json['@graph'][0]


def test_submission_center_user_permissions(submission_center_user_app, smaht_gcc_user, testapp, anontestapp, file):
    """ Tests that a user associated with a submission center can view an uploaded permissioned
        file, an anonymous user cannot and an admin user can """
    #submission_center_user_app.get(f'/{file["uuid"]}', status=200)
    # anontestapp.get(f'/{file["uuid"]}', status=403)
    # testapp.get(f'/{file["uuid"]}', status=200)

    # patch the file status so it has no submission_center, user should now no longer see
    testapp.patch_json(f'/{file["uuid"]}?delete_fields=submission_centers', {}, status=200)
    testapp.patch_json(f'/{smaht_gcc_user["uuid"]}?delete_fields=submission_centers', {}, status=200)
    import pdb; pdb.set_trace()
    submission_center_user_app.get(f'/{file["uuid"]}', status=403)
    # anontestapp.get(f'/{file["uuid"]}', status=403)
    # testapp.get(f'/{file["uuid"]}', status=200)
