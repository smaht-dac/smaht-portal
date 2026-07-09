"""Behavior-locking tests for the aggregation views in encoded.visualization.

These views build custom Elasticsearch aggregations and post-process the raw
ES response in Python. The tests here mock the ES round-trip
(``perform_search_request`` / ``make_search_subreq``) with canned aggregation
results so we can assert on the exact shape/values the views return. They exist
to demonstrate that the performance refactors preserve output.
"""

import json
from unittest.mock import patch

import pytest
from webob.multidict import MultiDict

from .. import visualization
from ..visualization import convert_date_range


class _FakeGET:
    """Minimal stand-in for request.GET, only supports .dict_of_lists()."""

    def __init__(self, mapping=None):
        self._mapping = mapping or {}

    def dict_of_lists(self):
        return self._mapping


class FakeRequest:
    """Minimal stand-in for a Pyramid request for the visualization views."""

    def __init__(self, json_body=None, params=None, get=None):
        self._json_body = json_body
        self._params = MultiDict(params or {})
        self._get = _FakeGET(get)

    @property
    def json_body(self):
        if self._json_body is None:
            raise json.decoder.JSONDecodeError("no json body", "", 0)
        return self._json_body

    @property
    def params(self):
        return self._params

    @property
    def GET(self):
        return self._get


def _stub_search(monkeypatch, search_result):
    """Bypass the real ES-backed search() call, returning a canned result."""
    monkeypatch.setattr(visualization, "make_search_subreq", lambda request, path: None)
    monkeypatch.setattr(
        visualization,
        "perform_search_request",
        lambda context, subreq, custom_aggregations=None: search_result,
    )


def test_bar_plot_chart_formats_nested_buckets_in_a_single_pass(monkeypatch) -> None:
    # Regression test for the format_bucket_result refactor: merging the tissue-category
    # pass into the main recursive walk must not change the shape/values of nested
    # "all_donors_ids" / "other_doc_count" results for a plain (non-tissue) aggregation.
    search_result = {
        "total": 42,
        "aggregations": {
            "total_donors": {"value": 10},
            "total_assays": {"value": 3},
            "total_tissues": {"value": 5},
            "total_file_size": {"value": 1000},
            "all_donors_ids": {"buckets": [{"key": "D1"}, {"key": "D2"}]},
            "field_0": {
                "sum_other_doc_count": 2,
                "buckets": [
                    {
                        "key": "RNA-seq",
                        "doc_count": 20,
                        "total_donors": {"value": 4},
                        "all_donors_ids": {"buckets": [{"key": "D1"}, {"key": "D2"}]},
                        "field_1": {
                            "sum_other_doc_count": 1,
                            "buckets": [
                                {
                                    "key": "Liver",
                                    "doc_count": 12,
                                    "total_donors": {"value": 3},
                                    "all_donors_ids": {"buckets": [{"key": "D1"}]},
                                },
                                {
                                    "key": "Kidney",
                                    "doc_count": 8,
                                    "total_donors": {"value": 2},
                                    "all_donors_ids": {"buckets": [{"key": "D2"}]},
                                },
                            ],
                        },
                    },
                    {
                        "key": "WGS",
                        "doc_count": 20,
                        "total_donors": {"value": 5},
                        "all_donors_ids": {"buckets": [{"key": "D3"}]},
                        "field_1": {"sum_other_doc_count": 0, "buckets": []},
                    },
                ],
            },
        },
    }
    _stub_search(monkeypatch, search_result)

    request = FakeRequest(
        json_body={
            "search_query_params": {"type": ["File"]},
            "fields_to_aggregate_for": ["assays.display_title", "sample_summary.tissues"],
            "include_meta_tissue_categories": False,
        }
    )

    result = visualization.bar_plot_chart(None, request)

    assert result["field"] == "assays.display_title"
    assert result["other_doc_count"] == 2
    assert result["total"]["doc_count"] == 42
    assert result["total"]["files"] == 42  # isFileTypeSearch True: type == ["File"]
    assert result["total"]["donors"] == 10
    assert result["total"]["all_donors_ids"] == ["D1", "D2"]
    assert result["meta"] == {}

    assert set(result["terms"].keys()) == {"RNA-seq", "WGS"}

    rna_seq = result["terms"]["RNA-seq"]
    assert rna_seq["term"] == "RNA-seq"
    assert rna_seq["field"] == "sample_summary.tissues"
    assert rna_seq["other_doc_count"] == 1
    assert rna_seq["total"]["doc_count"] == 20
    assert rna_seq["total"]["all_donors_ids"] == ["D1", "D2"]
    assert set(rna_seq["terms"].keys()) == {"Liver", "Kidney"}
    assert rna_seq["terms"]["Liver"] == {
        "doc_count": 12,
        "files": 12,
        "donors": 3,
        "all_donors_ids": ["D1"],
    }
    assert rna_seq["terms"]["Kidney"]["all_donors_ids"] == ["D2"]

    wgs = result["terms"]["WGS"]
    assert wgs["total"]["all_donors_ids"] == ["D3"]
    assert wgs["terms"] == {}


def test_bar_plot_chart_tissue_category_meta_matches_pre_merge_behavior(monkeypatch) -> None:
    # The tissue-category extraction used to run as a second, separate pass over
    # field_0's buckets; it now runs inside format_bucket_result's single pass.
    # Verify it still produces the same per-term "most common category" + full
    # per-category counts, and still skips terms with no category buckets at all.
    search_result = {
        "total": 15,
        "aggregations": {
            "total_donors": {"value": 5},
            "total_assays": {"value": 2},
            "total_tissues": {"value": 2},
            "total_file_size": {"value": 500},
            "all_donors_ids": {"buckets": [{"key": "D1"}]},
            "field_0": {
                "sum_other_doc_count": 0,
                "buckets": [
                    {
                        "key": "Liver",
                        "doc_count": 10,
                        "total_donors": {"value": 3},
                        "all_donors_ids": {"buckets": [{"key": "D1"}, {"key": "D2"}]},
                        "AGG_tissue_category": {
                            "buckets": [
                                {"key": "Solid Tissue", "doc_count": 7},
                                {"key": "Other", "doc_count": 3},
                            ]
                        },
                    },
                    {
                        "key": "Blood",
                        "doc_count": 5,
                        "total_donors": {"value": 2},
                        "all_donors_ids": {"buckets": [{"key": "D3"}]},
                        "AGG_tissue_category": {"buckets": []},
                    },
                ],
            },
        },
    }
    _stub_search(monkeypatch, search_result)

    request = FakeRequest(
        json_body={
            "search_query_params": {"type": ["File"], "sample_summary.tissues": ["Liver", "Blood"]},
            "fields_to_aggregate_for": ["sample_summary.tissues"],
            "include_meta_tissue_categories": True,
        }
    )

    result = visualization.bar_plot_chart(None, request)

    assert result["meta"]["tissue_category_by_term"] == {"Liver": "Solid Tissue"}
    assert result["meta"]["tissue_category_counts_by_term"] == {
        "Liver": {"Solid Tissue": 7, "Other": 3}
    }
    # "Blood" had no category buckets at all, so it's absent from both meta dicts.
    assert "Blood" not in result["meta"]["tissue_category_by_term"]
    assert "Blood" not in result["meta"]["tissue_category_counts_by_term"]


def test_convert_date_range_invalid_preset_raises() -> None:
    with pytest.raises(IndexError):
        convert_date_range("not-a-preset")


def _run_view(view, search_result, request):
    """Invoke a visualization view with the ES round-trip mocked out."""
    with patch.object(visualization, "make_search_subreq", return_value=None), \
            patch.object(visualization, "perform_search_request", return_value=search_result):
        return view(None, request)


def _strip_volatile(result):
    """Drop non-deterministic fields (timestamps) before comparison."""
    if isinstance(result, dict):
        result.pop("time_generated", None)
    return result


# ---------------------------------------------------------------------------
# date_histogram_aggregations
# ---------------------------------------------------------------------------

def test_date_histogram_aggregations_basic():
    search_result = {
        "@context": "/terms/",
        "@id": "/search/?type=File",
        "@graph": [],
        "facets": [],
        "filters": [],
        "aggregations": {
            "weekly_interval_file_status_tracking.status_tracking.uploading": {
                "buckets": [
                    {"key_as_string": "2024-01-01", "doc_count": 5,
                     "total_files": {"value": 5}}
                ]
            }
        },
        "total": 5,
    }
    request = FakeRequest(json_body={"search_query_params": {"type": ["File"]}})
    result = _run_view(visualization.date_histogram_aggregations, search_result, request)

    # FIELDS_TO_DELETE removed
    for field in visualization.FIELDS_TO_DELETE:
        assert field not in result
    assert result["aggregations"]["weekly_interval_file_status_tracking.status_tracking.uploading"][
        "buckets"][0]["doc_count"] == 5
    assert result["total"] == 5
    assert result["from_date"] is None
    assert result["to_date"] is None
    assert result["interval"] == ["weekly"]


# ---------------------------------------------------------------------------
# bar_plot_chart
# ---------------------------------------------------------------------------

def _bar_plot_search_result():
    """Two-level aggregation: field_0 (data_type) -> field_1 (file_format)."""
    def sum_aggs(donors, tissues, assays, file_size, donor_ids):
        return {
            "total_donors": {"value": donors},
            "total_tissues": {"value": tissues},
            "total_assays": {"value": assays},
            "total_file_size": {"value": file_size},
            "all_donors_ids": {"buckets": [{"key": d} for d in donor_ids]},
        }

    return {
        "total": 100,
        "aggregations": {
            **sum_aggs(10, 3, 4, 5000, ["D1", "D2", "D3"]),
            "field_0": {
                "sum_other_doc_count": 2,
                "buckets": [
                    {
                        "key": "Aligned Reads",
                        "doc_count": 60,
                        **sum_aggs(7, 2, 3, 3000, ["D1", "D2"]),
                        "field_1": {
                            "sum_other_doc_count": 1,
                            "buckets": [
                                {"key": "bam", "doc_count": 40,
                                 **sum_aggs(5, 1, 2, 2000, ["D1"])},
                                {"key": "cram", "doc_count": 20,
                                 **sum_aggs(3, 1, 1, 1000, ["D2"])},
                            ],
                        },
                    },
                    {
                        "key": "Unaligned Reads",
                        "doc_count": 40,
                        **sum_aggs(4, 1, 1, 2000, ["D3"]),
                        "field_1": {
                            "sum_other_doc_count": 0,
                            "buckets": [
                                {"key": "fastq", "doc_count": 40,
                                 **sum_aggs(4, 1, 1, 2000, ["D3"])},
                            ],
                        },
                    },
                ],
            },
        },
    }


def test_bar_plot_chart_two_level():
    request = FakeRequest(json_body={
        "search_query_params": {"type": ["File"]},
        "fields_to_aggregate_for": ["data_type", "file_format"],
    })
    result = _run_view(visualization.bar_plot_chart, _bar_plot_search_result(), request)
    _strip_volatile(result)

    assert result["field"] == "data_type"
    assert result["total"] == {
        "doc_count": 100,
        "files": 100,
        "donors": 10,
        "assays": 4,
        "tissues": 3,
        "file_size": 5000,
        "all_donors_ids": ["D1", "D2", "D3"],
    }
    assert result["other_doc_count"] == 2
    assert result["meta"] == {}

    aligned = result["terms"]["Aligned Reads"]
    assert aligned["term"] == "Aligned Reads"
    assert aligned["field"] == "file_format"
    assert aligned["total"] == {
        "doc_count": 60, "files": 60, "donors": 7, "all_donors_ids": ["D1", "D2"],
    }
    assert aligned["other_doc_count"] == 1
    # terminal level buckets carry just totals
    assert aligned["terms"]["bam"] == {
        "doc_count": 40, "files": 40, "donors": 5, "all_donors_ids": ["D1"],
    }
    assert aligned["terms"]["cram"] == {
        "doc_count": 20, "files": 20, "donors": 3, "all_donors_ids": ["D2"],
    }
    assert result["terms"]["Unaligned Reads"]["terms"]["fastq"] == {
        "doc_count": 40, "files": 40, "donors": 4, "all_donors_ids": ["D3"],
    }


def test_bar_plot_chart_tissue_categories():
    tissue_field = "sample_summary.tissues"
    category_agg = "AGG_tissue_category"

    def sum_aggs(donors, donor_ids, extra=None):
        d = {
            "total_donors": {"value": donors},
            "total_tissues": {"value": 1},
            "total_assays": {"value": 1},
            "total_file_size": {"value": 100},
            "all_donors_ids": {"buckets": [{"key": x} for x in donor_ids]},
        }
        if extra:
            d.update(extra)
        return d

    search_result = {
        "total": 50,
        "aggregations": {
            **sum_aggs(5, ["D1", "D2"]),
            "field_0": {
                "sum_other_doc_count": 0,
                "buckets": [
                    {
                        "key": "Lung",
                        "doc_count": 30,
                        **sum_aggs(3, ["D1"], {
                            category_agg: {"buckets": [
                                {"key": "Respiratory", "doc_count": 20},
                                {"key": "Other", "doc_count": 10},
                            ]}
                        }),
                    },
                    {
                        "key": "Liver",
                        "doc_count": 20,
                        **sum_aggs(2, ["D2"], {
                            category_agg: {"buckets": [
                                {"key": "Digestive", "doc_count": 20},
                            ]}
                        }),
                    },
                ],
            },
        },
    }
    request = FakeRequest(json_body={
        "search_query_params": {"type": ["File"]},
        "fields_to_aggregate_for": [tissue_field],
        "include_meta_tissue_categories": True,
    })
    result = _run_view(visualization.bar_plot_chart, search_result, request)
    _strip_volatile(result)

    assert result["meta"]["tissue_category_by_term"] == {
        "Lung": "Respiratory",
        "Liver": "Digestive",
    }
    assert result["meta"]["tissue_category_counts_by_term"] == {
        "Lung": {"Respiratory": 20, "Other": 10},
        "Liver": {"Digestive": 20},
    }
    # single-level: terms are terminal totals
    assert result["terms"]["Lung"] == {
        "doc_count": 30, "files": 30, "donors": 3, "all_donors_ids": ["D1"],
    }


# ---------------------------------------------------------------------------
# data_matrix_aggregations
# ---------------------------------------------------------------------------

def _data_matrix_search_result():
    """column field_0 (data_type) with nested row field_1 (tissue)."""
    def counts(files, coverage, donors):
        return {
            "doc_count": files,
            "total_coverage": {"value": coverage},
            "donors": {"value": donors},
        }

    return {
        "total": 100,
        "facets": [
            {"field": "data_type", "terms": [
                {"key": "Aligned Reads", "doc_count": 60},
                {"key": "Unaligned Reads", "doc_count": 40},
            ]},
        ],
        "filters": [],
        "aggregations": {
            "donors": {"value": 12},
            "field_0": {
                "sum_other_doc_count": 3,
                "buckets": [
                    {
                        "key": "Aligned Reads",
                        **counts(60, 30.0, 8),
                        "field_1": {
                            "sum_other_doc_count": 1,
                            "buckets": [
                                {"key": "Lung", **counts(40, 20.0, 5)},
                                {"key": "Liver", **counts(20, 10.0, 3)},
                            ],
                        },
                    },
                    {
                        "key": "Unaligned Reads",
                        **counts(40, 15.0, 4),
                        "field_1": {
                            "sum_other_doc_count": 0,
                            "buckets": [
                                {"key": "Lung", **counts(40, 15.0, 4)},
                            ],
                        },
                    },
                ],
            },
            "row_totals_0": {
                "buckets": [
                    {"key": "Lung", **counts(80, 35.0, 9)},
                    {"key": "Liver", **counts(20, 10.0, 3)},
                ],
            },
            "column_totals": {
                "buckets": [
                    {"key": "Aligned Reads", **counts(60, 30.0, 8)},
                    {"key": "Unaligned Reads", **counts(40, 15.0, 4)},
                ],
            },
        },
    }


def test_data_matrix_aggregations_nested():
    request = FakeRequest(json_body={
        "search_query_params": {"type": ["File"]},
        "column_agg_fields": ["data_type"],
        "row_agg_fields": ["tissue"],
    })
    result = _run_view(visualization.data_matrix_aggregations, _data_matrix_search_result(), request)
    _strip_volatile(result)

    assert result["field"] == "data_type"
    assert result["counts"] == {"files": 100, "donors": 12}
    assert result["row_total_field"] == "tissue"
    assert result["other_doc_count"] == 3
    assert result["facet_terms"] == {
        "data_type": ["Aligned Reads", "Unaligned Reads"],
    }

    aligned = result["terms"]["Aligned Reads"]
    assert aligned["term"] == "Aligned Reads"
    assert aligned["field"] == "tissue"
    assert aligned["counts"] == {"files": 60, "total_coverage": 30.0, "donors": 8}
    assert aligned["other_doc_count"] == 1
    assert aligned["terms"]["Lung"] == {
        "counts": {"files": 40, "total_coverage": 20.0, "donors": 5}
    }
    assert aligned["terms"]["Liver"] == {
        "counts": {"files": 20, "total_coverage": 10.0, "donors": 3}
    }

    assert result["row_total_terms"]["Lung"] == {
        "counts": {"files": 80, "total_coverage": 35.0, "donors": 9}
    }

    assert result["column_totals"] == [
        {"data_type": "Aligned Reads",
         "counts": {"files": 60, "total_coverage": 30.0, "donors": 8}},
        {"data_type": "Unaligned Reads",
         "counts": {"files": 40, "total_coverage": 15.0, "donors": 4}},
    ]


def test_data_matrix_aggregations_flatten_values():
    request = FakeRequest(json_body={
        "search_query_params": {"type": ["File"]},
        "column_agg_fields": ["data_type"],
        "row_agg_fields": ["tissue"],
        "flatten_values": True,
    })
    result = _run_view(visualization.data_matrix_aggregations, _data_matrix_search_result(), request)
    _strip_volatile(result)

    assert result["flatten_values"] is True
    assert result["column_agg_fields"] == ["data_type"]
    assert result["row_agg_fields"] == ["tissue"]
    assert result["counts"] == {"files": 100, "donors": 12}

    # data: flattened list of leaf records
    expected_data = [
        {"data_type": "Aligned Reads", "tissue": "Lung",
         "counts": {"files": 40, "total_coverage": 20.0, "donors": 5}},
        {"data_type": "Aligned Reads", "tissue": "Liver",
         "counts": {"files": 20, "total_coverage": 10.0, "donors": 3}},
        {"data_type": "Unaligned Reads", "tissue": "Lung",
         "counts": {"files": 40, "total_coverage": 15.0, "donors": 4}},
    ]
    assert result["data"] == expected_data
    assert result["column_totals"] == [
        {"data_type": "Aligned Reads",
         "counts": {"files": 60, "total_coverage": 30.0, "donors": 8}},
        {"data_type": "Unaligned Reads",
         "counts": {"files": 40, "total_coverage": 15.0, "donors": 4}},
    ]


# ---------------------------------------------------------------------------
# Edge cases (empty buckets, missing fields, composite keys)
# ---------------------------------------------------------------------------

def test_bar_plot_chart_empty_buckets_with_tissue_categories():
    """No matching files: terms is empty and the meta category dicts are
    present-but-empty (exercises the single-pass 2d refactor with 0 buckets)."""
    zero = {
        "total_donors": {"value": 0},
        "total_tissues": {"value": 0},
        "total_assays": {"value": 0},
        "total_file_size": {"value": 0},
        "all_donors_ids": {"buckets": []},
    }
    search_result = {
        "total": 0,
        "aggregations": {**zero, "field_0": {"buckets": []}},
    }
    request = FakeRequest(json_body={
        "search_query_params": {"type": ["File"]},
        "fields_to_aggregate_for": ["sample_summary.tissues"],
        "include_meta_tissue_categories": True,
    })
    result = _run_view(visualization.bar_plot_chart, search_result, request)
    _strip_volatile(result)

    assert result["terms"] == {}
    assert result["total"]["all_donors_ids"] == []
    assert result["meta"]["tissue_category_by_term"] == {}
    assert result["meta"]["tissue_category_counts_by_term"] == {}


def test_bar_plot_chart_tissue_category_missing_and_null_keys():
    """A category bucket with key=None is skipped; a tissue with no category
    buckets produces no mapping entry."""
    category_agg = "AGG_tissue_category"

    def sum_aggs(donors, donor_ids, extra=None):
        d = {
            "total_donors": {"value": donors},
            "total_tissues": {"value": 1},
            "total_assays": {"value": 1},
            "total_file_size": {"value": 100},
            "all_donors_ids": {"buckets": [{"key": x} for x in donor_ids]},
        }
        if extra:
            d.update(extra)
        return d

    search_result = {
        "total": 15,
        "aggregations": {
            **sum_aggs(3, ["D1", "D2"]),
            "field_0": {
                "sum_other_doc_count": 0,
                "buckets": [
                    {"key": "Lung", "doc_count": 10, **sum_aggs(2, ["D1"], {
                        category_agg: {"buckets": [
                            {"key": None, "doc_count": 5},
                            {"key": "Respiratory", "doc_count": 3},
                        ]}
                    })},
                    {"key": "Liver", "doc_count": 5, **sum_aggs(1, ["D2"], {
                        category_agg: {"buckets": []}
                    })},
                ],
            },
        },
    }
    request = FakeRequest(json_body={
        "search_query_params": {"type": ["File"]},
        "fields_to_aggregate_for": ["sample_summary.tissues"],
        "include_meta_tissue_categories": True,
    })
    result = _run_view(visualization.bar_plot_chart, search_result, request)
    _strip_volatile(result)

    # None-keyed category bucket ignored; Liver (no categories) absent.
    assert result["meta"]["tissue_category_by_term"] == {"Lung": "Respiratory"}
    assert result["meta"]["tissue_category_counts_by_term"] == {
        "Lung": {"Respiratory": 3},
    }


def test_data_matrix_aggregations_missing_coverage_and_donors():
    """Buckets without total_coverage/donors default coverage to 0 and omit
    the donors key (exercises the 3d extract_bucket_counts refactor)."""
    search_result = {
        "total": 5,
        "facets": [],
        "filters": [],
        "aggregations": {
            "field_0": {
                "sum_other_doc_count": 0,
                "buckets": [
                    {"key": "X", "doc_count": 5,
                     "field_1": {"buckets": [{"key": "Y", "doc_count": 5}]}},
                ],
            },
            "row_totals_0": {"buckets": [{"key": "Y", "doc_count": 5}]},
        },
    }
    request = FakeRequest(json_body={
        "search_query_params": {"type": ["File"]},
        "column_agg_fields": ["data_type"],
        "row_agg_fields": ["tissue"],
    })
    result = _run_view(visualization.data_matrix_aggregations, search_result, request)
    _strip_volatile(result)

    assert result["terms"]["X"]["counts"] == {"files": 5, "total_coverage": 0}
    assert result["terms"]["X"]["terms"]["Y"] == {
        "counts": {"files": 5, "total_coverage": 0}
    }
    # No column_totals agg -> falls back to field_0 buckets.
    assert result["column_totals"] == [
        {"data_type": "X", "counts": {"files": 5, "total_coverage": 0}},
    ]


def test_data_matrix_aggregations_flatten_composite_keys():
    """Composite column key (assay+platform) and composite row key
    (tissue+donor) are joined with the delimiter (exercises 3f)."""
    def c(files):
        return {"doc_count": files, "total_coverage": {"value": 1.0},
                "donors": {"value": 1}}

    search_result = {
        "total": 10,
        "facets": [],
        "filters": [],
        "aggregations": {
            "donors": {"value": 3},
            "field_0": {
                "sum_other_doc_count": 0,
                "buckets": [
                    {"key": "WGS", **c(10), "field_1": {"buckets": [
                        {"key": "Illumina", **c(10), "field_2": {"buckets": [
                            {"key": "Lung", **c(6), "field_3": {"buckets": [
                                {"key": "D1", **c(6)},
                            ]}},
                        ]}},
                    ]}},
                ],
            },
            "row_totals_0": {"buckets": [
                {"key": "Lung", **c(6), "row_totals_1": {"buckets": [
                    {"key": "D1", **c(6)},
                ]}},
            ]},
            "column_totals": {"buckets": [{"key": "WGS Illumina", **c(10)}]},
        },
    }
    request = FakeRequest(json_body={
        "search_query_params": {"type": ["File"]},
        "column_agg_fields": ["assay", "platform"],
        "row_agg_fields": [["tissue", "donor"]],
        "flatten_values": True,
    })
    result = _run_view(visualization.data_matrix_aggregations, search_result, request)
    _strip_volatile(result)

    # Composite column ['assay','platform'] -> item['assay'] becomes the join;
    # composite row [['tissue','donor']] -> item['tissue'] becomes the join.
    assert result["data"] == [{
        "assay": "WGS Illumina",
        "platform": "Illumina",
        "tissue": "Lung D1",
        "donor": "D1",
        "counts": {"files": 6, "total_coverage": 1.0, "donors": 1},
    }]
