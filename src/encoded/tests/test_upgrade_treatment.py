from typing import Any, Dict

import pytest
from pyramid.router import Router

from .utils import get_upgrader


@pytest.mark.parametrize(
    "treatment,expected",
    [
        ({"schema_version": "1"}, {"schema_version": "2"}),
        (
            {"schema_version": "1", "agent": "EtOH"},
            {"schema_version": "2", "agents": ["EtOH"]},
        ),
    ],
)
def test_upgrade_treatment_1_2(
    treatment: Dict[str, Any], expected: Dict[str, Any], app: Router
) -> None:
    """Test treatment upgrader from version 1 to 2."""
    upgrader = get_upgrader(app)
    assert (
        upgrader.upgrade("treatment", treatment, current_version="1", target_version="2")
        == expected
    )