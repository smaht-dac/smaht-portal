from typing import Any, Dict

from webtest.app import TestApp

from .utils import get_item


def test_md5_alias_not_resource_path(
    testapp: TestApp, output_file: Dict[str, Any]
) -> None:
    """Ensure MD5 checksum alias not added to unique keys."""
    md5sum = output_file.get("md5sum")
    assert md5sum
    get_item(testapp, f"md5:{md5sum}", collection="OutputFile", status=404)
