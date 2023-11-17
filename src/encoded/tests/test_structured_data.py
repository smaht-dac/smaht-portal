from contextlib import contextmanager
import os
from typing import List, Optional, Union
from unittest import mock
from encoded.ingestion.structured_data import Portal, Schema, Utils  # noqa
from encoded.ingestion.ingestion_processors import parse_structured_data

THIS_TEST_MODULE_DIRECTORY = os.path.dirname(os.path.abspath(__file__))
TEST_FILES_DIR = f"{THIS_TEST_MODULE_DIRECTORY}/data/test_files"


def test_parse_structured_data_1():
    _test_parse_structured_data(file = "test.csv", noschemas = True, rows = [
        "uuid,status,principals_allowed.view,principals_allowed.edit,other_allowed_extension#,data",
        "some-uuid-a,public,pav-a,pae-a,alfa|bravo|charlie,123.4",
        "some-uuid-b,public,pav-b,pae-a,delta|echo|foxtrot|golf,xyzzy"
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
          "principals_allowed": { "view": "pav-b", "edit": "pae-a" },
          "other_allowed_extension": [ "delta", "echo", "foxtrot", "golf" ],
          "data": "xyzzy"
        }
      ]
    })


def test_parse_structured_data_2():
    _test_parse_structured_data(file = f"submission_test_file_from_doug_20231106.xlsx", sheet_utils = False,
        refs = ["/Consortium/smaht",
                "/FileFormat/fastq",
                "/Software/SMAHT_SOFTWARE_VEP",
                "/Software/SMAHT_SOFTWARE_FASTQC",
                "/Workflow/smaht:workflow-basic"],
        expected = {
            "FileFormat": [
              {
                "identifier": "fastq",
                "standard_file_extension": "fastq",
                "consortia": [ "smaht" ]
              }
            ],
            "ReferenceFile": [
              {
                "aliases": [ "smaht:reference_file-fastq1" ],
                "file_format": "fastq",
                "data_category": [ "Sequencing Reads" ],
                "data_type": [ "Unaligned Reads" ],
                "filename": "first_file.fastq",
                "consortia": [ "smaht" ]
              },
              {
                "aliases": [ "smaht:reference_file-fastq2", "smaht:reference_file-fastq_alt" ],
                "file_format": "fastq",
                "data_category": [ "Sequencing Reads" ],
                "data_type": [ "Unaligned Reads" ],
                "filename": "second_file.fastq",
                "consortia": [ "smaht" ]
              }
            ],
            "Software": [
              {
                "submitted_id": "SMAHT_SOFTWARE_VEP",
                "name": "vep",
                "category": [ "Variant Annotation" ],
                "title": "VEP",
                "version": "1.0.1",
                "source_url": "https://grch37.ensembl.org/info/docs/tools/vep/index.html",
                "consortia": [ "smaht" ]
              },
              {
                "submitted_id": "SMAHT_SOFTWARE_FASTQC",
                "name": "fastqc",
                "category": [ "Quality Control", "Alignment" ],
                "title": "FastQC",
                "version": "3.5.1",
                "consortia": [ "smaht" ]
              }
            ],
            "Workflow": [
              {
                "aliases": [ "smaht:workflow-basic" ],
                "name": "basic_workflow",
                "title": "A Basic Workflow",
                "software": [ "SMAHT_SOFTWARE_VEP" ],
                "category": [ "Annotation" ],
                "language": "CWL",
                "tibanna_config": { "instance_type": [ "c5.4xlarge" ], "run_name": "vep" },
                "consortia": [ "smaht" ]
              },
              {
                "aliases": [ "smaht:workflow-complex" ],
                "name": "complex_workflow",
                "title": "A Complex Workflow",
                "software": [ "SMAHT_SOFTWARE_VEP", "SMAHT_SOFTWARE_FASTQC" ],
                "category": [ "Annotation", "Quality Control" ],
                "language": "WDL",
                "tibanna_config": { "instance_type": [ "c5.4xlarge" ], "run_name": "fastqc" },
                "previous_versions": [ "smaht:workflow-basic" ],
                "consortia": [ "smaht" ]
              }
            ]
        }
    )


def _test_parse_structured_data(file: str, rows: Optional[List[str]] = None,
                                expected: Union[dict, list] = None,
                                expected_validation_errors: Optional[Union[dict, list]] = None,
                                noschemas: bool = False,
                                norefs: bool = False,
                                refs: Optional[List[str]] = None,
                                sheet_utils: bool = False,
                                debug: bool = False) -> None:

    def call_parse_structured_data(file: str, rows: Optional[List[str]] = None,
                                      expected: Union[dict, list] = None,
                                      expected_validation_errors: Union[dict, list] = None,
                                      debug: bool = False) -> None:
        portal = Portal.create_for_unit_testing()
        if rows:
            if os.path.exists(file) or os.path.exists(os.path.join(TEST_FILES_DIR, file)):
                raise Exception("Attempt to create temporary file with same name as existing test file: {file}")
            with Utils.temporary_file(name=file, content=rows) as tmp_file_name:
                structured_data, validation_errors = parse_structured_data(file=tmp_file_name, portal=portal, sheet_utils=sheet_utils)
        else:
            if os.path.exists(os.path.join(TEST_FILES_DIR, file)):
                file = os.path.join(TEST_FILES_DIR, file)
            elif not os.path.exists(file):
                raise Exception(f"Cannot find input test file: {file}")
            structured_data, validation_errors = parse_structured_data(file=file, portal=portal, sheet_utils=sheet_utils)
        if debug:
            import pdb
            pdb.set_trace()
        assert structured_data == expected
        if expected_validation_errors:
            assert validation_errors == expected_validation_errors

    @contextmanager
    def mocked_schemas():
        nonlocal sheet_utils
        def schema_load_by_name(name: str, portal: Portal) -> Optional[dict]:
            return None
        if sheet_utils:
            yield None  # TODO
        else:
            with mock.patch("encoded.ingestion.structured_data.Schema.load_by_name", side_effect=schema_load_by_name):
                yield

    @contextmanager
    def mocked_refs(refs: Optional[List[str]] = None):
        nonlocal sheet_utils
        if sheet_utils:
            def refhint_apply_ref_hint(self, value):
                if refs:
                    for item in (value if isinstance(value, list) else [value]):
                        if not f"/{self.schema_name}/{item}" in refs:
                            raise Exception(f"Reference not found: /{self.schema_name}/{item}")
                return value
            from dcicutils.bundle_utils import RefHint
            # Can't quite figure out how to do this with mocking; the refhint_apply_ref_hint
            # mock function does not get the self argument which we need in this case; as
            # opposed to the non sheet_utils case, where we do not need the self.
            # with mock.patch.object(RefHint, "_apply_ref_hint", side_effect=refhint_apply_ref_hint):
            #   yield
            RefHint._apply_ref_hint = refhint_apply_ref_hint
            yield
        else:
            def portal_ref_exists(type_name, value):
                nonlocal refs
                if refs:
                    ref = f"/{type_name}/{value}"
                    return {"uuid": "dummy"} if ref in refs else None
                return True
            with mock.patch("encoded.ingestion.structured_data.Portal.ref_exists", side_effect=portal_ref_exists):
                yield

    def assert_parse_structured_data():
        call_parse_structured_data(file=file, rows=rows,
                                   expected=expected,
                                   expected_validation_errors=expected_validation_errors,
                                   debug=debug)

    if noschemas:
        if norefs or refs:
            with mocked_schemas():
                with mocked_refs(refs):
                    assert_parse_structured_data()
        else:
            with mocked_schemas():
                assert_parse_structured_data()
    elif norefs or refs:
        with mocked_refs(refs):
            assert_parse_structured_data()
    else:
        assert_parse_structured_data()
