from hms_utils.misc_utils import dj
import pytest
from typing import Optional
from encoded.elasticsearch_utils import create_elasticsearch_aggregation_query
from encoded.recent_files_summary import (AGGREGATION_FIELD_RELEASE_DATE,
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
      "file_status_tracking.released": {
        "meta": {"field_name": "file_status_tracking.released"},
        "filter": {
          "bool": {
            "must": [
              {"exists": {"field": "embedded.file_status_tracking.released.raw"}},
              {"exists": {"field": "embedded.file_sets.libraries.analytes.samples.sample_sources.cell_line.code.raw"}},
              {"exists": {"field": "embedded.release_tracker_description.raw"}}
            ]
          }
        },
        "aggs": {
          "dummy_date_histogram": {
            "date_histogram": {
              "field": "embedded.file_status_tracking.released",
              "calendar_interval": "month", "format": "yyyy-MM",
              "missing": "1970-01", "order": { "_key": "desc" }
            },
            "aggs": {
              "file_sets.libraries.analytes.samples.sample_sources.cell_line.code": {
                "meta": {"field_name": "file_sets.libraries.analytes.samples.sample_sources.cell_line.code"},
                "terms": {
                  "field": "embedded.file_sets.libraries.analytes.samples.sample_sources.cell_line.code.raw",
                  "missing": "No value", "size": 100
                },
                "aggs": {
                  "release_tracker_description": {
                    "meta": { "field_name": "release_tracker_description" },
                    "terms": {
                      "field": "embedded.release_tracker_description.raw",
                      "missing": "No value", "size": 100
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

    aggregation_query == {
        "file_status_tracking.released": {
          "meta": {"field_name": "file_status_tracking.released"},
          "date_histogram": {
            "field": "embedded.file_status_tracking.released",
            "calendar_interval": "month", "format": "yyyy-MM",
            "missing": "1970-01", "order": {"_key": "desc"}
          },
          "aggs": {
            "file_sets.libraries.analytes.samples.sample_sources.cell_line.code": {
              "meta": {"field_name": "file_sets.libraries.analytes.samples.sample_sources.cell_line.code"},
              "terms": {
                "field": "embedded.file_sets.libraries.analytes.samples.sample_sources.cell_line.code.raw",
                "missing": "No value", "size": 100
              },
              "aggs": {
                "release_tracker_description": {
                  "meta": {"field_name": "release_tracker_description"},
                  "terms": {
                    "field": "embedded.release_tracker_description.raw",
                    "missing": "No value", "size": 100
                  }
                }
              }
            }
          }
        }
      }
