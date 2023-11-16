import argparse
import json
from jsonschema import Draft7Validator as JsonSchemaValidator
from typing import List, Optional, Tuple
import yaml
from encoded.commands.captured_output import captured_output
from dcicutils.bundle_utils import load_items as sheet_utils_load_items, RefHint
from dcicutils.validation_utils import SchemaManager
with captured_output():
    from encoded.ingestion.loadxl_extensions import load_data_into_database
from encoded.ingestion.structured_data import Portal, Schema, StructuredDataSet
from encoded.project.loadxl import ITEM_INDEX_ORDER

# For dev/testing only.
# Parsed and optionally loads a structured CSV or Excel file
# using either ingestion.structured_data or dcicutils.sheet_utils.

def main() -> None:

    args = parse_args()

    # The Portal.create_for_unit_testing function returns a Portal object suitable for most local unit
    # testing purposes including, for example, fetching type (JSON) schemas (via Portal.get_schema);
    # assuming run within a (pyenv) virtualenv which includes the portal "encoded" package.
    #
    # The Portal.create_for_local_testing function returns a Portal object suitable for local integration
    # testing including, for example, fetching data (via Portal.get_metadata) from a locally running portal.
    #
    # The create_for_local_testing function with a provided .ini file (e.g. development.ini)
    # returns a Portal object suitable for local integration testing including, for example,
    # loading data into the database of a locally running portal.

    with captured_output():
        portal = Portal.create_for_local_testing(ini_file=args.load) if args.load else Portal.create_for_unit_testing()

    if args.noschemas:
        if not args.old:
            Schema.load_by_name = lambda name, portal: {}
        else:
            SchemaManager.get_schema = lambda name, portal_env, portal_vapp: {}
    if args.norefs:
        if not args.old:
            # Manually override the Schema._map_function_ref function to not check for linkTo references.
            Schema._map_function_ref = lambda self, type_info: lambda value: value
        else:
            # Manually override the RefHint._apply_ref_hint function to not check for linkTo references.
            RefHint._apply_ref_hint = lambda self, value: value

    if args.verbose:
        if args.old:
            print(f">>> Using sheet_utils rather than the new structured_data ...")
        print(f">>> Loading data", end="")
        if args.validate:
            print(" with validation", end="")
        if args.noschemas:
            print(" ignoring schemas", end="")
        print(f" from: {args.file} ...")

    structured_data_set, problems = parse_structured_data(file=args.file, portal=portal, args=args)

    print(f">>> Parsed Data:")
    print(json.dumps(structured_data_set, indent=4, default=str))

    if args.validate:
        print(f">>> Validation Results:")
        print(yaml.dump(problems) if problems else "OK")

    if args.schemas:
        if args.verbose:
            print(">>> Dumping referenced schemas ...")
        if args.noschemas:
            print("No schemas because --noschemas argument specified.")
        else:
            for data_type in structured_data_set:
                data_of_type = structured_data_set[data_type]
                schema = Schema.load_by_name(data_type, portal)
                schema = schema.data if schema else None
                if schema:
                    print(f">>> Schema: {data_type}")
                    print(json.dumps(schema, indent=4, default=str))
                elif args.verbose:
                    print(f">>> No schema found for type: {data_type}")

    if args.load:
        if args.verbose:
            print(">>> Loading data into local portal database ...")
        results = load_data_into_database(data=structured_data_set,
                                          portal_vapp=portal.vapp,
                                          validate_only=False)
        print(yaml.dump(results))

    if args.verbose:
        print(">>> Done.")


def parse_structured_data(file: str, portal: Optional[Portal], args) -> Tuple[Optional[dict], Optional[List[str]]]:
    if not args.old:
        structured_data = StructuredDataSet(file, portal=portal, order=ITEM_INDEX_ORDER)
        problems = structured_data.validate() if args.validate else []
        data = structured_data.data
    else:
        data = sheet_utils_load_items(file, portal_vapp=portal.vapp if portal else None,
                                      validate=args.validate, apply_heuristics=True,
                                      sheet_order=ITEM_INDEX_ORDER)
        if args.validate:
            problems = data[1] or []
            data = data[0]
        else:
            problems = []
    return data, problems


def parse_args():

    class argparse_optional(argparse.Action):
        def __call__(self, parser, namespace, values, option_string=None):
            setattr(namespace, self.dest, True if values is None else values)

    parser = argparse.ArgumentParser(description="Parse local structured data file for dev/testing purposes.")

    parser.add_argument("file", type=str, nargs="?", help=f"File to parse.")
    parser.add_argument("--old", required=False, action="store_true", default=False,
                        help=f"Use sheet_utils rather than the newer structure_data.")
    parser.add_argument("--schemas", required=False, action="store_true",
                        default=False, help=f"Output the referenced schema(s).")
    parser.add_argument("--norefs", required=False, action="store_true",
                        default=False, help=f"Do not try to resolve schema linkTo references.")
    parser.add_argument("--noschemas", required=False, action="store_true",
                        default=False, help=f"Do not use schemes at all.")
    parser.add_argument("--validate", required=False, action="store_true",
                        default=False, help=f"Validate parsed data using JSON schema.")

    parser.add_argument("--load", nargs="?", action=argparse_optional, const=True,
                        default=False, help=f"Load data into database (optionally specify .ini file to use).")
    parser.add_argument("--post-only", required=False, action="store_true",
                        default=False, help=f"Only perform updates (POST) for loaded data.")
    parser.add_argument("--patch-only", required=False, action="store_true",
                        default=False, help=f"Only perform updates (PATCH) for loaded data.")
    parser.add_argument("--validate-only", required=False, action="store_true",
                        default=False, help=f"Only perform validation for loaded data.")

    parser.add_argument("--verbose", required=False, action="store_true",
                        default=False, help=f"Verbose output.")
    parser.add_argument("--debug", required=False, action="store_true",
                        default=False, help=f"Debugging mode.")

    args = parser.parse_args()

    if args.noschemas and args.validate:
        print("May not specify both --noschemas and --validate.")
        exit(1)
    if (1 if args.patch_only else 0) + (1 if args.post_only else 0) + (1 if args.validate_only else 0) > 1:
        print("May only specify one of: --patch-only and --post-only and --validate-only")
        exit(1)
    if not args.load and (args.patch_only or args.patch_only or args.validate_only):
        print("Must use --load when using: --patch-only or --post-only or --validate-only")
        exit(1)

    return args


if __name__ == "__main__":
    main()
