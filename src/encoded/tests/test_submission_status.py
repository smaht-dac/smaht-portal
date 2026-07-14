import re
from typing import Any, Dict, List

import pytest

from ..submission_status import (
    generate_html_colors,
    get_latest_alignment_mwfr_for_fileset,
    get_output_files_info,
    get_qc_result,
    get_submitted_files_info,
    rgb_to_hex,
)

HEX_COLOR_RE = re.compile(r"^#[0-9a-f]{6}$")


@pytest.mark.parametrize(
    "rgb,expected",
    [
        ((0, 0, 0), "#000000"),
        ((255, 255, 255), "#ffffff"),
        ((255, 0, 0), "#ff0000"),
        # Floats are truncated via int(), then zero-padded to two hex digits
        ((254.9, 0.0, 15.0), "#fe000f"),
        ((16, 16, 16), "#101010"),
    ],
)
def test_rgb_to_hex(rgb, expected: str) -> None:
    assert rgb_to_hex(rgb) == expected


@pytest.mark.parametrize("num_colors", [0, -1, -5])
def test_generate_html_colors_non_positive_is_empty(num_colors: int) -> None:
    assert generate_html_colors(num_colors) == []


def test_generate_html_colors_single_is_fixed_green() -> None:
    assert generate_html_colors(1) == ["#30b052"]


@pytest.mark.parametrize("num_colors", [2, 3, 4, 6, 7])
def test_generate_html_colors_shape(num_colors: int) -> None:
    colors = generate_html_colors(num_colors)
    # Count is preserved and every entry is a valid lowercase hex color
    assert len(colors) == num_colors
    assert all(HEX_COLOR_RE.match(c) for c in colors)


def test_generate_html_colors_permutation_order() -> None:
    """The color list is interleave-permuted for contrast:
    [c0, c1, c2, c3, c4, c5] -> [c0, c3, c1, c4, c2, c5]."""
    colors = generate_html_colors(6)
    # The permutation is a pure reordering: no colors are lost or duplicated
    assert len(set(colors)) == len(colors)
    # First element is the red endpoint (hue 0), independent of permutation
    assert colors[0] == rgb_to_hex(tuple(c * 255 for c in (1.0, 0.0, 0.0)))


def _file(
    type_: str,
    status: str = "released",
    accession: str = "SMAFI000AAA",
    uuid: str = "uuid-0",
    **extra: Any,
) -> Dict[str, Any]:
    base = {
        "@type": [type_, "File", "Item"],
        "status": status,
        "accession": accession,
        "uuid": uuid,
        "display_title": accession,
    }
    base.update(extra)
    return base


def test_get_qc_result_basic_fields() -> None:
    file = _file("OutputFile", uuid="u1", accession="SMAFO001AAA")
    result = get_qc_result(file, is_output_file=True)
    assert result["uuid"] == "u1"
    assert result["accession"] == "SMAFO001AAA"
    assert result["status"] == "released"
    assert result["is_output_file"] is True
    # No quality_metrics key on the file -> empty list
    assert result["quality_metrics"] == []


def test_get_qc_result_quality_metrics_default_status() -> None:
    file = _file(
        "OutputFile",
        quality_metrics=[
            {"uuid": "qm1", "overall_quality_status": "PASS"},
            {"uuid": "qm2"},  # missing overall_quality_status -> "NA"
        ],
    )
    result = get_qc_result(file, is_output_file=False)
    assert result["is_output_file"] is False
    assert result["quality_metrics"] == [
        {"uuid": "qm1", "overall_quality_status": "PASS"},
        {"uuid": "qm2", "overall_quality_status": "NA"},
    ]


def test_get_output_files_info_filters_and_dedupes_by_accession() -> None:
    files = [
        _file("OutputFile", uuid="u1", accession="ACC1"),
        _file("OutputFile", status="deleted", uuid="u2", accession="ACC2"),
        _file("OutputFile", status="obsolete", uuid="u3", accession="ACC3"),
        _file("SubmittedFile", uuid="u4", accession="ACC4"),  # wrong type
        # Duplicate accession of ACC1 (e.g. released final output)
        _file("OutputFile", uuid="u5", accession="ACC1"),
    ]
    result = get_output_files_info(files, mwfrs=[], all_alignment_mwfrs={})
    accessions = sorted(qc["accession"] for qc in result["qc_infos"])
    # deleted/obsolete/non-output dropped; ACC1 de-duplicated to one entry
    assert accessions == ["ACC1"]


def test_get_output_files_info_collects_from_alignment_mwfrs() -> None:
    direct = _file("OutputFile", uuid="u1", accession="ACC1")
    mwfr_output_file = _file(
        "OutputFile",
        uuid="u2",
        accession="ACC2",
        quality_metrics=[{"uuid": "qm1", "overall_quality_status": "PASS"}],
    )
    mwfrs = [{"uuid": "mwfr-1"}]
    all_alignment_mwfrs = {
        "mwfr-1": {
            "workflow_runs": [
                {"output": [{"file": mwfr_output_file}]},
                {"output": [{"no_file": True}]},  # skipped: no "file"
            ]
        }
    }
    result = get_output_files_info([direct], mwfrs, all_alignment_mwfrs)
    accessions = sorted(qc["accession"] for qc in result["qc_infos"])
    assert accessions == ["ACC1", "ACC2"]


def test_get_submitted_files_info_upload_complete_and_formats() -> None:
    files = [
        _file(
            "SubmittedFile",
            uuid="u1",
            accession="ACC1",
            file_format={"display_title": "fastq"},
            file_status_tracking={"status_tracking": {"uploaded": "2024-01-01"}},
        ),
        _file(
            "SubmittedFile",
            uuid="u2",
            accession="ACC2",
            file_format={"display_title": "bam"},
            file_status_tracking={"status_tracking": {"uploaded": "2024-03-01"}},
        ),
    ]
    info = get_submitted_files_info(files)
    assert info["is_upload_complete"] is True
    assert info["num_submitted_files"] == 2
    # Formats are unique and sorted
    assert info["file_formats"] == "bam, fastq"
    # date_uploaded is the max across files
    assert info["date_uploaded"] == "2024-03-01"


def test_get_submitted_files_info_incomplete_upload_suppresses_date() -> None:
    files = [
        _file(
            "SubmittedFile",
            uuid="u1",
            accession="ACC1",
            status="uploading",
            file_format={"display_title": "fastq"},
            file_status_tracking={"status_tracking": {"uploaded": "2024-01-01"}},
        ),
    ]
    info = get_submitted_files_info(files)
    assert info["is_upload_complete"] is False
    # date only computed when the upload is complete
    assert info["date_uploaded"] is None


@pytest.mark.parametrize(
    "statuses,expected",
    [
        (["archived", "archived"], "archived"),  # single unique terminal status
        (["deleted"], "deleted"),
        (["archived", "deleted"], ""),  # mixed -> no overall status
        (["released"], ""),  # single but not terminal
        ([], ""),  # none present
    ],
)
def test_get_submitted_files_info_overall_status_unaligned_reads(
    statuses: List[str], expected: str
) -> None:
    files = [
        _file("UnalignedReads", uuid=f"u{i}", accession=f"ACC{i}", status=s)
        for i, s in enumerate(statuses)
    ]
    info = get_submitted_files_info(files)
    assert info["overall_status_unaligned_reads"] == expected


def test_get_latest_alignment_mwfr_for_fileset_none_when_empty() -> None:
    assert get_latest_alignment_mwfr_for_fileset([], {}) is None
    assert (
        get_latest_alignment_mwfr_for_fileset([{"uuid": "m1"}], {}) is None
    )


def test_get_latest_alignment_mwfr_for_fileset_no_match() -> None:
    fileset_mwfrs = [{"uuid": "m1", "date_created": "2024-01-01"}]
    all_alignment_mwfrs = {"other": {}}
    assert (
        get_latest_alignment_mwfr_for_fileset(fileset_mwfrs, all_alignment_mwfrs)
        is None
    )


def test_get_latest_alignment_mwfr_for_fileset_picks_most_recent() -> None:
    fileset_mwfrs = [
        {"uuid": "m1", "date_created": "2024-01-01"},
        {"uuid": "m2", "date_created": "2024-05-01"},
        {"uuid": "m3", "date_created": "2024-03-01"},
    ]
    all_alignment_mwfrs = {"m1": {}, "m2": {}, "m3": {}}
    latest = get_latest_alignment_mwfr_for_fileset(
        fileset_mwfrs, all_alignment_mwfrs
    )
    assert latest["uuid"] == "m2"
