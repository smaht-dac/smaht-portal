from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import get_item


def test_md5_alias_not_resource_path(
    testapp: TestApp, output_file: Dict[str, Any]
) -> None:
    """Ensure MD5 checksum alias not added to unique keys."""
    md5sum = output_file.get("md5sum")
    assert md5sum
    get_item(testapp, f"md5:{md5sum}", collection="OutputFile", status=404)


@pytest.mark.parametrize(
        "output_file", [
            "cca15caa-bc11-4a6a-8998-ea0c69df8b9d",
            "0f98abcb-bbc5-4c44-b228-cc33d4f82033"
        ]
)
@pytest.mark.workbook
def test_output_file_sample_sources(
    es_testapp: TestApp,
    workbook: None,
    output_file: str
) -> None:
    """Ensure sample sources calculated property works."""
    item = get_item(es_testapp, output_file, collection="OutputFile")
    assert "sample_sources" in item
    assert item["sample_sources"] is not None

@pytest.mark.parametrize(
        "output_file", [
            "cca15caa-bc11-4a6a-8998-ea0c69df8b9d",
            "0f98abcb-bbc5-4c44-b228-cc33d4f82033"
        ]
)
@pytest.mark.workbook
def test_output_file_donors(
    es_testapp: TestApp,
    workbook: None,
    output_file: str
) -> None:
    """Ensure donors calculated property works."""
    item = get_item(es_testapp, output_file, collection="OutputFile")
    assert "donors" in item
    assert item["donors"] is not None
