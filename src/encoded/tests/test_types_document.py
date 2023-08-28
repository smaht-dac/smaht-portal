from webtest import TestApp


def test_document_post(testapp: TestApp) -> None:
    properties = {
        "urls": ["https://foo.bar"],
        "description": "Some document",
        "notes": "Testing, testing",
    }
    testapp.post_json("/document", properties, status=200)
