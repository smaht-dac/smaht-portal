import pytest
from webtest import TestApp

from .utils import get_search
from ..item_utils import file_set as file_set_utils
from ..item_utils.utils import RequestHandler


@pytest.mark.workbook
def test_get_samples(es_testapp: TestApp, workbook: None) -> None:
    """Ensure sample(s) associated with file sets properly found."""
    request_handler = RequestHandler(test_app=es_testapp)
    file_sets_with_samples = get_search(
        es_testapp, "?type=FileSet&samples!=No+value&frame=object"
    )
    assert file_sets_with_samples
    for file_set in file_sets_with_samples:
        samples = file_set_utils.get_samples(file_set)
        assert samples
        assert samples == file_set_utils.get_samples(
            file_set, request_handler=request_handler
        )
    file_sets_without_samples = get_search(
        es_testapp, "?type=FileSet&samples=No+value&frame=object"
    )
    assert file_sets_without_samples
    for file_set in file_sets_without_samples:
        samples = file_set_utils.get_samples(file_set)
        assert not samples
        assert file_set_utils.get_samples(file_set, request_handler=request_handler)
