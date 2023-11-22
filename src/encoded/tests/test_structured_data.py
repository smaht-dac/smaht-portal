from contextlib import contextmanager
import inspect
import json
import os
import pdb
import pytest
import re
from typing import Callable, List, Optional, Union
from unittest import mock
from dcicutils.bundle_utils import RefHint
from dcicutils.misc_utils import to_camel_case
from dcicutils.validation_utils import SchemaManager  # noqa
from dcicutils.zip_utils import temporary_file
from encoded.ingestion.structured_data import Portal, Schema, _get_type_name, _StructuredRowData  # noqa
from encoded.ingestion.ingestion_processors import parse_structured_data

THIS_TEST_MODULE_DIRECTORY = os.path.dirname(os.path.abspath(__file__))
TEST_FILES_DIR = f"{THIS_TEST_MODULE_DIRECTORY}/data/test-files"
SAME_AS_EXPECTED_REFS = {}
SAME_AS_NOREFS = {}


def _load_json_from_file(file: str) -> dict:
    with open(os.path.join(TEST_FILES_DIR, file)) as f:
        return json.load(f)

def _pytest_kwargs(kwargs: List[dict]) -> List[dict]:
    debug_kwargs = [kwarg for kwarg in kwargs if (kwarg.get("debug") is True)]
    return debug_kwargs or kwargs

@pytest.mark.parametrize("kwargs", _pytest_kwargs([  # test_parse_structured_data_parameterized
    {
        "ignore": True,
        "rows":  [
            r"abc,def.ghi",
            r"{},[]"
        ],
        "as_file_name": "test.csv",
        "schemas": [
            {
                "title": "Test",
                "properties": {
                    "abc": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                             },
                            "id": {
                                "type": "integer",
                             }
                        }
                    },
                    "def": {
                        "type": "object",
                        "properties": {
                            "ghi": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "foo": {
                                        "type": "object",
                                        "properties": {
                                            "goo": {
                                                "type": "integer"
                                            }
                                        }
                                    }
                                }
                            }
                         }
                    }
                 }
            }
        ],
        "expected": {
            "Test": [
                {
                }
            ]
        }
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows":  [
            r"uuid,status,principals.view,principals.edit,extensions#,data",
            r"some-uuid-a,public,pav-a,pae-a,alfa|bravo|charlie,123.4",
            r"some-uuid-b,public,pav-b,pae-b,delta|echo|foxtrot|golf,xyzzy"
        ],
        "as_file_name": "some_test.csv",
        "noschemas": True,
        "expected": {
            "SomeTest": [
                {
                    "uuid": "some-uuid-a",
                    "status": "public",
                    "principals": { "view": "pav-a", "edit": "pae-a"
                },
                    "extensions": [ "alfa", "bravo", "charlie" ],
                    "data": "123.4"
                },
                {
                    "uuid": "some-uuid-b",
                    "status": "public",
                    "principals": { "view": "pav-b", "edit": "pae-b" },
                    "extensions": [ "delta", "echo", "foxtrot", "golf" ],
                    "data": "xyzzy"
                }
            ]
        },
        "sheet_utils_also": True
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            r"uuid,status,principals.view,principals.edit,extensions#,num,i,arr",
            r"some-uuid-a,public,pav-a,pae-a,alfa|bravo|charlie,123.4,617,hotel",
            r"some-uuid-b,public,pav-b,pae-b,delta|echo|foxtrot|golf,987,781,indigo\|juliet|kilo"
        ],
        "as_file_name": "some_test.csv",
        "schemas": [
            {
                "title": "SomeTest",
                "properties": {
                    "num": { "type": "number" },
                    "i": { "type": "integer" },
                    "arr": { "type": "array", "items": { "type": "string" } }
                 }
            }
        ],
        "expected": {
            "SomeTest": [
                {
                    "uuid": "some-uuid-a",
                    "status": "public",
                    "principals": { "view": "pav-a", "edit": "pae-a"
                },
                    "extensions": [ "alfa", "bravo", "charlie" ],
                    "num": 123.4,
                    "i": 617,
                    "arr": ["hotel"]
                },
                {
                    "uuid": "some-uuid-b",
                    "status": "public",
                    "principals": { "view": "pav-b", "edit": "pae-b" },
                    "extensions": [ "delta", "echo", "foxtrot", "golf" ],
                    "num": 987,
                    "i": 781,
                    "arr": [ "indigo|juliet", "kilo" ]
                }
            ]
        },
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows":  [ r"abcdef", r"alfa", r"bravo" ],
        "as_file_name":  "easy_test.csv",
        "noschemas":  True,
        "expected":  { "EasyTest": [ { "abcdef": "alfa", }, { "abcdef": "bravo" } ] },
        "sheet_utils_also": True
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            r"abcdef,ghi.jk,l,mno#,ghi.xyzzy",
            r"alfa,bravo,123,delta|echo|foxtrot,xyzzy:one",
            r"golf,hotel,456,juliet|kilo|lima,xyzzy:two"
        ],
        "as_file_name": "easy_test1.csv",
        "expected": {
            "EasyTest1": [
                {
                    "abcdef": "alfa",
                    "ghi": { "jk": "bravo", "xyzzy": "xyzzy:one" },
                    "l": "123",
                    "mno": [ "delta", "echo", "foxtrot" ]
                },
                {
                    "abcdef": "golf",
                    "ghi": { "jk": "hotel", "xyzzy": "xyzzy:two" },
                    "l": "456",
                    "mno": [ "juliet", "kilo", "lima" ]
                }
            ]
        },
        "noschemas": True,
        "sheet_utils_also": True
    },
    # ----------------------------------------------------------------------------------------------
    {
        "as_file_name": "easy_test2.csv",
        "rows": [
            r"abcdef,ghi.jk,l,mno#,ghi.xyzzy,mno#2",
            r"alfa,bravo,123,delta|echo|foxtrot,xyzzy:one,october",
            r"golf,hotel,456,juliet|kilo|lima,xyzzy:two,november"
        ],
        "noschemas": True,
        "expected": {
            "EasyTest2": [
                {
                    "abcdef": "alfa",
                    "ghi": { "jk": "bravo", "xyzzy": "xyzzy:one" },
                    "l": "123",
                    "mno": [ "delta", "echo", "october" ]
                },
                {
                    "abcdef": "golf",
                    "ghi": { "jk": "hotel", "xyzzy": "xyzzy:two" },
                    "l": "456",
                    "mno": [ "juliet", "kilo", "november" ]
                }
            ]
        },
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "file": "reference_file_20231119.csv",
        "as_file_name": "reference_file.csv",
        "expected": "reference_file_20231119.result.json",
        "expected_refs": [
            "/FileFormat/FASTA",
            "/FileFormat/VCF",
            "/SubmissionCenter/Center1"
        ],
        "norefs": SAME_AS_EXPECTED_REFS,
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            r"abcdef,ghi.jk,l,mno#,ghi.xyzzy,mno#2",
            r"alfa,bravo,123,delta|echo|foxtrot,xyzzy:one,october",
            r"golf,hotel,456,juliet|kilo|lima,xyzzy:two,november"
        ],
        "as_file_name": "easy_test3.csv",
        "noschemas": True,
        "expected": {
            "EasyTest3": [
                {
                    "abcdef": "alfa",
                    "ghi": { "jk": "bravo", "xyzzy": "xyzzy:one" },
                    "l": "123",
                    "mno": [ "delta", "echo", "october" ]
                },
                {
                    "abcdef": "golf",
                    "ghi": { "jk": "hotel", "xyzzy": "xyzzy:two" },
                    "l": "456",
                    "mno": [ "juliet", "kilo", "november" ]
                }
            ]
        },
        "sheet_utils_also": False,
    },
    # ----------------------------------------------------------------------------------------------
    {
        "file": "submission_test_file_from_doug_20231106.xlsx",
        "expected_refs": [
            "/Consortium/smaht",
            "/Software/SMAHT_SOFTWARE_FASTQC",
            "/Software/SMAHT_SOFTWARE_VEP",
            "/FileFormat/fastq",
            "/Workflow/smaht:workflow-basic"
        ],
        "norefs": [
            "/Consortium/smaht"
        ],
        "expected": "submission_test_file_from_doug_20231106.result.json",
        "sheet_utils_also": True,
    },
    # ----------------------------------------------------------------------------------------------
    {
        "novalidate": True,
        "file": "uw_gcc_colo829bl_submission_20231117.xlsx",
        "expected": "uw_gcc_colo829bl_submission_20231117.result.json",
        "expected_refs": [
            "/Analyte/UW-GCC_ANALYTE_COLO-829BLT-50to1_1_FiberSeq_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BLT-50to1_1_HMWgDNA_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BLT-50to1_1_bulkKinnex_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BLT-50to1_1_gDNA_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BL_FiberSeq_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BL_FiberSeq_2",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BL_HMWgDNA_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BL_HiC_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BL_bulkKinnex_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BL_gDNA_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_FiberSeq_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_FiberSeq_2",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_HMWgDNA_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_HMWgDNA_2",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_HiC_2",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_bulkKinnex_2",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_gDNA_2",
            "/FileSet/UW-GCC_FILE-SET_COLO-829BL_FIBERSEQ_1",
            "/FileSet/UW-GCC_FILE-SET_COLO-829BL_FIBERSEQ_2",
            "/FileSet/UW-GCC_FILE-SET_COLO-829T_FIBERSEQ_1",
            "/Library/UW-GCC_LIBRARY_COLO-829BL_FIBERSEQ_1",
            "/Library/UW-GCC_LIBRARY_COLO-829BL_FIBERSEQ_2",
            "/Library/UW-GCC_LIBRARY_COLO-829T_FIBERSEQ_1",
            "/Sequencing/UW-GCC_SEQUENCING_PACBIO-HIFI-150x",
            "/Sequencing/UW-GCC_SEQUENCING_PACBIO-HIFI-60x",
            "/Software/UW-GCC_SOFTWARE_FIBERTOOLS-RS"
        ],
        "norefs": [
            "/FileSet/UW-GCC_FILE-SET_COLO-829T_FIBERSEQ_1"
        ],
        "sheet_utils_also": True,
    },
    # ----------------------------------------------------------------------------------------------
    {
        # Same as uw_gcc_colo829bl_submission_20231117.xlsx but with the blank line in the
        # Unaligned Reads sheet that signaled the end of input, and the following comment, removed.
        "file": "uw_gcc_colo829bl_submission_20231117_more_unaligned_reads.xlsx",
        "novalidate": True,
        "expected": "uw_gcc_colo829bl_submission_20231117_more_unaligned_reads.result.json",
        "expected_refs": [
            "/Analyte/UW-GCC_ANALYTE_COLO-829BLT-50to1_1_FiberSeq_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BLT-50to1_1_HMWgDNA_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BLT-50to1_1_bulkKinnex_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BLT-50to1_1_gDNA_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BL_FiberSeq_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BL_FiberSeq_2",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BL_HMWgDNA_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BL_HiC_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BL_bulkKinnex_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BL_gDNA_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_FiberSeq_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_FiberSeq_2",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_HMWgDNA_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_HMWgDNA_2",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_HiC_2",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_bulkKinnex_2",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_gDNA_2",
            "/FileSet/UW-GCC_FILE-SET_COLO-829BL_FIBERSEQ_1",
            "/FileSet/UW-GCC_FILE-SET_COLO-829BL_FIBERSEQ_2",
            "/FileSet/UW-GCC_FILE-SET_COLO-829T_FIBERSEQ_1",
            "/Library/UW-GCC_LIBRARY_COLO-829BL_FIBERSEQ_1",
            "/Library/UW-GCC_LIBRARY_COLO-829BL_FIBERSEQ_2",
            "/Library/UW-GCC_LIBRARY_COLO-829T_FIBERSEQ_1",
            "/Sequencing/UW-GCC_SEQUENCING_PACBIO-HIFI-150x",
            "/Sequencing/UW-GCC_SEQUENCING_PACBIO-HIFI-60x",
            "/Software/UW-GCC_SOFTWARE_FIBERTOOLS-RS"
        ],
        "norefs": [
            "/FileSet/UW-GCC_FILE-SET_COLO-829T_FIBERSEQ_1"
        ],
        "sheet_utils_also": True
    },
    # ----------------------------------------------------------------------------------------------
    {
        "file": "software_20231119.csv",
        "as_file_name": "software.csv",
        "novalidate": True,
        "expected": "software_20231119.result.json",
        "expected_refs": [
            "/Consortium/Consortium1",
            "/Consortium/Consortium2",
            "/SubmissionCenter/SubmissionCenter1",
            "/SubmissionCenter/SubmissionCenter2",
            "/User/user-id-1",
            "/User/user-id-2"
        ],
        "norefs": SAME_AS_EXPECTED_REFS,
        "sheet_utils_also": True,
    },
    # ----------------------------------------------------------------------------------------------
    {
        "file": "workflow_20231119.csv",
        "as_file_name": "workflow.csv",
        "novalidate": True,
        "expected": "workflow_20231119.result.json",
        "expected_refs": [
            "/Consortium/Consortium1",
            "/Consortium/Consortium2",
            "/SubmissionCenter/SubmissionCenter1",
            "/SubmissionCenter/SubmissionCenter2",
            "/User/user-id-1",
            "/User/user-id-2"
        ],
        "norefs": SAME_AS_EXPECTED_REFS,
        "sheet_utils_also": True,
    },
    # ----------------------------------------------------------------------------------------------
    {
        "file": "analyte_20231119.csv",
        "as_file_name": "analyte.csv",
        "expected": "analyte_20231119.result.json",
        "expected_refs": [
            "/Consortium/another-consortia",
            "/Consortium/smaht",
            "/Protocol/Protocol9",
            "/Sample/Sample9"
        ],
        "norefs": SAME_AS_EXPECTED_REFS,
        "sheet_utils_also": True
    },
    # ----------------------------------------------------------------------------------------------
    {
        "file": "library_20231119.csv",
        "as_file_name": "library.csv",
        "expected": "library_20231119.result.json",
        "expected_refs": [
            "/Analyte/sample-analyte-1",
            "/Analyte/sample-analyte-2",
            "/Analyte/sample-analyte-3",
            "/Consortium/Consortium1",
            "/Consortium/Consortium2",
            "/LibraryPreparation/prep2",
            "/Protocol/protocol1",
            "/Protocol/protocol3",
            "/SubmissionCenter/Center1"
        ],
        "norefs": SAME_AS_EXPECTED_REFS,
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "file": "library_20231119.csv",
        "as_file_name": "library.csv",
        "expected": "library_20231119.result.json",
        "expected_refs": [
            "/Analyte/sample-analyte-1",
            "/Analyte/sample-analyte-2",
            "/Analyte/sample-analyte-3",
            "/Consortium/Consortium1",
            "/Consortium/Consortium2",
            "/LibraryPreparation/prep2",
            "/Protocol/protocol1",
            "/Protocol/protocol3",
            "/SubmissionCenter/Center1"
        ],
        "norefs": SAME_AS_EXPECTED_REFS,
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "file": "library_20231119.csv",
        "as_file_name": "library.csv",
        "expected": "library_20231119.result.json",
        "expected_refs": [
            "/Analyte/sample-analyte-1",
            "/Analyte/sample-analyte-2",
            "/Analyte/sample-analyte-3",
            "/Consortium/Consortium1",
            "/Consortium/Consortium2",
            "/LibraryPreparation/prep2",
            "/Protocol/protocol1",
            "/Protocol/protocol3",
            "/SubmissionCenter/Center1"
        ],
        "norefs": SAME_AS_EXPECTED_REFS,
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "file": "file_format_20231119.csv.gz",
        "as_file_name": "file_format.csv.gz",
        "expected": "file_format_20231119.result.json",
        "expected_refs": [
            "/Consortium/358aed10-9b9d-4e26-ab84-4bd162da182b",
            "/SubmissionCenter/9626d82e-8110-4213-ac75-0a50adf890ff",
        ],
        "norefs": SAME_AS_EXPECTED_REFS,
        "sheet_utils_also": True
    },
    # ----------------------------------------------------------------------------------------------
    {
        "file": "cell_line_20231120.csv",
        "as_file_name": "cell_line.csv",
        "expected": "cell_line_20231120.result.json",
        "expected_refs": [
            "/SubmissionCenter/some-submission-center-a",
            "/SubmissionCenter/some-submission-center-b"
        ],
        "norefs": SAME_AS_EXPECTED_REFS,
        "sheet_utils_also": True
    },
    # ----------------------------------------------------------------------------------------------
    {
        "file": "unaligned_reads_20231120.csv",
        "as_file_name": "unaligned_reads.csv",
        "expected": "unaligned_reads_20231120.result.json",
        "expected_refs": [
            "/FileSet/FileSet1", "/FileSet/FileSet2", "/FileSet/FileSet3",
            "/QualityMetric/QC1", "/QualityMetric/QC2", "/QualityMetric/QC3", "/QualityMetric/QC4", "/QualityMetric/QC5", "/QualityMetric/QC6",
            "/Software/Software1", "/Software/Software2", "/Software/Software3", "/Software/Software4", "/Software/Software5", "/Software/Software6",
            "/SubmissionCenter/Center1", "/SubmissionCenter/Center2", "/SubmissionCenter/Center3", "/User/User1",
            "/User/User2", "/User/User3", "/User/User4", "/User/User5", "/User/User6"
        ],
        "norefs": SAME_AS_EXPECTED_REFS,
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "file": "sequencing_20231120.csv",
        "as_file_name": "sequencing.csv",
        "expected": "sequencing_20231120.result.json",
        "expected_refs": [
            "/Consortium/Consortium1",
            "/Consortium/Consortium2",
            "/Protocol/Protocol1",
            "/Protocol/Protocol2",
            "/Protocol/Protocol3",
            "/SubmissionCenter/Center1",
            "/SubmissionCenter/Center2",
            "/User/User1",
            "/User/User2",
            "/User/User3",
            "/User/User4",
            "/User/User5",
            "/User/User6"
        ],
        "norefs": SAME_AS_EXPECTED_REFS,
        "sheet_utils_also": True
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            "abc,abc#",
            "alice|bob|charley,foobar|goobar"
        ],
        "as_file_name": "test.csv",
        "noschemas": True,
        "expected": {
            "Test" : [ { "abc": ["foobar", "goobar"] } ]
        },
        "sheet_utils_also": True
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            "abc#,abc#1",
            "alice|bob|charley,foobar|goobar"
        ],
        "as_file_name": "test.csv",
        "noschemas": True,
        "expected": {
            "Test" : [ {
                "abc": ["alice", "foobar", "goobar", "charley"]
            } ]
        },
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            "abc#,abc#",
            "alice|bob|charley,foobar|goobar"
        ],
        "as_file_name": "test.csv",
        "noschemas": True,
        "expected": {
            "Test" : [ {
                "abc": ["foobar", "goobar"]
            } ]
        },
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            "other_allowed_extensions,other_allowed_extensions#4",
            "alice|bob|charley,foobar|goobar"
        ],
        "as_file_name": "test.csv",
        "noschemas": True,
        "expected": {
            "Test" : [ {
                "other_allowed_extensions": ["alice", "bob", "charley", None, "foobar", "goobar"]
             } ]
        },
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            "other_allowed_extensions#,other_allowed_extensions#4",
            "alice|bob|charley,foobar|goobar"
        ],
        "as_file_name": "test.csv",
        "noschemas": True,
        "expected": {
            "Test" : [ {
                "other_allowed_extensions": ["alice", "bob", "charley", None, "foobar", "goobar"]
             } ]
        },
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            "uuid,status,principals_allowed. view,principals_allowed.edit,other_allowed_extensions,other_allowed_extensions#4",
            "some-uuid-a,public,pav-a,pae-a,alice|bob|charley,foobar|goobar",
            "some-uuid-b,public,pav-b,pae-a,alice|bob|charley,foobar|goobar"
        ],
        "as_file_name": "test.csv",
        "noschemas": True,
        "expected": {
            "Test" : [
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
            ]
        },
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            "abc.def,pqr,vw#.xy",
            "alpha,1234,781"
        ],
        "as_file_name": "test.csv",
        "noschemas": True,
        "expected": {
            "Test" : [
                {"abc": {"def": "alpha"}, "pqr": "1234", "vw": [{"xy": "781"}]}
             ]
        },
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            "xyzzy#1",
            "456"
        ],
        "as_file_name": "test.csv",
        "noschemas": True,
        "expected": {
            "Test" : [
                {"xyzzy": [None, "456"]}
             ]
        },
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            "xyzzy#2",
            "456"
        ],
        "as_file_name": "test.csv",
        "noschemas": True,
        "expected": {
            "Test" : [
            {"xyzzy": [None, None, "456"]}
             ]
        },
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            "abc.def.ghi,xyzzy#2",
            "123,456"
        ],
        "as_file_name": "test.csv",
        "noschemas": True,
        "expected": {
            "Test" : [
                {"abc": {"def": {"ghi": "123"}}, "xyzzy": [None, None, "456"]}
             ]
        },
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            "prufrock#",
            "J.|Alfred|Prufrock"
        ],
        "as_file_name": "test.csv",
        "noschemas": True,
        "expected": {
            "Test" : [
                {"prufrock": ["J.", "Alfred", "Prufrock"]}
             ]
        },
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            "abc.def,pqr,vw#1.xy",
            "alpha,1234,781"
        ],
        "as_file_name": "test.csv",
        "noschemas": True,
        "expected": {
            "Test" : [
                {"abc": {"def": "alpha"}, "pqr": "1234", "vw": [{"xy": None}, {"xy": "781"}]}
             ]
        },
        "prune": False,
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            "abc.def,pqr,vw#.xy",
            "alpha,1234,781"
        ],
        "as_file_name": "test.csv",
        "noschemas": True,
        "expected": {
            "Test" : [
                {"abc": {"def": "alpha"}, "pqr": "1234", "vw": [{"xy": "781"}]}
             ]
        },
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            "abc.def,pqr,vw#0.xy",
            "alpha,1234,781"
        ],
        "as_file_name": "test.csv",
        "noschemas": True,
        "expected": {
            "Test" : [
                {"abc": {"def": "alpha"}, "pqr": "1234", "vw": [{"xy": "781"}]}
             ]
        },
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            "abc.def,pqr,vw#2.xy",
            "alpha,1234,781"
        ],
        "as_file_name": "test.csv",
        "noschemas": True,
        "expected": {
            "Test" : [
                {"abc": {"def": "alpha"}, "pqr": "1234", "vw": [{"xy": None}, {"xy": None}, {"xy": "781"}]}
             ]
        },
        "prune": False,
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            "vw#.xy.foo,simple_string",
            "781,moby"
        ],
        "as_file_name": "test.csv",
        "noschemas": True,
        "expected": {
            "Test" : [
                {"vw": [{"xy": {"foo": "781"}}], "simple_string": "moby"}
             ]
        },
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            "abc.def,pqr,vw#.xy",
            "alpha,1234,781"
        ],
        "as_file_name": "some_type_one.csv",
        "schemas": [_load_json_from_file("some_type_one.json")],
        "expected": {
            "SomeTypeOne" : [
                {"abc": {"def": "alpha"}, "pqr": 1234, "vw": [{"xy": 781}]}
             ]
        },
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            "vw#2.xy.foo",
            "781"
        ],
        "as_file_name": "some_type_two.csv",
        "schemas": [_load_json_from_file("some_type_two.json")],
        "expected": {
            "SomeTypeTwo" : [
                {"vw": [
                    {"xy": {"foo": None}},
                    {"xy": {"foo": None}},
                    {"xy": {"foo": "781"}}
                ]}
             ]
        },
        "prune": False,
        "sheet_utils_also": False
    },
    # ----------------------------------------------------------------------------------------------
    {
        "rows": [
            "simple_string_array,simple_integer_array,simple_number_array,simple_boolean_array",
            "1|23|456|7890 , 1|23|456|7890  ,  1|23|456|7890.123 , true| False|false|True"
        ],
        "as_file_name": "some_type_one.csv",
        "schemas": [_load_json_from_file("some_type_one.json")],
        "expected": {
            "SomeTypeOne": [
                {"simple_string_array": ["1", "23", "456", "7890"],
                 "simple_integer_array": [1, 23, 456, 7890],
                 "simple_number_array": [1, 23, 456, 7890.123],
                 "simple_boolean_array": [True, False, False, True]}
            ]
        },
        "sheet_utils_also": False
    },
]))
def test_parse_structured_data_parameterized(kwargs):
    _test_parse_structured_data(**kwargs)


"""
@pytest.mark.parametrize("kwargs", [  # test_parse_structured_data_parameterized
    {
    },
])
def test_parse_structured_data_parameterized_debug(kwargs):
    _test_parse_structured_data(**kwargs)
"""


@pytest.mark.parametrize("columns, expected", [
    ["abc", {
        "abc": None
    }],
    ["abc,def.ghi,jkl#.mnop#2.rs", {
        "abc": None,
        "def": {"ghi": None},
        "jkl": [{"mnop": [{"rs": None}, {"rs": None}, {"rs": None}]}]
    }],
    ["abc,def,ghi.jkl,mnop.qrs.tuv", {
        "abc": None,
        "def": None,
        "ghi": {"jkl": None},
        "mnop": {"qrs": {"tuv": None}}
    }],
    ["abc,def,ghi.jkl,mnop.qrs.tuv", {
        "abc": None,
        "def": None,
        "ghi": {"jkl": None},
        "mnop": {"qrs": {"tuv": None}}
    }],
    ["abc,def.ghi,jkl#", {
       "abc": None,
       "def": {"ghi": None},
       "jkl": []
    }],
    ["abc,def.ghi,jkl#.mnop", {
        "abc": None,
        "def": {"ghi": None},
        "jkl": [{"mnop": None}]
    }],
    ["abc,def.ghi,jkl#.mnop#", {
        "abc": None,
        "def": {"ghi": None},
        "jkl": [{"mnop": []}]
    }],
    ["abc,def.ghi,jkl#.mnop#2", {
        "abc": None,
        "def": {"ghi": None},
        "jkl": [{"mnop": [None, None, None]}]
    }],
    ["abc,def.ghi,jkl#.mnop#2.rs", {
        "abc": None,
        "def": {"ghi": None},
        "jkl": [{"mnop": [{"rs": None}, {"rs": None}, {"rs": None}]}]
    }],
    ["abc,def.ghi,jkl#.mnop#2.rs#.tuv", {
        "abc": None,
        "def": {"ghi": None},
        "jkl": [{"mnop": [{"rs": [{"tuv": None}]}, {"rs": [{"tuv": None}]}, {"rs": [{"tuv": None}]}]}]
    }],
    ["abc.def.ghi,xyzzy", {
        "abc": {"def": {"ghi": None}},
        "xyzzy": None
    }],
    ["abc.def.ghi,xyzzy#,simple_string", {
        "abc": {"def": {"ghi": None}},
        "xyzzy": [],
        "simple_string": None
    }],
    ["abc.def.ghi,xyzzy#2", {
        "abc": {"def": {"ghi": None}},
        "xyzzy": [None, None, None]
    }],
    ["abc.def.ghi,xyzzy#2,xyzzy#3", {
        "abc": {"def": {"ghi": None}},
        "xyzzy": [None, None, None, None]
    }],
    ["abc.def.ghi,xyzzy#2,xyzzy#", {
        "abc": {"def": {"ghi": None}},
        "xyzzy": [None, None, None]
    }],
    ["abc.def.ghi,xyzzy#2,xyzzy#0", {
        "abc": {"def": {"ghi": None}},
        "xyzzy": [None, None, None]
    }],
    ["abc.def.ghi,xyzzy#2,xyzzy#1", {
        "abc": {"def": {"ghi": None}},
        "xyzzy": [None, None, None]
    }],
    ["abc.def.ghi,xyzzy#2,xyzzy#1.foo", {
        "abc": {"def": {"ghi": None}},
        "xyzzy": [{"foo": None}, {"foo": None}, {"foo": None}]
    }],
    ["abc.def.ghi,xyzzy#2.goo,xyzzy#1.foo", {
        "abc": {"def": {"ghi": None}},
        "xyzzy": [{"foo": None, "goo": None}, {"foo": None, "goo": None}, {"foo": None, "goo": None}]
    }],
    ["abc.def.ghi,xyzzy#2.goo,xyzzy#1.foo#", {
        "abc": {"def": {"ghi": None}},
        "xyzzy": [{"foo": [], "goo": None}, {"foo": [], "goo": None}, {"foo": [], "goo": None}]
    }],
    ["abc.def.ghi,xyzzy#2.goo,xyzzy#1.foo#0", {
        "abc": {"def": {"ghi": None}},
        "xyzzy": [{"foo": [None], "goo": None}, {"foo": [None], "goo": None}, {"foo": [None], "goo": None}]
    }],
    ["abc.def.ghi,xyzzy#2.goo,xyzzy#1.foo#2,jklmnop#3", {
        "abc": {"def": {"ghi": None}},
        "xyzzy": [{"foo": [None, None, None], "goo": None}, {"foo": [None, None, None], "goo": None}, {"foo": [None, None, None], "goo": None}],
        "jklmnop": [None, None, None, None]
    }],
    ["abc.def.ghi,xyzzy#2.goo,xyzzy#1.foo#2,jklmnop#3", {
        "abc": {"def": {"ghi": None}},
        "xyzzy": [{"foo": [None, None, None], "goo": None}, {"foo": [None, None, None], "goo": None}, {"foo": [None, None, None], "goo": None}],
        "jklmnop": [None, None, None, None]
    }]
])
def test_structured_row_data_0(columns, expected):
    _test_structured_row_data(columns, expected)


def test_flatten_schema_1():
    portal = Portal.create_for_testing()
    schema = Schema.load_by_name("reference_file", portal=portal)
    schema_flattened_json = _get_schema_flat_typeinfo(schema)
    with open(os.path.join(TEST_FILES_DIR, "reference_file.flattened.json")) as f:
        expected_schema_flattened_json = json.load(f)
        assert schema_flattened_json == expected_schema_flattened_json


def test_portal_custom_schemas_1():
    schemas = [{"title": "Abc"}, {"title": "Def"}]
    portal = Portal.create_for_testing(schemas=schemas)
    assert portal.get_schema("Abc") == schemas[0]
    assert portal.get_schema(" def ") == schemas[1]
    assert portal.get_schema("FileFormat") is not None


def test_get_type_name_1():
    assert _get_type_name("FileFormat") == "FileFormat"
    assert _get_type_name("file_format") == "FileFormat"
    assert _get_type_name("file_format.csv") == "FileFormat"
    assert _get_type_name("file_format.json") == "FileFormat"
    assert _get_type_name("file_format.xls") == "FileFormat"
    assert _get_type_name("File  Format") == "FileFormat"


def _test_parse_structured_data(file: Optional[str] = None,
                                as_file_name: Optional[str] = None,
                                rows: Optional[List[str]] = None,
                                expected: Optional[Union[dict, list]] = None,
                                expected_refs: Optional[List[str]] = None,
                                expected_errors: Optional[Union[dict, list]] = None,
                                norefs: Union[bool, List[str]] = False,
                                noschemas: bool = False,
                                novalidate: bool = False,
                                schemas: Optional[List[dict]] = None,
                                prune: bool = True,
                                sheet_utils: bool = False,
                                sheet_utils_also: bool = False,
                                ignore: bool = False,
                                debug: bool = False) -> None:

    if ignore:
        return
    if not file and as_file_name:
        file = as_file_name
    if not file and not rows:
        raise Exception("Must specify a file or rows for structured_data test.")
    if isinstance(expected, str):
        if os.path.exists(os.path.join(TEST_FILES_DIR, expected)):
            expected = os.path.join(TEST_FILES_DIR, expected)
        elif not os.path.exists(expected):
            raise Exception(f"Cannot find output result file for structured_data: {expected}")
        with open(expected, "r") as f:
            expected = json.load(f)
    elif not isinstance(expected, dict):
        raise Exception(f"Must specify a file name or a dictionary for structured_data test: {type(expected)}")
    if norefs is SAME_AS_EXPECTED_REFS:
        norefs = expected_refs
    if expected_refs is SAME_AS_NOREFS:
        expected_refs = norefs

    refs_actual = set()

    def assert_parse_structured_data():

        def call_parse_structured_data(file: str):
            nonlocal portal, novalidate, sheet_utils, debug
            return parse_structured_data(file=file, portal=portal, novalidate=novalidate,
                                         prune=True if prune is not False else False, sheet_utils=sheet_utils)

        nonlocal file, expected, expected_errors, noschemas, sheet_utils, debug
        portal = Portal.create_for_testing(schemas=schemas) if not noschemas else None  # But see mocked_schemas.
        if rows:
            if os.path.exists(file) or os.path.exists(os.path.join(TEST_FILES_DIR, file)):
                raise Exception("Attempt to create temporary file with same name as existing test file: {file}")
            with temporary_file(name=file, content=rows) as tmp_file_name:
                structured_data, validation_errors = call_parse_structured_data(tmp_file_name)
        else:
            if os.path.exists(os.path.join(TEST_FILES_DIR, file)):
                file = os.path.join(TEST_FILES_DIR, file)
            elif not os.path.exists(file):
                raise Exception(f"Cannot find input test file for structured_data: {file}")
            if as_file_name:
                with open(file, "rb" if file.endswith((".gz", ".tgz", ".tar", ".tar.gz", ".zip")) else "r") as f:
                    with temporary_file(name=as_file_name, content=f.read()) as tmp_file_name:
                        structured_data, validation_errors = call_parse_structured_data(tmp_file_name)
            else:
                structured_data, validation_errors = call_parse_structured_data(file)
        if debug:
            pdb.set_trace()
        if sheet_utils:
            structured_data = {to_camel_case(key): value for key, value in structured_data.items()}
        if expected is not None:
            assert structured_data == expected
        if expected_errors:
            assert validation_errors == expected_errors
        else:
            assert not validation_errors

    @contextmanager
    def mocked_schemas():
        # The sheet_utils implementation does not deal well with no portal, as opposed to structured_data
        # which which reacts by not attempting to load schemas (nor resolving refs), so we mock it out here.
        nonlocal sheet_utils
        if sheet_utils:
            with mock.patch("dcicutils.validation_utils.SchemaManager.get_schema", return_value=None):
                yield
        else:
            yield

    @contextmanager
    def mocked_refs():
        nonlocal sheet_utils
        if sheet_utils:
            real_ref_hint = RefHint._apply_ref_hint

            def mocked_ref_hint(self, value, src):
                nonlocal norefs, expected_refs, refs_actual
                for item in (value if isinstance(value, list) else [value]):
                    refs_actual.add(ref := f"/{self.schema_name}/{item}")
                    if norefs is True or isinstance(norefs, list) and ref in norefs:
                        return True
                    real_ref_hint(self, value, src)  # Throws exception if ref not found.
                    return True
                return value

            with mock.patch.object(RefHint, "_apply_ref_hint", side_effect=mocked_ref_hint, autospec=True):
                yield
        else:
            real_ref_exists = Portal.ref_exists

            def mocked_ref_exists(self, type_name, value):
                nonlocal norefs, expected_refs, refs_actual
                refs_actual.add(ref := f"/{type_name}/{value}")
                if norefs is True or isinstance(norefs, list) and ref in norefs:
                    return True
                return real_ref_exists(self, type_name, value) is True

            with mock.patch("encoded.ingestion.structured_data.Portal.ref_exists",
                            side_effect=mocked_ref_exists, autospec=True):
                yield

    def run_this_function():
        nonlocal expected_refs, noschemas, norefs, refs_actual
        refs_actual = set()
        if noschemas:
            if norefs or expected_refs:
                with mocked_schemas():
                    with mocked_refs():
                        assert_parse_structured_data()
            else:
                with mocked_schemas():
                    assert_parse_structured_data()
        elif norefs or expected_refs:
            with mocked_refs():
                assert_parse_structured_data()
        else:
            assert_parse_structured_data()
        if expected_refs:
            # Make sure any/all listed refs were actually referenced.
            assert refs_actual == set(expected_refs)

    run_this_function()
    if not sheet_utils and sheet_utils_also:
        sheet_utils = True
        run_this_function()


def _get_schema_flat_typeinfo(schema: Schema):
    def map_function_name(map_function: Callable) -> str:
        # This is ONLY for testing/troubleshooting; get the NAME of the mapping function; this is HIGHLY
        # implementation DEPENDENT, on the map_function_<type> functions. The map_function, as a string,
        # looks like: <function Schema._map_function_string.<locals>.map_string at 0x103474900> or
        # if it is implemented as a lambda (to pass in closure), then inspect.getclosurevars.nonlocals looks like:
        # {"map_enum": <function Schema._map_function_enum.<locals>.map_enum at 0x10544cd60>, ...}
        if isinstance(map_function, Callable):
            if (match := re.search(r"\.(\w+) at", str(map_function))):
                return f"<{match.group(1)}>"
            for item in inspect.getclosurevars(map_function).nonlocals:
                if item.startswith("map_"):
                    return f"<{item}>"
        return type(map_function)
    return {key: {k: (map_function_name(v) if k == "map" and isinstance(v, Callable) else v)
                  for k, v in value.items()} for key, value in schema._typeinfo.items()}


def _test_structured_row_data(columns: str, expected: Optional[dict]):
    assert _StructuredRowData(columns.split(",")).data == expected
