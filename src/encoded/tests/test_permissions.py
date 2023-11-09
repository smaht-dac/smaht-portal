from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .datafixtures import remote_user_testapp


@pytest.fixture
def submission_center_user_app(testapp, test_submission_center, smaht_gcc_user):
    return remote_user_testapp(testapp.app, smaht_gcc_user['uuid'])


@pytest.fixture
def consortium_user_app(testapp, test_consortium, smaht_consortium_user):
    return remote_user_testapp(testapp.app, smaht_consortium_user['uuid'])


@pytest.fixture
def fastq_format(testapp: TestApp, test_consortium: Dict[str, Any]):
    return testapp.post_json('/file_format', {
        'identifier': 'fastq',
        'standard_file_extension': 'fastq.gz',
        'other_allowed_extensions': ['fq.gz'],
        'consortia': [test_consortium['uuid']],
    }, status=201).json['@graph'][0]


@pytest.fixture
def submission_center_file(testapp, fastq_format, test_submission_center, test_consortium):
    item = {
        'file_format': fastq_format['uuid'],
        'md5sum': '00000000000000000000000000000000',
        'filename': 'my.fastq.gz',
        'status': 'in review',
        'data_category': 'Sequencing Reads',
        'data_type': 'Unaligned Reads',
        'submission_centers': [
            test_submission_center['uuid']
        ],
    }
    res = testapp.post_json('/OutputFile', item)
    return res.json['@graph'][0]


@pytest.fixture
def consortium_file(testapp, fastq_format, test_consortium):
    item = {
        'file_format': fastq_format['uuid'],
        'md5sum': '00000000000000000000000000000001',
        'filename': 'my.fastq.gz',
        'data_category': 'Sequencing Reads',
        'data_type': 'Unaligned Reads',
        'status': 'released',    # this status is important as this will make it viewable by consortium
        'consortia': [
            test_consortium['uuid']
        ]
    }
    res = testapp.post_json('/OutputFile', item)
    return res.json['@graph'][0]


class TestAdminPermissions:
    """ Tests admins can do various actions, including purging items """

    @staticmethod
    def test_admin_can_purge(testapp, fastq_format):
        testapp.patch_json(f'/{fastq_format["uuid"]}', {'status': 'deleted'}, status=200)
        testapp.delete_json(f'/{fastq_format["uuid"]}/?purge=True', {}, status=200)

    @staticmethod
    def test_non_admin_cannot_purge(submitter_testapp, fastq_format):
        submitter_testapp.patch_json(f'/{fastq_format["uuid"]}', {'status': 'deleted'}, status=422)
        submitter_testapp.delete_json(f'/{fastq_format["uuid"]}/?purge=True', {}, status=403)


class TestPermissionsHelper:

    @staticmethod
    def _handle_redir(app, url, status):
        """ Helper that handles redirect status """
        if status == 403:
            app.get(url, status=403)
        else:
            app.get(url).follow(status=status)

    @classmethod
    def validate_get_permissions(cls, *, restricted_app, restricted_expected_status,
                                  admin_app, admin_expected_status,
                                  anon_app, anon_expected_status,
                                  item_uuid):
        """ Tests a series of app/status combinations for GET based on the callers desired behavior """
        url = f'/{item_uuid}'
        cls._handle_redir(restricted_app, url, restricted_expected_status)
        cls._handle_redir(admin_app, url, admin_expected_status)
        cls._handle_redir(anon_app, url, anon_expected_status)


class TestSubmissionCenterPermissions(TestPermissionsHelper):
    """ Tests permissions scheme centered around the submission center ie: can they view associated items,
        can they create/edit them etc - all testing with default status
    """

    def test_submission_center_file_permissions_view(
        self, submission_center_user_app, smaht_gcc_user, testapp,
        anontestapp, submission_center_file, test_second_submission_center,
    ):
        """ Tests that a user associated with a submission center can view an in review permissioned
            file, an anonymous user cannot and an admin user can """
        uuid = submission_center_file["uuid"]
        self.validate_get_permissions(
            restricted_app=submission_center_user_app, restricted_expected_status=200,
            admin_app=testapp, admin_expected_status=200,
            anon_app=anontestapp, anon_expected_status=403,
            item_uuid=uuid
        )

    def test_submission_center_user_permissions_view(self, submission_center_user_app, smaht_gcc_user, testapp,
                                                     anontestapp, submission_center_file):
        """ Similar to above except tests the opposite case ie: user no longer has submission_center but file does"""
        uuid = submission_center_file["uuid"]
        # patch the file status, so it has no submission_center therefore user should no longer see
        testapp.patch_json(f'/{smaht_gcc_user["uuid"]}?delete_fields=submission_centers', {}, status=200)
        self.validate_get_permissions(
            restricted_app=submission_center_user_app, restricted_expected_status=403,
            admin_app=testapp, admin_expected_status=200,
            anon_app=anontestapp, anon_expected_status=403,
            item_uuid=uuid
        )

    def test_submission_center_user_permissions_cannot_view(self, submission_center_user_app, smaht_gcc_user, testapp,
                                                            anontestapp, submission_center_file,
                                                            test_second_submission_center):
        """ Tests that a submission center user cannot view items associated with a different submission center """
        uuid = submission_center_file["uuid"]
        testapp.patch_json(f'/{uuid}', {
            'submission_centers': [
                test_second_submission_center['uuid']
            ]
        })
        self.validate_get_permissions(
            restricted_app=submission_center_user_app, restricted_expected_status=403,
            admin_app=testapp, admin_expected_status=200,
            anon_app=anontestapp, anon_expected_status=403,
            item_uuid=uuid
        )

    def test_submission_center_user_can_view_consortium_item(self, submission_center_user_app, testapp,
                                                             anontestapp, consortium_file):
        """ Tests that a user with submission center permissions can view consortium associated items """
        uuid = consortium_file["uuid"]
        self.validate_get_permissions(
            restricted_app=submission_center_user_app, restricted_expected_status=200,
            admin_app=testapp, admin_expected_status=200,
            anon_app=anontestapp, anon_expected_status=403,
            item_uuid=uuid
        )

    @staticmethod
    def test_submission_center_user_create_access_key(test_submission_center, submission_center_user_app,
                                                      smaht_gcc_user, testapp):
        """ Tests that submission center users can create access keys """
        submission_center_user_app.post_json('/AccessKey', {
            'user': smaht_gcc_user['@id'],
            'description': 'test key',
        }, status=201)

    @staticmethod
    def test_submission_center_user_create_other(test_submission_center, submission_center_user_app, smaht_gcc_user):
        """ Tests a submission center user can create another allowed type """
        submission_center_user_app.post_json('/Image', {
            'description': 'test',
            'submission_centers': [
                test_submission_center['uuid']
            ]
        }, status=201)

    @staticmethod
    def test_submission_center_user_cannot_create_other(test_submission_center, submission_center_user_app,
                                                        smaht_gcc_user, test_second_submission_center):
        """ Tests that a submission center user cannot create items associated with other centers
            or types not allowed by submission center users/restricted fields
        """
        submission_center_user_app.post_json('/Image', {
            'description': 'test',
            'submission_centers': [
                test_second_submission_center['uuid']
            ]
        }, status=403)
        submission_center_user_app.post_json('/Image', {
            'description': 'test2',
            'submission_centers': [
                test_submission_center['uuid']
            ],
            'status': 'draft'
        }, status=422)
        submission_center_user_app.post_json('/SubmissionCenter', {
            'title': 'dummy',
            'name': 'dummy'
        }, status=422)  # blocked by restricted_fields on required fields


class TestConsortiumPermissions(TestPermissionsHelper):
    """ Similar to above class, tests that consortium members can view (note: NOT edit) items
        all testing with default status """

    def test_consortium_file_permissions_view(self, consortium_user_app, smaht_consortium_user, testapp, anontestapp,
                                              consortium_file):
        """ Tests view permissions for consortium, varying permissions on the file """
        uuid = consortium_file["uuid"]
        self.validate_get_permissions(
            restricted_app=consortium_user_app, restricted_expected_status=200,
            admin_app=testapp, admin_expected_status=200,
            anon_app=anontestapp, anon_expected_status=403,
            item_uuid=uuid
        )

    def test_consortium_user_permissions_view(self, consortium_user_app, smaht_consortium_user, testapp, anontestapp,
                                              consortium_file):
        """ Tests view permissions for consortium, varying permissions on the user """
        uuid = consortium_file["uuid"]
        self.validate_get_permissions(
            restricted_app=consortium_user_app, restricted_expected_status=200,
            admin_app=testapp, admin_expected_status=200,
            anon_app=anontestapp, anon_expected_status=403,
            item_uuid=uuid
        )

        # patch the file status, so it has no consortium therefore user should no longer see
        testapp.patch_json(f'/{smaht_consortium_user["uuid"]}?delete_fields=consortia', {}, status=200)
        self.validate_get_permissions(
            restricted_app=consortium_user_app, restricted_expected_status=403,
            admin_app=testapp, admin_expected_status=200,
            anon_app=anontestapp, anon_expected_status=403,
            item_uuid=uuid
        )

    @staticmethod
    def test_consortium_user_create_access_key(consortium_user_app, smaht_consortium_user, testapp):
        """ Tests that consortium users can create access keys """
        consortium_user_app.post_json('/AccessKey', {
            'user': smaht_consortium_user['@id'],
            'description': 'test key',
        }, status=201)

    @staticmethod
    def test_consortium_user_create_other(test_consortium, consortium_user_app, smaht_consortium_user, testapp):
        """ Tests that consortium users can create filter sets """
        consortium_user_app.post_json('/FilterSet', {
            'title': 'test fs',
            'consortia': [
                test_consortium['uuid']
            ]
        }, status=201)

    @staticmethod
    def test_consortium_user_cannot_create_other(test_submission_center, consortium_user_app, smaht_consortium_user, testapp):
        """ Tests that a consortium user cannot create items associated with submission centers,
            touch restricted fields or types """
        consortium_user_app.post_json('/Image', {
            'description': 'test image',
            'submission_centers': [
                test_submission_center['uuid']
            ]
        }, status=403)
        consortium_user_app.post_json('/Image', {
            'description': 'test image',
            'status': 'draft'
        }, status=422)  # blocked by restricted_fields on required fields
        consortium_user_app.post_json('/SubmissionCenter', {
            'title': 'dummy',
            'name': 'dummy'
        }, status=422)  # blocked by restricted_fields on required fields

    @staticmethod
    def test_consortium_user_cannot_view_or_edit_submission_center_data(submission_center_file,
                                                                        consortium_user_app):
        """ Tests that consortium users cannot view or edit data created by a submission
            center in default status """
        uuid = submission_center_file["uuid"]
        consortium_user_app.get(f'/{uuid}', status=403)
        consortium_user_app.patch_json(f'/{uuid}', {}, status=403)
