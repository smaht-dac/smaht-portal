import pytest
from typing import Any, Dict
from webtest import TestApp


def test_document_post_with_consortia(testapp: TestApp, test_consortium: Dict[str, Any]) -> None:
    properties = {
        "consortia": [test_consortium["uuid"]],
        "description": "Some document",
    }
    testapp.post_json("/document", properties, status=201)


def test_document_post_with_submission_center(testapp: TestApp, test_submission_center: Dict[str, Any]) -> None:
    properties = {
        "submission_centers": [test_submission_center["uuid"]],
        "description": "Some document",
    }
    testapp.post_json("/document", properties, status=201)


def test_document_post_with_both_attribution(testapp: TestApp, test_consortium: Dict[str, Any],
                                             test_submission_center: Dict[str, Any]) -> None:
    properties = {
        "submission_centers": [test_submission_center["uuid"]],
        "consortia": [test_consortium["uuid"]],
        "description": "Some document",
    }
    testapp.post_json("/document", properties, status=201)


@pytest.mark.parametrize('item', [
    {
        'description': 'no attribution'
    },
])
def test_document_failure(testapp: TestApp, test_consortium: Dict[str, Any],
                          test_submission_center: Dict[str, Any], item) -> None:
    """ Test any failure cases for document """
    testapp.post_json('/document', item, status=422)
