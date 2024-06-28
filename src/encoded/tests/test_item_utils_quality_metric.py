from typing import Any, Dict

import pytest

from ..item_utils.quality_metric import get_zip_file_accession


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, ""),
        ({"url": "/files/ENCFF123ABC/@@download/SMHTF123ABC.zip"}, "SMHTF123ABC"),
    ],
)
def test_get_zip_file_accession(properties: Dict[str, Any], expected: str) -> None:
    assert get_zip_file_accession(properties) == expected
