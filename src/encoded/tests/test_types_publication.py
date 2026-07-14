import pytest
from webtest import TestApp

from .utils import get_item


pytestmark = [pytest.mark.workbook]


@pytest.mark.parametrize(
    "identifier, expected",
    [
        ("a87f640f-710c-4405-9965-b0e2e0d0573e", "One et al. (2025)"),
        ("b98f640f-710c-4405-9965-b0e2e0d0574f", "One and Two (2023)"),
        ("c09f640f-710c-4405-9965-b0e2e0d0575f", "One (2024)"),
    ],
)
def test_short_citation_calculated_property(
    es_testapp: TestApp,
    workbook: None,
    identifier,
    expected,
) -> None:
    """Verify short_citation formatting calcprop from workbook data."""
    pub = get_item(es_testapp, identifier, collection="Publication")
    assert pub.get("short_citation") == expected


def test_citation_and_author_info(es_testapp: TestApp, workbook: None) -> None:
    """Verify citation formatting remains unchanged and author_info is stored."""
    pub = get_item(
        es_testapp,
        "a87f640f-710c-4405-9965-b0e2e0d0573e",
        collection="Publication",
    )

    assert pub.get("citation") == (
        "One, A., Two, A., & Three, A. (2025). "
        "Test Publication One. Test Journal. https://doi.org/10.1011/test_doi_1"
    )
    assert pub["authors"][0]["author_info"] == [
        "co-first author",
        "corresponding author",
    ]
