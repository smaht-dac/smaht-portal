import pytest


@pytest.fixture
def admin(testapp):
    item = {
        'first_name': 'Test',
        'last_name': 'Admin',
        'email': 'admin@example.org',
        'groups': ['admin'],
        'status': 'current'
    }
    # User @@object view has keys omitted.
    res = testapp.post_json('/user', item)
    return testapp.get(res.location).json


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
    res = testapp.post_json('/smaht-user', item)
    return testapp.get(res.location).json


def test_types_user_succeeds(testapp, admin):
    """ Tests that we can load a user into the system using by posting to the snovault user """
    assert testapp.get(f'/users/{admin["email"]}', status=200)


def test_types_smaht_user_succeeds(testapp, smaht_admin):
    """ Tests that we can load a user into the system by posting to the smaht user """
    assert testapp.get(f'/smaht-users/{smaht_admin["email"]}', status=200)
