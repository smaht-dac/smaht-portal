import pytest
from webtest import TestApp

from .utils import get_insert_identifier_for_item_type, get_item


@pytest.mark.workbook
def test_sample_sources_calc_prop(es_testapp: TestApp, workbook: None) -> None:
    """Ensure sample_sources calc prop works."""
    uuid=get_insert_identifier_for_item_type(es_testapp,"ExternalOutputFile")
    eof=get_item(
        es_testapp,
        uuid,
        collection='ExternalOutputFile',
    )
    assert len(eof.get("sample_sources",[])) == 1


@pytest.mark.workbook
def test_donors_calc_prop(es_testapp: TestApp, workbook: None) -> None:
    """Ensure donors calc prop works."""
    uuid=get_insert_identifier_for_item_type(es_testapp,"ExternalOutputFile")
    eof=get_item(
        es_testapp,
        uuid,
        collection='ExternalOutputFile',
    )
    assert len(eof.get("donors",[])) == 1