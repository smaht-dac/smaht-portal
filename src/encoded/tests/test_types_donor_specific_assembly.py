import pytest
from webtest import TestApp
from typing import Dict, Any

from .utils import get_insert_identifier_for_item_type, get_search, get_item

####### FIXTURE TESTS ##### 
def test_sequence_files_rev_link(
    testapp: TestApp,
    test_chain_file: Dict[str, Any],
    test_sequence_file: Dict[str, Any],
    donor_specific_assembly: Dict[str, Any]
) -> None:
    """Ensure sequence files rev link works."""
    item = get_item(
        testapp,
        donor_specific_assembly["uuid"],
        collection="DonorSpecificAssembly",
        frame="object"
    )
    assert len(item.get("sequence_files","")) == 1


def test_supplementary_files_rev_link(
    testapp: TestApp,
    test_chain_file: Dict[str, Any],
    test_sequence_file: Dict[str, Any],
    donor_specific_assembly: Dict[str, Any]
) -> None:
    """Ensure sequence files rev link works."""
    item = get_item(
        testapp,
        donor_specific_assembly["uuid"],
        collection="DonorSpecificAssembly",
        frame="object"
    )
    assert len(item.get("supplementary_files","")) == 1


def test_cell_lines_calc_prop(
    donor_specific_assembly: Dict[str, Any]
) -> None:
    """Ensure the cell line calcprop works."""
    assert len(donor_specific_assembly.get("cell_lines",[])) == 1


def test_donors_calc_prop(
    donor_specific_assembly: Dict[str, Any]
) -> None:
    """Ensure the cell line calcprop works."""
    assert len(donor_specific_assembly.get("donors",[])) == 1

####### WORKBOOK TESTS #####

@pytest.mark.workbook
def test_searchable_as_reference_genome(es_testapp: TestApp, workbook: None) -> None:
    """Ensure DonorSpecificAssemblies can be searched in ReferenceGenome.
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
def test_dsa_reference_genome_collection(es_testapp: TestApp, workbook: None) -> None:
    """Ensure DonorSpecificAssemblies can be found in the ReferenceGenome collection.
    """

    uuid = get_insert_identifier_for_item_type(
        es_testapp,
        "DonorSpecificAssembly"
    )
    get_item(
        es_testapp,
        uuid,
        collection="ReferenceGenome",
        status=301
    )


@pytest.mark.workbook
def test_es_sequence_files_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure sequence files rev link works."""
    fa_file_set_search = get_search(
        es_testapp,
        "?type=DonorSpecificAssembly&sequence_files.uuid!=No+value"
    )
    assert fa_file_set_search


@pytest.mark.workbook
def test_es_supplementary_files_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure chain files rev link works."""
    supp_file_set_search = get_search(
        es_testapp,
        "?type=DonorSpecificAssembly&supplementary_files.uuid!=No+value"
    )
    assert supp_file_set_search


@pytest.mark.workbook
def test_es_donors_calc_prop(es_testapp: TestApp, workbook: None) -> None:
    """Ensure donors calcprop works."""
    uuid=get_insert_identifier_for_item_type(es_testapp,"DonorSpecificAssembly")
    dsa=get_item(
        es_testapp,
        uuid,
        collection='DonorSpecificAssembly',
    )
    assert len(dsa.get("donors",[])) == 1


@pytest.mark.workbook
def test_es_cell_lines_calc_prop(es_testapp: TestApp, workbook: None) -> None:
    """Ensure the cell line calcprop works."""
    uuid=get_insert_identifier_for_item_type(es_testapp,"DonorSpecificAssembly")
    dsa=get_item(
        es_testapp,
        uuid,
        collection='DonorSpecificAssembly',
        frame="object"
    )
    assert len(dsa.get("cell_lines",[])) == 1

