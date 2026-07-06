"""Behavior-locking tests for the aggregation views in encoded.visualization.

These views build custom Elasticsearch aggregations and post-process the raw
ES response in Python. The tests here mock the ES round-trip
(``perform_search_request`` / ``make_search_subreq``) with canned aggregation
results so we can assert on the exact shape/values the views return. They exist
to demonstrate that the performance refactors preserve output.
"""

import json
from unittest.mock import patch

from webob.multidict import MultiDict

from encoded import visualization


class _FakeGET:
    def __init__(self, data):
        self._data = data or {}

    def dict_of_lists(self):
        return {k: list(v) for k, v in self._data.items()}


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
