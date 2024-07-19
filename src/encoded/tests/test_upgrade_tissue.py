from typing import Any, Dict

import pytest
from pyramid.router import Router

from .utils import get_upgrader

@pytest.mark.parametrize(
    "tissue,expected",
    [
        ({}, {"schema_version": "2"}),
        ({"recovery_interval": 123}, {"schema_version": "2"}),
    ],
)
def test_upgrade_tissue_2_3(
    app: Router, tissue: Dict[str, Any], expected: Dict[str, Any]
) -> None:
    """Test tissue upgrader from version 2 to 3."""
    upgrader = get_upgrader(app)
    assert (
        upgrader.upgrade(
            "tissue", tissue, current_version="2", target_version="3"
        )
        == expected
    )