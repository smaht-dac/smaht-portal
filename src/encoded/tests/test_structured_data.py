from contextlib import contextmanager
import json
import os
import tempfile
from typing import List, Optional, Union
from unittest import mock
from encoded.ingestion.structured_data import Portal, Schema, StructuredDataSet, Utils
from encoded.ingestion.ingestion_processors import parse_structured_data
from encoded.project.loadxl import ITEM_INDEX_ORDER

portal = Portal.create_for_unit_testing()


@contextmanager
def _mocked_noschema():
    def mocked_schema_load_by_name(name: str, portal: Portal) -> Optional[dict]:
        return None
    with mock.patch("encoded.ingestion.structured_data.Schema.load_by_name", side_effect=mocked_schema_load_by_name):
        yield


def _assert_parse_structured_data(file: str, rows: List[str], expected: Union[dict, list]) -> None:
    if rows:
        with Utils.temporary_file(name=file, content=rows) as tmp_file_name:
            structured_data_set = StructuredDataSet.load(file=tmp_file_name, portal=portal, order=ITEM_INDEX_ORDER)
            assert structured_data_set.data == expected
    else:
        structured_data_set = StructuredDataSet.load(file=file, portal=portal, order=ITEM_INDEX_ORDER)
        assert structured_data_set.data == expected


def _test_parse_structured_data(file: str, rows: List[str], expected: Union[dict, list], noschemas: bool = False) -> None:
    if noschemas:
        with _mocked_noschema():
            _assert_parse_structured_data(file, rows, expected)
    else:
        _assert_parse_structured_data(file, rows, expected)


def test_parse_structured_data():
    _test_parse_structured_data("test.csv", noschemas=True, rows=[
        "uuid,status,principals_allowed.view,principals_allowed.edit,other_allowed_extension#,data",
        "some-uuid-a,public,pav-a,pae-a,alfa|bravo|charlie,123.4",
        "some-uuid-b,public,pav-b,pae-a,delta|echo|foxtrot|golf,xyzzy"
    ],
    expected={
      "Test": [
        {
          "uuid": "some-uuid-a",
          "status": "public",
          "principals_allowed": { "view": "pav-a", "edit": "pae-a"
          },
          "other_allowed_extension": [ "alfa", "bravo", "charlie" ],
          "data": "123.4"
        },
        {
          "uuid": "some-uuid-b",
          "status": "public",
          "principals_allowed": { "view": "pav-b", "edit": "pae-a" },
          "other_allowed_extension": [ "delta", "echo", "foxtrot", "golf" ],
          "data": "xyzzy"
        }
      ]
    })
