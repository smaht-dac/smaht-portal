from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .datafixtures import remote_user_testapp


@pytest.fixture
def submission_center_user_app(testapp, test_submission_center, smaht_gcc_user):
    """ App associated with a consortia member who is a submitter """
    return remote_user_testapp(testapp.app, smaht_gcc_user['uuid'])


@pytest.fixture
def consortium_user_app(testapp, test_consortium, smaht_consortium_user):
    """ App associated with a normal consortia member """
    return remote_user_testapp(testapp.app, smaht_consortium_user['uuid'])


@pytest.fixture
def multi_consortium_user_app(testapp, smaht_consortium_protected_user, test_consortium, test_protected_consortium):
    """ App associated with a user who has access to consortia and protected data """
    return remote_user_testapp(testapp.app, smaht_consortium_protected_user['uuid'])


@pytest.fixture
def unassociated_user_app(testapp, blank_user):
    """ App associated with a user who has no associations """
    return remote_user_testapp(testapp.app, blank_user['uuid'])


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


@pytest.fixture
def released_file(testapp, fastq_format, test_submission_center, test_consortium):
    item = {
        'file_format': fastq_format['uuid'],
        'md5sum': '00000000000000000000000000000001',
        'filename': 'my.fastq.gz',
        'data_category': 'Sequencing Reads',
        'data_type': 'Unaligned Reads',
        'status': 'released',    # this status is important as this will make it viewable by consortium
        'consortia': [
            test_consortium['uuid']
        ],
        'submission_centers': [
            test_submission_center['uuid']
        ],
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
        can they create/edit them etc - note that submission centers members are all consortia members!
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

    @staticmethod
    @pytest.mark.parametrize('new_status', [
        'uploading',
        'uploaded',
        'upload failed',
        'to be uploaded by workflow',
        'in review'
    ])
    def test_submission_center_can_edit_file(test_submission_center, submission_center_user_app, released_file,
                                             testapp, new_status):
        """ Tests that submission center user can still edit metadata in the editable statuses """
        atid = released_file['@id']
        testapp.patch_json(f'/{atid}', {'status': new_status})
        submission_center_user_app.patch_json(f'/{atid}', {}, status=200)

    @staticmethod
    @pytest.mark.parametrize('new_status', [
        'released',
        'obsolete',
        'archived',
        'deleted',
        'public'
    ])
    def test_submission_center_cannot_edit_file(test_submission_center, submission_center_user_app, released_file,
                                             testapp, new_status):
        """ Tests that submission center user cannot edit metadata in the non-editable statuses """
        atid = released_file['@id']
        testapp.patch_json(f'/{atid}', {'status': new_status})
        submission_center_user_app.patch_json(f'/{atid}', {}, status=403)


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
    @pytest.mark.parametrize('new_status', [
        "uploading",
        "uploaded",
        "upload failed",
        "to be uploaded by workflow",
        "released",
        "in review",
        "obsolete",
        "archived",
        "deleted",
    ])
    def test_consortium_user_cannot_view_submission_center_data(submission_center_file, new_status, testapp,
                                                                consortium_user_app):
        """ Tests that consortium users cannot view or edit data created by a submission
            center in all statuses except public """
        atid = submission_center_file['@id']
        testapp.patch_json(f'/{atid}', {'status': new_status})
        consortium_user_app.get(f'/{atid}', status=403)

    @staticmethod
    @pytest.mark.parametrize('new_status', [
        "uploading",
        "uploaded",
        "upload failed",
        "to be uploaded by workflow",
        "released",
        "in review",
        "obsolete",
        "archived",
        "deleted",
        "public"
    ])
    def test_consortium_user_cannot_edit_submission_center_data(submission_center_file, new_status, testapp,
                                                                consortium_user_app):
        """ Tests that consortium users cannot edit data created by a submission
            center in all statuses """
        atid = submission_center_file['@id']
        testapp.patch_json(f'/{atid}', {'status': new_status})
        consortium_user_app.patch_json(f'/{atid}', {}, status=403)

    @staticmethod
    def test_consortium_user_can_view_public_submission_center_data(submission_center_file, consortium_user_app,
                                                                    testapp):
        """ Tests that a consortium user can view a public file tagged witha submission center """
        atid = submission_center_file['@id']
        testapp.patch_json(f'/{atid}', {'status': 'public'})
        consortium_user_app.get(f'/{atid}', status=200)

    @staticmethod
    @pytest.mark.parametrize('new_status', [
        "released",
        "obsolete",
        "public"
    ])
    def test_consortium_user_can_view_dual_tagged_data(released_file, consortium_user_app, new_status,
                                                       testapp):
        """ Consortia members should be able to view submission center tagged data in viewable statuses
            Also tests that it is not editable
        """
        atid = released_file['@id']
        testapp.patch_json(f'/{atid}', {'status': new_status})
        consortium_user_app.get(f'/{atid}', status=200)  # should succeed
        consortium_user_app.patch_json(f'/{atid}', {}, status=403)  # always fail

    @staticmethod
    @pytest.mark.parametrize('new_status', [
        "uploading",
        "uploaded",
        "upload failed",
        "to be uploaded by workflow",
        "in review",
        "archived",
        "deleted",
    ])
    def test_consortium_user_cannot_view_or_edit_dual_tagged_data(released_file, consortium_user_app, new_status,
                                                                  testapp):
        """ Most statuses do not allow view or edit permissions """
        atid = released_file['@id']
        testapp.patch_json(f'/{atid}', {'status': new_status})
        consortium_user_app.get(f'/{atid}', status=403)
        consortium_user_app.patch_json(f'/{atid}', {}, status=403)  # always fail


class TestAnonUserPermissions:
    """ Tests that public users don't have various access permissions to data that is not
        public, whether they have an account or are totally anonymous """

    @staticmethod
    def test_public_user_can_view_public_data(released_file, testapp, anontestapp, unassociated_user_app):
        """ Tests that public users can view data with status = public """
        atid = released_file['@id']
        testapp.patch_json(f'/{atid}', {'status': 'public'})
        anontestapp.get(f'/{atid}', status=200)
        anontestapp.patch_json(f'/{atid}', {}, status=403)  # always fail
        unassociated_user_app.get(f'/{atid}', status=200)
        unassociated_user_app.patch_json(f'/{atid}', {}, status=403)  # always fail

    @staticmethod
    @pytest.mark.parametrize('new_status', [
        "uploading",
        "uploaded",
        "upload failed",
        "to be uploaded by workflow",
        "released",
        "in review",
        "obsolete",
        "archived",
        "deleted",
    ])
    def test_public_user_cannot_view_restricted_data(released_file, new_status, testapp, anontestapp,
                                                     unassociated_user_app):
        """ Tests that public users cannot view/edit any data with status other than public """
        atid = released_file['@id']
        testapp.patch_json(f'/{atid}', {'status': new_status})
        anontestapp.get(f'/{atid}', status=403)
        anontestapp.patch_json(f'/{atid}', {}, status=403)  # always fail
        unassociated_user_app.get(f'/{atid}', status=403)
        unassociated_user_app.patch_json(f'/{atid}', {}, status=403)  # always fail
