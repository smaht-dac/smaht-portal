from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import pytest
from webtest.app import TestApp

from .utils import (
    get_item, get_search, patch_item, post_item, post_item_and_return_location
)
from ..item_utils import (
    file as file_utils,
    file_set as file_set_utils,
    item as item_utils
)


OUTPUT_FILE_FORMAT = "FASTQ"


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


@pytest.fixture
def bam_output_file_properties(
    test_submission_center: Dict[str, Any],
    file_formats: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        "submission_centers": [test_submission_center["uuid"]],
        "data_category": ["Sequencing Reads"],
        "data_type": ["Unaligned Reads"],
        "file_format": file_formats.get("BAM", {}).get("uuid"),
    }


@pytest.fixture
def bam_output_file(
    testapp: TestApp, bam_output_file_properties: Dict[str, Any]
) -> Dict[str, Any]:
    return post_item(testapp, bam_output_file_properties, "OutputFile")


def test_href(output_file: Dict[str, Any], file_formats: Dict[str, Dict[str, Any]]) -> None:
    """Ensure download link formatted as expected."""
    expected = (
        f"/output-files/{output_file.get('uuid')}/@@download/"
        f"{output_file.get('accession')}"
        f".{file_formats.get(OUTPUT_FILE_FORMAT, {}).get('standard_file_extension', '')}"
    )
    assert output_file.get("href") == expected


@pytest.mark.parametrize(
    "status,expected",
    [
        ("released", False),
        ("deleted", False),
        ("archived", False),
        ("in review", True),
        ("obsolete", False),
        ("public", False),
    ]
)
def test_upload_credentials(
    status: str, expected: bool, testapp: TestApp, output_file: Dict[str, Any]
) -> None:
    """Ensure upload credentials presence by file status."""
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


@pytest.mark.parametrize(
    "status,expected",
    [
        ("released", "Open"),
        ("public", "Open"),
        ("restricted", "Protected"),
        ("deleted", None),  # test just one additional since there is significant setup cost
    ]
)
def test_file_access_status(status: str, expected: Optional[str], testapp: TestApp,
                            output_file: Dict[str, Any]) -> None:
    """ Ensure calcprop for file_access_status reports Open, Protected or None in the
        appropriate cases
    """
    patch_body = {"status": status}
    patch_response = patch_item(
        testapp, patch_body, output_file.get("uuid")
    )
    result = patch_response.get("file_access_status", None)
    assert result == expected


def test_upload_key(
    output_file: Dict[str, Any], file_formats: Dict[str, Dict[str, Any]]
) -> None:
    """Ensure upload key formatted as expected.

    Expected format is {uuid}/{accession}.{file_format_extension}
    """
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
    assert 'smaht-unit-testing-wfout.s3.amazonaws.com' in res['message']


@pytest.mark.parametrize(
    "extra_files,expected_status",
    [
        ([{"file_format": "bai"}], 201),
        ([{"file_format": "not found"}], 422),
        ([{"file_format": "fastq"}], 422),
        ([{"file_format": "bai"}, {"file_format": "bai"}], 422),
    ],
)
def test_validate_extra_file_format_on_post(
    extra_files: List[Dict[str, Any]],
    expected_status: int,
    testapp: TestApp,
    bam_output_file_properties: Dict[str, Any],
) -> None:
    """Ensure extra file formats properly validated on POST.

    Note: Permissible extra file formats are determined by fixtures.
    """
    properties = {**bam_output_file_properties, "extra_files": extra_files}
    post_item(testapp, properties, "OutputFile", status=expected_status)


@pytest.mark.parametrize(
    "extra_files,expected_status",
    [
        ([{"file_format": "bai"}], 200),
        ([{"file_format": "not found"}], 422),
        ([{"file_format": "fastq"}], 422),
        ([{"file_format": "bai"}, {"file_format": "bai"}], 422),
    ],
)
def test_validate_extra_file_format_on_patch(
    extra_files: List[Dict[str, Any]],
    expected_status: int,
    testapp: TestApp,
    bam_output_file: Dict[str, Any],
) -> None:
    """Ensure extra file formats properly validated on PATCH.

    Note: Permissible extra file formats are determined by fixtures.
    """
    identifier = bam_output_file.get("uuid")
    patch_body = {"extra_files": extra_files}
    patch_item(testapp, patch_body, identifier, status=expected_status)


@pytest.mark.parametrize(
    "extra_files,expected_status",
    [
        ([{"file_format": "bai"}], 200),
        ([{"file_format": "bai", "filename": "foo.bai"}], 200),
        ([{"file_format": "bai", "filename": "foo.bai"}], 200),
        ([{"file_format": "bai", "filename": "foo.bai", "foo": "bar"}], 200),
    ]
)
def test_validate_extra_files_update_properties(
    extra_files: List[Dict[str, Any]],
    expected_status: int,
    testapp: TestApp,
    bam_output_file: Dict[str, Any],
) -> None:
    """Ensure extra files object allows non-submitted properties.

    Properties for these nested objects are updated via File._update(),
    so ensure these make it in without issue.

    Could update the schema with all expected properties or allow
    additionalProperties; latter approach as of 2023-12-11.
    """
    identifier = bam_output_file.get("uuid")
    patch_body = {"extra_files": extra_files}
    patch_item(testapp, patch_body, identifier, status=expected_status)


@pytest.mark.workbook
def test_validate_file_format_for_file_type(
    es_testapp: TestApp,
    workbook: None,
) -> None:
    """Ensure file format validated for file type.

    Using workbook inserts here, so presumably positive validation
    has been successful. Thus, only testing negative validation here.
    """
    file_types_test_data = get_file_types_test_data(es_testapp)
    for file_type_data in file_types_test_data:
        assert_file_format_validated_on_post(es_testapp, file_type_data)
        assert_file_format_validated_on_patch(es_testapp, file_type_data)


@dataclass(frozen=True)
class FileTypeTestData:
    file_type: str
    insert: Dict[str, Any]
    invalid_file_format: Dict[str, Any]


def get_file_types_test_data(es_testapp: TestApp) -> List[FileTypeTestData]:
    """Collect test data for all file types in workbook inserts."""
    file_types_to_inserts = get_file_types_to_inserts(es_testapp)
    return [
        FileTypeTestData(
            file_type, insert, get_invalid_file_format(es_testapp, file_type)
        )
        for file_type, insert in file_types_to_inserts.items()
    ]


def get_file_types_to_inserts(es_testapp: TestApp) -> Dict[str, Dict[str, Any]]:
    """Collect all file types in workbook and map to 1 insert each."""
    workbook_files = get_search(es_testapp, "/search/?type=File")
    seen_file_types = set()
    file_types_to_inserts = {}
    for file_insert in workbook_files:
        file_type = get_file_type(file_insert)
        if file_type and file_type not in seen_file_types:
            file_types_to_inserts[file_type] = file_insert
            seen_file_types.add(file_type)
    return file_types_to_inserts


def get_file_type(file: Dict[str, Any]) -> str:
    """Get file type from file."""
    result = ""
    if len(file.get("@type", [])) > 0:
        result = file["@type"][0]
    return result


def get_invalid_file_format(es_testapp: TestApp, file_type: str) -> str:
    """Retrieve an invalid file format for a given file type."""
    try:
        file_formats = get_search(
            es_testapp,
            f"/search/?type=FileFormat&valid_item_types!={file_type}",
        )
    except Exception:
        raise Exception(f"Workbook is missing file format invalid for {file_type}")
    return file_formats[0]


def assert_file_format_validated_on_post(
    es_testapp: TestApp, file_type_data: FileTypeTestData
) -> None:
    """Ensure file format validated on POST."""
    item_to_post = generate_file_insert_for_type(es_testapp, file_type_data)
    response = post_item(es_testapp, item_to_post, file_type_data.file_type, status=422)
    assert_file_format_invalid(response, file_type_data)



def assert_file_format_invalid(
    response: Dict[str, Any], file_type_data: FileTypeTestData
) -> None:
    """Ensure invalid file format for file type error in response."""
    assert "ValidationFailure" in response.get("@type", [])
    assert response.get("status") == "error"
    errors = response.get("errors", [])
    assert errors
    invalid_file_format_for_type_error_found = False
    for error in errors:
        if error.get("description") == (
            f"File format {file_type_data.invalid_file_format['identifier']} is"
            f" not allowed for {file_type_data.file_type}"
        ):
            invalid_file_format_for_type_error_found = True
            break
    assert invalid_file_format_for_type_error_found



def generate_file_insert_for_type(
    es_testapp: TestApp, file_type_data: FileTypeTestData
) -> Dict[str, Any]:
    """Generate a file for a given file type with invalid file format."""
    raw_insert = get_item(es_testapp, file_type_data.insert["uuid"], frame="raw")
    keys_to_skip = [
        "uuid",
        "accession",
        "aliases",
        "md5sum",
        "content_md5sum",
        "submitted_id",
        "schema_version",
    ]
    existing_keys_to_use = {
        key: value for key, value in raw_insert.items()
        if key not in keys_to_skip
    }
    filename_to_use = get_test_filename(file_type_data)
    submitted_id_to_use = get_test_submitted_id(file_type_data)
    return {
        **existing_keys_to_use,
        **filename_to_use,
        **submitted_id_to_use,
        "file_format": file_type_data.invalid_file_format["uuid"],
    }


def get_test_filename(file_type_data: FileTypeTestData) -> Dict[str, Any]:
    """Get a filename for test file insert."""
    existing_filename = file_type_data.insert.get("filename", "")
    if existing_filename:
        extension_to_use = file_type_data.invalid_file_format["standard_file_extension"]
        return {"filename": f"{existing_filename}.{extension_to_use}"}
    return {}


def get_test_submitted_id(file_type_data: FileTypeTestData) -> Dict[str, Any]:
    """Get a submitted ID for test file insert."""
    existing_submitted_id = file_type_data.insert.get("submitted_id", "")
    if existing_submitted_id:
        return {"submitted_id": f"{existing_submitted_id}-TEST"}
    return {}


def assert_file_format_validated_on_patch(
    es_testapp: TestApp, file_type_data: FileTypeTestData
) -> None:
    """Ensure file format validated on PATCH."""
    item_to_patch = file_type_data.insert.get("uuid")
    patch_body = {"file_format": file_type_data.invalid_file_format.get("uuid")}
    response = patch_item(es_testapp, patch_body, item_to_patch, status=422)
    assert_file_format_invalid(response, file_type_data)


@pytest.mark.workbook
def test_meta_workflow_run_inputs_rev_link(
    es_testapp: TestApp,
    workbook: None,
) -> None:
    """Ensure meta workflow run inputs rev link is correct."""
    file_with_inputs_search = get_search(
        es_testapp, "/search/?type=File&meta_workflow_run_inputs.uuid!=No+value"
    )
    assert file_with_inputs_search
    file_without_inputs_search = get_search(
        es_testapp, "/search/?type=File&meta_workflow_run_inputs.uuid=No+value"
    )
    assert file_without_inputs_search


@pytest.mark.workbook
def test_meta_workflow_run_outputs_rev_link(
    es_testapp: TestApp,
    workbook: None,
) -> None:
    """Ensure meta workflow run outputs rev link is correct."""
    file_with_outputs_search = get_search(
        es_testapp, "/search/?type=File&meta_workflow_run_outputs.uuid!=No+value"
    )
    assert file_with_outputs_search
    file_without_outputs_search = get_search(
        es_testapp, "/search/?type=File&meta_workflow_run_outputs.uuid=No+value"
    )
    assert file_without_outputs_search


@pytest.mark.workbook
def test_libraries(es_testapp: TestApp, workbook: None) -> None:
    """Ensure 'libraries' calcprop is correct.

    Search on the embed and compare to the calcprop to ensure they match.
    """
    file_without_libraries_search = get_search(
        es_testapp, "/search/?type=File&file_sets.libraries.uuid=No+value"
    )
    assert file_without_libraries_search
    file = file_without_libraries_search[0]
    assert_libraries_calcprop_matches_file_set(file)

    submitted_file_with_libraries_search = get_search(
        es_testapp, "/search/?type=SubmittedFile&file_sets.libraries.uuid!=No+value"
    )
    assert submitted_file_with_libraries_search
    submitted_file = submitted_file_with_libraries_search[0]
    assert_libraries_calcprop_matches_file_set(submitted_file)

    output_file_with_libraries_search = get_search(
        es_testapp, "/search/?type=OutputFile&file_sets.libraries.uuid!=No+value"
    )
    assert output_file_with_libraries_search
    output_file = output_file_with_libraries_search[0]
    assert_libraries_calcprop_matches_file_set(output_file)


def assert_libraries_calcprop_matches_file_set(file: Dict[str, Any]) -> None:
    """Ensure 'libraries' calcprop matches 'file_sets.libraries'."""
    libraries_from_calcprop = file_utils.get_libraries(file)
    file_sets = file_utils.get_file_sets(file)
    libraries_from_file_set = [
        library
        for file_set in file_sets
        for library in file_set_utils.get_libraries(file_set)
    ]
    assert_items_match(libraries_from_calcprop, libraries_from_file_set)


def assert_items_match(
    first: List[Dict[str, Any]], second: List[Dict[str, Any]]
) -> None:
    """Ensure two lists of items match, per UUIDs."""
    first_uuids = list(set(item_utils.get_uuid(item) for item in first))
    second_uuids = list(set(item_utils.get_uuid(item) for item in second))
    assert first_uuids == second_uuids
