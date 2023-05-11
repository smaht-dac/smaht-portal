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


def test_types_user_succeeds(testapp, admin):
    """ Tests that we can load a user into the system using the snovault user """
    assert testapp.get(f'/user/{admin["email"]}', status=200)
