from webtest import TestApp
import pytest


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
        'email': 'admin@example.org',
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
    return post_item_and_return_location(testapp, item, 'smaht-user')


@pytest.fixture
def test_submission_center(testapp):
    """ Tests the posting of a submission center """
    item = {
        'name': 'SMaHT-Test-GCC',
        'title': 'SMahT Test GCC'
    }
    return post_item_and_return_location(testapp, item, 'submission-center')


@pytest.fixture
def test_consortium(testapp):
    """ Tests the posting of a consortium """
    item = {
        'name': 'SMaHT-Test-Consortium',
        'title': 'SMahT Test Consortium'
    }
    return post_item_and_return_location(testapp, item, 'consortium')
