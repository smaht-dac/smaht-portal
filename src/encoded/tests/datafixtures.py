from typing import Any, Dict
from uuid import uuid4

from webtest import TestApp
import pytest

from .utils import post_item, post_item_and_return_location


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
        'FASTQ': {
            'standard_file_extension': 'fastq.gz',
            'other_allowed_extensions': ['fq.gz'],
        },
        'pairs': {
            'standard_file_extension': 'pairs.gz',
            "extra_file_formats": ['pairs_px2', 'pairsam_px2'],
        },
        'BAM': {
            'standard_file_extension': 'bam',
            'extra_file_formats': ['bai'],
        },
        "CHAIN": {
            'standard_file_extension': 'chain.gz',
        },
        "FASTA": {
            'standard_file_extension': 'fasta',
            'other_allowed_extensions': ['fa']
        },
        'VCF': {"standard_file_extension": "vcf",},
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

    all_file_item_types = [
        "OutputFile",
        "ReferenceFile",
        "AlignedReads",
        "UnalignedReads",
        "VariantCalls",
        "SupplementaryFile"
    ]
    for eff, info in ef_format_info.items():
        info['identifier'] = eff
        info['uuid'] = str(uuid4())
        info['consortia'] = [test_consortium['@id']]
        if not info.get("valid_item_types"):
            info["valid_item_types"] = all_file_item_types
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
        if not info.get("valid_item_types"):
            info["valid_item_types"] = all_file_item_types
        formats[ff] = testapp.post_json('/file_format', info, status=201).json['@graph'][0]
    return formats


def remote_user_testapp(app, remote_user: str) -> TestApp:
    '''Use this to generate testapp fixtures acting as different users (pass uuid) '''
    environ = {
        'HTTP_ACCEPT': 'application/json',
        'REMOTE_USER': str(remote_user),
    }
    return TestApp(app, environ)


TEST_SUBMISSION_CENTER_CODE = "test"
TEST_SECOND_SUBMISSION_CENTER_CODE = "secondtest"
TEST_SECOND_CENTER_SUBMITTED_ID_CODE = (
    TEST_SECOND_SUBMISSION_CENTER_CODE.upper()
)


@pytest.fixture
def test_submission_center(testapp):
    """ Tests the posting of a submission center """
    item = {
        'identifier': 'SMaHTTestGCC',
        'title': 'SMaHT Test GCC',
        'code': TEST_SUBMISSION_CENTER_CODE,
    }
    return post_item_and_return_location(testapp, item, 'submission_center')


@pytest.fixture
def test_second_submission_center(testapp):
    """ Tests the posting of a submission center """
    item = {
        'identifier': 'SecondSMaHTTestGCC',
        'title': 'Second SMaHT Test GCC',
        'code': TEST_SECOND_SUBMISSION_CENTER_CODE,
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
def test_protected_consortium(testapp):
    """ Tests the posting of a consortium """
    item = {
        'identifier': 'SMaHTProtectedConsortium',
        'title': 'SMaHT Protected Test Consortium'
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
def blank_user(testapp):
    item = {
        'first_name': 'Unaffiliated',
        'last_name': 'User',
        'email': 'unaffiliated@example.org',
        'status': 'current'
    }
    # User @@object view has keys omitted.
    return post_item_and_return_location(testapp, item, 'user')


@pytest.fixture
def smaht_gcc_user(testapp, test_submission_center, test_consortium):
    """ A GCC user would be a consortia member and a submission center member """
    item = {
        'first_name': 'Test',
        'last_name': 'User',
        'email': 'gcc_user@example.org',
        'status': 'current',
        'submission_centers': [
            test_submission_center['uuid']
        ],
        'consortia': [
            test_consortium['uuid']
        ],
        'submits_for': [
            test_submission_center['uuid']
        ],
        'uuid': '47be2cf5-4e19-47ff-86cb-b7b3c4188308'
    }
    return post_item_and_return_location(testapp, item, 'user')


@pytest.fixture
def smaht_gcc_user_2(testapp, test_second_submission_center, test_consortium):
    """ A GCC user would be a consortia member and a submission center member """
    item = {
        'first_name': 'Test2',
        'last_name': 'User',
        'email': 'gcc_user2@example.org',
        'status': 'current',
        'submission_centers': [
            test_second_submission_center['uuid']
        ],
        'consortia': [
            test_consortium['uuid']
        ],
        'submits_for': [
            test_second_submission_center['uuid']
        ],
        'uuid': '47be2cf5-4e19-47ff-86cb-b7b3c4188309'
    }
    return post_item_and_return_location(testapp, item, 'user')


@pytest.fixture
def smaht_consortium_user(testapp, test_consortium):
    """ Simulates a user who is a member of the consortia """
    item = {
        'first_name': 'Test',
        'last_name': 'User',
        'email': 'consortium_user@example.org',
        'status': 'current',
        'consortia': [
            test_consortium['uuid']
        ],
        'uuid': '47be2cf5-4e19-47ff-86cb-b7b3c4188309'
    }
    return post_item_and_return_location(testapp, item, 'user')


@pytest.fixture
def smaht_consortium_protected_user(testapp, test_consortium, test_protected_consortium):
    """ Simulates a user with access to protected data """
    item = {
        'first_name': 'TestProtected',
        'last_name': 'User',
        'email': 'protected_user@example.org',
        'status': 'current',
        'consortia': [
            test_consortium['uuid'],
            test_protected_consortium['uuid']  # use of the protected consortia is obsolete but remains for
                                               # demonstration purposes if we do want to have "hidden" data
        ],
        'uuid': '47be2cf5-4e19-47ff-86cb-b7b3c4188310',
        'groups': [  # This group now indicates "protected" access via the ability to download restricted files
            'dbgap'
        ]
    }
    return post_item_and_return_location(testapp, item, 'user')


@pytest.fixture
def smaht_consortium_protected_submitter(testapp, test_consortium, test_protected_consortium,
                                         test_submission_center):
    """ Simulates a user with access to protected data who is part of a submission center """
    item = {
        'first_name': 'TestProtected',
        'last_name': 'User',
        'email': 'protected_user@example.org',
        'status': 'current',
        'submission_centers': [
            test_submission_center['uuid']
        ],
        'consortia': [
            test_consortium['uuid'],
            test_protected_consortium['uuid']
        ],
        'uuid': '47be2cf5-4e19-47ff-86cb-b7b3c4188310'
    }
    return post_item_and_return_location(testapp, item, 'user')


@pytest.fixture
def smaht_protected_gcc_user(testapp, test_submission_center, test_consortium, test_protected_consortium):
    """ A GCC user would be a consortia member and a submission center member """
    item = {
        'first_name': 'Test',
        'last_name': 'User',
        'email': 'user@example.org',
        'status': 'current',
        'submission_centers': [
            test_submission_center['uuid']
        ],
        'consortia': [
            test_consortium['uuid'],
            test_protected_consortium['uuid']
        ],
        'uuid': '47be2cf5-4e19-47ff-86cb-b7b3c4188311'
    }
    return post_item_and_return_location(testapp, item, 'user')


@pytest.fixture
def smaht_admin_app(testapp, smaht_admin):
    """ App associated with a consortia member who is a submitter """
    return remote_user_testapp(testapp.app, smaht_admin['uuid'])


@pytest.fixture
def submission_center_user_app(testapp, test_submission_center, smaht_gcc_user):
    """ App associated with a consortia member who is a submitter """
    return remote_user_testapp(testapp.app, smaht_gcc_user['uuid'])


@pytest.fixture
def submission_center2_user_app(testapp, test_second_submission_center, smaht_gcc_user_2):
    """ App associated with a consortia member who is a submitter """
    return remote_user_testapp(testapp.app, smaht_gcc_user_2['uuid'])


@pytest.fixture
def consortium_user_app(testapp, test_consortium, smaht_consortium_user):
    """ App associated with a normal consortia member """
    return remote_user_testapp(testapp.app, smaht_consortium_user['uuid'])


@pytest.fixture
def protected_consortium_user_app(testapp, smaht_consortium_protected_user, test_consortium, test_protected_consortium):
    """ App associated with a user who has access to consortia and protected data """
    return remote_user_testapp(testapp.app, smaht_consortium_protected_user['uuid'])


@pytest.fixture
def protected_consortium_submitter_app(testapp, smaht_consortium_protected_submitter, test_consortium,
                                       test_protected_consortium, test_submission_center):
    """ App associated with a user who has access to consortia and protected data and submission center """
    return remote_user_testapp(testapp.app, smaht_consortium_protected_submitter['uuid'])


@pytest.fixture
def unassociated_user_app(testapp, blank_user):
    """ App associated with a user who has no associations """
    return remote_user_testapp(testapp.app, blank_user['uuid'])


@pytest.fixture
def admin_user_app(testapp: TestApp, admin: Dict[str, Any]) -> TestApp:
    """ App associated with an admin user """
    return remote_user_testapp(testapp.app, admin['uuid'])


@pytest.fixture
def workflow(testapp: TestApp, test_consortium: Dict[str, Any]) -> Dict[str, Any]:
    item = {
        "name": "simply-the-best",
        "title": "A Great Workflow",
        "category": ["Annotation"],
        "consortia": [test_consortium["uuid"]],
    }
    return post_item_and_return_location(testapp, item, "workflow")


OUTPUT_FILE_UUID = "f99fe12f-79f9-4c2c-b0b5-07fc20d7ce1d"


@pytest.fixture
def output_file(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    file_formats: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    item = {
        "uuid": OUTPUT_FILE_UUID,
        "file_format": file_formats.get("BAM", {}).get("uuid", ""),
        "md5sum": "00000000000000000000000000000001",
        "filename": "my.bam",
        "status": "uploaded",
        "data_category": ["Sequencing Reads"],
        "data_type": ["Unaligned Reads"],
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


@pytest.fixture
def meta_workflow(
    testapp: TestApp, test_consortium: Dict[str, Any], workflow: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "consortia": [test_consortium["uuid"]],
        "name": "a_beautiful_workflow",
        "title": "A beauty",
        "category": ["Alignment"],
        "version": "1.0.0",
        "workflows": [
            {
                "name": "some_workflow",
                "workflow": workflow["uuid"],
                "input": [
                    {"argument_name": "arg1", "argument_type": "parameter"},
                ],
                "config": {"instance_type": ["c5.4xlarge"], "run_name": "some_workflow"},
            },
        ]
    }
    return post_item_and_return_location(testapp, item, "MetaWorkflow")


@pytest.fixture
def higlass_view_config(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "consortia": [test_consortium["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "identifier": "some_view_config",
        "title": "A great view config",
        "view_config": {
            "whatever props": "anything",
        },
        "instance_height": 500,
    }
    return post_item(testapp, item, "HiglassViewConfig")


@pytest.fixture
def donor_properties(test_second_submission_center: Dict[str, Any]) -> Dict[str, Any]:
    """Donor properties not added to database.

    Useful for testing posting permissions.
    """
    return {
        "submission_centers": [test_second_submission_center["uuid"]],
        "submitted_id": f"{TEST_SECOND_CENTER_SUBMITTED_ID_CODE}_DONOR_1234",
        "age": 35,
        "sex": "Male",
    }


@pytest.fixture
def donor(testapp: TestApp, donor_properties: Dict[str, Any]) -> Dict[str, Any]:
    return post_item(testapp, donor_properties, "Donor")
