from typing import Any, Dict

import pytest
from pyramid.router import Router

from .utils import get_upgrader

@pytest.mark.parametrize(
    "software,expected",
    [
        ({}, {"schema_version": "2"}),
        (
            {"gpu": "NVIDIA A100", "schema_version": "1"},
            {"gpu_architecture": "NVIDIA A100", "schema_version": "2"},
        ),
    ]
)
def test_upgrade_software_1_2(
    app: Router, software: Dict[str, Any], expected: Dict[str, Any]
) -> None:
    """Test software upgrader from version 1 to 2."""
    upgrader = get_upgrader(app)
    assert upgrader.upgrade(
        "software", software, current_version="1", target_version="2"
    ) == expected