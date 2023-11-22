from typing import Any, Dict

from webtest.app import TestApp

from .utils import get_item


def test_email_resource_path(testapp: TestApp, admin: Dict[str, Any]) -> None:
    """Ensure 'email' is available resource path for User."""
    get_item(testapp, admin.get("email", ""), collection="User")
