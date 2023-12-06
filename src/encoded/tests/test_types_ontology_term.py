from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import get_item, post_item


@pytest.fixture
def ontology_term_properties(test_submission_center: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "identifier": "ONTO:0000001",
        "title": "Foobar",
        "submission_centers": [test_submission_center["uuid"]],
    }


@pytest.fixture
def ontology_term(
    testapp: TestApp, ontology_term_properties: Dict[str, Any]
) -> Dict[str, Any]:
    return post_item(testapp, ontology_term_properties, "OntologyTerm")


def test_identifier_resource_path_in_collection(
    testapp: TestApp, ontology_term: Dict[str, Any]
):
    """Ensure 'identifier' is available resource path within collection."""
    identifier = ontology_term.get("identifier", "")
    get_item(testapp, identifier, collection="OntologyTerm")


def test_post_permissions(
    anontestapp: TestApp,
    unassociated_user_app: TestApp,
    submission_center_user_app: TestApp,
    consortium_user_app: TestApp,
    testapp: TestApp,
    ontology_term_properties: Dict[str, Any],
) -> None:
    """Ensure add permissions scoped appropriately.

    Note: 422 (Unprocessable) instead of 403 (Forbidden) because of
    'identifier' permissions and requirement.
    """
    post_item(anontestapp, ontology_term_properties, "OntologyTerm", status=422)
    post_item(
        unassociated_user_app,
        ontology_term_properties,
        "OntologyTerm",
        status=422,
    )
    post_item(
        submission_center_user_app,
        ontology_term_properties,
        "OntologyTerm",
        status=422,
    )
    post_item(consortium_user_app, ontology_term_properties, "OntologyTerm", status=422)
    post_item(testapp, ontology_term_properties, "OntologyTerm", status=201)
