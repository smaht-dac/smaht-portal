from contextlib import contextmanager
import json
import os
import pdb
from typing import List, Optional, Union
from unittest import mock
from dcicutils.bundle_utils import RefHint
from dcicutils.misc_utils import to_camel_case
from dcicutils.validation_utils import SchemaManager  # noqa
from encoded.ingestion.structured_data import Portal, Schema, Utils  # noqa
from encoded.ingestion.ingestion_processors import parse_structured_data

THIS_TEST_MODULE_DIRECTORY = os.path.dirname(os.path.abspath(__file__))
TEST_FILES_DIR = f"{THIS_TEST_MODULE_DIRECTORY}/data/test-files"


def test_parse_structured_data_1():
    _test_parse_structured_data(file = "test.csv", noschemas = True, sheet_utils_also = True, rows = [
        "uuid,status,principals_allowed.view,principals_allowed.edit,other_allowed_extension#,data",
        "some-uuid-a,public,pav-a,pae-a,alfa|bravo|charlie,123.4",
        "some-uuid-b,public,pav-b,pae-b,delta|echo|foxtrot|golf,xyzzy"
    ],
    expected = {
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
          "principals_allowed": { "view": "pav-b", "edit": "pae-b" },
          "other_allowed_extension": [ "delta", "echo", "foxtrot", "golf" ],
          "data": "xyzzy"
        }
      ]
    })


def test_parse_structured_data_2():
    _test_parse_structured_data(file = f"submission_test_file_from_doug_20231106.xlsx", sheet_utils_also = True,
        norefs = [
            "/Consortium/smaht"
        ],
        expected_refs = [
            "/Consortium/smaht",
            "/Software/SMAHT_SOFTWARE_FASTQC",
            "/Software/SMAHT_SOFTWARE_VEP",
            "/FileFormat/fastq",
            "/Workflow/smaht:workflow-basic"
        ],
        expected = _read_result_json_file("submission_test_file_from_doug_20231106.result.json")
    )

def test_parse_structured_data_3():
    _test_parse_structured_data(file = f"uw_gcc_colo829bl_submission_20231117.xlsx",
                                novalidate = True, sheet_utils_also = True,
        norefs = [
            "/FileSet/UW-GCC_FILE-SET_COLO-829T_FIBERSEQ_1"
        ],
        expected_refs = [
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
        expected = _read_result_json_file("uw_gcc_colo829bl_submission_20231117.result.json")
    )

def test_portal_custom_schemas():
    schemas = [{"title": "Abc"}, {"title": "Def"}]
    portal = Portal.create_for_unit_testing(schemas=schemas)
    assert portal.get_schema("Abc") == schemas[0]
    assert portal.get_schema(" def ") == schemas[1]
    import pdb ; pdb.set_trace()
    assert portal.get_schema("FileFormat") is not None


def _test_parse_structured_data(file: str,
                                expected: Union[dict, list],
                                rows: Optional[List[str]] = None,
                                expected_refs: Optional[List[str]] = None,
                                expected_errors: Optional[Union[dict, list]] = None,
                                noschemas: bool = False,
                                novalidate: bool = False,
                                norefs: Union[bool, List[str]] = False,
                                sheet_utils: bool = False,
                                sheet_utils_also: bool = False,
                                debug: bool = False) -> None:
    refs_actual = set()

    def assert_parse_structured_data():
        nonlocal file, expected, expected_errors, noschemas, sheet_utils, debug
        portal = Portal.create_for_unit_testing() if not noschemas else None  # But see mocked_schemas below.
        if rows:
            if os.path.exists(file) or os.path.exists(os.path.join(TEST_FILES_DIR, file)):
                raise Exception("Attempt to create temporary file with same name as existing test file: {file}")
            with Utils.temporary_file(name=file, content=rows) as tmp_file_name:
                structured_data, validation_errors = parse_structured_data(file=tmp_file_name,
                                                                           portal=portal,
                                                                           novalidate=novalidate,
                                                                           sheet_utils=sheet_utils)
        else:
            if os.path.exists(os.path.join(TEST_FILES_DIR, file)):
                file = os.path.join(TEST_FILES_DIR, file)
            elif not os.path.exists(file):
                raise Exception(f"Cannot find input test file: {file}")
            structured_data, validation_errors = parse_structured_data(file=file,
                                                                       portal=portal,
                                                                       novalidate=novalidate,
                                                                       sheet_utils=sheet_utils)
        if debug:
            pdb.set_trace()
        if sheet_utils:
            structured_data = {to_camel_case(key): value for key, value in structured_data.items()}
        assert structured_data == expected
        if expected_errors:
            assert validation_errors == expected_errors
        else:
            assert not validation_errors

    @contextmanager
    def mocked_schemas():
        # The sheet_utils implementation does not deal well with no portal, as opposed to structured_data
        # which which reacts by not attempting to load schems (nor resolving refs), so we mock it out here.
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

def _read_result_json_file(file: str):
    if os.path.exists(os.path.join(TEST_FILES_DIR, file)):
        file = os.path.join(TEST_FILES_DIR, file)
    elif not os.path.exists(file):
        raise Exception(f"Cannot find result test file: {file}")
    with open(file, "r") as f:
        return json.load(f)
