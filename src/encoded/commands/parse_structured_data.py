import argparse
import json
from typing import List
import yaml
from dcicutils.bundle_utils import RefHint
from dcicutils.validation_utils import SchemaManager
from encoded.commands.captured_output import captured_output
with captured_output():
    from encoded.ingestion.loadxl_extensions import load_data_into_database, summary_of_load_data_results
from encoded.ingestion.ingestion_processors import parse_structured_data
from encoded.ingestion.structured_data import Portal, Schema


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

    ref_errors = []

     # Manually override implementation specifics for --noschemas.
    if args.noschemas:
        if not args.sheet_utils:
            Schema.load_by_name = lambda name, portal: {}
        else:
            SchemaManager.get_schema = lambda name, portal_env, portal_vapp: {}

     # Manually override implementation specifics for --norefs and --refs-optional.
    if args.norefs:
        if not args.sheet_utils:
            Schema._map_function_ref = lambda self, type_info: lambda value: value
        else:
            RefHint._apply_ref_hint = lambda self, value: value
    elif args.refs_optional:
        if not args.sheet_utils:
            real_map_function_ref = Schema._map_function_ref
            def custom_map_function_ref(self, type_info):
                real_map_value_ref = real_map_function_ref(self, type_info)
                def custom_map_value_ref(value, link_to, portal):
                    try:
                        return real_map_value_ref(value)
                    except Exception as e:
                        ref_errors.append(str(e))
                        return value
                return lambda value: custom_map_value_ref(value, type_info.get("linkTo"), self._portal)
            Schema._map_function_ref = custom_map_function_ref
        else:
            real_apply_ref_hint = RefHint._apply_ref_hint
            def custom_apply_ref_hint(self, value):
                try:
                    return real_apply_ref_hint(self, value)
                except Exception as e:
                    ref_errors.append(str(e))
            RefHint._apply_ref_hint = custom_apply_ref_hint


    if args.verbose:
        if args.sheet_utils:
            print(f">>> Using sheet_utils rather than the newer structured_data ...")
        print(f">>> Loading data", end="")
        if args.validate:
            print(" with validation", end="")
        else:
            print(" with NO validation", end="")
        if args.noschemas:
            print(" ignoring schemas", end="")
        print(f" from: {args.file} ...")

    structured_data_set, validation_errors = parse_structured_data(file=args.file,
                                                                   portal=portal,
                                                                   validate=args.validate,
                                                                   sheet_utils=args.sheet_utils)
    print(f">>> Parsed Data:")
    print(json.dumps(structured_data_set, indent=4, default=str))

    if ref_errors:
        print(f"\n>>> Validation Reference (linkTo) Errors:")
        for ref_error in ref_errors:
            print(ref_error)

    print(f"\n>>> Validation Results:")
    if args.validate:
        print(yaml.dump(validation_errors) if validation_errors else "OK")
    else:
        print("No validation results because the --novalidate argument was specified.")

    if args.schemas:
        if args.verbose:
            print(">>> Dumping referenced schemas ...")
        if args.noschemas:
            print("No schemas because the --noschemas argument was specified.")
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
        with captured_output():
            load_results = load_data_into_database(data=structured_data_set,
                                                   portal_vapp=portal.vapp,
                                                   post_only=args.post_only,
                                                   patch_only=args.patch_only,
                                                   validate_only=args.validate_only)
        load_summary = summary_of_load_data_results(load_results)
        print("\n>>> Load Summary:")
        [print(item) for item in load_summary]
        print("\n>>> Load Results:")
        print(yaml.dump(load_results))

    if args.verbose:
        print("\n>>> Done.")


def dump_schemas(schema_names: List[str], portal: Portal) -> None:
    for schema_name in schema_names:
        schema = Schema.load_by_name(schema_name, portal)
        schema = schema.data if schema else None
        if schema:
            print(f">>> Schema: {schema_name}")
            print(json.dumps(schema, indent=4, default=str))
        else:
            print(f">>> No schema found for type: {schema_name}")

def parse_args() -> argparse.Namespace:

    class argparse_optional(argparse.Action):
        def __call__(self, parser, namespace, values, option_string=None):
            setattr(namespace, self.dest, True if values is None else values)

    parser = argparse.ArgumentParser(description="Parse local structured data file for dev/testing purposes.", allow_abbrev=False)

    parser.add_argument("file", type=str, nargs="?", help=f"File to parse.")
    parser.add_argument("--sheet-utils", required=False, action="store_true", default=False,
                        help=f"Use sheet_utils rather than the newer structure_data.")
    parser.add_argument("--schemas", required=False, action="store_true",
                        default=False, help=f"Output the referenced schema(s).")
    parser.add_argument("--norefs", required=False, action="store_true",
                        default=False, help=f"Do not try to resolve schema linkTo references.")
    parser.add_argument("--refs-optional", required=False, action="store_true",
                        default=False, help=f"TODO Do not try to resolve schema linkTo references.")
    parser.add_argument("--noschemas", required=False, action="store_true",
                        default=False, help=f"Do not use schemes at all.")
    parser.add_argument("--novalidate", required=False, action="store_true",
                        default=False, help=f"Do not validate parsed data using JSON schema.")

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
                        default=False, help=f"Debugging mode.")  # Turns off captured_output (use when pdb-ing)

    args = parser.parse_args()

    args.validate = not args.novalidate
    if args.noschemas:
        args.validate = False
    if (1 if args.patch_only else 0) + (1 if args.post_only else 0) + (1 if args.validate_only else 0) > 1:
        print("May only specify one of: --patch-only and --post-only and --validate-only")
        exit(1)
    if not args.norefs and args.refs_optional:
        print("May only specify one of: --norefs and --refs-optional")
    if not args.load and (args.patch_only or args.patch_only or args.validate_only):
        print("Must use --load when using: --patch-only or --post-only or --validate-only")
        exit(1)

    return args


if __name__ == "__main__":
    main()
