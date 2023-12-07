import argparse
import json
import os
from typing import List, Optional
import yaml
from dcicutils.misc_utils import PRINT
from dcicutils.zip_utils import temporary_file
from encoded.commands.captured_output import captured_output
with captured_output():
    from encoded.ingestion.loadxl_extensions import load_data_into_database, summary_of_load_data_results
from encoded.ingestion.ingestion_processors import parse_structured_data
from dcicutils.structured_data import Portal, Schema


# For dev/testing only.
# Parsed and optionally loads a structured CSV or Excel file using ingestion.structured_data.

def main() -> None:

    args = parse_args()

    # The Portal.create_for_testing function returns a Portal object suitable for most local unit
    # testing purposes including, for example, fetching type (JSON) schemas (via Portal.get_schema);
    # assuming run within a (pyenv) virtualenv which includes the portal "encoded" package.
    #
    # The Portal.create_for_testing_local function returns a Portal object suitable for local integration
    # testing including, for example, fetching data (via Portal.get_metadata) from a locally running portal.
    #
    # The create_portal_for_local_testing function with a provided .ini file (e.g. development.ini)
    # returns a Portal object suitable for local integration testing including, for example,
    # loading data into the database of a locally running portal.
    with captured_output():
        if args.load or not args.norefs:
            portal = Portal.create_for_testing_local(args.load)
        else:
            portal = Portal.create_for_testing()

    # Manually override implementation specifics for --noschemas.
    if args.noschemas:
        Schema.load_by_name = lambda name, portal: {}

    if args.norefs:
        override_ref_handling(args)

    if args.verbose:
        PRINT(f"> Loading data", end="")
        if args.novalidate:
            PRINT(" with NO validation", end="")
        else:
            PRINT(" with validation", end="")
        if args.norefs:
            PRINT(" with NO ref checking", end="")
        if args.noschemas:
            PRINT(" with NO schemas", end="")
        PRINT(f" from: {args.file} ...")

    if not os.path.exists(args.file):
        PRINT(f"Cannot open file: {args.file}")
        exit(2)

    if args.as_file_name:
        with open(args.file, "rb" if args.file.endswith((".gz", ".tgz", ".tar", ".tar.gz", ".zip")) else "r") as f:
            with temporary_file(name=args.as_file_name, content=f.read()) as file_name:
                structured_data_set = parse_structured_data(file=file_name, portal=portal, novalidate=args.novalidate)
    else:
        structured_data_set = parse_structured_data(file=args.file, portal=portal, novalidate=args.novalidate)
    structured_data = structured_data_set.data
    validation_errors = structured_data_set.validation_errors

    PRINT(f"> Parsed Data:")
    PRINT(json.dumps(structured_data, indent=4, default=str))

    PRINT(f"\n> References (linkTo):")
    if args.norefs or args.noschemas:
        PRINT(f"  - No references because --norefs or --noschemas was specified.")
    else:
        if structured_data_set.resolved_refs:
            for ref in sorted(structured_data_set.resolved_refs):
                PRINT(f"  - {ref}")

    if structured_data_set.ref_errors:
        PRINT(f"\n> Reference (linkTo) Errors:")
        for ref_error in structured_data_set.ref_errors:
            PRINT(f"  - {format_issue(ref_error)}")

    PRINT(f"\n> Schema Validation Results:")
    if not args.novalidate:
        if not validation_errors:
            PRINT("  - OK")
        elif args.verbose:
            for validation_error in validation_errors:
                PRINT(f"  - {format_issue(validation_error)}")
        elif len(validation_errors) > 16:
            nmore_validation_errors = len(validation_errors) - 16
            for validation_error in validation_errors[:16]:
                PRINT(f"  - {format_issue(validation_error)}")
            PRINT(f"  - There are {nmore_validation_errors} more validation errors; use --verbose to see all.")
        else:
            for validation_error in validation_errors:
                PRINT(f"  - {format_issue(validation_error)}")
    else:
        PRINT("  - No validation results because the --novalidate argument was specified.")

    if structured_data_set.reader_warnings:
        for reader_warning in structured_data_set.reader_warnings:
            PRINT(f"  - {format_issue(reader_warning)}")

    if args.schemas:
        if args.verbose:
            PRINT("> Dumping referenced schemas ...")
        if args.noschemas:
            PRINT("  - No schemas because the --noschemas argument was specified.")
        else:
            dump_schemas(list(structured_data.keys()), portal)

    if args.load:
        if args.verbose:
            PRINT("> Loading data into local portal database", end="")
            if args.post_only:
                PRINT(" (POST only)", end="")
            if args.patch_only:
                PRINT(" (POST only)", end="")
            if args.validate_only:
                PRINT(" (VALIDATE only)", end="")
            PRINT(" ...")
        with captured_output():
            load_results = load_data_into_database(data=structured_data,
                                                   portal_vapp=portal._vapp,
                                                   post_only=args.post_only,
                                                   patch_only=args.patch_only,
                                                   validate_only=args.validate_only)
        load_summary = summary_of_load_data_results(load_results)
        PRINT("\n> Load Summary:")
        [PRINT(item) for item in load_summary]
        PRINT("\n> Load Results:")
        PRINT(yaml.dump(load_results))

    if args.verbose:
        PRINT("\n> Done.")


def override_ref_handling(args: argparse.Namespace) -> dict:
    # Should probably have used mocking, maybe a bit simpler..
    refs = {"errors": set(), "actual": set()}
    if args.norefs:  # Do not check refs at all.
        Schema._map_function_ref = lambda self, typeinfo: lambda value, src: value
    return refs


def dump_schemas(schema_names: List[str], portal: Portal) -> None:
    for schema_name in schema_names:
        schema = Schema.load_by_name(schema_name, portal)
        schema = schema.data if schema else None
        if schema:
            PRINT(f"\n> Schema: {schema_name}")
            PRINT(json.dumps(schema, indent=4, default=str))
        else:
            PRINT(f"> No schema found for type: {schema_name}")


def format_issue(issue: dict, original_file: Optional[str] = None) -> str:
    def src_string(issue: dict) -> str:
        if not isinstance(issue, dict) or not isinstance(issue_src := issue.get("src"), dict):
            return ""
        show_file = original_file and (original_file.endswith(".zip") or
                                       original_file.endswith(".tgz") or original_file.endswith(".gz"))
        src_file = issue_src.get("file") if show_file else ""
        src_type = issue_src.get("type")
        src_column = issue_src.get("column")
        src_row = issue_src.get("row", 0)
        if src_file:
            src = f"{os.path.basename(src_file)}"
            sep = ":"
        else:
            src = ""
            sep = "."
        if src_type:
            src += (sep if src else "") + src_type
            sep = "."
        if src_column:
            src += (sep if src else "") + src_column
        if src_row > 0:
            src += (" " if src else "") + f"[{src_row}]"
        if not src:
            if issue.get("warning"):
                src = "Warning"
            elif issue.get("error"):
                src = "Error"
            else:
                src = "Issue"
        return src
    issue_message = None
    if issue:
        if error := issue.get("error"):
            issue_message = error
        elif warning := issue.get("warning"):
            issue_message = warning
        elif issue.get("truncated"):
            return f"Truncated result set | More: {issue.get('more')} | See: {issue.get('details')}"
    return f"{src_string(issue)}: {issue_message}" if issue_message else ""


def parse_args() -> argparse.Namespace:

    class argparse_optional(argparse.Action):
        def __call__(self, parser, namespace, values, option_string=None):
            setattr(namespace, self.dest, True if values is None else values)

    parser = argparse.ArgumentParser(description="Parse local structured data file for dev/testing purposes.", allow_abbrev=False)

    parser.add_argument("file", type=str, nargs="?", help=f"File to parse.")
    parser.add_argument("--as-file-name", type=str, nargs="?", help=f"Use this file name as the name of the given file.")
    parser.add_argument("--schemas", required=False, action="store_true",
                        default=False, help=f"Output the referenced schema(s).")
    parser.add_argument("--norefs", required=False, action="store_true",
                        default=False, help=f"Do not try to resolve schema linkTo references.")
    parser.add_argument("--noschemas", required=False, action="store_true",
                        default=False, help=f"Do not use schemes at all.")
    parser.add_argument("--novalidate", required=False, action="store_true",
                        default=False, help=f"Do not validate parsed data using JSON schema.")

    parser.add_argument("--load", nargs="?", action=argparse_optional, const=True,
                        default=False, help=f"Load data into database (optionally specify .ini file to use).")
    parser.add_argument("--post-only", required=False, action="store_true",
                        default=False, help=f"Only perform updates (POST) when loading data.")
    parser.add_argument("--patch-only", required=False, action="store_true",
                        default=False, help=f"Only perform updates (PATCH) when loading data.")
    parser.add_argument("--validate-only", required=False, action="store_true",
                        default=False, help=f"Only perform validation when loading data.")

    parser.add_argument("--verbose", required=False, action="store_true",
                        default=False, help=f"Verbose output.")
    parser.add_argument("--debug", required=False, action="store_true",
                        default=False, help=f"Debugging mode.")  # Turns off captured_output (use when pdb-ing)

    args = parser.parse_args()

    if args.noschemas:
        args.novalidate = True
    if (1 if args.patch_only else 0) + (1 if args.post_only else 0) + (1 if args.validate_only else 0) > 1:
        PRINT("May only specify one of: --patch-only or --post-only or --validate-only")
        exit(1)
    if not args.load and (args.patch_only or args.post_only or args.validate_only):
        PRINT("Must use --load when using: --patch-only or --post-only or --validate-only")
        exit(1)

    return args


if __name__ == "__main__":
    main()
