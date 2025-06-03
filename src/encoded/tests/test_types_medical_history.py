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
    assert len(mh_search) == 1