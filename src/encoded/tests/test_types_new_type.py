import pytest
from webtest import TestApp

from .utils import get_item
from ..item_utils import (
    new_type as new_type_utils,
    item as item_utils,
)


@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure identifier is available resource path for new type within collection.

    Note: Must match a New Type 'identifier' in temp-local-inserts
    """
    get_item(es_testapp, "NT1", collection="NewType", status=301)


# def test_submission_centers(
#         es_testapp: TestApp, workbook: None) -> None:
#     """Ensure 'submission_centers' calc prop working."""
#     expected = ["SMaHT Test Center"]
#     item = get_item(
#         es_testapp,
#         "NT1",
#         collection="NewType"
#     )
#     assert item.get("submission_centers","") == expected


def test_string_and_number_calc_prop(es_testapp: TestApp, workbook: None) -> None:
    """Ensure string_and_number calc prop gives expected value"""
    expected="Bar 31"
    item = get_item(
        es_testapp,
        "NT1",
        collection="NewType"
    )
    assert item.get("string_and_number","") == expected


def test_tissue_samples(es_testapp: TestApp, workbook: None) -> None:
    """Ensure 'tissue_samples' calc prop working.
    
    Expected values determined here by parsing file properties/embeds
    """
    expected=["TEST_TISSUE-SAMPLE_LIVER"]
    import pdb; pdb.set_trace()
    item = get_item(
        es_testapp,
        "NT1",
        collection="NewType"
    )
    #tissue_samples = new_type_utils.get_tissue_samples(item)
    display_title = item.get("tissue_samples_display_title",[])
    assert  display_title == expected