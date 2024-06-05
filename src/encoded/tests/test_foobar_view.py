from typing import Any, Dict, Union
from ..foo_bar import FooBarViews
import pytest
from webtest.app import TestApp
from pyramid import testing


@pytest.mark.parametrize(
    "input_request,expected_response", 
    [
        ("", b'Neither foo nor bar'),
        ("tfoo", b'bar'),
        ("barrty", b'foo'),
        ("foobar", b'You hit the lottery')
    ]
)
def test_foobar(testapp: TestApp, 
                input_request: str,
                  expected_response
                ) -> None:
    """Tests foo_bar response"""
    request = testing.DummyRequest()
    request.GET['name'] = input_request
    inst = FooBarViews(request)
    response = inst.foo_bar()
    assert expected_response in response.body

@pytest.mark.parametrize(
    "input_request,expected_response", 
    [
        ({'foo': 5, 'bar': 11}, b'16'),
        ({'foo': 5, 'bar': -11}, b'Invalid Response: Sum of values is negative'),
        ({'foo': "5", 'bar': "11"}, b'Invalid Response: Values are not integers'),
    ]
)
def test_foobar_post(testapp: TestApp,
                     input_request: Dict[str, Any],
                     expected_response):
        """Tests post for foo_bar_post."""
        request = testing.DummyRequest()
        request.POST['body'] = input_request
        inst = FooBarViews(request)
        response = inst.foo_bar_post()
        assert expected_response in response.body
