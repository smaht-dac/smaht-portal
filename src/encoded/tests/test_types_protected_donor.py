import pytest
from webtest import TestApp


from .utils import (
    get_search
)

@pytest.mark.workbook
def test_medical_history_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure medical_history rev link works."""
    donor_search = get_search(
        es_testapp,
        "?type=ProtectedDonor&medical_history!=No+value"
    )
    assert donor_search


@pytest.mark.workbook
def test_demographic_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure demographic rev link works."""
    donor_search = get_search(
        es_testapp,
        "?type=ProtectedDonor&demographic!=No+value"
    )
    assert donor_search


@pytest.mark.workbook
def test_death_circumstances_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure death circumstances rev link works."""
    donor_search = get_search(
        es_testapp,
        "?type=ProtectedDonor&death_circumstances!=No+value"
    )
    assert donor_search


@pytest.mark.workbook
def test_family_history_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure family history rev link works."""
    donor_search = get_search(
        es_testapp,
        "?type=ProtectedDonor&family_history!=No+value"
    )
    assert donor_search


@pytest.mark.workbook
def test_tissue_collection_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure tissue collection rev link works."""
    donor_search = get_search(
        es_testapp,
        "?type=ProtectedDonor&tissue_collection!=No+value"
    )
    assert donor_search