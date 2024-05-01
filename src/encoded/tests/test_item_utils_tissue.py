from typing import Any, Dict

import pytest

from ..item_utils import constants
from ..item_utils.tissue import get_study


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, ""),
        ({"external_id": "FooBar"}, ""),
        ({"external_id": "ST001-1A"}, constants.BENCHMARKING_STUDY),
        ({"external_id": "SMHT001-1A"}, constants.PRODUCTION_STUDY),
    ],
)
def test_get_study(properties: Dict[str, Any], expected: str) -> None:
    """Test identification of benchmarking vs. production for tissue."""
    assert get_study(properties) == expected
