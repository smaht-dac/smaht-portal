from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item


@pytest.fixture
def ontology_term(
    testapp: TestApp, test_consortium: Dict[str, Any], meta_workflow: Dict[str, Any]
) -> Dict[str, Any]:
    item = {
        "consortia": [test_consortium["uuid"]],
        "identifier": "ONTO:0000001",
        "title": "Great Term",
        "url": "https://foo.bar/ONTO:0000001",
    }
    return post_item(testapp, item, "OntologyTerm")


def test_ontology_term_post(ontology_term: Dict[str, Any]) -> None:
    """Ensure OntologyTerm properties POST."""
    pass
