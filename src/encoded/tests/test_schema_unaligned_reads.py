from typing import Any, Dict

from webtest import TestApp
import pytest

from .utils import delete_field, get_search, patch_item


@pytest.mark.workbook
def test_paired_with_conditions(es_testapp: TestApp, workbook: None) -> None:
    """Test conditional validation for `paired_with`.

    Only a file designated as an R2 read pair can be paired with another
    file, presumably an R1 read pair, though that validation cannot be
    accomplished here.
    """
    r1_file = get_r1_file(es_testapp)
    r2_paired_file = get_r2_paired_file(es_testapp)
    no_read_pair_file = get_no_read_pair_file(es_testapp)

    assert_r1_cannot_pair(es_testapp, r1_file, no_read_pair_file)
    assert_r2_must_have_pair(es_testapp, r2_paired_file)
    assert_no_read_pair_cannot_pair(es_testapp, no_read_pair_file, r1_file)


def get_r1_file(es_testapp: TestApp) -> Dict[str, Any]:
    """Get R1 read pair UnalignedReads from workbook."""
    r1_search = get_search(es_testapp, "?type=UnalignedReads&read_pair_number=R1")
    assert r1_search, "No R1 read pair file found"
    return r1_search[0]


def get_r2_paired_file(es_testapp: TestApp) -> Dict[str, Any]:
    """Get R2 read pair UnalignedReads from workbook."""
    r2_paired_search = get_search(
        es_testapp,
        "?type=UnalignedReads&read_pair_number=R2&paired_with.uuid!=No+value",
    )
    assert r2_paired_search, "No paired R2 read pair file found"
    return r2_paired_search[0]


def get_no_read_pair_file(es_testapp: TestApp) -> Dict[str, Any]:
    """Get UnalignedReads without a read pair number from workbook."""
    no_read_pair_search = get_search(
        es_testapp,
        "?type=UnalignedReads&read_pair_number=No+value&paired_with.uuid=No+value",
    )
    assert no_read_pair_search, "No UnalignedReads without read pair number found"
    return no_read_pair_search[0]


def assert_r1_cannot_pair(
    es_testapp: TestApp, r1_file: Dict[str, Any], no_read_pair_file: Dict[str, Any]
) -> None:
    """Assert that an R1 read pair UnalignedReads cannot be paired."""
    r1_file_uuid = r1_file["uuid"]
    no_read_pair_file_uuid = no_read_pair_file["uuid"]
    patch_item(
        es_testapp,
        {"paired_with": no_read_pair_file_uuid},
        r1_file_uuid,
        status=422,
    )


def assert_r2_must_have_pair(
    es_testapp: TestApp, r2_paired_file: Dict[str, Any]
) -> None:
    """Assert that an R2 read pair UnalignedReads must be paired."""
    r2_paired_file_uuid = r2_paired_file["uuid"]
    delete_field(es_testapp, r2_paired_file_uuid, "paired_with", status=422)


def assert_no_read_pair_cannot_pair(
    es_testapp: TestApp, no_read_pair_file: Dict[str, Any], r1_file: Dict[str, Any]
) -> None:
    """Assert that an UnalignedReads without a read pair number cannot be paired."""
    no_read_pair_file_uuid = no_read_pair_file["uuid"]
    r1_file_uuid = r1_file["uuid"]
    patch_item(
        es_testapp,
        {"paired_with": r1_file_uuid},
        no_read_pair_file_uuid,
        status=422,
    )
