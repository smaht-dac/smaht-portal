from typing import Any, Dict

from webtest import TestApp


def test_document_post(testapp: TestApp, test_consortium: Dict[str, Any]) -> None:
    properties = {
        "consortia": [test_consortium["uuid"]],
        "description": "Some document",
    }
    testapp.post_json("/document", properties, status=201)
