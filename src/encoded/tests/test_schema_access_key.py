from typing import Any, Dict

from webtest.app import TestApp


def test_access_key_id_unique(testapp: TestApp, access_key: Dict[str, Any]) -> None:
    item_with_duplicate_access_key_id = {
        "access_key_id": access_key.get("access_key_id")
    }
    testapp.post_json("/AccessKey", item_with_duplicate_access_key_id, status=409)
