from typing import Any, Dict, List, Optional

import pytest
from webtest import TestApp
from ..item_utils.ontology_term import get_grouping_term_from_tag
from ..item_utils.utils import RequestHandler
from ..item_utils.item import get_tags


@pytest.mark.parametrize(
   "tag",
    [
        ("germ_layer"),
        ("tissue_type"),
        (""),
    ],
)
def test_get_grouping_term_from_tag(
    testapp: TestApp,
    test_ontology_term: Dict[str, Any],
    tag: str,
) -> None:
    """Test function to grab top grouping term from OntologyTerm."""
    request_handler = RequestHandler(test_app=testapp)
    expected = get_expected_grouping_term(test_ontology_term, tag)
    result = get_grouping_term_from_tag(test_ontology_term, request_handler, tag)
    assert result == expected


def get_expected_grouping_term(term: Dict[str, Any], tag: Optional[str] = None) -> List[str]:
    """Get expected top grouping term from the ontology terms from tags.

    A little cheeky, but simplifies testing to have expected values
    directly on the inserts.
    """
    expected_ont_top_tag_start = "test_top_terms-"
    if tag:
        expected_ont_top_tag_start = f"{tag}_"+expected_ont_top_tag_start
    tags = get_tags(term)
    expected_ont_top_tags = [
        tag for tag in tags if tag.startswith(expected_ont_top_tag_start)
    ]
    return [
        value
        for tag in expected_ont_top_tags
        for value in tag.split(expected_ont_top_tag_start)[1].split("|")
    ][0]