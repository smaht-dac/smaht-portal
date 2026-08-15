from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import post_item


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
                "consortia": ["smaht"],
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
                "consortia": ["smaht"],
            },
            422,
        ),
    ],
)
def test_author_info_schema(
    testapp: TestApp, post_body: Dict[str, Any], status: int
) -> None:
    """Ensure publication author_info accepts only the supported enum values."""
    assert post_item(testapp, post_body, "Publication", status=status)
