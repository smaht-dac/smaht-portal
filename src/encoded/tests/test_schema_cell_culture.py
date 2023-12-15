import pytest
from webtest import TestApp

from .utils import get_insert_identifier_for_item_type, patch_item


@pytest.mark.workbook
@pytest.mark.parametrize(
    "value,expected_status",
    [
        ("2019-01-01", 200),
        ("2019-01-01T00:00:00.000000+00:00", 200),
        ("20190101", 422),
    ]
)
def test_culture_harvest_date(
        value: str, expected_status: int, es_testapp: TestApp, workbook: None
) -> None:
    """Ensure property accepts date and date-time formats."""
    cell_culture_identifier = get_insert_identifier_for_item_type(
        es_testapp, "cell_culture"
    )
    patch_body = {"culture_harvest_date": value}
    patch_item(es_testapp, patch_body, cell_culture_identifier, status=expected_status)
