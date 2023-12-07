from typing import Any, Dict

from webtest.app import TestApp

from .utils import get_item


def test_access_key_id_resource_path(
    testapp: TestApp, access_key: Dict[str, Any]
) -> None:
    """Ensure 'access_key_id' is available resource path."""
    access_key_id = access_key.get("access_key_id", "")
    get_item(testapp, access_key_id, collection="AccessKey")
