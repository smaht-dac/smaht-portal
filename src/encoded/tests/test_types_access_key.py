from typing import Any, Dict

from webtest.app import TestApp


def test_access_key_id_resource_path(
    testapp: TestApp, access_key: Dict[str, Any]
) -> None:
    testapp.get(f"/access-keys/{access_key.get('access_key_id')}/", status=301)
