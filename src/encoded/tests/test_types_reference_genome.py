from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import get_item, post_item


@pytest.fixture
def reference_genome_properties(
    test_submission_center: Dict[str, Any]
) -> Dict[str, Any]:
    return {
        "identifier": "foo_bar_genome",
        "title": "GRCh32.foo",
        "submission_centers": [test_submission_center["uuid"]],
    }


@pytest.fixture
def reference_genome(
    testapp: TestApp, reference_genome_properties: Dict[str, Any]
) -> Dict[str, Any]:
    return post_item(testapp, reference_genome_properties, "ReferenceGenome")


def test_identifier_resource_path_in_collection(
    testapp: TestApp, reference_genome: Dict[str, Any]
):
    """Ensure 'identifier' is available resource path within collection."""
    identifier = reference_genome.get("identifier", "")
    get_item(testapp, identifier, collection="ReferenceGenome")


def test_post_permissions(
    anontestapp: TestApp,
    unassociated_user_app: TestApp,
    submission_center_user_app: TestApp,
    consortium_user_app: TestApp,
    testapp: TestApp,
    reference_genome_properties: Dict[str, Any],
) -> None:
    """Ensure add permissions scoped appropriately.

    Note: 422 (Unprocessable) instead of 403 (Forbidden) because of
    'identifier' permissions and requirement.
    """
    post_item(anontestapp, reference_genome_properties, "ReferenceGenome", status=422)
    post_item(
        unassociated_user_app,
        reference_genome_properties,
        "ReferenceGenome",
        status=422,
    )
    post_item(
        submission_center_user_app,
        reference_genome_properties,
        "ReferenceGenome",
        status=422,
    )
    post_item(
        consortium_user_app, reference_genome_properties, "ReferenceGenome", status=422
    )
    post_item(testapp, reference_genome_properties, "ReferenceGenome", status=201)
