from typing import Any, Dict, List, Tuple

import pytest
from webtest import TestApp

from .utils import get_search
from ..commands.create_annotated_filenames import (
    FILENAME_SEPARATOR,
    AnnotatedFilename,
    get_annotated_filename,
    get_project_id,
    get_sample_source_id,
    get_donor_kit_id,
    get_protocol_id,
    get_aliquot_id,
    get_donor_sex_and_age,
    get_sequencing_and_assay_codes,
    get_sequencing_center_code,
    get_analysis,
    get_file_extension,
)
from ..item_utils import constants, file as file_utils, item as item_utils
from ..item_utils.utils import RequestHandler


def get_request_handler(testapp: TestApp) -> RequestHandler:
    return RequestHandler(test_app=testapp)


def get_submitted_files_with_annotated_filenames(
    testapp: TestApp
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
    return string[len(prefix):]


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
            to_add = f".{part}"
            if index == 0:
                analysis += to_add
            else:
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
    for file in files:
        expected = file_utils.get_annotated_filename(file)
        result = str(get_annotated_filename(file, request_handler))
        import pdb; pdb.set_trace()
        assert result == expected, (
            f"Expected annotated filename {expected} for file"
            f" {item_utils.get_uuid(file)} but found {result}."
        )


@pytest.mark.workbook
def test_get_project_id(es_testapp: TestApp, workbook: None) -> None:
    """Test project ID retrieval for annotated filenames."""
    request_handler = get_request_handler(es_testapp)
    files = get_submitted_files_with_annotated_filenames(es_testapp)
    for file in files:
        expected = parse_expected_project_id(file)
        project_id_part = get_project_id(file, request_handler)
        assert project_id_part.value == expected, (
            f"Expected project ID {expected} for file {item_utils.get_uuid(file)}"
            f" but found {project_id_part.value}."
        )


def parse_expected_project_id(file: Dict[str, Any]) -> str:
    """Parse expected project ID from annotated filename."""
    annotated_filename = parse_annotated_filename(file)
    return annotated_filename.project_id
