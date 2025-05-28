from typing import Any, Dict, List, Optional

import pytest
from webtest import TestApp
from .utils import get_search, post_item_and_return_location
from ..item_utils.ontology_term import get_top_grouping_term
from ..item_utils.utils import RequestHandler
from ..item_utils.item import get_tags

# @pytest.fixture
# def liver_ontology_term(
#     testapp: TestApp,
#     test_consortium: Dict[str, Any],
#     test_ontology: Dict[str, Any],
#     endoderm_ontology: Dict[str, Any]
# ):
#     item = {
#         "uuid": "69ac1b9e-b76d-4d41-90b9-aec992024929",
#         "identifier": "UBERON:0002107",
#         "ontologies": [
#             test_ontology["uuid"]
#         ],
#         "title": "liver",
#         "grouping_term": endoderm_ontology["uuid"],
#         "consortia": [
#             test_consortium["uuid"]
#         ],
#         "preferred_name": "Liver",
#         "tags":[
#             "test_terms",
#             "test_top_terms-Endoderm",
#             "tissue_type_test_top_terms-Liver",
#             "germ_layer_test_top_terms-Endoderm",
#             "tissue_type"
#         ]
#     }
#     return post_item_and_return_location(testapp, item, 'ontology_term')

# @pytest.fixture
# def endoderm_ontology_term(
#     testapp: TestApp,
#     test_consortium: Dict[str, Any],
#     test_ontology: Dict[str, Any],
# ): 
#     item = {
#         "uuid": "b20b2257-1d5b-4015-8182-cce79e4f6235",
#         "identifier": "UBERON:0000925",
#         "ontologies": [
#             test_ontology["uuid"]
#         ],
#         "title": "endoderm",
#         "consortia": [
#             test_consortium["uuid"]
#         ],
#         "preferred_name": "Endoderm",
#         "tags": [
#             "germ_layer"
#         ]
#     }
#     return post_item_and_return_location(testapp, item, 'ontology_term')

@pytest.mark.workbook
@pytest.mark.parametrize(
   "tag",
    [
        ("germ_layer"),
        ("tissue_type"),
        ("random"),
        (""),
    ],
)
def test_get_top_grouping_term(
    es_testapp: TestApp,
    workbook: None,
    tag: str,
) -> None:
    """Test function to grab top grouping term from OntologyTerm."""

    ont_search = get_search(es_testapp, "?type=OntologyTerm&tags=test_terms")
    assert ont_search

    request_handler = RequestHandler(test_app=es_testapp)
    for term in ont_search:
        expected = get_expected_top_grouping_term(term, tag)
        result = get_top_grouping_term(term, request_handler, tag)
        assert result == expected


def get_expected_top_grouping_term(term: Dict[str, Any], tag: Optional[str] = None) -> List[str]:
    """Get expected top grouping term from the ontology terms from tags.

    A little cheeky, but simplifies testing to have expected values
    directly on the inserts.
    """
    expected_ont_top_tag_start = "test_top_terms-"
    if tag:
        expected_ont_top_tag_start = f"{tag}_"+expected_ont_top_tag_start
    tags = get_tags(term)
    import pdb; pdb.set_trace()
    expected_ont_top_tags = [
        tag for tag in tags if tag.startswith(expected_ont_top_tag_start)
    ]
    return [
        value
        for tag in expected_ont_top_tags
        for value in tag.split(expected_ont_top_tag_start)[1].split("|")
    ][0]