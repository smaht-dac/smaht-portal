import pytest
from webtest import TestApp

from .utils import get_item


@pytest.mark.workbook
def test_submitted_id_resource_path(es_testapp: TestApp, workbook: None) -> None:
    """Ensure submitted_id is resource path for cell culture within
    SampleSource and CellCulture collections.
    """
    get_item(
        es_testapp,
        "TEST_CELL-CULTURE-MIXTURE_HELA-HEK293",
        collection="SampleSource",
        status=301,
    )
    get_item(
        es_testapp,
        "TEST_CELL-CULTURE-MIXTURE_HELA-HEK293",
        collection="CellCulture",
        status=301,
    )
