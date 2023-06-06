import pytest
from .datafixtures import remote_user_testapp


@pytest.fixture
def submission_center_user_app(testapp, test_submission_center, smaht_gcc_user):
    return remote_user_testapp(testapp.app, smaht_gcc_user['uuid'])


@pytest.fixture
def file(testapp, test_submission_center):
    res = testapp.post_json('/file_format', {
        'file_format': 'fastq',
        'standard_file_extension': 'fastq.gz',
        'other_allowed_extensions': ['fq.gz'],
        'valid_item_types': ["FileSubmitted", "FileReference", "FileProcessed"]
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
    res = testapp.post_json('/file_submitted', item)
    return res.json['@graph'][0]


class TestSubmissionCenterPermissions:
    """ Tests permissions scheme centered around the submission center ie: can they view associated items,
        can they create/edit them etc
    """

    @staticmethod
    def test_submission_center_file_permissions_view(submission_center_user_app, smaht_gcc_user, testapp,
                                                     anontestapp, file):
        """ Tests that a user associated with a submission center can view an uploaded permissioned
            file, an anonymous user cannot and an admin user can """
        submission_center_user_app.get(f'/{file["uuid"]}', status=200)
        anontestapp.get(f'/{file["uuid"]}', status=403)
        testapp.get(f'/{file["uuid"]}', status=200)

        # patch the file status so it has no submission_center, user should now no longer see
        testapp.patch_json(f'/{file["uuid"]}?delete_fields=submission_centers', {}, status=200)
        submission_center_user_app.get(f'/{file["uuid"]}', status=403)
        anontestapp.get(f'/{file["uuid"]}', status=403)
        testapp.get(f'/{file["uuid"]}', status=200)

    @staticmethod
    def test_submission_center_user_permissions_view(submission_center_user_app, smaht_gcc_user, testapp,
                                                     anontestapp, file):
        """ Similar to above except tests the opposite case ie: user no longer has submission_center but file does"""
        # patch the file status so it has no submission_center, user should now no longer see
        testapp.patch_json(f'/{smaht_gcc_user["uuid"]}?delete_fields=submission_centers', {}, status=200)
        submission_center_user_app.get(f'/{file["uuid"]}', status=403)
        anontestapp.get(f'/{file["uuid"]}', status=403)
        testapp.get(f'/{file["uuid"]}', status=200)

    @pytest.mark.skip
    @staticmethod
    def test_submission_center_user_create(test_submission_center, submission_center_user_app, smaht_gcc_user):
        submission_center_user_app.post_json('/Image', {
            'description': 'test',
            'submission_centers': [
                test_submission_center['uuid']
            ]
        }, status=201)
        submission_center_user_app.post_json('/Image', {
            'description': 'test'
        }, status=403)


class TestConsortiumPermissions:
    """ Similar to above class, tests that consortium members can view (note: NOT edit) items """
    pass
