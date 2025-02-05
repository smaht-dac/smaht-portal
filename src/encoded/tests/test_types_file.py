import functools
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import pytest
from dcicutils import schema_utils
from webtest.app import TestApp

from .utils import (
    get_item, get_search, patch_item, post_item, post_item_and_return_location
)
from ..item_utils import (
    analyte as analyte_utils,
    cell_line as cell_line_utils,
    file as file_utils,
    file_set as file_set_utils,
    item as item_utils,
    library as library_utils,
    sample as sample_utils,
    sequencing as sequencing_utils,
    software as software_utils,
    tissue as tissue_utils,
)
from ..item_utils.utils import (
    get_property_values_from_identifiers,
    get_unique_values,
    RequestHandler,
)
from ..types.file import CalcPropConstants


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


@pytest.fixture
def reference_file(
    testapp: TestApp, file_formats: Dict[str, dict], test_consortium: Dict[str, Any]
) -> Dict[str, Any]:
    """ Reference File for testing the file release status calc prop omission """
    item = {
        'file_format': file_formats.get('BAM').get('uuid'),
        'md5sum': '00000000000000000000000000000000',
        'content_md5sum': '00000000000000000000000000000000',
        'filename': 'my.bam',
        'data_category': ['Sequencing Reads'],
        'data_type': ['Unaligned Reads'],
        'status': 'released',  # if it does clear the prop will definitely show up
        'consortia': [test_consortium['uuid']],
    }
    res = testapp.post_json('/reference_file', item)
    return res.json['@graph'][0]


def test_href(output_file: Dict[str, Any], file_formats: Dict[str, Dict[str, Any]]) -> None:
    """Ensure download link formatted as expected."""
    expected = (
        f"/output-files/{output_file.get('uuid')}/@@download/"
        f"{output_file.get('accession')}"
        f".{file_formats.get(OUTPUT_FILE_FORMAT, {}).get('standard_file_extension', '')}"
    )
    assert output_file.get("href") == expected


def test_output_file_status_tracking_calcprop(smaht_admin_app: TestApp, output_file: Dict[str, Any],
                                              reference_file: Dict[str, Any],
                                              file_formats: Dict[str, Dict[str, Any]]) -> None:
    """ Tests that as we make changes to the output file, the calc prop for changing status
        Note that for this to work, changes need to be tied to a real (not virtual) user
        so that last_modified is present
    """
    assert not reference_file.get('file_status_tracking')  # should be absent
    res = output_file['file_status_tracking']
    assert 'in review' in res
    assert 'released' not in res
    assert 'released_date' not in res
    assert 'public' not in res
    res = smaht_admin_app.patch_json(f'{output_file["@id"]}',
                                     {'status': 'released'}).json['@graph'][0]['file_status_tracking']
    assert 'in review' in res
    assert 'released' in res
    assert 'released_date' in res
    assert 'public' not in res
    res = smaht_admin_app.patch_json(f'{output_file["@id"]}',
                                     {'status': 'public'}).json['@graph'][0]['file_status_tracking']
    assert 'in review' in res
    assert 'released' in res
    assert 'released_date' in res
    assert 'public' in res


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


def search_type_for_key(
    testapp: TestApp, item_type: str, key: str, exists: Optional[bool] = True
) -> List[Dict[str, Any]]:
    """Search for items of a given type for given key."""
    query = f"?type={item_type}&{key}"
    if exists:
        query += "!=No+value"
    else:
        query += "=No+value"
    return get_search(testapp, query)


@pytest.mark.workbook
def test_libraries(es_testapp: TestApp, workbook: None) -> None:
    """Ensure 'libraries' calcprop is correct.

    Search on the embed and compare to the calcprop to ensure they match.

    Calcprop expected on SubmittedFile and OutputFile.
    """
    search_key = "file_sets.libraries.uuid"
    file_without_libraries_search = search_type_for_key(
        es_testapp, "File", search_key, exists=False
    )
    assert file_without_libraries_search
    for file in file_without_libraries_search:
        assert not file_utils.get_libraries(file)

    submitted_file_with_libraries_search = search_type_for_key(
        es_testapp, "SubmittedFile", search_key
    )
    assert submitted_file_with_libraries_search
    for submitted_file in submitted_file_with_libraries_search:
        assert_libraries_calcprop_matches_embeds(submitted_file)

    output_file_with_libraries_search = search_type_for_key(
        es_testapp, "OutputFile", search_key
    )
    assert output_file_with_libraries_search
    for output_file in output_file_with_libraries_search:
        assert_libraries_calcprop_matches_embeds(output_file)


def assert_libraries_calcprop_matches_embeds(file: Dict[str, Any]) -> None:
    """Ensure 'libraries' calcprop matches file_sets.libraries."""
    libraries_from_calcprop = file_utils.get_libraries(file)
    file_sets = file_utils.get_file_sets(file)
    libraries_from_file_set = get_unique_values(file_sets, file_set_utils.get_libraries)
    assert_items_match(libraries_from_calcprop, libraries_from_file_set)


def assert_items_match(
    first: List[Dict[str, Any]], second: List[Dict[str, Any]]
) -> None:
    """Ensure two lists of items match, per UUIDs."""
    first_uuids = sorted(list(set(item_utils.get_uuid(item) for item in first)))
    second_uuids = sorted(list(set(item_utils.get_uuid(item) for item in second)))
    assert first_uuids == second_uuids


@pytest.mark.workbook
def test_sequencing(es_testapp: TestApp, workbook: None) -> None:
    """Ensure 'sequencing' calcprop is correct.

    Search on the embed and compare to the calcprop to ensure they match.

    Calcprop expected on SubmittedFile and OutputFile.
    """
    search_key = "file_sets.sequencing.uuid"
    file_without_sequencing_search = search_type_for_key(
        es_testapp, "File", search_key, exists=False
    )
    assert file_without_sequencing_search
    for file in file_without_sequencing_search:
        assert not file_utils.get_sequencings(file)

    submitted_file_with_sequencing_search = search_type_for_key(
        es_testapp, "SubmittedFile", search_key
    )
    assert submitted_file_with_sequencing_search
    for submitted_file in submitted_file_with_sequencing_search:
        assert_sequencing_calcprop_matches_embeds(submitted_file)

    output_file_with_sequencing_search = search_type_for_key(
        es_testapp, "OutputFile", search_key
    )
    assert output_file_with_sequencing_search
    for output_file in output_file_with_sequencing_search:
        assert_sequencing_calcprop_matches_embeds(output_file)


def assert_sequencing_calcprop_matches_embeds(file: Dict[str, Any]) -> None:
    """Ensure 'sequencing' calcprop matches file_sets.sequencing."""
    sequencing_from_calcprop = file_utils.get_sequencings(file)
    file_sets = file_utils.get_file_sets(file)
    sequencing_from_file_set = get_unique_values(
        file_sets, file_set_utils.get_sequencing
    )
    assert_items_match(sequencing_from_calcprop, sequencing_from_file_set)


@pytest.mark.workbook
def test_assays(es_testapp: TestApp, workbook: None) -> None:
    """Ensure 'assays' calcprop is correct.

    Search on the embed and compare to the calcprop to ensure they match.

    Calcprop expected on SubmittedFile and OutputFile.
    """
    search_key = "file_sets.libraries.assay.uuid"
    file_without_assays_search = search_type_for_key(
        es_testapp, "File", search_key, exists=False
    )
    assert file_without_assays_search
    for file in file_without_assays_search:
        assert not file_utils.get_assays(file)

    submitted_file_with_assays_search = search_type_for_key(
        es_testapp, "SubmittedFile", search_key
    )
    assert submitted_file_with_assays_search
    for submitted_file in submitted_file_with_assays_search:
        assert_assays_calcprop_matches_embeds(submitted_file)

    output_file_with_assays_search = search_type_for_key(
        es_testapp, "OutputFile", search_key
    )
    assert output_file_with_assays_search
    for output_file in output_file_with_assays_search:
        assert_assays_calcprop_matches_embeds(output_file)


def assert_assays_calcprop_matches_embeds(file: Dict[str, Any]) -> None:
    """Ensure 'assays' calcprop matches file_sets.assay."""
    assays_from_calcprop = file_utils.get_assays(file)
    file_sets = file_utils.get_file_sets(file)
    libraries = get_unique_values(file_sets, file_set_utils.get_libraries)
    assays = get_unique_values(libraries, library_utils.get_assay)
    assert_items_match(assays_from_calcprop, assays)


@pytest.mark.workbook
def test_analytes(es_testapp: TestApp, workbook: None) -> None:
    """Ensure 'analytes' calcprop is correct.

    Search on the embed and compare to the calcprop to ensure they match.

    Calcprop expected on SubmittedFile and OutputFile.
    """
    search_key = "file_sets.libraries.analytes.uuid"
    file_without_analytes_search = search_type_for_key(
        es_testapp, "File", search_key, exists=False
    )
    assert file_without_analytes_search
    for file in file_without_analytes_search:
        assert not file_utils.get_analytes(file)

    submitted_file_with_analytes_search = search_type_for_key(
        es_testapp, "SubmittedFile", search_key
    )
    assert submitted_file_with_analytes_search
    for submitted_file in submitted_file_with_analytes_search:
        assert_analytes_calcprop_matches_embeds(submitted_file)

    output_file_with_analytes_search = search_type_for_key(
        es_testapp, "OutputFile", search_key
    )
    assert output_file_with_analytes_search
    for output_file in output_file_with_analytes_search:
        assert_analytes_calcprop_matches_embeds(output_file)


def assert_analytes_calcprop_matches_embeds(file: Dict[str, Any]) -> None:
    """Ensure 'analytes' calcprop matches file_sets.libraries.analytes."""
    analytes_from_calcprop = file_utils.get_analytes(file)
    file_sets = file_utils.get_file_sets(file)
    libraries = get_unique_values(file_sets, file_set_utils.get_libraries)
    analytes = get_unique_values(libraries, library_utils.get_analytes)
    assert_items_match(analytes_from_calcprop, analytes)


@pytest.mark.workbook
def test_samples(es_testapp: TestApp, workbook: None) -> None:
    """Ensure 'samples' calcprop is correct.

    Search on the embed and compare to the calcprop to ensure they match.

    Calcprop expected on SubmittedFile and OutputFile.
    """
    search_key = "file_sets.libraries.analytes.samples.uuid"
    file_without_samples_search = search_type_for_key(
        es_testapp, "File", search_key, exists=False
    )
    assert file_without_samples_search
    for file in file_without_samples_search:
        assert not file_utils.get_samples(file)

    submitted_file_with_samples_search = search_type_for_key(
        es_testapp, "SubmittedFile", search_key
    )
    assert submitted_file_with_samples_search
    for submitted_file in submitted_file_with_samples_search:
        assert_samples_calcprop_includes_embeds(submitted_file)

    output_file_with_samples_search = search_type_for_key(
        es_testapp, "OutputFile", search_key
    )
    assert output_file_with_samples_search
    for output_file in output_file_with_samples_search:
        assert_samples_calcprop_includes_embeds(output_file)


def assert_samples_calcprop_includes_embeds(file: Dict[str, Any]) -> None:
    """Ensure 'samples' calcprop includes file_sets.libraries.analytes.samples.

    Due to inclusion of parent samples, the calcprop may include more
    samples than are directly embedded.
    """
    samples_from_calcprop = file_utils.get_samples(file)
    file_sets = file_utils.get_file_sets(file)
    samples = get_unique_values(file_sets, file_set_utils.get_samples)
    if samples:
        assert_items_present(samples, samples_from_calcprop)
    else:
        libraries = get_unique_values(file_sets, file_set_utils.get_libraries)
        analytes = get_unique_values(libraries, library_utils.get_analytes)
        samples = get_unique_values(analytes, analyte_utils.get_samples)
        assert_items_present(samples, samples_from_calcprop)


def assert_items_present(
    items: List[Dict[str, Any]], items_to_check: List[Dict[str, Any]]
) -> None:
    """Ensure all items present in items_to_check."""
    items_uuids = [item_utils.get_uuid(item) for item in items]
    items_to_check_uuids = [item_utils.get_uuid(item) for item in items_to_check]
    for item_uuid in items_uuids:
        assert item_uuid in items_to_check_uuids


@pytest.mark.workbook
def test_sample_sources(es_testapp: TestApp, workbook: None) -> None:
    """Ensure 'sample_sources' calcprop is correct.

    Search on the embed and compare to the calcprop to ensure they match.

    Calcprop expected on SubmittedFile and OutputFile.
    """
    search_key = "file_sets.libraries.analytes.samples.sample_sources.uuid"
    file_without_sample_sources_search = search_type_for_key(
        es_testapp, "File", search_key, exists=False
    )
    assert file_without_sample_sources_search
    for file in file_without_sample_sources_search:
        assert not file_utils.get_sample_sources(file)

    submitted_file_with_sample_sources_search = search_type_for_key(
        es_testapp, "SubmittedFile", search_key
    )
    assert submitted_file_with_sample_sources_search
    for submitted_file in submitted_file_with_sample_sources_search:
        assert_sample_sources_calcprop_matches_embeds(submitted_file)
    
    output_file_with_sample_sources_search = search_type_for_key(
        es_testapp, "OutputFile", search_key
    )
    assert output_file_with_sample_sources_search
    for output_file in output_file_with_sample_sources_search:
        assert_sample_sources_calcprop_matches_embeds(output_file)


def assert_sample_sources_calcprop_matches_embeds(file: Dict[str, Any]) -> None:
    """Ensure 'sample_sources' calcprop matches upstream sample sources."""
    sample_sources_from_calcprop = file_utils.get_sample_sources(file)
    file_sets = file_utils.get_file_sets(file)
    libraries = get_unique_values(file_sets, file_set_utils.get_libraries)
    analytes = get_unique_values(libraries, library_utils.get_analytes)
    samples = get_unique_values(analytes, analyte_utils.get_samples)
    sample_sources = get_unique_values(samples, sample_utils.get_sample_sources)
    assert_items_match(sample_sources_from_calcprop, sample_sources)


@pytest.mark.workbook
def test_donors(es_testapp: TestApp, workbook: None) -> None:
    """Ensure 'donors' calcprop is correct.

    Search on the embed and compare to the calcprop to ensure as
    expected.

    Note: Donors on cell lines are not embedded but are present on
    calcprop.

    Calcprop expected on SubmittedFile and OutputFile.
    """
    search_key = "file_sets.libraries.analytes.samples.sample_sources.donor.uuid"
    file_without_donors_search = search_type_for_key(
        es_testapp, "File", search_key, exists=False
    )
    assert file_without_donors_search
    request_handler = RequestHandler(test_app=es_testapp)
    for file in file_without_donors_search:
        cell_lines = file_utils.get_cell_lines(file, request_handler)
        if cell_lines:
            assert_cell_line_donors_match_calcprop(request_handler, file, cell_lines)
        else:
            assert not file_utils.get_donors(file)

    submitted_file_with_donors_search = search_type_for_key(
        es_testapp, "SubmittedFile", search_key
    )
    assert submitted_file_with_donors_search
    for submitted_file in submitted_file_with_donors_search:
        assert_donors_calcprop_matches_embeds(submitted_file)

    output_file_with_donors_search = search_type_for_key(
        es_testapp, "OutputFile", search_key
    )
    assert output_file_with_donors_search
    for output_file in output_file_with_donors_search:
        assert_donors_calcprop_matches_embeds(output_file)


def assert_cell_line_donors_match_calcprop(
    request_handler: RequestHandler,
    file: Dict[str, Any],
    cell_lines: List[Dict[str, Any]],
) -> None:
    """Ensure cell line donors match calcprop.""" 
    donor_ids = get_property_values_from_identifiers(
        request_handler, cell_lines, functools.partial(cell_line_utils.get_source_donor, request_handler)
    )
    donors = request_handler.get_items(donor_ids)
    assert_items_match(donors, file_utils.get_donors(file))


def assert_donors_calcprop_matches_embeds(file: Dict[str, Any]) -> None:
    """Ensure 'donors' calcprop matches upstream donors."""
    donors_from_calcprop = file_utils.get_donors(file)
    file_sets = file_utils.get_file_sets(file)
    libraries = get_unique_values(file_sets, file_set_utils.get_libraries)
    analytes = get_unique_values(libraries, library_utils.get_analytes)
    samples = get_unique_values(analytes, analyte_utils.get_samples)
    sample_sources = get_unique_values(samples, sample_utils.get_sample_sources)
    donors = get_unique_values(sample_sources, tissue_utils.get_donor)     
    assert_items_match(donors_from_calcprop, donors)


@pytest.mark.workbook
def test_file_summary(es_testapp: TestApp, workbook: None) -> None:
    """Ensure 'file_summary' calcprop fields correct for inserts.

    Checks fields present on inserts and as expected by parsing
    properties/embeds, and all ensures all fields present on at least
    one item.
    """
    search_key = "file_summary.uuid"  # should always be present if file_summary present
    file_with_summary_search = search_type_for_key(
        es_testapp, "File", search_key
    )
    for file in file_with_summary_search:
        assert_file_summary_matches_expected(file, es_testapp)
    all_fields = schema_utils.get_properties(
        CalcPropConstants.FILE_SUMMARY_SCHEMA
    ).keys()
    assert_all_summary_fields_present_in_items(
        file_with_summary_search, all_fields, "file_summary"
    )


def assert_file_summary_matches_expected(
    file: Dict[str, Any], es_testapp: TestApp
) -> None:
    """Compare 'file_summary' calcprop to expected values.

    Expected values determined here by parsing file properties/embeds.
    """
    file_summary = file_utils.get_file_summary(file)
    expected_annotated_name = file_utils.get_annotated_filename(file)
    expected_access_status = file_utils.get_access_status(file)
    expected_file_format = item_utils.get_display_title(
        get_item(es_testapp, item_utils.get_uuid(file_utils.get_file_format(file)))
    )
    expected_file_size = file_utils.get_file_size(file)
    expected_md5sum = file_utils.get_md5sum(file)
    expected_consortia = [
        item_utils.get_display_title(
            get_item(es_testapp, item_utils.get_uuid(consortium))
        )
        for consortium in item_utils.get_consortia(file)
    ]
    expected_uuid = item_utils.get_uuid(file)
    assert_values_match_if_present(
        file_summary, "annotated_name", expected_annotated_name
    )
    assert_values_match_if_present(
        file_summary, "access_status", expected_access_status
    )
    assert_values_match_if_present(file_summary, "file_format", expected_file_format)
    assert_values_match_if_present(file_summary, "file_size", expected_file_size)
    assert_values_match_if_present(file_summary, "md5sum", expected_md5sum)
    assert_values_match_if_present(file_summary, "consortia", expected_consortia)
    assert_values_match_if_present(file_summary, "uuid", expected_uuid)


def assert_values_match_if_present(
    summary_values: Dict[str, Any], key: str, expected_value: Any
) -> None:
    """Ensure key-value pair matches expected value.

    If key present, value must match expected value. If key not present,
    expected value must be falsy.
    """
    value = summary_values.get(key)
    if value:
        if isinstance(expected_value, list) and isinstance(value, list):
            assert len(value) == len(expected_value)
            assert set(value) == set(expected_value)
        else:
            assert value == expected_value
    else:
        assert not expected_value


def assert_all_summary_fields_present_in_items(
    items: List[Dict[str, Any]], fields: List[str], summary_key: str
) -> None:
    """Ensure all summary fields have value for at least one item."""
    fields_exist = [
        any(item.get(summary_key, {}).get(field) for item in items)
        for field in fields
    ]
    missing_fields = [
        field for field, exists in zip(fields, fields_exist) if not exists
    ]
    assert all(fields_exist), f"Missing fields: {missing_fields}"


@pytest.mark.workbook
def test_data_generation_summary(es_testapp: TestApp, workbook: None) -> None:
    """Ensure 'data_generation_summary' calcprop fields correct for inserts.

    Checks fields present on inserts and as expected by parsing
    properties/embeds, and all ensures all fields present on at least
    one item.
    """
    search_key = "data_generation_summary.data_type"
    files_with_summary_search = search_type_for_key(
        es_testapp, "File", search_key
    )
    for file in files_with_summary_search:
        assert_data_generation_summary_matches_expected(file, es_testapp)
    all_fields = schema_utils.get_properties(
        CalcPropConstants.DATA_GENERATION_SCHEMA
    ).keys()
    assert_all_summary_fields_present_in_items(
        files_with_summary_search, all_fields, "data_generation_summary"
    )


def assert_data_generation_summary_matches_expected(
    file: Dict[str, Any], es_testapp: TestApp
) -> None:
    """Compare 'data_generation_summary' calcprop to expected values.

    Expected values determined here by parsing file properties/embeds.
    """
    data_generation_summary = file_utils.get_data_generation_summary(file)
    expected_data_category = file_utils.get_data_category(file)
    expected_data_type = file_utils.get_data_type(file)
    sequencing_center = file_utils.get_sequencing_center(file)
    expected_sequencing_center = item_utils.get_display_title(
        get_item(es_testapp, item_utils.get_uuid(sequencing_center))
    ) if sequencing_center else ""
    expected_submission_centers = [
        item_utils.get_display_title(
            get_item(es_testapp, item_utils.get_uuid(submission_center))
        )
        for submission_center in item_utils.get_submission_centers(file)
    ]
    assays = file_utils.get_assays(file)
    expected_assays = [
        item_utils.get_display_title(
            get_item(es_testapp, item_utils.get_uuid(assay))
        )
        for assay in assays
    ] if assays else []
    sequencings = [
        file_set_utils.get_sequencing(file_set)
        for file_set in file_utils.get_file_sets(file)
    ]
    expected_platforms = [
        item_utils.get_display_title(
            get_item(
                es_testapp,
                item_utils.get_uuid(sequencing_utils.get_sequencer(sequencing)),
            )
        )
        for sequencing in sequencings
    ] if sequencings else []
    if (override_coverage := file_utils.get_override_group_coverage(file)):
        expected_target_coverage = [override_coverage]
    else:
        expected_target_coverage = [ target_coverage 
            for sequencing in sequencings
                
            if (target_coverage := sequencing_utils.get_target_coverage(
                    get_item(es_testapp, item_utils.get_uuid(sequencing))
                ))

            ] if sequencings else []
    expected_target_read_count = [ target_coverage 
        for sequencing in sequencings                     
        if (target_coverage := sequencing_utils.get_target_read_count(
                get_item(es_testapp, item_utils.get_uuid(sequencing))
            ))
    ] if sequencings else []
    assert_values_match_if_present(
        data_generation_summary, "data_category", expected_data_category
    )
    assert_values_match_if_present(
        data_generation_summary, "data_type", expected_data_type
    )
    assert_values_match_if_present(
        data_generation_summary, "sequencing_center", expected_sequencing_center
    )
    assert_values_match_if_present(
        data_generation_summary, "submission_centers", expected_submission_centers
    )
    assert_values_match_if_present(data_generation_summary, "assays", expected_assays)
    assert_values_match_if_present(
        data_generation_summary, "sequencing_platforms", expected_platforms
    )
    assert_values_match_if_present(
        data_generation_summary,"target_group_coverage",expected_target_coverage
    )
    assert_values_match_if_present(
        data_generation_summary,"target_read_count",expected_target_read_count
    )


@pytest.mark.workbook
def test_sample_summary(es_testapp: TestApp, workbook: None) -> None:
    """Ensure 'sample_summary' calcprop fields correct for inserts.

    Checks fields present on inserts and as expected by parsing
    properties/embeds, and all ensures all fields present on at least
    one item.
    """
    search_key = "sample_summary.analytes"
    file_without_summary_search = search_type_for_key(
        es_testapp, "File", search_key, exists=False
    )
    assert file_without_summary_search  # Not expected for Reference Files

    files_with_summary_search = search_type_for_key(
        es_testapp, "File", search_key
    )
    for file in files_with_summary_search:
        assert_sample_summary_matches_expected(file, es_testapp)

    all_fields = schema_utils.get_properties(
        CalcPropConstants.SAMPLE_SUMMARY_SCHEMA
    ).keys()
    assert_all_summary_fields_present_in_items(
        files_with_summary_search, all_fields, "sample_summary"
    )


def assert_sample_summary_matches_expected(
    file: Dict[str, Any], es_testapp: TestApp
) -> None:
    """Compare 'sample_summary' calcprop to expected values.

    Expected values determined here by parsing file properties/embeds
    or calling functions on correct items. The latter is similar to how
    the calcprop is implemented, so not a great test of the calcprop,
    but these are too complex to test in a more direct way.
    """
    sample_summary = file_utils.get_sample_summary(file)
    analytes = file_utils.get_analytes(file)
    samples = [
        get_item(es_testapp, item_utils.get_uuid(sample))
        for sample in file_utils.get_samples(file)
    ]
    tissues = file_utils.get_tissues(file)
    donors = file_utils.get_donors(file)
    request_handler = RequestHandler(test_app=es_testapp)
    expected_analytes = get_unique_values(
        [get_item(es_testapp, item_utils.get_uuid(analyte)) for analyte in analytes],
        analyte_utils.get_molecule,
    )
    expected_tissues = get_unique_values(
        [get_item(es_testapp, item_utils.get_uuid(tissue)) for tissue in tissues],
        tissue_utils.get_location,
    )
    expected_donor_ids = get_unique_values(
        [get_item(es_testapp, item_utils.get_uuid(donor)) for donor in donors],
        item_utils.get_external_id,
    )
    expected_sample_names = get_unique_values(
        samples,
        functools.partial(
            sample_utils.get_sample_names, request_handler=request_handler
        ),
    )
    expected_sample_descriptions = get_unique_values(
        samples,
        functools.partial(
            sample_utils.get_sample_descriptions, request_handler=request_handler
        ),
    )
    expected_studies = get_unique_values(
        samples,
        functools.partial(
            sample_utils.get_studies, request_handler=request_handler
        ),
    )
    assert_values_match_if_present(
        sample_summary, "analytes", expected_analytes
    )
    assert_values_match_if_present(
        sample_summary, "sample_names", expected_sample_names
    )
    assert_values_match_if_present(
        sample_summary, "tissues", expected_tissues
    )
    assert_values_match_if_present(
        sample_summary, "donor_ids", expected_donor_ids
    )
    assert_values_match_if_present(
        sample_summary, "sample_descriptions", expected_sample_descriptions
    )
    assert_values_match_if_present(
        sample_summary, "studies", expected_studies
    )


@pytest.mark.workbook
def test_analysis_summary(es_testapp: TestApp, workbook: None) -> None:
    """Ensure 'analysis_summary' calcprop fields correct for inserts.

    Checks fields present on inserts and as expected by parsing
    properties/embeds, and all ensures all fields present on at least
    one item.
    """
    search_key = "analysis_summary.software"
    file_without_summary_search = search_type_for_key(
        es_testapp, "File", search_key, exists=False
    )
    assert file_without_summary_search  # Not expected for Reference Files

    files_with_summary_search = search_type_for_key(
        es_testapp, "File", search_key
    )
    for file in files_with_summary_search:
        assert_analysis_software_matches_expected(file, es_testapp)
        assert_analysis_reference_genome_matches_expected(file, es_testapp)
    all_fields = schema_utils.get_properties(
        CalcPropConstants.ANALYSIS_SUMMARY_SCHEMA
    ).keys()
    assert_all_summary_fields_present_in_items(
        files_with_summary_search, all_fields, "analysis_summary"
    )


def assert_analysis_reference_genome_matches_expected(
    file: Dict[str, Any], es_testapp: TestApp
) -> None:
    """Compare 'analysis_summary' reference_genome calcprop to expected values.

    Expected values determined here by parsing file properties/embeds.
    """
    analysis_summary = file_utils.get_analysis_summary(file)
    reference_genome = file_utils.get_reference_genome(file)
    expected_reference_genome = None
    if reference_genome:
        expected_reference_genome = item_utils.get_display_title(reference_genome)
    assert_values_match_if_present(
        analysis_summary, "reference_genome", expected_reference_genome
    )


def assert_analysis_software_matches_expected(
    file: Dict[str, Any], es_testapp: TestApp
) -> None:
    """Compare 'analysis_summary' software calcprop to expected values.

    Expected values determined here by parsing file properties/embeds.
    """
    analysis_summary = file_utils.get_analysis_summary(file)
    software = [
        get_item(es_testapp, item_utils.get_uuid(item))
        for item in file_utils.get_software(file)
    ]
    expected_software = [
        software_utils.get_title_with_version(item)
        for item in software
    ]
    assert_values_match_if_present(
        analysis_summary, "software", expected_software
    )


@pytest.mark.workbook
def test_release_tracker_description(es_testapp: TestApp, workbook: None) -> None:
    """Ensure 'release_tracker_description' calcprop fields correct for inserts.

    Checks fields present on inserts and as expected by parsing
    properties/embeds."""
    
    search_key = "release_tracker_description"
    file_without_release_tracker_description = search_type_for_key(
        es_testapp, "File", search_key, exists=False
    )
    assert file_without_release_tracker_description  # Not expected for Reference Files

    files_with_release_tracker_description = search_type_for_key(
        es_testapp, "File", search_key
    )
    for file in files_with_release_tracker_description:
        assert_release_tracker_description_matches_expected(file, es_testapp)


def assert_release_tracker_description_matches_expected(file: Dict[str, Any], es_testapp: TestApp):
    """Assert release_tracker_description calcprop matches expected."""

    release_tracker_description = file_utils.get_release_tracker_description(file)
    file_format = item_utils.get_display_title(
        file_utils.get_file_format(file)
    )
    if "override_release_tracker_description" in file:
        description_from_calcprops=f"{file_utils.get_override_release_tracker_description(file)} {file_format}"
    if "file_sets" in file:
        assay_from_calcprop = item_utils.get_display_title(
            file_utils.get_assays(file)[0]
        )
        sequencer_from_calcprop = item_utils.get_display_title(
            sequencing_utils.get_sequencer(
                file_utils.get_sequencings(file)[0]
            )
        )                 
        description_from_calcprops=f"{assay_from_calcprop} {sequencer_from_calcprop} {file_format}"
    assert release_tracker_description == description_from_calcprops
   
    

    



@pytest.mark.workbook
def test_unique_key(es_testapp: TestApp, workbook: None) -> None:
    """Ensure `submitted_id` is valid unique key for File."""
    search_key = "submitted_id"
    files_with_submitted_id_search = search_type_for_key(
        es_testapp, "File", search_key
    )
    file_with_submitted_id = files_with_submitted_id_search[0]
    get_item(
        es_testapp, f"/files/{item_utils.get_submitted_id(file_with_submitted_id)}"
    )


# Fix for "sid" in properties.
# https://hms-dbmi.atlassian.net/browse/C4-1189
@pytest.mark.workbook
def test_new_20241104( es_testapp: TestApp, workbook: None) -> None:
    from dcicutils.portal_utils import Portal
    portal = Portal(es_testapp)
    unaligned_reads = portal.get_metadata("92e8371b-bcdf-44de-ad49-3a5f108e91eb", raw=True)
    unaligned_reads_sid = unaligned_reads.get("sid")
    assert unaligned_reads_sid is None
