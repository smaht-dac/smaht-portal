from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import assert_keys_conflict, patch_item, post_item


def make_publication(
    consortium: Dict[str, Any], doi: str, **kwargs: Any
) -> Dict[str, Any]:
    return {
        "doi": doi,
        "title": f"Publication {doi}",
        "authors": [{"first_name": "Author", "last_name": "One"}],
        "scope": "Network",
        "consortia": [consortium["uuid"]],
        **kwargs,
    }


@pytest.fixture
def publication(
    testapp: TestApp, test_consortium: Dict[str, Any]
) -> Dict[str, Any]:
    item = make_publication(test_consortium, "10.1011/test_doi_unique")
    return post_item(testapp, item, "Publication")


def test_doi_unique(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    publication: Dict[str, Any],
) -> None:
    """Ensure doi unique across publications on POST."""
    item_with_duplicate_doi = make_publication(test_consortium, publication["doi"])
    response = post_item(
        testapp, item_with_duplicate_doi, "Publication", status=409
    )
    assert_keys_conflict(response)


def test_doi_unique_on_patch(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    publication: Dict[str, Any],
) -> None:
    """Ensure doi unique across publications on PATCH."""
    other = post_item(
        testapp,
        make_publication(test_consortium, "10.1011/test_doi_other"),
        "Publication",
    )
    response = patch_item(
        testapp, {"doi": publication["doi"]}, other["uuid"], status=409
    )
    assert_keys_conflict(response)


def test_doi_released_after_change(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    publication: Dict[str, Any],
) -> None:
    """Ensure an old doi moved to previous_dois can be reused as a doi."""
    old_doi = publication["doi"]
    patch_item(
        testapp,
        {"doi": "10.1011/test_doi_new", "previous_dois": [old_doi]},
        publication["uuid"],
    )
    post_item(testapp, make_publication(test_consortium, old_doi), "Publication")


def test_previous_dois_unique_items(
    testapp: TestApp, test_consortium: Dict[str, Any]
) -> None:
    """Ensure previous_dois rejects duplicate entries within the array."""
    item = make_publication(
        test_consortium,
        "10.1011/test_doi_dup_previous",
        previous_dois=["10.1011/test_doi_prev", "10.1011/test_doi_prev"],
    )
    post_item(testapp, item, "Publication", status=422)


def test_previous_dois_not_unique_across_items(
    testapp: TestApp, test_consortium: Dict[str, Any]
) -> None:
    """Ensure the same previous doi may appear on multiple publications."""
    for doi in ["10.1011/test_doi_a", "10.1011/test_doi_b"]:
        item = make_publication(
            test_consortium, doi, previous_dois=["10.1011/test_doi_shared_prev"]
        )
        post_item(testapp, item, "Publication")


@pytest.mark.parametrize(
    "post_body,status",
    [
        (
            {
                "doi": "10.1011/test_author_info_valid",
                "title": "Publication With Author Info",
                "authors": [
                    {
                        "first_name": "Author",
                        "last_name": "One",
                        "author_info": [
                            "co-first author",
                            "co-corresponding author",
                        ],
                    }
                ],
                "scope": "Network",
            },
            201,
        ),
        (
            {
                "doi": "10.1011/test_author_info_invalid",
                "title": "Publication With Invalid Author Info",
                "authors": [
                    {
                        "first_name": "Author",
                        "last_name": "One",
                        "author_info": ["lead author"],
                    }
                ],
                "scope": "Network",
            },
            422,
        ),
    ],
)
def test_author_info_schema(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    post_body: Dict[str, Any],
    status: int,
) -> None:
    """Ensure publication author_info accepts only the supported enum values."""
    publication = {
        **post_body,
        "consortia": [test_consortium["uuid"]],
    }
    assert post_item(testapp, publication, "Publication", status=status)
