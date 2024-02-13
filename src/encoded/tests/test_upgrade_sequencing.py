from typing import Any, Dict

import pytest
from pyramid.router import Router

from .utils import get_upgrader


@pytest.mark.parametrize(
    "sequencing,expected",
    [
        ({}, {"schema_version": "2"}),
        (
            {
                "read_length": 150,
                "platform": "Illumina",
                "instrument_model": "NovaSeq X",
                "schema_version": "1",
            },
            {"read_length": 150, "schema_version": "2"},
        ),
    ]
)
def test_upgrade_sequencing_1_2(
    app: Router, sequencing: Dict[str, Any], expected: Dict[str, Any]
) -> None:
    """Test sequencing upgrader from version 1 to 2."""
    upgrader = get_upgrader(app)
    assert upgrader.upgrade(
        "sequencing", sequencing, current_version="1", target_version="2"
    ) == expected
