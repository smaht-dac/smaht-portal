from typing import Any, Dict

import pytest
from webtest.app import TestApp

from .utils import patch_item, post_item_and_return_location


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
        "data_category": ["Sequencing Reads"],
        "data_type": ["Unaligned Reads"],
        "consortia": [test_consortium["uuid"]],
    }
    return post_item_and_return_location(testapp, item, "output_file")


@pytest.fixture
def output_file2(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    file_formats: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    item = {
        "file_format": file_formats.get(OUTPUT_FILE_FORMAT, {}).get("uuid", ""),
        "md5sum": "00000000000000000000000000000002",
        "filename": "my.fastq.gz",
        "status": "in review",
        "data_category": ["Sequencing Reads"],
        "data_type": ["Unaligned Reads"],
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
    patch_response = patch_item(
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


def test_output_file_force_md5(testapp: TestApp, output_file: Dict[str, Any], output_file2: Dict[str, Any],
                               file_formats: Dict[str, Dict[str, Any]]) -> None:
    """ Tests that we can skip md5 check by passing ?force_md5 to patch output_file2 to md5 of output_file """
    atid = output_file2['@id']
    testapp.patch_json(f'/{atid}', {'md5sum': '00000000000000000000000000000001'}, status=422)  # fails without force_md5
    testapp.patch_json(f'/{atid}?force_md5', {'md5sum': '00000000000000000000000000000001'}, status=200)


def test_output_file_get_post_upload(testapp: TestApp, output_file: Dict[str, Any],
                                     file_formats: Dict[str, Dict[str, Any]]) -> None:
    """ Tests that the get_upload API works correctly for a basic output file """
    atid = output_file['@id']
    res = testapp.get(f'/{atid}?upload').json
    assert 'upload_credentials' in res
    for upload_key in ['key', 'upload_url', 'AccessKeyId', 'SessionToken', 'SecretAccessKey']:
        assert upload_key in res['upload_credentials']

    # This does not work right now - it's untested in CGAP and 4DN, not clear it works there either - Will Nov 16 2023
    # res = testapp.post_json(f'/{atid}?upload', {}).json
    # assert 'upload_credentials' in res
    # for upload_key in ['key', 'upload_url', 'AccessKeyId', 'SessionToken', 'SecretAccessKey']:
    #     assert upload_key in res['upload_credentials']


def test_output_file_download(testapp: TestApp, output_file: Dict[str, Any],
                              file_formats: Dict[str, Dict[str, Any]]) -> None:
    """ Tests that download returns a reasonable looking URL """
    atid = output_file['@id']
    res = testapp.get(f'/{atid}@@download', status=307).json
    assert 'smaht-unit-testing-wfoutput.s3.amazonaws.com' in res['message']
