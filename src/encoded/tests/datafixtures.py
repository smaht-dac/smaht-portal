import pytest


def post_item_and_return_location(testapp, item, resource_path):
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
