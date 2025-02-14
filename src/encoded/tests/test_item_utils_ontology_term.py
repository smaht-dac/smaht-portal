from typing import Any, Dict, List

import pytest
from webtest import TestApp
from .utils import get_search
from ..item_utils.ontology_term import get_top_grouping_term
from ..item_utils.utils import RequestHandler
from ..item_utils.item import get_tags

@pytest.mark.workbook
def test_get_top_grouping_term(es_testapp: TestApp, workbook: None) -> None:
    """Test function to grab top grouping term from OntologyTerm."""

    ont_search = get_search(es_testapp, "?type=OntologyTerm&tags=test_terms")
    assert ont_search

    request_handler = RequestHandler(test_app=es_testapp)
    for term in ont_search:
        result = get_top_grouping_term(term, request_handler)
        expected = get_expected_top_grouping_term(term)
        assert result == expected


def get_expected_top_grouping_term(term: Dict[str, Any]) -> List[str]:
    """Get expected top grouping term from the ontology terms from tags.

    A little cheeky, but simplifies testing to have expected values
    directly on the inserts.
    """
    expected_ont_top_tag_start = "test_top_terms-"
    tags = get_tags(term)
    expected_ont_top_tags = [
        tag for tag in tags if tag.startswith(expected_ont_top_tag_start)
    ]
    return [
        value
        for tag in expected_ont_top_tags
        for value in tag.split(expected_ont_top_tag_start)[1].split("|")
    ][0]