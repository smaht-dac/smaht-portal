from contextlib import contextmanager
from unittest import mock

import pytest
from webtest import TestApp

from .utils import get_search
from ..commands.release_file import FileRelease
from ..item_utils import (
    file as file_utils,
    item as item_utils,
    supplementary_file as supp_file_utils
)
from ..item_utils.utils import RequestHandler


@contextmanager
def patch_get_request_handler(testapp: TestApp) -> mock.MagicMock:
    with mock.patch(
        "encoded.commands.release_file.FileRelease.get_request_handler",
        return_value=RequestHandler(test_app=testapp),
    ) as mock_get_request_handler:
        yield mock_get_request_handler


@pytest.mark.workbook
def test_file_release(es_testapp: TestApp, workbook: None) -> None:
    """Test file release process for select files.

    Only ensuring the preparation stage functions without bugs, not
    actually patching anything here.
    """
    query = "?type=File&annotated_filename!=No+value"  # Since already set up
    files_to_release = get_search(es_testapp, query)
    assert files_to_release, "No files to release found."
    with patch_get_request_handler(es_testapp):
        for file in files_to_release:
            dataset = file_utils.get_dataset(file) or FileRelease.TISSUE
            identifier = item_utils.get_uuid(file)
            file_release = FileRelease({}, identifier)
            file_release.prepare(dataset)
            if not supp_file_utils.is_reference_conversion(file) and not supp_file_utils.is_genome_assembly(file):
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
