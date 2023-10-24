from typing import Any, Dict, Union

import pytest
from webtest.app import TestApp

from .utils import patch_item_and_return_response, post_item_and_return_location


OUTPUT_FILE_FORMAT = "fastq"


@pytest.fixture
def output_file(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    file_formats: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    item = {
        "file_format": file_formats.get(OUTPUT_FILE_FORMAT, {}).get("uuid", ""),
        "md5sum": "00000000000000000000000000000001",
        "filename": "my.fastq.gz",
        "status": "in review",
        "data_category": "Sequencing Reads",
        "data_type": "Unaligned Reads",
        "consortia": [test_consortium["uuid"]],
    }
    return post_item_and_return_location(testapp, item, "output_file")


def test_href(output_file: Dict[str, Any], file_formats: Dict[str, Dict[str, Any]]) -> None:
    expected = (
        f"/output-files/{output_file.get('uuid')}/@@download/"
        f"{output_file.get('accession')}"
        f".{file_formats.get(OUTPUT_FILE_FORMAT, {}).get('standard_file_extension', '')}"
    )
    assert output_file.get("href") == expected


@pytest.mark.parametrize(
    "status,expected",
    [
        ("current", False),
        ("deleted", False),
        ("inactive", False),
        ("in review", True),
        ("obsolete", False),
        ("shared", False),
    ]
)
def test_upload_credentials(
    status: str, expected: bool, testapp: TestApp, output_file: Dict[str, Any]
) -> None:
    patch_body = {"status": status}
    patch_response = patch_item_and_return_response(
        testapp, patch_body, output_file.get("uuid")
    )
    result = patch_response.get("upload_credentials")
    if expected is False:
        assert result is None
    else:
        assert isinstance(result, dict)
        for expected_key in (
            "key", "upload_url", "AccessKeyId", "SessionToken", "SecretAccessKey"
        ):
            assert expected_key in result


def test_upload_key(output_file: Dict[str, Any], file_formats: Dict[str, Dict[str, Any]]) -> None:
    expected = (
        f"{output_file.get('uuid')}/{output_file.get('accession')}"
        f".{file_formats.get(OUTPUT_FILE_FORMAT, {}).get('standard_file_extension', '')}"
    )
    assert output_file.get("upload_key") == expected
