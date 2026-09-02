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
    generate_manifest_header,
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
    assert row_by_column["PathologyOutcome"] == "Acceptable"
    assert row_by_column["PathologyTargetTissueSubtype"] == "Cortex,Liver"
    assert row_by_column["PathologyTargetTissuePresent"] == "No,Yes"
    assert "PathologyMetadataStatus" not in row_by_column
    assert "SequencedSampleExternalID" not in row_by_column
    assert "LinkedFixedSampleIdentifier" not in row_by_column
    assert "PathologyReportType" not in row_by_column
    assert "PathologyReportSubmittedID" not in row_by_column


def test_sample_pathology_manifest_header_excludes_rejected_status_and_historical_columns() -> None:
    _header1, _header2, columns = generate_manifest_header("sample_pathology.tsv", SAMPLE_PATHOLOGY)

    assert columns[:4] == [
        "FixedSampleAccession",
        "SequencedSampleAccession",
        "FixedSampleExternalID",
        "PathologyReportAccession",
    ]
    assert "PathologyMetadataStatus" not in columns
    assert "SequencedSampleExternalID" not in columns
    assert "FixedSamplePreservationType" not in columns
    assert "FixedSampleCategory" not in columns
    assert "LinkedFixedSampleIdentifier" not in columns
    assert "PathologyReportType" not in columns
    assert "PathologyReportSubmittedID" not in columns


def test_build_sample_pathology_row_preserves_numeric_zero_values() -> None:
    report = {
        "@type": ["BrainPathologyReport", "PathologyReport"],
        "accession": "SMHT-PR-0",
        "abc_score_A": 0,
        "abc_score_B": None,
        "abc_score_C": 0,
        "cerad_score": 0,
        "brain_subregions": [
            {
                "subregion": "Cerebellum Left Hemisphere",
                "is_present": "Yes",
                "tissue_autolysis_score": 0,
            },
        ],
    }

    row = _build_sample_pathology_row(
        None,
        {"accession": "SMHT-SAMPLE-1"},
        fixed_sample={"accession": "SMHT-FIXED-1"},
        report=report,
    )
    row_by_column = dict(zip(TSV_MAPPING[SAMPLE_PATHOLOGY].keys(), row))

    assert row_by_column["PathologyABCScoreA"] == 0
    assert row_by_column["PathologyABCScoreB"] == ""
    assert row_by_column["PathologyABCScoreC"] == 0
    assert row_by_column["PathologyCERADScore"] == 0
    assert row_by_column["PathologyBrainSubregionAutolysisScore"] == "0"


def test_build_sample_pathology_row_keeps_repeated_pathology_siblings_aligned() -> None:
    report = {
        "@type": ["PathologyReport"],
        "target_tissues": [
            {
                "target_tissue_subtype": "Liver",
                "target_tissue_present": "Yes",
                "target_tissue_percentage": "[50-100]",
                "target_tissue_autolysis_score": 0,
            },
            {
                "target_tissue_subtype": "Cortex",
                "target_tissue_percentage": "0",
            },
        ],
        "non_target_tissues": [
            {
                "non_target_tissue_subtype": "Other",
                "non_target_tissue_present": "Yes",
                "non_target_tissue_description": "capsule",
            },
            {
                "non_target_tissue_subtype": "Fibroadipose",
                "non_target_tissue_present": "No",
                "non_target_tissue_percentage": "[0-10]",
            },
        ],
        "pathologic_findings": [
            {
                "finding_type": "Other",
                "finding_description": "pigment",
                "finding_percentage": "[11-25]",
            },
            {
                "finding_type": "Inflammation",
                "finding_present": "No",
            },
        ],
        "brain_subregions": [
            {
                "subregion": "Hippocampus Left Hemisphere",
                "tissue_autolysis_score": 2,
            },
            {
                "subregion": "Cerebellum Left Hemisphere",
                "is_present": "Yes",
                "tissue_autolysis_score": 0,
            },
        ],
    }

    row = _build_sample_pathology_row(
        None,
        {"accession": "SMHT-SAMPLE-1"},
        fixed_sample={"accession": "SMHT-FIXED-1"},
        report=report,
    )
    row_by_column = dict(zip(TSV_MAPPING[SAMPLE_PATHOLOGY].keys(), row))

    assert row_by_column["PathologyTargetTissueSubtype"] == "Cortex,Liver"
    assert row_by_column["PathologyTargetTissuePresent"] == ",Yes"
    assert row_by_column["PathologyTargetTissuePercentage"] == "0,[50-100]"
    assert row_by_column["PathologyTargetTissueAutolysisScore"] == ",0"
    assert row_by_column["PathologyNonTargetTissueSubtype"] == "Fibroadipose,Other"
    assert row_by_column["PathologyNonTargetTissuePresent"] == "No,Yes"
    assert row_by_column["PathologyNonTargetTissuePercentage"] == "[0-10],"
    assert row_by_column["PathologyNonTargetTissueDescription"] == ",capsule"
    assert row_by_column["PathologyFindingType"] == "Inflammation,Other"
    assert row_by_column["PathologyFindingPresent"] == "No,"
    assert row_by_column["PathologyFindingDescription"] == ",pigment"
    assert row_by_column["PathologyFindingPercentage"] == ",[11-25]"
    assert row_by_column["PathologyBrainSubregion"] == (
        "Cerebellum Left Hemisphere,Hippocampus Left Hemisphere"
    )
    assert row_by_column["PathologyBrainSubregionPresent"] == "Yes,"
    assert row_by_column["PathologyBrainSubregionAutolysisScore"] == "0,2"


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
    assert columns[:4] == [
        "FixedSampleAccession",
        "SequencedSampleAccession",
        "FixedSampleExternalID",
        "PathologyReportAccession",
    ]
    assert "PathologyMetadataStatus" not in columns
    assert "SequencedSampleExternalID" not in columns
    assert "FixedSamplePreservationType" not in columns
    assert "FixedSampleCategory" not in columns
    assert "LinkedFixedSampleIdentifier" not in columns
    assert "PathologyReportType" not in columns
    assert "PathologyReportSubmittedID" not in columns
    assert not any(name.endswith("SubmittedID") for name in columns)
    assert rows_by_column[0]["FixedSampleAccession"] == "SMHT-FIXED-1"
    assert rows_by_column[0]["SequencedSampleAccession"] == "SMHT-SAMPLE-1"
    assert rows_by_column[0]["PathologyReportAccession"] == "SMHT-PR-1"
    assert rows_by_column[1]["FixedSampleAccession"] == "SMHT-FIXED-2"
    assert rows_by_column[1]["SequencedSampleAccession"] == "SMHT-SAMPLE-2"
    assert rows_by_column[1]["PathologyReportAccession"] == ""
    assert rows_by_column[1]["PathologyOutcome"] == ""
    assert rows_by_column[2]["FixedSampleAccession"] == "SMHT-FIXED-1"
    assert rows_by_column[2]["SequencedSampleAccession"] == "SMHT-SAMPLE-4"
    assert all(row["SequencedSampleAccession"] != "SMHT-SAMPLE-3" for row in rows_by_column)
    assert all(row["SequencedSampleAccession"] != "SMHT-SAMPLE-5" for row in rows_by_column)


def test_generate_sample_pathology_manifest_excludes_only_in_review_and_deleted_fixed_samples(monkeypatch) -> None:
    sequenced_sample = {
        "uuid": "sequenced-sample",
        "@type": ["TissueSample", "Sample"],
        "accession": "SMHT-SAMPLE-1",
        "linked_fixed_samples": [
            {"uuid": "fixed-released"},
            {"uuid": "fixed-open"},
            {"uuid": "fixed-open-early"},
            {"uuid": "fixed-open-network"},
            {"uuid": "fixed-in-review"},
            {"uuid": "fixed-deleted"},
        ],
    }
    fixed_samples = [
        {
            "uuid": f"fixed-{status.replace(' ', '-').replace('_', '-')}",
            "accession": f"SMHT-FIXED-{index}",
            "status": status,
        }
        for index, status in enumerate(
            ["released", "open", "open-early", "open-network", "in review", "deleted"],
            start=1,
        )
    ]
    calls = []

    def fake_stream_metadata_items(_request, *, type_param, uuids=None, excluded_statuses=None, **_kwargs):
        calls.append((type_param, excluded_statuses))
        if type_param == "Sample":
            return iter([sequenced_sample])
        if type_param == "TissueSample":
            excluded = set(excluded_statuses or ())
            return (
                sample
                for sample in fixed_samples
                if sample["uuid"] in uuids and sample["status"] not in excluded
            )
        raise AssertionError(type_param)

    monkeypatch.setattr(metadata_module, "_stream_metadata_items", fake_stream_metadata_items)
    monkeypatch.setattr(metadata_module, "_stream_pathology_reports_for_fixed_samples", lambda *_args: iter([]))

    args = SimpleNamespace(tsv_mapping=TSV_MAPPING[SAMPLE_PATHOLOGY])
    rows = list(
        generate_sample_pathology_manifest(
            None,
            args,
            [{"samples": [{"uuid": sequenced_sample["uuid"]}]}],
        )
    )
    rows_by_column = [
        dict(zip(TSV_MAPPING[SAMPLE_PATHOLOGY].keys(), row))
        for row in rows
    ]

    assert calls[1] == ("TissueSample", ("in review", "deleted"))
    assert [row["FixedSampleAccession"] for row in rows_by_column] == [
        "SMHT-FIXED-1",
        "SMHT-FIXED-2",
        "SMHT-FIXED-3",
        "SMHT-FIXED-4",
    ]
