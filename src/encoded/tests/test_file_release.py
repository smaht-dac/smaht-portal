from contextlib import contextmanager
from unittest import mock

import pytest
from webtest import TestApp

from .utils import get_search
from ..commands.release_file import FileRelease
from ..item_utils import (
    file as file_utils,
    item as item_utils,
    supplementary_file as supp_file_utils,
    external_output_file as eof_utils,
)
from ..item_utils.utils import RequestHandler


@contextmanager
def patch_get_request_handler(testapp: TestApp) -> mock.MagicMock:
    with mock.patch(
        "encoded.commands.release_file.FileRelease.get_request_handler",
        return_value=RequestHandler(test_app=testapp),
    ) as mock_get_request_handler:
        yield mock_get_request_handler


@contextmanager
def patch_get_request_handler_embedded(testapp: TestApp) -> mock.MagicMock:
    with mock.patch(
        "encoded.commands.release_file.FileRelease.get_request_handler_embedded",
        return_value=RequestHandler(test_app=testapp, frame="embedded"),
    ) as mock_get_request_handler_embedded:
        yield mock_get_request_handler_embedded


# We need to break this up in two context managers to avoid too many nested mocks
@contextmanager
def patch_file_release_properties():
    """Patch FileRelease properties that return lists."""
    with (
        mock.patch(
            "encoded.commands.release_file.FileRelease.software",
            return_value=None,
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.get_output_meta_workflow_run",
            return_value=None,
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.validate_required_qc_runs",
            return_value=None,
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.library_preparations",
            return_value=[],
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.analyte_preparations",
            return_value=[],
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.preparation_kits",
            return_value=[],
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.treatments", return_value=[]
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.tissues", return_value=[]
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.tissue_samples", return_value=[]
        ),
    ):
        yield


@contextmanager
def patch_file_release_donor_properties():
    """Patch FileRelease donor-related properties."""
    with (
        mock.patch("encoded.commands.release_file.FileRelease.donors", return_value=[]),
        mock.patch(
            "encoded.commands.release_file.FileRelease.protected_donors",
            return_value=[],
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.demographics", return_value=[]
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.death_circumstances",
            return_value=[],
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.family_histories",
            return_value=[],
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.tissue_collections",
            return_value=[],
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.medical_histories",
            return_value=[],
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.diagnoses", return_value=[]
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.exposures", return_value=[]
        ),
        mock.patch(
            "encoded.commands.release_file.FileRelease.medical_treatments",
            return_value=[],
        ),
    ):
        yield


@pytest.mark.workbook
def test_file_release(es_testapp: TestApp, workbook: None) -> None:
    """Test file release process for select files.

    Only ensuring the preparation stage functions without bugs, not
    actually patching anything here.
    """
    query = "?type=File&annotated_filename!=No+value"  # Since already set up
    files_to_release = get_search(es_testapp, query)
    assert files_to_release, "No files to release found."

    with (
        patch_get_request_handler(es_testapp),
        patch_get_request_handler_embedded(es_testapp),
        patch_file_release_properties(),
        patch_file_release_donor_properties(),
    ):
        for file in files_to_release:
            dataset = file_utils.get_dataset(file) or FileRelease.TISSUE
            identifier = item_utils.get_uuid(file)
            file_release = FileRelease({}, identifier)
            file_release.prepare(dataset)
            if not supp_file_utils.is_reference_conversion(
                file
            ) and not supp_file_utils.is_genome_assembly(
                file
            ) and not eof_utils.is_external_output_file(
                file
            ):
                assert file_release.file_sets
            assert file_release.libraries
            assert file_release.assays
            assert file_release.sequencings
            assert file_release.analytes
            assert file_release.samples
            assert file_release.sample_sources
            assert file_release.cell_lines or file_release.donors
            assert file_release.patch_infos
            assert file_release.patch_dicts
