import pytest
from webtest import TestApp

from .utils import (
    get_item,
)
pytestmark = [pytest.mark.workbook]


@pytest.mark.workbook
@pytest.mark.parametrize(
    "identifier, expected",
    [
        ("a87f640f-710c-4405-9965-b0e2e0d0573e", "Author One et al. (2025)"),
        ("b98f640f-710c-4405-9965-b0e2e0d0574f", "Author One and Author Two (2023)"),
        ("c09f640f-710c-4405-9965-b0e2e0d0575f", "Author One (2024)"),
    ],
)
def test_short_citation_calculated_property(
    es_testapp: TestApp,
    workbook: None,
    identifier, expected
) -> None:
    """Verify short_citation formatting calcprop from workbook data."""
    pub = get_item(
        es_testapp,
        identifier,
        collection="Publication"
    )
    assert pub.get('short_citation') == expected
