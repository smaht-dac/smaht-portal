from typing import Any, Dict

from webtest.app import TestApp


def test_email_resource_path(testapp: TestApp, admin: Dict[str, Any]) -> None:
    """Ensure email is available resource path for User."""
    testapp.get(f"/users/{admin['email']}/", status=301)
