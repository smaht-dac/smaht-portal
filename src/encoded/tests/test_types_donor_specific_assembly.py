import pytest
from webtest import TestApp

from .utils import get_insert_identifier_for_item_type, get_search


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
