from types import SimpleNamespace
from typing import Any, Optional

import pytest

from .. import metadata as metadata_module

from ..metadata import (
    SAMPLE_PATHOLOGY,
    TSV_MAPPING,
    _build_sample_pathology_row,
    _index_items_by_identifiers,
    _linked_item_identifiers,
    _neutralize_formula_injection,
    generate_sample_pathology_manifest,
    handle_file_group,
    handle_sample_source_type,
    handle_sample_type,
)


@pytest.mark.parametrize(
    "value,expected",
    [
        # Each of the four spreadsheet-formula lead characters gets quoted
        ("=1+1", "'=1+1"),
        ("+cmd", "'+cmd"),
        ("-2+3", "'-2+3"),
        ("@SUM(A1)", "'@SUM(A1)"),
        # A value that is *only* a lead char is still neutralized
        ("=", "'="),
        # Benign strings are returned unchanged
        ("safe", "safe"),
        ("a=b", "a=b"),  # lead char not first
        ("", ""),
        # Non-string values pass through untouched (no quoting, no crash)
        (5, 5),
        (None, None),
        (["=danger"], ["=danger"]),
        (0, 0),
    ],
)
def test_neutralize_formula_injection(value: Any, expected: Any) -> None:
    """CSV/TSV formula-injection guard (CWE-1236): only leading-char strings
    are prefixed with a single quote; everything else is returned as-is."""
    assert _neutralize_formula_injection(value) == expected


def test_handle_file_group_without_group_tag() -> None:
    field = {
        "submission_center": "smaht",
        "sample_source": "src",
        "sequencing": "seq",
        "assay": "assay",
        "group_tag": "",
    }
    assert handle_file_group(field) == "smaht-src-seq-assay"


def test_handle_file_group_with_group_tag() -> None:
    field = {
        "submission_center": "smaht",
        "sample_source": "src",
        "sequencing": "seq",
        "assay": "assay",
        "group_tag": "batch1",
    }
    assert handle_file_group(field) == "smaht-src-seq-assay-batch1"


@pytest.mark.parametrize("field", [{}, None, ""])
def test_handle_file_group_empty(field: Any) -> None:
    assert handle_file_group(field) == ""


def test_handle_file_group_missing_key_raises() -> None:
    # A required subfield being absent is a programming error, not a
    # silently-swallowed empty result. Pin that it raises.
    with pytest.raises(KeyError):
        handle_file_group({"submission_center": "smaht"})


@pytest.mark.parametrize(
    "field,expected",
    [
        # Precedence follows SAMPLE_TYPE_LIST order, not the input order:
        # TissueSample wins even when listed last in the input.
        ("CellCultureSample,TissueSample", "TissueSample"),
        ("CellCultureSample,CellSample", "CellSample"),
        ("CellCultureSample", "CellCultureSample"),
        # A value not in the list yields empty
        ("SomethingElse", ""),
        ("", ""),
        (None, ""),
    ],
)
def test_handle_sample_type(field: Optional[str], expected: str) -> None:
    assert handle_sample_type(field) == expected


@pytest.mark.parametrize(
    "field,expected",
    [
        # Precedence follows SAMPLE_SOURCE_TYPE_LIST order
        ("CellCulture,Tissue", "Tissue"),
        ("CellCulture,CellCultureMixture", "CellCultureMixture"),
        ("CellCulture", "CellCulture"),
        ("SomethingElse", ""),
        ("", ""),
        (None, ""),
    ],
)
def test_handle_sample_source_type(field: Optional[str], expected: str) -> None:
    assert handle_sample_source_type(field) == expected


def test_linked_item_identifiers_handles_embedded_links_and_strings() -> None:
    assert _linked_item_identifiers([
        {"uuid": "uuid-1", "@id": "/tissue-samples/1/"},
        {"@id": "/tissue-samples/2/"},
        "uuid-3",
        {},
        None,
    ]) == ["uuid-1", "/tissue-samples/2/", "uuid-3"]


def test_index_items_by_identifiers_indexes_common_link_keys() -> None:
    item = {
        "uuid": "uuid-1",
        "@id": "/pathology-reports/uuid-1/",
        "accession": "SMP123",
        "submitted_id": "TEST_ITEM_1",
    }
    indexed = _index_items_by_identifiers([item])
    assert indexed["uuid-1"] is item
    assert indexed["/pathology-reports/uuid-1/"] is item
    assert indexed["SMP123"] is item
    assert indexed["TEST_ITEM_1"] is item


def test_build_sample_pathology_row_includes_common_and_subtype_fields() -> None:
    sequenced_sample = {
        "accession": "SMHT-SAMPLE-1",
        "external_id": "SMHT001-1A-100A1",
        "preservation_type": "Frozen",
        "category": "Core",
        "sample_sources": [{"donor": {"accession": "SMHT-DONOR-1"}}],
    }
    fixed_sample = {
        "accession": "SMHT-FIXED-1",
        "external_id": "SMHT001-1B-100A1",
        "preservation_type": "Formalin-fixed Paraffin-embedded",
        "category": "Core",
    }
    report = {
        "@type": ["NonBrainPathologyReport", "PathologyReport", "SubmittedItem"],
        "accession": "SMHT-PR-1",
        "submitted_id": "TEST_NON-BRAIN-PATHOLOGY-REPORT_SMHT001-1B-100A1",
        "status": "released",
        "tissue_name": "Liver",
        "outcome": "Acceptable",
        "target_tissues": [
            {"target_tissue_subtype": "Liver", "target_tissue_present": "Yes"},
            {"target_tissue_subtype": "Cortex", "target_tissue_present": "No"},
        ],
    }

    row = _build_sample_pathology_row(
        None, sequenced_sample, fixed_sample=fixed_sample, report=report,
    )
    columns = list(TSV_MAPPING[SAMPLE_PATHOLOGY].keys())
    row_by_column = dict(zip(columns, row))

    assert row_by_column["SequencedSampleAccession"] == "SMHT-SAMPLE-1"
    assert row_by_column["FixedSampleAccession"] == "SMHT-FIXED-1"
    assert row_by_column["FixedSampleExternalID"] == "SMHT001-1B-100A1"
    assert row_by_column["LinkedFixedSampleIdentifier"] == ""
    assert row_by_column["PathologyReportType"] == "NonBrainPathologyReport"
    assert row_by_column["PathologyOutcome"] == "Acceptable"
    assert row_by_column["PathologyTargetTissueSubtype"] == "Cortex,Liver"
    assert row_by_column["PathologyTargetTissuePresent"] == "No,Yes"
    assert "PathologyMetadataStatus" not in row_by_column
    assert "SequencedSampleExternalID" not in row_by_column


def test_generate_sample_pathology_manifest_joins_samples_fixed_samples_and_reports(monkeypatch) -> None:
    sequenced_samples = [
        {
            "uuid": "sequenced-with-report",
            "@type": ["TissueSample", "Sample"],
            "accession": "SMHT-SAMPLE-1",
            "external_id": "SMHT001-3Q-001A1",
            "linked_fixed_samples": [{"uuid": "fixed-with-report"}],
        },
        {
            "uuid": "sequenced-no-report",
            "@type": ["TissueSample", "Sample"],
            "accession": "SMHT-SAMPLE-2",
            "external_id": "SMHT001-3Q-002A1",
            "linked_fixed_samples": [{"uuid": "fixed-no-report"}],
        },
        {
            "uuid": "sequenced-no-fixed",
            "@type": ["TissueSample", "Sample"],
            "accession": "SMHT-SAMPLE-3",
            "external_id": "SMHT001-3Q-003A1",
        },
        {
            "uuid": "sequenced-mixed-visibility",
            "@type": ["TissueSample", "Sample"],
            "accession": "SMHT-SAMPLE-4",
            "external_id": "SMHT001-3Q-004A1",
            "linked_fixed_samples": [{"uuid": "fixed-with-report"}, {"uuid": "fixed-not-visible"}],
        },
        {
            "uuid": "sequenced-not-tissue",
            "@type": ["CellCultureSample", "Sample"],
            "accession": "SMHT-SAMPLE-5",
            "external_id": "SMHT001-3Q-005A1",
            "linked_fixed_samples": [{"uuid": "fixed-with-report"}],
        },
    ]
    fixed_samples = [
        {"uuid": "fixed-with-report", "accession": "SMHT-FIXED-1", "external_id": "SMHT001-3R-001A1"},
        {"uuid": "fixed-no-report", "accession": "SMHT-FIXED-2", "external_id": "SMHT001-3R-002A1"},
    ]
    reports = [
        {
            "uuid": "report-1",
            "@type": ["BrainPathologyReport", "PathologyReport"],
            "accession": "SMHT-PR-1",
            "outcome": "Acceptable",
            "tissue_samples": [{"uuid": "fixed-with-report"}],
        }
    ]

    def fake_stream_metadata_items(_request, *, type_param, uuids=None, **_kwargs):
        if type_param == "Sample":
            return (sample for sample in sequenced_samples if sample["uuid"] in uuids)
        if type_param == "TissueSample":
            return (sample for sample in fixed_samples if sample["uuid"] in uuids)
        raise AssertionError(type_param)

    def fake_stream_pathology_reports(_request, fixed_identifiers, _source_fields):
        assert "fixed-with-report" in fixed_identifiers
        return iter(reports)

    monkeypatch.setattr(metadata_module, "_stream_metadata_items", fake_stream_metadata_items)
    monkeypatch.setattr(metadata_module, "_stream_pathology_reports_for_fixed_samples", fake_stream_pathology_reports)

    args = SimpleNamespace(tsv_mapping=TSV_MAPPING[SAMPLE_PATHOLOGY])
    search_iter = [{"samples": [{"uuid": sample["uuid"]} for sample in sequenced_samples]}]
    rows = list(generate_sample_pathology_manifest(None, args, search_iter))
    columns = list(TSV_MAPPING[SAMPLE_PATHOLOGY].keys())
    rows_by_column = [dict(zip(columns, row)) for row in rows]

    assert len(rows_by_column) == 3
    assert columns[:5] == [
        "FixedSampleAccession",
        "SequencedSampleAccession",
        "FixedSampleExternalID",
        "FixedSamplePreservationType",
        "FixedSampleCategory",
    ]
    assert "PathologyMetadataStatus" not in columns
    assert "SequencedSampleExternalID" not in columns
    assert rows_by_column[0]["FixedSampleAccession"] == "SMHT-FIXED-1"
    assert rows_by_column[0]["SequencedSampleAccession"] == "SMHT-SAMPLE-1"
    assert rows_by_column[0]["LinkedFixedSampleIdentifier"] == "fixed-with-report"
    assert rows_by_column[0]["PathologyReportAccession"] == "SMHT-PR-1"
    assert rows_by_column[0]["PathologyReportType"] == "BrainPathologyReport"
    assert rows_by_column[1]["FixedSampleAccession"] == "SMHT-FIXED-2"
    assert rows_by_column[1]["SequencedSampleAccession"] == "SMHT-SAMPLE-2"
    assert rows_by_column[1]["PathologyReportAccession"] == ""
    assert rows_by_column[1]["PathologyOutcome"] == ""
    assert rows_by_column[2]["FixedSampleAccession"] == "SMHT-FIXED-1"
    assert rows_by_column[2]["SequencedSampleAccession"] == "SMHT-SAMPLE-4"
    assert rows_by_column[2]["LinkedFixedSampleIdentifier"] == "fixed-with-report"
    assert all(row["SequencedSampleAccession"] != "SMHT-SAMPLE-3" for row in rows_by_column)
    assert all(row["SequencedSampleAccession"] != "SMHT-SAMPLE-5" for row in rows_by_column)
