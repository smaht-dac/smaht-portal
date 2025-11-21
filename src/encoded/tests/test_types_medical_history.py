import pytest
from webtest import TestApp

from .utils import (
    get_search
)


@pytest.mark.workbook
def test_exposures_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure exposures rev link works."""
    mh_search = get_search(
        es_testapp,
        "?type=MedicalHistory&exposures!=No+value"
    )
    assert mh_search


@pytest.mark.workbook
def test_diagnoses_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure diagnoses rev link works."""
    mh_search = get_search(
        es_testapp,
        "?type=MedicalHistory&diagnoses!=No+value"
    )
    assert mh_search


@pytest.mark.workbook
def test_medical_treatments_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure medical treatments rev link works."""
    mh_search = get_search(
        es_testapp,
        "?type=MedicalHistory&medical_treatments!=No+value"
    )
    assert mh_search