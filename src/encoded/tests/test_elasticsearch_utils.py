import pytest
from typing import Optional
from encoded.endpoints.elasticsearch_utils import (
        create_elasticsearch_aggregation_query,
        merge_elasticsearch_aggregation_results,
        normalize_elasticsearch_aggregation_results)
from encoded.endpoints.recent_files_summary.recent_files_summary import (
        AGGREGATION_FIELD_RELEASE_DATE,
        AGGREGATION_FIELD_CELL_LINE,
        AGGREGATION_FIELD_FILE_DESCRIPTOR)

def test_create_elasticsearch_aggregation_query_a():

    def create_field_aggregation(field: str) -> Optional[dict]:
        if field == AGGREGATION_FIELD_RELEASE_DATE:
            return {
                "date_histogram": {
                    "field": f"embedded.{field}",
                    "calendar_interval": "month", "format": "yyyy-MM",
                    "missing": "1970-01", "order": {"_key": "desc"}
                }
            }

    aggregations = [
        AGGREGATION_FIELD_RELEASE_DATE,
        AGGREGATION_FIELD_CELL_LINE,
        AGGREGATION_FIELD_FILE_DESCRIPTOR
    ]

    aggregation_query = create_elasticsearch_aggregation_query(
        aggregations, create_field_aggregation=create_field_aggregation)

    assert aggregation_query ==  {
      "file_status_tracking.release_dates.initial_release": {
        "meta": {"field_name": "file_status_tracking.release_dates.initial_release"},
        "filter": {
          "bool": {
            "must": [
              {"exists": {"field": "embedded.file_status_tracking.release_dates.initial_release.raw"}},
              {"exists": {"field": "embedded.file_sets.libraries.analytes.samples.sample_sources.cell_line.code.raw"}},
              {"exists": {"field": "embedded.release_tracker_description.raw"}}
            ]
          }
        },
        "aggs": {
          "dummy_date_histogram": {
            "date_histogram": {
              "field": "embedded.file_status_tracking.release_dates.initial_release",
              "calendar_interval": "month", "format": "yyyy-MM",
              "missing": "1970-01", "order": { "_key": "desc" }
            },
            "aggs": {
              "file_sets.libraries.analytes.samples.sample_sources.cell_line.code": {
                "meta": {"field_name": "file_sets.libraries.analytes.samples.sample_sources.cell_line.code"},
                "terms": {
                  "field": "embedded.file_sets.libraries.analytes.samples.sample_sources.cell_line.code.raw",
                  "missing": "No value", "size": 200
                },
                "aggs": {
                  "release_tracker_description": {
                    "meta": {"field_name": "release_tracker_description"},
                    "terms": {
                      "field": "embedded.release_tracker_description.raw",
                      "missing": "No value", "size": 200
                    }
                  }
                }
              }
            }
          }
        }
      }
    }


def test_create_elasticsearch_aggregation_query_b():

    def create_field_aggregation(field: str) -> Optional[dict]:
        if field == AGGREGATION_FIELD_RELEASE_DATE:
            return {
                "date_histogram": {
                    "field": f"embedded.{field}",
                    "calendar_interval": "month", "format": "yyyy-MM",
                    "missing": "1970-01", "order": {"_key": "desc"}
                }
            }

    aggregations = [
        AGGREGATION_FIELD_RELEASE_DATE,
        AGGREGATION_FIELD_CELL_LINE,
        AGGREGATION_FIELD_FILE_DESCRIPTOR
    ]

    # Same as previous tests but with include_missing=True (no date_histogram complication).
    aggregation_query = create_elasticsearch_aggregation_query(
        aggregations, create_field_aggregation=create_field_aggregation, include_missing=True)

    assert aggregation_query == {
        "file_status_tracking.release_dates.initial_release": {
          "meta": {"field_name": "file_status_tracking.release_dates.initial_release"},
          "date_histogram": {
            "field": "embedded.file_status_tracking.release_dates.initial_release",
            "calendar_interval": "month", "format": "yyyy-MM",
            "missing": "1970-01", "order": {"_key": "desc"}
          },
          "aggs": {
            "file_sets.libraries.analytes.samples.sample_sources.cell_line.code": {
              "meta": {"field_name": "file_sets.libraries.analytes.samples.sample_sources.cell_line.code"},
              "terms": {
                "field": "embedded.file_sets.libraries.analytes.samples.sample_sources.cell_line.code.raw",
                "missing": "No value", "size": 200
              },
              "aggs": {
                "release_tracker_description": {
                  "meta": {"field_name": "release_tracker_description"},
                  "terms": {
                    "field": "embedded.release_tracker_description.raw",
                    "missing": "No value", "size": 200
                  }
                }
              }
            }
          }
        }
      }


def test_merge_elasticsearch_aggregation_results_a():

    target = {
      "meta": {"field_name": "date_created"}, "doc_count": 7,
      "buckets": [
        {
          "key_as_string": "2024-12", "key": 1733011200000, "doc_count": 7,
          "file_sets.libraries.analytes.samples.sample_sources.cell_line.code": {
              "meta": {"field_name": "file_sets.libraries.analytes.samples.sample_sources.cell_line.code"},
              "buckets": [
                  {
                      "key": "COLO829T", "doc_count": 7,
                      "release_tracker_description": {
                          "meta": {"field_name": "release_tracker_description"},
                          "buckets": [
                              {"key": "WGS ONT PromethION 24 bam", "doc_count": 7}
                          ]
                      }
                  }
              ]
          }
        }
      ]
    }

    source = {
      "meta": {"field_name": "date_created"}, "doc_count": 12,
      "buckets": [
        {
          "key_as_string": "2024-12", "key": 1733011200000, "doc_count": 12,
          "donors.display_title": {
            "meta": {"field_name": "donors.display_title"},
            "buckets": [
              {
                "key": "DAC_DONOR_COLO829", "doc_count": 12,
                "release_tracker_description": {
                  "meta": {"field_name": "release_tracker_description"},
                  "buckets": [
                    {"key": "Fiber-seq PacBio Revio bam", "doc_count": 12}
                  ]
                }
              }
            ]
          }
        }
      ]
    }

    assert merge_elasticsearch_aggregation_results(target, source) == {
      "meta": {"field_name": "date_created"}, "doc_count": 19,
      "buckets": [
        {
          "key_as_string": "2024-12", "key": 1733011200000, "doc_count": 19,
          "file_sets.libraries.analytes.samples.sample_sources.cell_line.code": {
            "meta": {"field_name": "file_sets.libraries.analytes.samples.sample_sources.cell_line.code"},
            "buckets": [
              {
                "key": "COLO829T", "doc_count": 7,
                "release_tracker_description": {
                  "meta": {"field_name": "release_tracker_description"},
                  "buckets": [
                    {"key": "WGS ONT PromethION 24 bam", "doc_count": 7}
                  ]
                }
              }
            ]
          },
          "donors.display_title": {
            "meta": {"field_name": "donors.display_title"},
            "buckets": [
              {
                "key": "DAC_DONOR_COLO829", "doc_count": 12,
                "release_tracker_description": {
                  "meta": {"field_name": "release_tracker_description"},
                  "buckets": [
                    {"key": "Fiber-seq PacBio Revio bam", "doc_count": 12}
                  ]
                }
              }
            ]
          }
        }
      ]
    }


def test_normalize_elasticsearch_aggregation_results_a():

    results = {
      "meta": {"field_name": "date_created"}, "doc_count": 15,
      "buckets": [
        {
          "key_as_string": "2024-12", "key": 1733011200000, "doc_count": 25,
          "file_sets.libraries.analytes.samples.sample_sources.cell_line.code": {
            "meta": {"field_name": "file_sets.libraries.analytes.samples.sample_sources.cell_line.code"},
            "buckets": [
              {
                "key": "COLO829T", "doc_count": 7,
                "release_tracker_description": {
                  "meta": {"field_name": "release_tracker_description"},
                  "buckets": [
                    {"key": "WGS ONT PromethION 24 bam", "doc_count": 1}
                  ]
                }
              }
            ]
          },
          "donors.display_title": {
            "meta": {"field_name": "donors.display_title"},
            "buckets": [
              {
                "key": "DAC_DONOR_COLO829", "doc_count": 12,
                "release_tracker_description": {
                  "meta": {"field_name": "release_tracker_description"},
                  "buckets": [
                    {"key": "Fiber-seq PacBio Revio bam", "doc_count": 4}
                  ]
                }
              }
            ]
          }
        }
      ]
    }

    assert normalize_elasticsearch_aggregation_results(results) == {
        "count": 25,
        "items": [
          {
            "name": "date_created",
            "value": "2024-12", "count": 11,
            "items": [
              {
                "name": "file_sets.libraries.analytes.samples.sample_sources.cell_line.code",
                "value": "COLO829T", "count": 1,
                "items": [
                  {
                    "name": "release_tracker_description",
                    "value": "WGS ONT PromethION 24 bam", "count": 1
                  }
                ]
              },
              {
                "name": "donors.display_title",
                "value": "DAC_DONOR_COLO829", "count": 4,
                "items": [
                  {
                    "name": "release_tracker_description",
                    "value": "Fiber-seq PacBio Revio bam", "count": 4
                  }
                ]
              }
            ]
          }
        ]
      }
