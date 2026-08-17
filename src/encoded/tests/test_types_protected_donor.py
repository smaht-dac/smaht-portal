import pytest
from webtest import TestApp


from .utils import (
    get_search
)


PROTECTED_METADATA_TYPES = [
    ("Demographic", "DEMOGRAPHIC", {}),
    ("DeathCircumstances", "DEATH-CIRCUMSTANCES", {}),
    (
        "FamilyHistory",
        "FAMILY-HISTORY",
        {"disease": "Pulmonary Fibrosis", "relatives": ["Father"]},
    ),
    ("MedicalHistory", "MEDICAL-HISTORY", {}),
    ("TissueCollection", "TISSUE-COLLECTION", {}),
]


def _protected_metadata_body(item_code, suffix, donor, extra_properties=None):
    body = {
        "submitted_id": f"TEST_{item_code}_{suffix}",
        "submission_centers": ["smaht"],
        "donor": donor,
    }
    if extra_properties:
        body.update(extra_properties)
    return body

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


@pytest.mark.workbook
@pytest.mark.parametrize("item_type,item_code,extra_properties", PROTECTED_METADATA_TYPES)
def test_protected_metadata_rejects_unprotected_donor(
    es_testapp: TestApp,
    workbook: None,
    item_type: str,
    item_code: str,
    extra_properties: dict,
) -> None:
    """Protected metadata items must not link their donor field to plain Donor."""
    body = _protected_metadata_body(
        item_code,
        f"UNPROTECTED-{item_code}",
        "TEST_DONOR_MALE",
        extra_properties,
    )
    response = es_testapp.post_json(f"/{item_type}", body, status=422)
    assert "ProtectedDonor" in str(response.json)


@pytest.mark.workbook
@pytest.mark.parametrize("item_type,item_code,extra_properties", PROTECTED_METADATA_TYPES)
def test_protected_metadata_accepts_protected_donor(
    es_testapp: TestApp,
    workbook: None,
    item_type: str,
    item_code: str,
    extra_properties: dict,
) -> None:
    """Protected metadata items can link their donor field to ProtectedDonor."""
    body = _protected_metadata_body(
        item_code,
        f"PROTECTED-{item_code}",
        "TEST_PROTECTED-DONOR_MALE",
        extra_properties,
    )
    es_testapp.post_json(f"/{item_type}", body, status=201)


@pytest.mark.workbook
def test_protected_metadata_donor_check_skips_for_check_only_skip_links(
    es_testapp: TestApp,
    workbook: None,
) -> None:
    """Server validation-only paths use check_only + skip_links for compatibility."""
    body = _protected_metadata_body(
        "DEMOGRAPHIC",
        "CHECK-ONLY-SKIP-LINKS-UNPROTECTED",
        "TEST_DONOR_MALE",
    )
    es_testapp.post_json(
        "/Demographic?check_only=true&skip_links=true",
        body,
        status=200,
    )


@pytest.mark.workbook
def test_protected_metadata_donor_check_does_not_skip_for_skip_links_write(
    es_testapp: TestApp,
    workbook: None,
) -> None:
    """skip_links=true alone is rejected before any DB-writing validation can be bypassed."""
    body = _protected_metadata_body(
        "DEMOGRAPHIC",
        "SKIP-LINKS-WRITE-UNPROTECTED",
        "TEST_DONOR_MALE",
    )
    response = es_testapp.post_json("/Demographic?skip_links=true", body, status=400)
    assert "check_only=true" in response.json["detail"]


@pytest.mark.workbook
def test_validate_false_does_not_bypass_protected_metadata_donor_check(
    es_testapp: TestApp,
    workbook: None,
) -> None:
    """validate=false must not allow creating protected metadata on a plain Donor."""
    body = _protected_metadata_body(
        "DEMOGRAPHIC",
        "BAD-EDIT-UNPROTECTED",
        "TEST_DONOR_MALE",
    )
    response = es_testapp.post_json(
        "/Demographic?validate=false", body, status=422
    )
    assert "ProtectedDonor" in str(response.json)
