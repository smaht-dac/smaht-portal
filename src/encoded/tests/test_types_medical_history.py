import pytest
from webtest import TestApp

from .utils import get_search


@pytest.mark.workbook
def test_diagnosis_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure diagnosis rev link works."""
    diagnosis_search = get_search(es_testapp, "?type=MedicalHistory&diagnosis.uuid!=No+value")
    assert diagnosis_search


@pytest.mark.workbook
def test_exposure_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure exposure rev link works."""
    exposure_search = get_search(es_testapp, "?type=MedicalHistory&exposure.uuid!=No+value")
    assert exposure_search


@pytest.mark.workbook
def test_medical_treatment_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure medical treatment rev link works."""
    treatment_search = get_search(es_testapp, "?type=MedicalHistory&medical_treatment.uuid!=No+value")
    assert treatment_search