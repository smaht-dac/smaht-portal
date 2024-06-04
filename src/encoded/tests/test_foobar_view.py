from typing import Any, Dict

import unittest
from pyramid import testing
from webtest.app import TestApp

class FoobarViewTests(unittest.TestCase):
    def setUp(self):
        self.config = testing.setUp()

    def tearDown(self):
        testing.tearDown()

    def test_foobar_none(self):
        """Tests when neither foo nor bar is in query"""
        from ..foo_bar import FooBarViews

        request = testing.DummyRequest()
        inst = FooBarViews(request)
        response = inst.foo_bar()
        self.assertIn(b'Neither foo nor bar', response.body)

    def test_foo(self):
        """Tests when only foo is in query"""
        from ..foo_bar import FooBarViews

        request = testing.DummyRequest()
        request.GET['name'] = 'tfoo'
        inst = FooBarViews(request)
        response = inst.foo_bar()
        self.assertIn(b'bar', response.body)

    def test_bar(self):
        """Tests when only bar is in query"""
        from ..foo_bar import FooBarViews

        request = testing.DummyRequest()
        request.GET['name'] = 'bartty'
        inst = FooBarViews(request)
        response = inst.foo_bar()
        self.assertIn(b'foo', response.body)

    def test_foobar(self):
        """Tests when foo and bar are in query"""
        from ..foo_bar import FooBarViews

        request = testing.DummyRequest()
        request.GET['name'] = 'foobar'
        inst = FooBarViews(request)
        response = inst.foo_bar()
        self.assertIn(b'You hit the lottery', response.body)
