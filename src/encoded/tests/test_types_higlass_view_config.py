from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import get_item, post_item


@pytest.fixture
def higlass_view_config_properties() -> Dict[str, Any]:
    return {
        "identifier": "foo_bar_config",
        "view_config": {"foo": "bar"},
    }


def test_identifier_resource_path(
    testapp: TestApp, higlass_view_config: Dict[str, Any]
) -> None:
    """Ensure 'identifier' is available resource path."""
    identifier = higlass_view_config.get("identifier", "")
    get_item(testapp, identifier, collection="HiglassViewConfig")


def test_post_permissions(
    anontestapp: TestApp,
    unassociated_user_app: TestApp,
    submission_center_user_app: TestApp,
    consortium_user_app: TestApp,
    testapp: TestApp,
    higlass_view_config_properties: Dict[str, Any],
) -> None:
    """Ensure add permissions scoped appropriately.

    Note: 422 (Unprocessable) instead of 403 (Forbidden) because of
    'identifier' permissions and requirement.
    """
    post_item(
        anontestapp, higlass_view_config_properties, "HiglassViewConfig", status=422
    )
    post_item(
        unassociated_user_app,
        higlass_view_config_properties,
        "HiglassViewConfig",
        status=422,
    )
    post_item(
        submission_center_user_app,
        higlass_view_config_properties,
        "HiglassViewConfig",
        status=422,
    )
    post_item(
        consortium_user_app,
        higlass_view_config_properties,
        "HiglassViewConfig",
        status=422,
    )
    post_item(testapp, higlass_view_config_properties, "HiglassViewConfig", status=201)
