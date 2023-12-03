from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import get_item, post_item


@pytest.fixture
def access_key_properties() -> Dict[str, Any]:
    return {
        "description": "Some access key",
    }


def test_access_key_id_resource_path(
    testapp: TestApp, access_key: Dict[str, Any]
) -> None:
    """Ensure 'access_key_id' is available resource path."""
    access_key_id = access_key.get("access_key_id", "")
    get_item(testapp, access_key_id, collection="AccessKey")


def test_post_permissions(
    anontestapp: TestApp,
    unassociated_user_app: TestApp,
    submission_center_user_app: TestApp,
    consortium_user_app: TestApp,
    testapp: TestApp,
    access_key_properties: Dict[str, Any],
) -> None:
    """Ensure add permissions scoped appropriately."""
    post_item(anontestapp, access_key_properties, "AccessKey", status=403)
    post_item(unassociated_user_app, access_key_properties, "AccessKey", status=201)
    post_item(submission_center_user_app, access_key_properties, "AccessKey", status=201)
    post_item(consortium_user_app, access_key_properties, "AccessKey", status=201)
    post_item(testapp, access_key_properties, "AccessKey", status=201)
