from unittest import mock
from contextlib import contextmanager
from typing import Any, Dict, List, Tuple, Union

import pytest
from webtest import TestApp

from .utils import get_search
from ..commands.create_annotated_filenames import (
    DEFAULT_ABSENT_FIELD,
    DEFAULT_PROJECT_ID,
    FILENAME_SEPARATOR,
    AnnotatedFilename,
    FilenamePart,
    collect_errors,
    get_aliquot_id,
    get_aliquot_id_from_tissue_sample,
    get_analysis,
    get_annotated_filename,
    get_donor_sex_and_age,
    get_exclusive_filename_part,
    get_file_extension,
    get_filename_part,
    get_filename_part_for_values,
    get_project_id,
    get_protocol_id,
    get_sample_source_id,
    get_sequencing_and_assay_codes,
    get_sequencing_center_code,
    get_sex_and_age_part,
    get_software_and_versions,
)
from ..item_utils import constants, file as file_utils, item as item_utils
from ..item_utils.utils import RequestHandler


def get_request_handler(testapp: TestApp) -> RequestHandler:
    return RequestHandler(test_app=testapp)


def get_submitted_files_with_annotated_filenames(
    testapp: TestApp,
) -> List[Dict[str, Any]]:
    """Get submitted files with annotated filenames.

    Presence of annotated filename indicates file is to be used for
    tests.
    """
    return get_search(testapp, "?type=File&annotated_filename!=No+value")


def parse_annotated_filename(file: Dict[str, Any]) -> AnnotatedFilename:
    """Parse annotated filename."""
    annotated_filename = file_utils.get_annotated_filename(file)
    filename_parts = annotated_filename.split(FILENAME_SEPARATOR)
    assert len(filename_parts) == 8, (
        f"Expected 8 parts in annotated filename for file {item_utils.get_uuid(file)}"
        f" but found {len(filename_parts)} parts."
    )
    project_and_sample_source_part = filename_parts[0]
    project_id, sample_source_id = parse_project_and_sample_source_part(
        project_and_sample_source_part
    )
    analysis, extension = parse_analysis_and_extension_part(filename_parts[-1])
    return AnnotatedFilename(
        project_id=project_id,
        sample_source_id=sample_source_id,
        protocol_id=filename_parts[1],
        aliquot_id=filename_parts[2],
        donor_sex_and_age=filename_parts[3],
        sequencing_and_assay_codes=filename_parts[4],
        sequencing_center_code=filename_parts[5],
        accession=filename_parts[6],
        analysis_info=analysis,
        file_extension=extension,
        errors=[],
    )


def parse_project_and_sample_source_part(
    project_and_sample_source_part: str,
) -> Tuple[str, str]:
    """Parse project and sample source IDs from annotated filename."""
    if project_and_sample_source_part.startswith(constants.BENCHMARKING_PREFIX):
        project_id = constants.BENCHMARKING_PREFIX
        sample_source_id = remove_prefix(
            project_and_sample_source_part, constants.BENCHMARKING_PREFIX
        )
    elif project_and_sample_source_part.startswith(constants.PRODUCTION_PREFIX):
        project_id = constants.PRODUCTION_PREFIX
        sample_source_id = remove_prefix(
            project_and_sample_source_part, constants.PRODUCTION_PREFIX
        )
    else:
        project_id = ""
        sample_source_id = project_and_sample_source_part
    return project_id, sample_source_id


def remove_prefix(string: str, prefix: str) -> str:
    """Remove prefix from string."""
    return string[len(prefix) :]


def parse_analysis_and_extension_part(
    analysis_and_extension_part: str,
) -> Tuple[str, str]:
    """Parse analysis and extension from annotated filename."""
    if analysis_and_extension_part.startswith("."):
        analysis = ""
        extension = analysis_and_extension_part
    else:
        parts = analysis_and_extension_part.split(".")
        analysis = ""
        extension = ""
        for index, part in enumerate(parts):
            if index == 0:
                to_add = part
                analysis += to_add
            else:
                to_add = f".{part}"
                if has_starting_digit(part):
                    analysis += to_add
                elif extension:
                    extension += to_add
                else:
                    extension = part
    return analysis, extension


def has_starting_digit(string: str) -> bool:
    """Check if string has starting digit."""
    return string[0].isdigit()


@pytest.mark.workbook
def test_get_annotated_filename(es_testapp: TestApp, workbook: None) -> None:
    """Test annotated filename creation.

    Assume here that the annotated filenames on workbook files are
    correct.

    Serves as integrated test for the annotated filename creation.
    """
    request_handler = get_request_handler(es_testapp)
    files = get_submitted_files_with_annotated_filenames(es_testapp)
    assert files, "No files with annotated filenames found."
    for file in files:
        expected_string = file_utils.get_annotated_filename(file)
        expected = parse_annotated_filename(file)
        result = get_annotated_filename(file, request_handler)
        assert not result.errors
        errors = collect_differences(result, expected)
        if errors:
            errors_string = "\n".join(errors)
            assert False, (
                f"Expected annotated filename {expected} for file"
                f" {item_utils.get_uuid(file)} but found {result}."
                f" Differences:\n{errors_string}"
            )
        assert str(result) == expected_string, (
            f"Expected annotated filename {expected_string} for file"
            f" {item_utils.get_uuid(file)} but found {result}."
        )


def collect_differences(
    result: AnnotatedFilename, expected: AnnotatedFilename
) -> List[str]:
    """Collect differences between annotated filenames."""
    errors = []
    if result.project_id != expected.project_id:
        errors.append(f"Project ID: {expected.project_id} != {result.project_id}")
    if result.sample_source_id != expected.sample_source_id:
        errors.append(
            f"Sample source ID: {expected.sample_source_id} !="
            f" {result.sample_source_id}"
        )
    if result.protocol_id != expected.protocol_id:
        errors.append(f"Protocol ID: {expected.protocol_id} != {result.protocol_id}")
    if result.aliquot_id != expected.aliquot_id:
        errors.append(f"Aliquot ID: {expected.aliquot_id} != {result.aliquot_id}")
    if result.donor_sex_and_age != expected.donor_sex_and_age:
        errors.append(
            f"Donor sex and age: {expected.donor_sex_and_age} !="
            f" {result.donor_sex_and_age}"
        )
    if result.sequencing_and_assay_codes != expected.sequencing_and_assay_codes:
        errors.append(
            f"Sequencing and assay codes: {expected.sequencing_and_assay_codes} !="
            f" {result.sequencing_and_assay_codes}"
        )
    if result.sequencing_center_code != expected.sequencing_center_code:
        errors.append(
            f"Sequencing center code: {expected.sequencing_center_code} !="
            f" {result.sequencing_center_code}"
        )
    if result.accession != expected.accession:
        errors.append(f"Accession: {expected.accession} != {result.accession}")
    if result.analysis_info != expected.analysis_info:
        errors.append(
            f"Analysis info: {expected.analysis_info} != {result.analysis_info}"
        )
    if result.file_extension != expected.file_extension:
        errors.append(
            f"File extension: {expected.file_extension} != {result.file_extension}"
        )
    return errors


@pytest.mark.parametrize(
    "filename_parts,expected_value,expected_errors",
    [
        ([], "", True),
        ([get_filename_part(value="foo")], "foo", False),
        ([get_filename_part(value="foo"), get_filename_part(value="bar")], "", True),
        (
            [get_filename_part(value="foo"), get_filename_part(value="foo")],
            "foo",
            False,
        ),
    ],
)
def test_get_exclusive_filename_part(
    filename_parts: List[FilenamePart], expected_value: str, expected_errors: bool
) -> None:
    """Test exclusive filename part retrieval."""
    part_name = "test"
    result = get_exclusive_filename_part(filename_parts, part_name)
    assert_filename_part_matches(result, expected_value, expected_errors)
    if expected_errors:
        assert any(part_name in error for error in result.errors)


def assert_filename_part_matches(
    part: FilenamePart, expected_value: str, expected_errors: bool
) -> None:
    """Assert filename part matches expected value and errors."""
    assert isinstance(part, FilenamePart)
    assert part.value == expected_value
    assert bool(part.errors) == expected_errors


@pytest.mark.parametrize(
    "values,expected_value,expected_errors",
    [
        ([], "", True),
        (["foo"], "foo", False),
        (["foo", "bar"], "", True),
        (["foo", "foo"], "foo", False),
    ],
)
def test_get_filename_part_for_values(
    values: List[str], expected_value: str, expected_errors: bool
) -> None:
    """Test filename part retrieval for values."""
    part_name = "test"
    result = get_filename_part_for_values(values, part_name)
    assert_filename_part_matches(result, expected_value, expected_errors)
    if expected_errors:
        assert any(part_name in error for error in result.errors)


@contextmanager
def patch_is_cell_culture_mixture_derived(value: bool) -> mock.MagicMock:
    """Patch is_cell_culture_mixture_derived."""
    with mock.patch(
        (
            "encoded.commands.create_annotated_filenames"
            ".file_utils.is_cell_culture_mixture_derived"
        ),
        return_value=value,
    ) as mock_is_cell_culture_mixture_derived:
        yield mock_is_cell_culture_mixture_derived


@contextmanager
def patch_is_cell_line_derived(value: bool) -> mock.MagicMock:
    """Patch is_cell_line_derived."""
    with mock.patch(
        "encoded.commands.create_annotated_filenames.file_utils.is_cell_line_derived",
        return_value=value,
    ) as mock_is_cell_line_derived:
        yield mock_is_cell_line_derived


@contextmanager
def patch_is_tissue_derived(value: bool) -> mock.MagicMock:
    """Patch is_tissue_derived."""
    with mock.patch(
        "encoded.commands.create_annotated_filenames.file_utils.is_tissue_derived",
        return_value=value,
    ) as mock_is_tissue_derived:
        yield mock_is_tissue_derived


SOME_PROJECT_ID = "some_project_id"


@contextmanager
def patch_get_project_id_from_tissue() -> mock.MagicMock:
    """Patch get_project_id_from_tissue."""
    with mock.patch(
        "encoded.commands.create_annotated_filenames.get_project_id_from_tissue",
        return_value=get_filename_part(SOME_PROJECT_ID),
    ) as mock_get_project_id_from_tissue:
        yield mock_get_project_id_from_tissue


@pytest.mark.parametrize(
    "mixture_derived,cell_line_derived,tissue_derived,expected,errors",
    [
        (False, False, False, "", True),
        (True, False, False, DEFAULT_PROJECT_ID, False),
        (True, True, False, DEFAULT_PROJECT_ID, False),
        (False, False, True, SOME_PROJECT_ID, False),
        (False, True, True, "", True),
        (True, False, True, "", True),
        (True, True, True, "", True),
    ],
)
def test_get_project_id(
    mixture_derived: bool,
    cell_line_derived: bool,
    tissue_derived: bool,
    expected: str,
    errors: bool,
) -> None:
    """Test project ID retrieval for annotated filenames."""
    with patch_is_cell_culture_mixture_derived(mixture_derived):
        with patch_is_cell_line_derived(cell_line_derived):
            with patch_is_tissue_derived(tissue_derived):
                with patch_get_project_id_from_tissue():
                    result = get_project_id(None, None)
                    assert_filename_part_matches(result, expected, errors)


@contextmanager
def patch_is_only_cell_culture_mixture_derived(value: bool) -> mock.MagicMock:
    """Patch is_only_cell_culture_mixture_derived."""
    with mock.patch(
        (
            "encoded.commands.create_annotated_filenames"
            ".file_utils.is_only_cell_culture_mixture_derived"
        ),
        return_value=value,
    ) as mock_is_only_cell_culture_mixture_derived:
        yield mock_is_only_cell_culture_mixture_derived


@contextmanager
def patch_get_cell_culture_mixture_code(value: str) -> mock.MagicMock:
    """Patch get_cell_culture_mixture_code."""
    with mock.patch(
        "encoded.commands.create_annotated_filenames.get_cell_culture_mixture_code",
        return_value=get_filename_part(value),
    ) as mock_get_cell_culture_mixture_code:
        yield mock_get_cell_culture_mixture_code


@contextmanager
def patch_get_cell_line_id(value: str) -> mock.MagicMock:
    """Patch get_cell_line_id."""
    with mock.patch(
        "encoded.commands.create_annotated_filenames.get_cell_line_id",
        return_value=get_filename_part(value),
    ) as mock_get_cell_line_id:
        yield mock_get_cell_line_id


@contextmanager
def patch_get_donor_kit_id(value: str) -> mock.MagicMock:
    """Patch get_donor_kit_id."""
    with mock.patch(
        "encoded.commands.create_annotated_filenames.get_donor_kit_id",
        return_value=get_filename_part(value),
    ) as mock_get_donor_kit_id:
        yield mock_get_donor_kit_id


MIXTURE_CODE = "mixture_code"
CELL_LINE_ID = "cell_line_id"
DONOR_KIT_ID = "donor_kit_id"


@contextmanager
def patches_for_sample_source_id(
    mixture_derived: bool,
    cell_line_derived: bool,
    tissue_derived: bool,
    mixture_code: str = MIXTURE_CODE,
    cell_line_id: str = CELL_LINE_ID,
    donor_kit_id: str = DONOR_KIT_ID,
) -> None:
    """Mock functions for sample source ID retrieval."""
    if mixture_derived and not any([cell_line_derived, tissue_derived]):
        only_mixture_derived = True
    else:
        only_mixture_derived = False
    with patch_is_cell_culture_mixture_derived(mixture_derived):
        with patch_is_cell_line_derived(cell_line_derived):
            with patch_is_tissue_derived(tissue_derived):
                with patch_is_only_cell_culture_mixture_derived(only_mixture_derived):
                    with patch_get_cell_culture_mixture_code(mixture_code):
                        with patch_get_cell_line_id(cell_line_id):
                            with patch_get_donor_kit_id(donor_kit_id):
                                yield


@pytest.mark.parametrize(
    "mixture_derived,cell_line_derived,tissue_derived,expected,errors",
    [
        (False, False, False, "", True),
        (True, False, False, MIXTURE_CODE, False),
        (False, True, False, CELL_LINE_ID, False),
        (False, False, True, DONOR_KIT_ID, False),
        (True, True, False, "", True),
        (True, False, True, "", True),
        (False, True, True, "", True),
        (True, True, True, "", True),
    ],
)
def test_get_sample_source_id(
    mixture_derived: bool,
    cell_line_derived: bool,
    tissue_derived: bool,
    expected: str,
    errors: bool,
) -> None:
    """Test sample source ID retrieval for annotated filenames."""
    with patches_for_sample_source_id(
        mixture_derived, cell_line_derived, tissue_derived
    ):
        result = get_sample_source_id(None, None)
        assert_filename_part_matches(result, expected, errors)


PROTOCOL_ID = "protocol_id"


@contextmanager
def patch_get_protocol_id_from_tissues() -> mock.MagicMock:
    """Patch get_protocol_id_from_tissues."""
    with mock.patch(
        "encoded.commands.create_annotated_filenames.get_protocol_id_from_tissues",
        return_value=get_filename_part(PROTOCOL_ID),
    ) as mock_get_protocol_id_from_tissues:
        yield mock_get_protocol_id_from_tissues


@pytest.mark.parametrize(
    "mixture_derived,cell_line_derived,tissue_derived,expected,errors",
    [
        (False, False, False, "", True),
        (True, False, False, DEFAULT_ABSENT_FIELD, False),
        (False, True, False, DEFAULT_ABSENT_FIELD, False),
        (False, False, True, PROTOCOL_ID, False),
        (True, True, False, DEFAULT_ABSENT_FIELD, False),
        (True, False, True, "", True),
        (False, True, True, "", True),
        (True, True, True, "", True),
    ],
)
def test_get_protocol_id(
    mixture_derived: bool,
    cell_line_derived: bool,
    tissue_derived: bool,
    expected: str,
    errors: bool,
) -> None:
    """Test protocol ID retrieval for annotated filenames."""
    with patch_is_cell_culture_mixture_derived(mixture_derived):
        with patch_is_cell_line_derived(cell_line_derived):
            with patch_is_tissue_derived(tissue_derived):
                with patch_get_protocol_id_from_tissues():
                    result = get_protocol_id(None, None)
                    assert_filename_part_matches(result, expected, errors)


ALIQUOT_ID = "aliquot_id"


@contextmanager
def patch_get_aliquot_id_from_samples() -> mock.MagicMock:
    """Patch get_aliquot_id_from_samples."""
    with mock.patch(
        "encoded.commands.create_annotated_filenames.get_aliquot_id_from_samples",
        return_value=get_filename_part(ALIQUOT_ID),
    ) as mock_get_aliquot_id_from_samples:
        yield mock_get_aliquot_id_from_samples


@pytest.mark.parametrize(
    "mixture_derived,cell_line_derived,tissue_derived,expected,errors",
    [
        (False, False, False, "", True),
        (True, False, False, DEFAULT_ABSENT_FIELD, False),
        (False, True, False, DEFAULT_ABSENT_FIELD, False),
        (False, False, True, ALIQUOT_ID, False),
        (True, True, False, DEFAULT_ABSENT_FIELD, False),
        (True, False, True, "", True),
        (False, True, True, "", True),
        (True, True, True, "", True),
    ],
)
def test_get_aliquot_id(
    mixture_derived: bool,
    cell_line_derived: bool,
    tissue_derived: bool,
    expected: str,
    errors: bool,
) -> None:
    """Test aliquot ID retrieval for annotated filenames."""
    with patch_is_cell_culture_mixture_derived(mixture_derived):
        with patch_is_cell_line_derived(cell_line_derived):
            with patch_is_tissue_derived(tissue_derived):
                with patch_get_aliquot_id_from_samples():
                    result = get_aliquot_id(None, None)
                    assert_filename_part_matches(result, expected, errors)


def mock_request_handler(
    value: Union[Dict[str, Any], List[Dict[str, Any]]]
) -> mock.MagicMock:
    """Mock request handler."""
    mocked = mock.create_autospec(RequestHandler)
    if isinstance(value, list):
        mocked.get_items.return_value = value
    else:
        mocked.get_item.return_value = value
    return mocked


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, ""),
        ({"category": "Homogenate"}, DEFAULT_ABSENT_FIELD * 2),
        ({"category": "Core", "external_id": "ST001-1A-100A3"}, "100A3"),
    ],
)
def test_get_aliquot_id_from_tissue_sample(
    properties: Dict[str, Any], expected: str
) -> None:
    """Test aliquot ID retrieval from tissue sample."""
    request_handler = mock_request_handler(properties)
    result = get_aliquot_id_from_tissue_sample({}, request_handler)
    assert result == expected


@contextmanager
def patch_get_sex_and_age_parts(values: List[str]) -> mock.MagicMock:
    """Patch sex and age filename parts retrieval."""
    return_value = [get_filename_part(value) for value in values]
    with mock.patch(
        "encoded.commands.create_annotated_filenames.get_sex_and_age_parts",
        return_value=return_value,
    ) as mock_get_sex_and_age_parts:
        yield mock_get_sex_and_age_parts


@contextmanager
def patch_get_donors(value: List[Dict[str, Any]]) -> mock.MagicMock:
    """Patch file_utils.get_donors."""
    with mock.patch(
        "encoded.commands.create_annotated_filenames.file_utils.get_donors",
        return_value=value,
    ) as mock_get_donors:
        yield mock_get_donors


@pytest.mark.parametrize(
    "donors,is_mixture_derived,sex_and_age_parts,expected,errors",
    [
        (False, False, [], "", True),
        (False, True, [], "NN", False),
        (True, False, [], "", True),
        (True, True, [], "", True),
        (True, False, ["M30"], "M30", False),
        (True, False, ["M30", "M35"], "", True),
        (True, True, ["M30", "M35"], "NN", False),
    ],
)
def test_get_donor_sex_and_age_parts(
    donors: bool,
    is_mixture_derived: bool,
    sex_and_age_parts: List[str],
    expected: str,
    errors: bool,
) -> None:
    """Test sex and age retrieval for annotated filenames."""
    with patch_get_donors(donors):
        with patch_is_only_cell_culture_mixture_derived(is_mixture_derived):
            with patch_get_sex_and_age_parts(sex_and_age_parts):
                result = get_donor_sex_and_age(None, None)
                assert_filename_part_matches(result, expected, errors)


@pytest.mark.parametrize(
    "properties,expected,errors",
    [
        ({}, "", True),
        ({"sex": "Male", "age": "30"}, "M30", False),
        ({"sex": "Mele", "age": "30"}, "", True),
        ({"sex": "Male"}, "", True),
        ({"age": "30"}, "", True),
    ],
)
def test_get_sex_and_age_part(
    properties: Dict[str, Any], expected: str, errors: bool
) -> None:
    """Test sex and age filename part for donor."""
    request_handler = mock_request_handler(properties)
    result = get_sex_and_age_part("", request_handler)
    assert_filename_part_matches(result, expected, errors)


@contextmanager
def patch_get_sequencing_codes(values: List[str]) -> mock.MagicMock:
    """Patch sequencing codes retrieval."""
    with mock.patch(
        "encoded.commands.create_annotated_filenames.get_sequencing_codes",
        return_value=values,
    ) as mock_get_sequencing_codes:
        yield mock_get_sequencing_codes


@contextmanager
def patch_get_assay_codes(values: List[str]) -> mock.MagicMock:
    """Patch assay codes retrieval."""
    with mock.patch(
        "encoded.commands.create_annotated_filenames.get_assay_codes",
        return_value=values,
    ) as mock_get_assay_codes:
        yield mock_get_assay_codes


@pytest.mark.parametrize(
    "sequencing_codes,assay_codes,expected,errors",
    [
        ([], [], "", True),
        (["A"], [], "", True),
        ([], ["001"], "", True),
        (["A"], ["001"], "A001", False),
        (["A", "B"], ["001"], "", True),
        (["A"], ["001", "002"], "", True),
        (["A", "B"], ["001", "002"], "", True),
    ],
)
def test_get_sequencing_and_assay_codes(
    sequencing_codes: List[str], assay_codes: List[str], expected: str, errors: bool
) -> None:
    """Test sequencing and assay codes retrieval for annotated filenames."""
    with patch_get_sequencing_codes(sequencing_codes):
        with patch_get_assay_codes(assay_codes):
            result = get_sequencing_and_assay_codes(None, None)
            assert_filename_part_matches(result, expected, errors)


@contextmanager
def patch_get_sequencing_center_code_from_file(value: str) -> mock.MagicMock:
    """Patch sequencing center code retrieval."""
    with mock.patch(
        "encoded.commands.create_annotated_filenames.get_sequencing_center_code_from_file",
        return_value=value,
    ) as mock_get_sequencing_center_code_from_file:
        yield mock_get_sequencing_center_code_from_file


@pytest.mark.parametrize(
    "code,expected,errors",
    [
        ("", "", True),
        ("dac", "dac", False),
        ("DAC", "dac", False),
    ],
)
def test_get_sequencing_center_code(code: str, expected: str, errors: bool) -> None:
    """Test sequencing center code retrieval for annotated filenames."""
    with patch_get_sequencing_center_code_from_file(code):
        result = get_sequencing_center_code(None, None)
        assert_filename_part_matches(result, expected, errors)


@contextmanager
def patch_get_software_and_versions(values: List[str]) -> mock.MagicMock:
    """Patch software and versions retrieval."""
    with mock.patch(
        "encoded.commands.create_annotated_filenames.get_software_and_versions",
        return_value=values,
    ) as mock_get_software_and_versions:
        yield mock_get_software_and_versions


@contextmanager
def patch_get_reference_genome_code(value: str) -> mock.MagicMock:
    """Patch reference genome code retrieval."""
    with mock.patch(
        "encoded.commands.create_annotated_filenames.file_utils.get_reference_genome_code",
        return_value=value,
    ) as mock_get_reference_genome_code:
        yield mock_get_reference_genome_code


@pytest.mark.parametrize(
    "file,software_and_versions,reference_genome_code,expected,errors",
    [
        ({}, "", "", "", True),
        ({"data_type": ["Unaligned Reads"]}, "foo_1.2.3", "GRCh38", "", True),
        ({"data_type": ["Unaligned Reads"]}, "", "", DEFAULT_ABSENT_FIELD, False),
        ({"data_type": ["Unaligned Reads"]}, "foo_1.2.3", "", "foo_1.2.3", False),
        ({"data_type": ["Aligned Reads"]}, "", "", "", True),
        ({"data_type": ["Aligned Reads"]}, "foo_1.2.3", "", "", True),
        ({"data_type": ["Aligned Reads", "SNV"]}, "foo_1.2.3", "GRCh38", "", True),
        (
            {"data_type": ["Aligned Reads"]},
            "foo_1.2.3",
            "GRCh38",
            "foo_1.2.3_GRCh38",
            False,
        ),
        ({"data_category": ["Somatic Variant Calls"]}, "", "", "", True),
        ({"data_category": ["Somatic Variant Calls"]}, "foo_1.2.3", "GRCh38", "", True),
        (
            {
                "data_category": ["Somatic Variant Calls"],
                "data_type": ["SNV", "CNV", "MEI", "SV", "Indel"],
            },
            "foo_1.2.3",
            "",
            "",
            True,
        ),
        (
            {
                "data_category": ["Somatic Variant Calls"],
                "data_type": ["SNV", "CNV", "MEI", "SV", "Indel"],
            },
            "",
            "GRCh38",
            "GRCh38_cnv_mei_snv_sv",
            False,
        ),
        (
            {
                "data_category": ["Somatic Variant Calls"],
                "data_type": ["SNV", "CNV", "MEI", "SV", "Indel"],
            },
            "foo_1.2.3",
            "GRCh38",
            "foo_1.2.3_GRCh38_cnv_mei_snv_sv",
            False,
        ),
    ],
)
def test_get_analysis(
    file: Dict[str, Any],
    software_and_versions: str,
    reference_genome_code: str,
    expected: str,
    errors: bool,
) -> None:
    """Test analysis info retrieval for annotated filenames."""
    with patch_get_software_and_versions(software_and_versions):
        with patch_get_reference_genome_code(reference_genome_code):
            result = get_analysis(file, None)
            assert_filename_part_matches(result, expected, errors)


@pytest.mark.parametrize(
    "software,expected",
    [
        ([], ""),
        ([{"version": "2.3.4"}], ""),
        ([{"code": "foo", "version": "1.2.3"}], "foo_1.2.3"),
        ([{"code": "foo", "version": "1.2.3"}, {"version": "2.3.4"}], "foo_1.2.3"),
        (
            [
                {"code": "foo", "version": "1.2.3"},
                {"version": "2.3.4"},
                {"code": "bar", "version": "3.4.5"},
            ],
            "bar_3.4.5_foo_1.2.3",
        ),
    ],
)
def test_get_software_and_versions(
    software: List[Dict[str, Any]], expected: str
) -> None:
    """Test software names and versions retrieval."""
    request_handler = mock_request_handler(software)
    result = get_software_and_versions({}, request_handler)
    assert result == expected


@contextmanager
def patch_get_file_extension(value: str) -> mock.MagicMock:
    """Patch file extension retrieval."""
    with mock.patch(
        "encoded.commands.create_annotated_filenames.file_utils.get_file_extension",
        return_value=value,
    ) as mock_get_file_extension:
        yield mock_get_file_extension


@pytest.mark.parametrize(
    "file,extension,expected,errors",
    [
        ({}, "", "", True),
        ({}, "foo", "foo", False),
        (
            {"data_type": ["Aligned Reads"], "alignment_details": ["Phased", "Sorted"]},
            "foo",
            "aligned.sorted.phased.foo",
            False,
        ),
        (
            {"alignment_details": ["Phased", "Sorted"]},
            "foo.gz",
            "sorted.phased.foo.gz",
            False,
        ),
    ],
)
def test_get_file_extension(
    file: Dict[str, Any], extension: str, expected: str, errors: bool
) -> None:
    """Test file extension retrieval for annotated filenames."""
    with patch_get_file_extension(extension):
        result = get_file_extension(file, None)
        assert_filename_part_matches(result, expected, errors)


@pytest.mark.parametrize(
    "errors,expected",
    [
        ([], []),
        (
            [
                get_filename_part("foo", errors=["a", "b"]),
                get_filename_part("bar"),
                get_filename_part("baz", errors=["c", "d"]),
            ],
            ["a", "b", "c", "d"],
        ),
    ],
)
def test_collect_errors(errors: List[FilenamePart], expected: List[str]) -> None:
    """Test error collection across filename parts."""
    result = collect_errors(*errors)
    assert result == expected
