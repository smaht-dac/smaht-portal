from datetime import datetime

import pytest

from .. import visualization
from ..visualization import convert_date_range, DATE_RANGE_PRESETS


class _FakeParams:
    """Minimal stand-in for request.params, only supports .getall()."""

    def __init__(self, mapping=None):
        self._mapping = mapping or {}

    def getall(self, key):
        return self._mapping.get(key, [])


class _FakeGET:
    """Minimal stand-in for request.GET, only supports .dict_of_lists()."""

    def __init__(self, mapping=None):
        self._mapping = mapping or {}

    def dict_of_lists(self):
        return self._mapping


class _FakeRequest:
    """Bare-bones request exposing only what bar_plot_chart reads."""

    def __init__(self, json_body, field_params=None):
        self.json_body = json_body
        self.params = _FakeParams(field_params)
        self.GET = _FakeGET()


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

    request = _FakeRequest(
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

    request = _FakeRequest(
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


def test_convert_date_range_custom_both_dates() -> None:
    result = convert_date_range("custom|2024-01-01|2024-02-15")
    assert result == [datetime(2024, 1, 1), datetime(2024, 2, 15)]


def test_convert_date_range_custom_only_from() -> None:
    result = convert_date_range("custom|2024-01-01")
    assert result == [datetime(2024, 1, 1), None]


def test_convert_date_range_custom_no_dates() -> None:
    assert convert_date_range("custom") == [None, None]


@pytest.mark.parametrize(
    "date_range_str",
    [
        "custom|2024-1-1|2024-02-15",  # from is not exactly 10 chars -> ignored
        "custom||2024-02-15",  # empty from
    ],
)
def test_convert_date_range_custom_malformed_from_is_ignored(
    date_range_str: str,
) -> None:
    # A non-10-char (or empty) date field is silently skipped rather than parsed
    date_from, _ = convert_date_range(date_range_str)
    assert date_from is None


def test_convert_date_range_custom_bad_10_char_date_raises() -> None:
    # Exactly 10 chars but not a real date -> strptime raises ValueError
    with pytest.raises(ValueError):
        convert_date_range("custom|2024-13-99")


@pytest.mark.parametrize("preset", sorted(DATE_RANGE_PRESETS.keys()))
def test_convert_date_range_presets_return_two_datetimes(preset: str) -> None:
    date_from, date_to = convert_date_range(preset)
    assert isinstance(date_from, datetime)
    assert isinstance(date_to, datetime)
    # Ranges are well-formed: start is not after end
    assert date_from <= date_to
