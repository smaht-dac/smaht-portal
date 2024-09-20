import pytest
from webtest import TestApp

from .utils import get_search


@pytest.mark.workbook
def test_tissues_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure tissues rev link works."""
    tissues_search = get_search(es_testapp, "?type=Donor&tissues.uuid!=No+value")
    assert tissues_search


@pytest.mark.workbook
def test_death_circumstances_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure death circumstances rev link works."""
    dc_search = get_search(es_testapp, "?type=Donor&death_circumstances.uuid!=No+value")
    assert dc_search


@pytest.mark.workbook
def test_demographic_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure demographic rev link works."""
    dc_search = get_search(es_testapp, "?type=Donor&demographic.uuid!=No+value")
    assert dc_search


@pytest.mark.workbook
def test_family_history_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure family history rev link works."""
    family_search = get_search(es_testapp, "?type=Donor&family_history.uuid!=No+value")
    assert family_search


@pytest.mark.workbook
def test_medical_history_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure family history rev link works."""
    medical_search = get_search(es_testapp, "?type=Donor&medical_history.uuid!=No+value")
    assert medical_search