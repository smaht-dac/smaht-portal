from contextlib import contextmanager
import copy
import inspect
import json
import os
import re
import tempfile
from typing import Callable, List, Optional
from unittest import mock
from encoded.ingestion.structured_data import Schema, _StructuredRowData, StructuredDataSet, Portal, Utils
from dcicutils.zip_utils import temporary_file

SAMPLE_SCHEMA_ONE = {
    "properties": {
        "uuid": {
            "title": "UUID",
            "type": "string"
        },
        "tags": {
            "type": "array",
            "items": {
                "type": "string"
            }
        },
        "date_created": {
            "type": "string"
        },
        "submitted_by": {
            "type": "string",
            "linkTo": "User"
        },
        "status": {
            "type": "string",
            "enum": [
                "Public",
                "Current",
                "Deleted",
                "Inactive",
                "In Review",
                "Obsolete",
                "Shared"
            ]
        },
        "schema_version": {
            "type": "string"
        },
        "last_modified": {
            "type": "object",
            "properties": {
                "date_modified": {
                    "type": "string"
                },
                "modified_by": {
                    "type": "string"
                }
            }
        },
        "identifier": {
            "type": "string"
        },
        "description": {
            "type": "string"
        },
        "submission_centers": {
            "type": "array",
            "items": {
                "type": "string"
            }
        },
#       "nonono": {
#           "type": "array",
#           "items": {
#               "type": "array"
#           }
#       },
#       "nonono": {
#           "type": "array"
#       },
        "xyzzy": {
            "type": "array",
            "items": {
                 "type": "object",
                 "properties": {
                     "foo": {"type": "string"},
                     "goo": {"type": "string"},
                     "hoo": {"type": "integer"}
                 }
            }
        },
        "some_integer_property": {
            "type": "integer"
        },
        "some_boolean_property": {
            "type": "boolean"
        },
        "consortia": {
            "type": "array",
            "items": {
                "type": "string"
            }
        },
        "aliases": {
            "type": "array",
            "items": {
                "type": "string"
            }
        },
        "accession": {
            "type": "string"
        },
        "alternate_accessions": {
            "type": "array",
            "items": {
                "type": "string"
            }
        },
        "standard_file_extension": {
            "type": "string"
        },
        "other_allowed_extensions": {
            "items": {
                "title": "OK Extension",
                "type": "string"
            },
            "type": "array"
        },
        "extra_file_formats": {
            "items": {
                "description": "A file format for an extra file",
                "linkTo": "FileFormat",
                "title": "Format",
                "type": "string"
            },
            "type": "array"
        },
        "@id": {
            "type": "string"
        },
        "@type": {
            "type": "array",
            "items": {
                "type": "string"
            }
        },
        "principals_allowed": {
            "type": "object",
            "properties": {
                "view": {
                    "type": "string"
                },
                "edit": {
                    "type": "string"
                }
            }
        },
        "display_title": {
            "type": "string"
        }
    }
}

SAMPLE_SCHEMA_TWO = {
    "properties": {
        "abc": {
            "type": "object",
            "properties": {
                "def": {"type": "string"},
                "ghi": {
                    "type": "object",
                    "properties": {
                        "jkl": {"type": "string"},
                        "mno": {"type": "number"}
                      }
                  }
              }
        },
        "pqr": {"type": "integer"},
        "stu": {
            "type": "array",
            "items": {"type": "string"}
        },
        "vw": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "xy": {"type": "integer"},
                    "z": {"type": "boolean"},
                    "foo": {"type": "integer"}
                }
            }
        },
        "simple_string": {
            "type": "string",
        },
        "simple_string_array": {
            "type": "array",
            "items": {
                "type": "string"
            }
        },
        "simple_integer_array": {
            "type": "array",
            "items": {
                "type": "integer"
            }
        },
        "simple_number_array": {
            "type": "array",
            "items": {
                "type": "number"
            }
        },
        "simple_boolean_array": {
            "type": "array",
            "items": {
                "type": "boolean"
            }
        },
        "ignore_empty_object": {},
        "ignore_no_object": None
    }
}


def _check_schema_flat_type_info_results(schema: dict, expected: dict) -> None:
    assert _get_schema_flat_type_info(Schema(schema), debug=True) == expected


def _check_parse_csv(rows: List[str], expected: dict, schema: Optional[Schema] = None) -> dict:
    portal = Portal.create_for_testing() if schema else None
    if schema:
        schema = copy.deepcopy(schema.data)
    with temporary_file(content=rows, suffix=".csv") as tmp_file_name:
        if schema and not schema.get("title"):
            schema["title"] = Utils.get_type_name(tmp_file_name)
        with mock.patch("encoded.ingestion.structured_data.Portal.ref_exists", return_value=True):
            structured_data = StructuredDataSet.load(tmp_file_name, schemas=[schema], portal=portal, prune=False)
            assert structured_data and structured_data.data and len(structured_data.data) == 1
            data = next(iter(structured_data.data.values()))
            assert data == expected


def _check_parse_csv_with_schema(schema: Schema, rows: List[str], expected: dict) -> dict:
    return _check_parse_csv(rows, expected, schema)


@contextmanager
def _temporary_file(name: Optional[str] = None, suffix: Optional[str] = None):
    with tempfile.TemporaryDirectory() as temporary_directory:
        if name:
            temporary_file_name = os.path.join(temporary_directory, name) + (suffix or "")
        else:
            tmp_file = tempfile.NamedTemporaryFile(dir=temporary_directory, suffix=suffix, delete=False)
            temporary_file_name = tmp_file.name
            tmp_file.close()
        try:
            yield temporary_file_name
        finally:
            pass  # TemporaryDirectory handles cleanup.


def test_schema_basic_one():
    _check_schema_flat_type_info_results(SAMPLE_SCHEMA_ONE, {
        "uuid": {"type": "string", "map": "<map_value_string>"},
        "tags#": {"type": "string", "map": "<map_value_array>"},
        "date_created": {"type": "string", "map": "<map_value_string>"},
        "submitted_by": {"type": "string", "map": "<map_value_ref>"},
        "status": {"type": "string", "map": "<map_value_enum>"},
        "schema_version": {"type": "string", "map": "<map_value_string>"},
        "last_modified.date_modified": {"type": "string", "map": "<map_value_string>"},
        "last_modified.modified_by": {"type": "string", "map": "<map_value_string>"},
        "identifier": {"type": "string", "map": "<map_value_string>"},
        "description": {"type": "string", "map": "<map_value_string>"},
        "submission_centers#": {"type": "string", "map": "<map_value_array>"},
        "xyzzy#.foo": {"type": "string", "map": "<map_value_string>"},
        "xyzzy#.goo": {"type": "string", "map": "<map_value_string>"},
        "xyzzy#.hoo": {"type": "integer", "map": "<map_value_integer>"},
        "consortia#": {"type": "string", "map": "<map_value_array>"},
        "aliases#": {"type": "string", "map": "<map_value_array>"},
        "accession": {"type": "string", "map": "<map_value_string>"},
        "alternate_accessions#": {"type": "string", "map": "<map_value_array>"},
        "standard_file_extension": {"type": "string", "map": "<map_value_string>"},
        "other_allowed_extensions#": {"type": "string", "map": "<map_value_array>"},
        "extra_file_formats#": {"type": "string", "map": "<map_value_array>"},
        "@id": {"type": "string", "map": "<map_value_string>"},
        "@type#": {"type": "string", "map": "<map_value_array>"},
        "principals_allowed.view": {"type": "string", "map": "<map_value_string>"},
        "principals_allowed.edit": {"type": "string", "map": "<map_value_string>"},
        "display_title": {"type": "string", "map": "<map_value_string>"},
        "some_integer_property": {"type": "integer", "map": "<map_value_integer>"},
        "some_boolean_property": {"type": "boolean", "map": "<map_value_boolean>"}
    })
    _check_schema_flat_type_info_results(SAMPLE_SCHEMA_TWO, {
        "abc.def":               {"type": "string", "map": "<map_value_string>"},
        "abc.ghi.jkl":           {"type": "string", "map": "<map_value_string>"},
        "abc.ghi.mno":           {"type": "number", "map": "<map_value_number>"},
        "stu#":                  {"type": "string", "map": "<map_value_array>"},
        "vw#.xy":                {"type": "integer", "map": "<map_value_integer>"},
        "pqr":                   {"type": "integer", "map": "<map_value_integer>"},
        "vw#.z":                 {"type": "boolean", "map": "<map_value_boolean>"},
        "vw#.foo":               {"type": "integer", "map": "<map_value_integer>"},
        "simple_string":         {"type": "string", "map": "<map_value_string>"},
        "simple_string_array#":  {"type": "string", "map": "<map_value_array>"},
        "simple_integer_array#": {"type": "integer", "map": "<map_value_array>"},
        "simple_number_array#":  {"type": "number", "map": "<map_value_array>"},
        "simple_boolean_array#": {"type": "boolean", "map": "<map_value_array>"}
    })


def _check_structured_column_data_results(columns: str, expected: dict) -> None:
    assert _StructuredRowData(columns.split(","))._row_template == expected


def test_schema_structured_column_data_basic_one():
    _check_structured_column_data_results(
        "abc", {
            "abc": None
        })
    _check_structured_column_data_results(
        "abc,def,ghi.jkl,mnop.qrs.tuv", {
            "abc": None,
            "def": None,
            "ghi": {"jkl": None},
            "mnop": {"qrs": {"tuv": None}}
        })
    _check_structured_column_data_results(
        "abc,def.ghi,jkl#", {
            "abc": None,
            "def": {"ghi": None},
            "jkl": []
        })
    _check_structured_column_data_results(
        "abc,def.ghi,jkl#.mnop", {
            "abc": None,
            "def": {"ghi": None},
            "jkl": [{"mnop": None}]
        })
    _check_structured_column_data_results(
        "abc,def.ghi,jkl#.mnop#", {
            "abc": None,
            "def": {"ghi": None},
            "jkl": [{"mnop": []}]
        })
    _check_structured_column_data_results(
        "abc,def.ghi,jkl#.mnop#2", {
            "abc": None,
            "def": {"ghi": None},
            "jkl": [{"mnop": [None, None, None]}]
        })
    _check_structured_column_data_results(
        "abc,def.ghi,jkl#.mnop#2.rs", {
            "abc": None,
            "def": {"ghi": None},
            "jkl": [{"mnop": [{"rs": None}, {"rs": None}, {"rs": None}]}]
        })
    _check_structured_column_data_results(
        "abc,def.ghi,jkl#.mnop#2.rs#.tuv", {
            "abc": None,
            "def": {"ghi": None},
            "jkl": [{"mnop": [{"rs": [{"tuv": None}]}, {"rs": [{"tuv": None}]}, {"rs": [{"tuv": None}]}]}]
        })
    _check_structured_column_data_results(
        "abc.def.ghi,xyzzy", {
            "abc": {"def": {"ghi": None}},
            "xyzzy": None
        })


def test_schema_structured_column_data_basic_two():
    _check_structured_column_data_results(
        "abc.def.ghi,xyzzy#,simple_string", {
            "abc": {"def": {"ghi": None}},
            "xyzzy": [],
            "simple_string": None
        })
    _check_structured_column_data_results(
        "abc.def.ghi,xyzzy#2", {
            "abc": {"def": {"ghi": None}},
            "xyzzy": [None, None, None]
        })
    _check_structured_column_data_results(
        "abc.def.ghi,xyzzy#2,xyzzy#3", {
            "abc": {"def": {"ghi": None}},
            "xyzzy": [None, None, None, None]
        })
    _check_structured_column_data_results(
        "abc.def.ghi,xyzzy#2,xyzzy#", {
            "abc": {"def": {"ghi": None}},
            "xyzzy": [None, None, None]
        })
    _check_structured_column_data_results(
        "abc.def.ghi,xyzzy#2,xyzzy#0", {
            "abc": {"def": {"ghi": None}},
            "xyzzy": [None, None, None]
        })
    _check_structured_column_data_results(
        "abc.def.ghi,xyzzy#2,xyzzy#1", {
            "abc": {"def": {"ghi": None}},
            "xyzzy": [None, None, None]
        })
    _check_structured_column_data_results(
        "abc.def.ghi,xyzzy#2,xyzzy#1.foo", {
            "abc": {"def": {"ghi": None}},
            "xyzzy": [{"foo": None}, {"foo": None}, {"foo": None}]
        })
    _check_structured_column_data_results(
        "abc.def.ghi,xyzzy#2.goo,xyzzy#1.foo", {
            "abc": {"def": {"ghi": None}},
            "xyzzy": [{"foo": None, "goo": None}, {"foo": None, "goo": None}, {"foo": None, "goo": None}]
        })
    _check_structured_column_data_results(
        "abc.def.ghi,xyzzy#2.goo,xyzzy#1.foo#", {
            "abc": {"def": {"ghi": None}},
            "xyzzy": [{"foo": [], "goo": None}, {"foo": [], "goo": None}, {"foo": [], "goo": None}]
        })
    _check_structured_column_data_results(
        "abc.def.ghi,xyzzy#2.goo,xyzzy#1.foo#0", {
            "abc": {"def": {"ghi": None}},
            "xyzzy": [{"foo": [None], "goo": None}, {"foo": [None], "goo": None}, {"foo": [None], "goo": None}]
        })
    _check_structured_column_data_results(
        "abc.def.ghi,xyzzy#2.goo,xyzzy#1.foo#2,jklmnop#3", {
            "abc": {"def": {"ghi": None}},
            "xyzzy": [{"foo": [None, None, None], "goo": None}, {"foo": [None, None, None], "goo": None}, {"foo": [None, None, None], "goo": None}],
            "jklmnop": [None, None, None, None]
        })
    _check_structured_column_data_results(
        "abc.def.ghi,xyzzy#2.goo,xyzzy#1.foo#2,jklmnop#3", {
            "abc": {"def": {"ghi": None}},
            "xyzzy": [{"foo": [None, None, None], "goo": None}, {"foo": [None, None, None], "goo": None}, {"foo": [None, None, None], "goo": None}],
            "jklmnop": [None, None, None, None]
        })


def test_parse_csv_one():
    _check_parse_csv(
        [
            "abc,abc#",
            "alice|bob|charley,foobar|goobar"
        ],
        [
            {
                "abc": ["foobar", "goobar"]
            }
        ])
    _check_parse_csv(
        [
            "abc#,abc#1",
            "alice|bob|charley,foobar|goobar"
        ],
        [
            {
                "abc": ["alice", "foobar", "goobar", "charley"]
            }
        ])
    _check_parse_csv(
        [
            "abc#,abc#",
            "alice|bob|charley,foobar|goobar"
        ],
        [
            {
                "abc": ["foobar", "goobar"]
            }
        ])
    _check_parse_csv(
        [
            "other_allowed_extensions,other_allowed_extensions#4",
            "alice|bob|charley,foobar|goobar"
        ],
        [
            {
                "other_allowed_extensions": ["alice", "bob", "charley", None, "foobar", "goobar"]
            }
        ])
    _check_parse_csv(
        [
            "other_allowed_extensions#,other_allowed_extensions#4",
            "alice|bob|charley,foobar|goobar"
        ],
        [
            {
                "other_allowed_extensions": ["alice", "bob", "charley", None, "foobar", "goobar"]
            }
        ])
    _check_parse_csv(
        [
            "uuid,status,principals_allowed. view,principals_allowed.edit,other_allowed_extensions,other_allowed_extensions#4",
            "some-uuid-a,public,pav-a,pae-a,alice|bob|charley,foobar|goobar",
            "some-uuid-b,public,pav-b,pae-a,alice|bob|charley,foobar|goobar"
        ],
        [
            {
                "uuid": "some-uuid-a",
                "status": "public",
                "principals_allowed": {"view": "pav-a", "edit": "pae-a"},
                "other_allowed_extensions": ["alice", "bob", "charley", None, "foobar", "goobar"]
            },
            {
                "uuid": "some-uuid-b",
                "status": "public",
                "principals_allowed": {"view": "pav-b", "edit": "pae-a"},
                "other_allowed_extensions": ["alice", "bob", "charley", None, "foobar", "goobar"]
            }
        ])


def test_parse_csv_two():
    _check_parse_csv(
        [
            "abc.def,pqr,vw#.xy",
            "alpha,1234,781"
        ],
        [
            {"abc": {"def": "alpha"}, "pqr": "1234", "vw": [{"xy": "781"}]}
        ])
    _check_parse_csv(
        [
            "xyzzy#1",
            "456"
        ],
        [
            {"xyzzy": [None, "456"]}
        ])
    _check_parse_csv(
        [
            "xyzzy#2",
            "456"
        ],
        [
            {"xyzzy": [None, None, "456"]}
        ])
    _check_parse_csv(
        [
            "abc.def.ghi,xyzzy#2",
            "123,456"
        ],
        [
            {"abc": {"def": {"ghi": "123"}}, "xyzzy": [None, None, "456"]}
        ])
    _check_parse_csv(
        [
            "prufrock#",
            "J.|Alfred|Prufrock"
        ],
        [
            {"prufrock": ["J.", "Alfred", "Prufrock"]}
        ])


def test_parse_csv_three():
    _check_parse_csv(
        [
            "abc.def,pqr,vw#1.xy",
            "alpha,1234,781"
        ],
        [
            {"abc": {"def": "alpha"}, "pqr": "1234", "vw": [{"xy": None}, {"xy": "781"}]}
        ])
    _check_parse_csv(
        [
            "abc.def,pqr,vw#.xy",
            "alpha,1234,781"
        ],
        [
            {"abc": {"def": "alpha"}, "pqr": "1234", "vw": [{"xy": "781"}]}
        ])
    _check_parse_csv(
        [
            "abc.def,pqr,vw#0.xy",
            "alpha,1234,781"
        ],
        [
            {"abc": {"def": "alpha"}, "pqr": "1234", "vw": [{"xy": "781"}]}
        ])
    _check_parse_csv(
        [
            "abc.def,pqr,vw#2.xy",
            "alpha,1234,781"
        ],
        [
            {"abc": {"def": "alpha"}, "pqr": "1234", "vw": [{"xy": None}, {"xy": None}, {"xy": "781"}]}
        ])


def test_parse_csv_with_schema_one():
    _check_parse_csv_with_schema(Schema(SAMPLE_SCHEMA_TWO),
        [
            "vw#.xy.foo,simple_string",
            "781,moby"
        ],
        [
            {"vw": [{"xy": {"foo": "781"}}], "simple_string": "moby"}
        ])
    _check_parse_csv_with_schema(Schema(SAMPLE_SCHEMA_TWO),
        [
            "abc.def,pqr,vw#.xy.foo",
            "alpha,1234,781"
        ],
        [
            {"abc": {"def": "alpha"}, "pqr": 1234, "vw": [{"xy": {"foo": "781"}}]}
        ])
    _check_parse_csv_with_schema(Schema(SAMPLE_SCHEMA_TWO),
        [
            "abc.def,pqr,vw#.xy",
            "alpha,1234,781"
        ],
        [
            {"abc": {"def": "alpha"}, "pqr": 1234, "vw": [{"xy": 781}]}
        ])


def test_parse_csv_with_schema_two():
    _check_parse_csv_with_schema(Schema(SAMPLE_SCHEMA_TWO),
        [
            "vw#2.xy.foo",
            "781"
        ],
        [
            {"vw": [
                {"xy": {"foo": None}},
                {"xy": {"foo": None}},
                {"xy": {"foo": "781"}}
            ]}
        ])
    _check_parse_csv_with_schema(Schema(SAMPLE_SCHEMA_TWO),
        [
            "vw#2.foo",
            "781"
        ],
        [
            {"vw": [
                {"foo": None},
                {"foo": None},
                {"foo": 781}
            ]}
        ])
    _check_parse_csv_with_schema(Schema(SAMPLE_SCHEMA_ONE),
        [
            "xyzzy#.hoo,status,extra_file_formats,submitted_by,some_boolean_property",
            "781,CURRENt,fastq,joe,true",
            "abc,curr,another_file_format,fred,false"
        ],
        [
            {"xyzzy": [{"hoo": 781}], "status": "Current", "extra_file_formats": ["fastq"], "submitted_by": "joe", "some_boolean_property": True},
            {"xyzzy": [{"hoo": "abc"}], "status": "Current", "extra_file_formats": ["another_file_format"], "submitted_by": "fred", "some_boolean_property": False}
        ])
    _check_parse_csv_with_schema(Schema(SAMPLE_SCHEMA_TWO),
        [
            "vw#.xy.foo",
            "781"
        ],
        [
            {"vw": [{"xy": {"foo": "781"}}]}
        ])
    _check_parse_csv_with_schema(Schema(SAMPLE_SCHEMA_TWO),
        [
            "simple_string_array",
            "1|23|456|7890"
        ],
        [
            {"simple_string_array": ["1", "23", "456", "7890"]}
        ])
    _check_parse_csv_with_schema(Schema(SAMPLE_SCHEMA_TWO),
        [
            "simple_integer_array",
            "1|23|456|7890"
        ],
        [
            {"simple_integer_array": [1, 23, 456, 7890]}
        ])
    _check_parse_csv_with_schema(Schema(SAMPLE_SCHEMA_TWO),
        [
            "simple_number_array",
            "1|23|456|7890.123"
        ],
        [
            {"simple_number_array": [1, 23, 456, 7890.123]}
        ])
    _check_parse_csv_with_schema(Schema(SAMPLE_SCHEMA_TWO),
        [
            "simple_boolean_array#",
            "true| False|false|True"
        ],
        [
            {"simple_boolean_array": [True, False, False, True]}
        ])
    _check_parse_csv_with_schema(Schema(SAMPLE_SCHEMA_TWO),
        [
            "simple_string_array,simple_integer_array,simple_number_array,simple_boolean_array",
            "1|23|456|7890 , 1|23|456|7890  ,  1|23|456|7890.123 , true| False|false|True"
        ],
        [
            {"simple_string_array": ["1", "23", "456", "7890"],
             "simple_integer_array": [1, 23, 456, 7890],
             "simple_number_array": [1, 23, 456, 7890.123],
             "simple_boolean_array": [True, False, False, True]}
        ])


def test_structured_data_set():
    x = StructuredDataSet("data/test.zip")

    rows = [
        "uuid,status,principals_allowed. view,principals_allowed.edit,other_allowed_extensions,other_allowed_extensions#4",
        "some-uuid-a,public,pav-a,pae-a,alice|bob|charley,foobar|goobar",
        "some-uuid-b,public,pav-b,pae-a,alice|bob|charley,foobar|goobar"
    ]
    with temporary_file(content=rows, name="abc.csv") as temporary_file_name:
        structured_data_set = StructuredDataSet(temporary_file_name)
        pass

    structured_data_set = StructuredDataSet("data/test.xlsx")



def test_schema():
    portal = Portal.create_for_testing()
    user_schema = Schema.load_by_name("user", portal=portal)
    assert user_schema is not None
    assert user_schema.data["$id"] == "/profiles/user.json"

def test_xyzzy():
    _check_parse_csv_with_schema(Schema(SAMPLE_SCHEMA_ONE),
        [
            "xyzzy#1.foo,xyzzy#1.hoo",
            "abc,123"
        ],
        [
            {"xyzzy": [{"foo": None, "hoo": None}, {"foo": "abc", "hoo": 123}]}
        ])
    _check_parse_csv_with_schema(Schema(SAMPLE_SCHEMA_ONE),
        [
            "xyzzy#.foo,xyzzy#.hoo",
            "abc,123"
        ],
        [
            {"xyzzy": [{"foo": "abc", "hoo": 123}]} # TODO: no xyzzy[1].hoo should be None
        ])
    _check_parse_csv_with_schema(Schema(SAMPLE_SCHEMA_ONE),
        [
            "xyzzy#.hoo",
            "123"
        ],
        [
            {"xyzzy": [{"hoo": 123}]}
        ])
    _check_parse_csv_with_schema(Schema(SAMPLE_SCHEMA_ONE),
        [
            "xyzzy#1.foo",
            "abc"
        ],
        [
            {"xyzzy": [{"foo": None}, {"foo": "abc"}]}
        ])

SAMPLE_SCHEMA_THREE = {
    "properties": {
        "vw": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "xy": {"type": "integer"},
                    "z": {"type": "boolean"},
                    "foo": {"type": "integer"},
                    "gooy": { "type": "string", "linkTo": "User"},
                    "hooy": { "type": "object", 
                             "properties": {
                                 "hello": {
                                    "type": "string",
                                    "linkTo": "User"}
                                 }
                             }
                }
            }
        }
    }
}

def test_abc():
    x = Schema(SAMPLE_SCHEMA_THREE)


def _get_schema_flat_type_info(schema: Schema, debug: bool = False):
    def map_function_name(map_function: Callable) -> str:
        # This is ONLY for testing/troubleshooting; get the NAME of the mapping function; this is HIGHLY
        # implementation DEPENDENT, on the map_function_<type> functions. The map_function, as a string,
        # looks like: <function Schema._map_function_string.<locals>.map_value_string at 0x103474900> or
        # if it is implemented as a lambda (to pass in closure), then inspect.getclosurevars.nonlocals looks like:
        # {"map_value_enum": <function Schema._map_function_enum.<locals>.map_value_enum at 0x10544cd60>, ...}
        if isinstance(map_function, Callable):
            if (match := re.search(r"\.(\w+) at", str(map_function))):
                return f"<{match.group(1)}>"
            for item in inspect.getclosurevars(map_function).nonlocals:
                if item.startswith("map_value_"):
                    return f"<{item}>"
        return type(map_function)
    return {key: {k: (map_function_name(v) if k == "map" and isinstance(v, Callable) and debug else v)
                  for k, v in value.items()} for key, value in schema._type_info.items()}
