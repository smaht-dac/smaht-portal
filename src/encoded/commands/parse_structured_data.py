import argparse
import json
from jsonschema import Draft7Validator as JsonSchemaValidator
from typing import List, Optional, Tuple
import yaml
from encoded.commands.captured_output import captured_output
from dcicutils.bundle_utils import load_items as parse_structured_data_via_sheet_utils, RefHint
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
        if not args.sheet_utils:
            Schema.load_by_name = lambda name, portal: {}
        else:
            SchemaManager.get_schema = lambda name, portal_env, portal_vapp: {}
    if args.norefs:
        if not args.sheet_utils:
            # Manually override the Schema._map_function_ref function to not check for linkTo references.
            Schema._map_function_ref = lambda self, type_info: lambda value: value
        else:
            # Manually override the RefHint._apply_ref_hint function to not check for linkTo references.
            RefHint._apply_ref_hint = lambda self, value: value

    if args.verbose:
        if args.sheet_utils:
            print(f">>> Using sheet_utils rather than the newer structured_data ...")
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
            dump_schemas(list(structured_data_set.keys()), portal)

    if args.load:
        if args.verbose:
            print(">>> Loading data into local portal database", end="")
            if args.post_only:
                print(" (POST only)", end="")
            if args.patch_only:
                print(" (POST only)", end="")
            if args.validate_only:
                print(" (VALIDATE only)", end="")
            print(" ...")
        results = load_data_into_database(data=structured_data_set,
                                          portal_vapp=portal.vapp,
                                          post_only=args.post_only,
                                          patch_only=args.patch_only,
                                          validate_only=args.validate_only)
        print(">>> Load Results:")
        print(yaml.dump(results))

    if args.verbose:
        print(">>> Done.")


def parse_structured_data(file: str, portal: Portal,
                          args: argparse.Namespace) -> Tuple[Optional[dict], Optional[List[str]]]:
    if not args.sheet_utils:
        structured_data = StructuredDataSet(file, portal=portal, order=ITEM_INDEX_ORDER)
        return structured_data.data, structured_data.validate() if args.validate else []
    else:
        data = parse_structured_data_via_sheet_utils(file,
                                                     portal_vapp=portal.vapp if portal else None,
                                                     validate=args.validate,
                                                     apply_heuristics=True,
                                                     sheet_order=ITEM_INDEX_ORDER)
        return (data[0], data[1] or []) if args.validate else (data, [])


def dump_schemas(schema_names: List[str], portal: Portal) -> None:
    for schema_name in schema_names:
        schema = Schema.load_by_name(schema_name, portal)
        schema = schema.data if schema else None
        if schema:
            print(f">>> Schema: {schema_name}")
            print(json.dumps(schema, indent=4, default=str))
        elif args.verbose:
            print(f">>> No schema found for type: {schema_name}")

def parse_args() -> argparse.Namespace:

    class argparse_optional(argparse.Action):
        def __call__(self, parser, namespace, values, option_string=None):
            setattr(namespace, self.dest, True if values is None else values)

    parser = argparse.ArgumentParser(description="Parse local structured data file for dev/testing purposes.")

    parser.add_argument("file", type=str, nargs="?", help=f"File to parse.")
    parser.add_argument("--sheet-utils", required=False, action="store_true", default=False,
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
