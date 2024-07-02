import pytest
from webtest import TestApp

from .utils import get_insert_identifier_for_item_type, get_search, get_item


@pytest.mark.workbook
def test_searchable_as_reference_genome(es_testapp: TestApp, workbook: None) -> None:
    """Ensure DonorSpecificAssemblies can searched in ReferenceGenome.
    """

    uuid = get_insert_identifier_for_item_type(
        es_testapp,
        "DonorSpecificAssembly"
    )

    get_search(
        es_testapp,
        f"/search/?type=ReferenceGenome&uuid={uuid}",
        status=200
    )


@pytest.mark.workbook
def test_sequence_files_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure sequence files rev link works."""
    fa_file_set_search = get_search(es_testapp, "?type=DonorSpecificAssembly&sequence_files.uuid!=No+value")
    assert fa_file_set_search


@pytest.mark.workbook
def test_chain_files_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure chain files rev link works."""
    chain_file_set_search = get_search(es_testapp, "?type=DonorSpecificAssembly&chain_files.uuid!=No+value")
    assert chain_file_set_search


@pytest.mark.workbook
def test_donors_calc_prop(es_testapp: TestApp, workbook: None) -> None:
    """Ensure donors calcprop works."""
    uuid=get_insert_identifier_for_item_type(es_testapp,"DonorSpecificAssembly")
    dsa=get_item(
        es_testapp,
        uuid,
        collection='DonorSpecificAssembly'
    )
    assert len(dsa.get("donors",[])) == 2


@pytest.mark.workbook
def test_cell_lines_calc_prop(es_testapp: TestApp, workbook: None) -> None:
    """Ensure the cell line calcprop works."""
    uuid=get_insert_identifier_for_item_type(es_testapp,"DonorSpecificAssembly")
    dsa=get_item(
        es_testapp,
        uuid,
        collection='DonorSpecificAssembly'
    )
    assert len(dsa.get("cell_lines",[])) == 2