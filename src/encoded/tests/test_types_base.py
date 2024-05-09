from typing import Any, Dict, List

import pytest
from webtest import TestApp

from .utils import get_item, get_search
from ..item_utils import item as item_utils
from ..server_defaults import ACCESSION_PREFIX


@pytest.mark.workbook
def test_get(es_testapp: TestApp, workbook: None) -> None:
    """Test item retrieval from collection via various lookup keys.

    Using files from workbooks for tests here, but could be any
    collection.
    """
    submitted_files_with_accessions = get_search(
        es_testapp, "?type=SubmittedFile&accession!=No+value"
    )  # Unique key should not be accession
    file_with_accession = get_item_with_smaht_accession(submitted_files_with_accessions)
    assert file_with_accession, "No file with SMaHT-style accession found in workbook."

    files_with_aliases = get_search(es_testapp, "?type=File&aliases!=No+value")
    file_with_alias = files_with_aliases[0]

    get_item(es_testapp, f"/files/{item_utils.get_uuid(file_with_accession)}")
    get_item(es_testapp, f"/files/{item_utils.get_accession(file_with_accession)}")
    get_item(es_testapp, f"/files/{item_utils.get_aliases(file_with_alias)[0]}")


def get_item_with_smaht_accession(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Return item with SMaHT-style accession.

    Many workbook items have test-style accessions, but these are not
    suitable for lookups.
    """
    for item in items:
        accession = item_utils.get_accession(item)
        if accession.startswith(ACCESSION_PREFIX):
            return item
    return {}
