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