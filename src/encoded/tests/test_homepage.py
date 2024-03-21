import pytest


def test_home_page_static(testapp):
    # XXX: this is just to test the route works. will be updated with more later
    home = testapp.get('/home').json
    assert '@graph' in home
