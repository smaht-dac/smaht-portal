from typing import Any, Dict

import pytest
from pyramid.router import Router

from .utils import get_upgrader


@pytest.mark.parametrize(
    "library_preparation,expected",
    [
        ({"schema_version": "1"}, {"schema_version": "2"}),
        (
            {"schema_version": "1", "cell_sorting_method": "Size Selection"},
            {"schema_version": "2", "cell_selection_method": "Size Selection"},
        ),
    ],
)
def test_upgrade_library_preparation_1_2(
    library_preparation: Dict[str, Any], expected: Dict[str, Any], app: Router
) -> None:
    """Test library_preparation upgrader from version 1 to 2."""
    upgrader = get_upgrader(app)
    assert (
        upgrader.upgrade("library_preparation", library_preparation, current_version="1", target_version="2")
        == expected
    )