from typing import Any, Dict

from webtest.app import TestApp


def test_access_key_id_unique(testapp: TestApp, access_key: Dict[str, Any]) -> None:
    """Ensure that access_key_id is unique."""
    item_with_duplicate_access_key_id = {
        "access_key_id": access_key.get("access_key_id")
    }
    testapp.post_json("/AccessKey", item_with_duplicate_access_key_id, status=409)


def test_access_key_revision_history_not_tracked(
    testapp: TestApp, access_key: Dict[str, Any]
) -> None:
    """AccessKey opts out of Postgres revision-history tracking."""
    testapp.get(f'/{access_key["uuid"]}/@@revision-history', status=404)
