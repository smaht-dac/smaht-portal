from typing import Any, Dict, List

import pytest
from dcicutils import schema_utils
from webtest.app import AppError, TestApp

from .utils import (
    delete_item,
    get_item,
    get_items_with_submitted_id,
    get_items_without_submitted_id,
    get_schema,
    get_workbook_inserts,
    patch_item,
    post_item
)
from ..project.loadxl import ITEM_INDEX_ORDER as loadxl_order
from ..utils import get_remote_user as get_app_remote_user


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
        'data_category': ['Sequencing Reads'],
        'data_type': ['Unaligned Reads'],
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
        'data_category': ['Sequencing Reads'],
        'data_type': ['Unaligned Reads'],
        'status': 'released',    # this status is important as this will make it viewable by consortium
        'consortia': [
            test_consortium['uuid']
        ]
    }
    res = testapp.post_json('/OutputFile', item)
    return res.json['@graph'][0]


@pytest.fixture
def protected_file(testapp, fastq_format, test_protected_consortium):
    item = {
        'file_format': fastq_format['uuid'],
        'md5sum': '00000000000000000000000000000002',
        'filename': 'my.fastq.gz',
        'data_category': ['Sequencing Reads'],
        'data_type': ['Unaligned Reads'],
        'status': 'released',    # this status is important as this will make it viewable by consortium
        'consortia': [
            test_protected_consortium['uuid']
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
        'data_category': ['Sequencing Reads'],
        'data_type': ['Unaligned Reads'],
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

    @staticmethod
    def test_admin_can_submit_any_affiliations(
        admin_user_app: TestApp,
        admin: Dict[str, Any],
        donor_properties: Dict[str, Any],
        test_consortium: Dict[str, Any],
    ) -> None:
        """Ensure admins can bypass affiliations validation.

        Submission centers and consortia of admin users should
        not prevent successful POST/PATCH of items.
        """
        assert admin['groups'] == ['admin']
        assert get_app_remote_user(admin_user_app) == admin["uuid"]
        assert not admin.get("submission_centers")
        assert not admin.get("consortia")

        response = post_item(admin_user_app, donor_properties, "Donor")
        patch_body = {"consortia": [test_consortium["uuid"]]}
        patch_item(admin_user_app, patch_body, response["uuid"])


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
        }, status=422)
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
    def test_consortium_user_cannot_create_other(test_submission_center, consortium_user_app, smaht_consortium_user, testapp):
        """ Tests that a consortium user cannot create items associated with submission centers,
            touch restricted fields or types """
        consortium_user_app.post_json('/Image', {
            'description': 'test image',
            'submission_centers': [
                test_submission_center['uuid']
            ]
        }, status=422)
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
        consortium_user_app.patch_json(f'/{atid}', {}, status=422)

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
        consortium_user_app.patch_json(f'/{atid}', {}, status=422)  # always fail

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
        consortium_user_app.patch_json(f'/{atid}', {}, status=422)  # always fail


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
        unassociated_user_app.patch_json(f'/{atid}', {}, status=422)  # always fail

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
        unassociated_user_app.patch_json(f'/{atid}', {}, status=422)  # always fail


class TestProtectedDataPermissions:
    """ Class that contains tests for users in the following combinations:
            * User that is part of 2 consortia
            * User that is part of 2 submission centers and the general consortium
            * User that is part of 2 submission centers and both consortia
    """

    @staticmethod
    @pytest.mark.parametrize('new_status', [
        "uploading",  # TEMPORARY: will be removed later
        "uploaded",   # TEMPORARY: will be removed later
        "upload failed",   # TEMPORARY: will be removed later
        "to be uploaded by workflow",   # TEMPORARY: will be removed later
        "released",
        "in review",  # TEMPORARY: will be removed later
        "archived",   # TEMPORARY: will be removed later
    ])
    def test_controlled_user_can_access_controlled_data(testapp, protected_file, consortium_file,
                                                        protected_consortium_user_app, new_status,
                                                        consortium_user_app, unassociated_user_app):
        """ Tests 3 scenarios for the released status:
                * protected user can view protected data
                * protected user can view non-protected data
                * normal consortia user cannot view protected data
                * anon user cannot view protected data
        """
        atid = protected_file['@id']
        testapp.patch_json(f'/{atid}', {'status': new_status})
        unassociated_user_app.get(f'/{atid}', status=403)
        consortium_user_app.get(f'/{atid}', status=403)
        protected_consortium_user_app.get(f'/{atid}', status=200)
        atid = consortium_file['@id']
        testapp.patch_json(f'/{atid}', {'status': new_status})
        protected_consortium_user_app.get(f'/{atid}', status=200)

    @staticmethod
    @pytest.mark.parametrize('new_status', [
        "deleted",  # TEMPORARY: More statuses will be added to this test in the future
    ])
    def test_controlled_user_cannot_access_controlled_data(testapp, protected_file,
                                                           protected_consortium_user_app, new_status,
                                                           consortium_user_app, unassociated_user_app):
        """ Tests 3 scenarios for the non-released statuses:
                * protected user cannot view protected data
                * normal consortia user cannot view protected data
                * anon user cannot view protected data
        """
        atid = protected_file['@id']
        testapp.patch_json(f'/{atid}', {'status': new_status})
        unassociated_user_app.get(f'/{atid}', status=403)
        consortium_user_app.get(f'/{atid}', status=403)
        protected_consortium_user_app.get(f'/{atid}', status=403)

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
    def test_controlled_user_cannot_access_submitter_data(testapp, released_file, protected_consortium_user_app,
                                                          new_status):
        """ Tests that even a protected consortium user cannot view submission center data that
            is not released or obsolete """
        atid = released_file['@id']
        testapp.patch_json(f'/{atid}', {'status': new_status})
        protected_consortium_user_app.get(f'/{atid}', status=403)

    @staticmethod
    @pytest.mark.parametrize('new_status', [
        "uploading",
        "uploaded",
        "upload failed",
        "to be uploaded by workflow",
        "in review",
        "archived",
        "released",
        "public"
    ])
    def test_submitter_user_can_access_submitter_data(testapp, released_file, protected_consortium_submitter_app,
                                                      new_status):
        """ Tests that a protected consortium user can view submission center data that was submitted
            by the center they are a part of """
        atid = released_file['@id']
        testapp.patch_json(f'/{atid}', {'status': new_status})
        protected_consortium_submitter_app.get(f'/{atid}', status=200)


class TestUserSubmissionConsistency:
    """ Tests various situations when users post data to ensure they
        do so under the correct identifiers, else throw errors """

    @staticmethod
    def test_user_submission_center_consistency(testapp, test_consortium, test_protected_consortium,
                                                test_submission_center, test_second_submission_center,
                                                submission_center_user_app):
        """ Tests that users can only submit to submission centers they are a part of
        """
        submission_center_user_app.post_json('/FilterSet', {
            'title': 'test', 'submission_centers': [test_submission_center['uuid']]
        }, status=201)
        # fail as user is not part of this submission center
        submission_center_user_app.post_json('/FilterSet', {
            'title': 'test', 'submission_centers': [test_second_submission_center['uuid']]
        }, status=422)
        # fail as object has both submission centers, one of which does not match
        submission_center_user_app.post_json('/FilterSet', {
            'title': 'test', 'submission_centers': [test_consortium['uuid'], test_protected_consortium['uuid']]
        }, status=422)

    @staticmethod
    def test_user_consortia_submission_consistency_alternate_id(testapp, test_consortium, test_protected_consortium,
                                                                consortium_user_app):
        """ Tests that validation for consortia still works when referenced by name other
            than uuid
        """
        consortium_user_app.post_json('/FilterSet', {
            'title': 'test', 'consortia': [test_protected_consortium['@id']]
        }, status=422)

    @staticmethod
    def test_user_submission_center_consistency_alternate_id(testapp, test_submission_center,
                                                             test_second_submission_center,
                                                             submission_center_user_app):
        """ Tests that validation for submission center still works when referenced by name other
            than uuid
        """
        submission_center_user_app.post_json('/FilterSet', {
            'title': 'test', 'submission_centers': [test_second_submission_center['@id']]
        }, status=422)


@pytest.mark.parametrize(
    "donor_status", ["public", "draft", "released", "in review", "obsolete", "deleted"]
)
def test_link_to_another_submission_center_item(
    donor_status: str,
    submission_center_user_app: TestApp,
    testapp: TestApp,
    donor: Dict[str, Any],
    test_submission_center: Dict[str, Any],
    test_second_submission_center: Dict[str, Any],
) -> None:
    """Ensure item can link to one under different submission center.

    Should hold under any valid status for original item. Essentially,
    if reference is correct, can link any items.
    """
    # Confirm different submission center from tissue to post
    donor_submission_centers = donor["submission_centers"]
    assert len(donor_submission_centers) == 1
    assert donor_submission_centers[0] == test_second_submission_center["@id"]
    assert donor.get("consortia") is None

    patch_body = {"status": donor_status}
    patch_item(testapp, patch_body, donor["uuid"])

    tissue_properties = {
        "submission_centers": [test_submission_center["uuid"]],
        "donor": donor["uuid"],
        "submitted_id": "TEST_TISSUE_XYZ",
        "uberon_id": "UBERON:0001111",
    }
    post_item(submission_center_user_app, tissue_properties, "Tissue", status=201)


def test_user_can_view_profile(protected_consortium_user_app: TestApp,
                               smaht_consortium_protected_user: Dict[str, Any]) -> None:
    """ Tests that a non-admin user can view their own profile """
    assert protected_consortium_user_app.get(f'{smaht_consortium_protected_user["@id"]}', status=200)


def test_user_cannot_view_other_profile(protected_consortium_user_app: TestApp,
                                        smaht_consortium_protected_user: Dict[str, Any],
                                        smaht_gcc_user) -> None:
    """ Tests that a non-admin user cannot view other profiles """
    assert protected_consortium_user_app.get(f'{smaht_gcc_user["@id"]}', status=403)


POST_FAIL_STATUSES = [403, 422]


def test_item_create_permissions(
    anontestapp: TestApp,
    unassociated_user_app: TestApp,
    submission_center_user_app: TestApp,
    consortium_user_app: TestApp,
    testapp: TestApp,
    test_submission_center: Dict[str, Any],
) -> None:
    """Test create permissions for all item types.

    If schema has 'submitted_id' property, assume it can be created
    by submission center user and admin user only; if lacking the
    property, assume admin only. Exceptions to the above handled
    explicitly.

    Uses workbook inserts indirectly for properties, loading per
    loadxl order to ensure links are present. Thus, assumes all item
    types are represented in workbook inserts.
    """
    assert_submission_center_affiliations( # Must be as expected
        test_submission_center,
        anontestapp,
        unassociated_user_app,
        submission_center_user_app,
        consortium_user_app,
        testapp,
    )
    special_item_types = [ # snake_cased names
        "access_key",
        "filter_set",
        "ingestion_submission",
    ]
    assumed_submittable_item_types = get_items_with_submitted_id(testapp)
    assumed_admin_item_types = get_items_without_submitted_id(testapp)
    item_properties_to_test = get_item_properties_from_workbook_inserts(
        test_submission_center
    )
    for item_type in loadxl_order:
        test_properties = item_properties_to_test.get(item_type)
        assert test_properties, f"Missing workbook properties for {item_type}"
        if item_type in special_item_types:
            assert_expected_special_permissions(
                test_properties,
                item_type,
                anontestapp,
                unassociated_user_app,
                submission_center_user_app,
                consortium_user_app,
                testapp,
            )
        elif item_type in assumed_submittable_item_types:
            assert_submittable_permissions(
                test_properties,
                item_type,
                anontestapp,
                unassociated_user_app,
                submission_center_user_app,
                consortium_user_app,
                testapp,
            )
        elif item_type in assumed_admin_item_types:
            assert_admin_permissions(
                test_properties,
                item_type,
                anontestapp,
                unassociated_user_app,
                submission_center_user_app,
                consortium_user_app,
                testapp,
            )
        else:
            raise NotImplementedError(
                f"Could not place {item_type} for create permissions test"
            )

def assert_submission_center_affiliations(
    submission_center: Dict[str, Any],
    anontestapp: TestApp,
    unassociated_user_app: TestApp,
    submission_center_user_app: TestApp,
    consortium_user_app: TestApp,
    admin_app: TestApp,
) -> None:
    """Confirm expected affiliations for create permissions test."""
    assert_not_affiliated_with_submission_center(
        admin_app, anontestapp, submission_center
    )
    assert_not_affiliated_with_submission_center(
        admin_app, unassociated_user_app, submission_center
    )
    assert_not_affiliated_with_submission_center(
        admin_app, consortium_user_app, submission_center
    )
    assert_affiliated_with_submission_center(
        admin_app, submission_center_user_app, submission_center
    )


def assert_not_affiliated_with_submission_center(
    admin_app: TestApp,
    app_to_test: TestApp,
    submission_center: Dict[str, Any],
) -> None:
    remote_user = get_app_remote_user(app_to_test)
    if remote_user:
        assert not is_user_affiliated_with_submission_center(
            admin_app, remote_user, submission_center
        )


def assert_affiliated_with_submission_center(
    admin_app: TestApp,
    app_to_test: TestApp,
    submission_center: Dict[str, Any],
) -> None:
    remote_user = get_app_remote_user(app_to_test)
    assert remote_user
    assert is_user_affiliated_with_submission_center(
        admin_app, remote_user, submission_center
    )


def is_user_affiliated_with_submission_center(
    admin_app: TestApp,
    user_identifier: str,
    submission_center: Dict[str, Any],
) -> bool:
    """Check if user affiliated with submission center."""
    user = get_item(
        admin_app, user_identifier, collection="User", status=[200, 301], frame="raw"
    )
    return submission_center["uuid"] in user.get("submission_centers", [])


def get_item_properties_from_workbook_inserts(
    submission_center: Dict[str, Any]
) -> Dict[str, Dict[str, Any]]:
    """Get representative item types from workbook inserts.

    For those with submission centers and consortia, wipe and replace
    with only provided submission center.
    """
    inserts = get_workbook_inserts()
    return clean_workbook_inserts(inserts, submission_center)


def clean_workbook_inserts(
    workbook_inserts: Dict[str, Dict[str, Any]],
    submission_center: Dict[str, Any]
) -> Dict[str, Dict[str, Any]]:
    """Clean workbook inserts to only include submission center.

    For those with submission centers and consortia, wipe and replace
    with only provided submission center.
    """
    return {
        item_type: replace_inserts_affiliations(item_inserts, submission_center)
        for item_type, item_inserts in workbook_inserts.items()
    }


def replace_inserts_affiliations(
    item_inserts: List[Dict[str, Any]],
    submission_center: Dict[str, Any]
) -> Dict[str, Any]:
    """Replace affiliations in item inserts with provided submission center."""
    return [
        replace_insert_affiliations(item_insert, submission_center)
        for item_insert in item_inserts
    ]


def replace_insert_affiliations(
    item_insert: Dict[str, Any],
    submission_center: Dict[str, Any]
) -> Dict[str, Any]:
    """If needed, replace affiliations in item insert with provided
    submission center.
    """
    if has_affiliations(item_insert):
        return replace_affiliations(item_insert, submission_center)
    return item_insert


def has_affiliations(item_insert: Dict[str, Any]) -> bool:
    """Check if item insert has submission centers or consortia."""
    return any(
        [
            item_insert.get("submission_centers", []),
            item_insert.get("consortia", []),
        ]
    )

def replace_affiliations(
    item_insert: Dict[str, Any],
    submission_center: Dict[str, Any]
) -> Dict[str, Any]:
    """Replace affiliations in item insert with provided submission center.

    Assumes submission_centers property is valid. Can check schemas if
    assumption no longer holds.
    """
    insert_without_affiliation = {
        key: value for key, value in item_insert.items()
        if key not in ["submission_centers", "consortia"]
    }
    return {
        **insert_without_affiliation, "submission_centers": [submission_center["uuid"]]
    }


def get_limited_insert(
    test_app: TestApp, insert: Dict[str, Any], item_type: str
) -> Dict[str, Any]:
    """Get insert with limited properties for POST attempt.

    Keep only required fields plus submission centers, if present.
    """
    schema = get_schema(test_app, item_type)
    required_properties = schema_utils.get_conditional_required(schema)
    if has_affiliations(insert):
        properties_to_keep = required_properties + ["submission_centers"]
    else:
        properties_to_keep = required_properties
    return {key: value for key, value in insert.items() if key in properties_to_keep}


def get_identifying_insert(
    test_app: TestApp, insert: Dict[str, Any], item_type: str
) -> Dict[str, Any]:
    """Get insert with required + identifying properties for POST attempt.

    Keep submission centers, if present.
    """
    schema = get_schema(test_app, item_type)
    required_properties = schema_utils.get_conditional_required(schema)
    identifying_properties = schema_utils.get_identifying_properties(schema)
    if has_affiliations(insert):
        properties_to_keep = (
            identifying_properties + required_properties + ["submission_centers"]
        )
    else:
        properties_to_keep = identifying_properties + required_properties
    return {key: value for key, value in insert.items() if key in properties_to_keep}


def post_item_then_delete(
    admin_app: TestApp,
    post_app: TestApp,
    item_type: str,
    item: Dict[str, Any],
    status: int = 201,
) -> None:
    """Post item then delete it.

    Inserts may have unique keys that will prevent subsequent POSTs
    of the insert, so deletion required.
    """
    try:
        post_response = post_item(post_app, item, item_type, status=status)
        if status == 201:
            uuid = post_response.get("uuid", "")
            assert uuid
            delete_item(admin_app, uuid)
        else:
            assert post_response["status"] == "error"
    except AppError as e:
        raise RuntimeError(f"Error posting {item_type} item: {e}")


def post_item_to_fail(
    test_app: TestApp,
    item_type: str,
    item: Dict[str, Any],
) -> None:
    """Attempt to post item that should fail."""
    post_response = post_item(test_app, item, item_type, status=POST_FAIL_STATUSES)
    assert post_response["status"] == "error"


def assert_expected_special_permissions(
    inserts: List[Dict[str, Any]],
    item_type: str,
    anontestapp: TestApp,
    unassociated_user_app: TestApp,
    submission_center_user_app: TestApp,
    consortium_user_app: TestApp,
    testapp: TestApp,
) -> None:
    """Ensure expected permissions for creation of special items."""
    if item_type == "access_key":
        assert_expected_access_key_permissions(
            inserts,
            item_type,
            anontestapp,
            unassociated_user_app,
            submission_center_user_app,
            consortium_user_app,
            testapp,
        )
    elif item_type == "filter_set":
        assert_submittable_permissions(
            inserts,
            item_type,
            anontestapp,
            unassociated_user_app,
            submission_center_user_app,
            consortium_user_app,
            testapp,
        )
    elif item_type == "ingestion_submission":
        assert_submittable_permissions(
            inserts,
            item_type,
            anontestapp,
            unassociated_user_app,
            submission_center_user_app,
            consortium_user_app,
            testapp,
        )
    else:
        raise NotImplementedError(
            f"Special item type {item_type} not handled."
        )


def assert_expected_access_key_permissions(
    inserts: List[Dict[str, Any]],
    item_type: str,
    anontestapp: TestApp,
    unassociated_user_app: TestApp,
    submission_center_user_app: TestApp,
    consortium_user_app: TestApp,
    testapp: TestApp,
) -> None:
    """Ensure expected permissions for creation of access keys."""
    for idx, insert in enumerate(inserts):
        limited_insert = get_limited_insert(testapp, insert, item_type)
        identifying_insert = get_identifying_insert(testapp, insert, item_type)
        if idx == 0:
            post_item_to_fail(anontestapp, item_type, limited_insert)
            post_item_then_delete(testapp, unassociated_user_app, item_type, limited_insert)
            post_item_then_delete(testapp, submission_center_user_app, item_type, limited_insert)
            post_item_then_delete(testapp, consortium_user_app, item_type, limited_insert)
        post_item(testapp, identifying_insert, item_type, status=201)



def assert_submittable_permissions(
    inserts: List[Dict[str, Any]],
    item_type: str,
    anontestapp: TestApp,
    unassociated_user_app: TestApp,
    submission_center_user_app: TestApp,
    consortium_user_app: TestApp,
    testapp: TestApp,
) -> None:
    """Ensure expected permissions for creation of submittable items."""
    for idx, insert in enumerate(inserts):
        limited_insert = get_limited_insert(testapp, insert, item_type)
        identifying_insert = get_identifying_insert(testapp, insert, item_type)
        if idx == 0:
            post_item_to_fail(anontestapp, item_type, limited_insert)
            post_item_to_fail(unassociated_user_app, item_type, limited_insert)
            post_item_then_delete(testapp, submission_center_user_app, item_type, limited_insert)
            post_item_to_fail(consortium_user_app, item_type, limited_insert)
        post_item(testapp, identifying_insert, item_type, status=201)


def assert_admin_permissions(
    inserts: List[Dict[str, Any]],
    item_type: str,
    anontestapp: TestApp,
    unassociated_user_app: TestApp,
    submission_center_user_app: TestApp,
    consortium_user_app: TestApp,
    testapp: TestApp,
) -> None:
    """Ensure expected permissions for creation of admin-only items."""
    for idx, insert in enumerate(inserts):
        limited_insert = get_limited_insert(testapp, insert, item_type)
        identifying_insert = get_identifying_insert(testapp, insert, item_type)
        if idx == 0:
            post_item_to_fail(anontestapp, item_type, limited_insert)
            post_item_to_fail(unassociated_user_app, item_type, limited_insert)
            post_item_to_fail(submission_center_user_app, item_type, limited_insert)
            post_item_to_fail(consortium_user_app, item_type, limited_insert)
        post_item(testapp, identifying_insert, item_type, status=201)
