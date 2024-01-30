import argparse
import json
import os
from typing import List, Optional
import yaml
from dcicutils.misc_utils import PRINT
from dcicutils.tmpfile_utils import temporary_file
from encoded.commands.captured_output import captured_output
with captured_output():
    from encoded.ingestion.loadxl_extensions import load_data_into_database, summary_of_load_data_results
from encoded.ingestion.ingestion_processors import parse_structured_data
from dcicutils.structured_data import Portal, Schema, StructuredDataSet
from dcicutils.portal_object_utils import PortalObject


# For dev/testing only.
# Parsed and optionally loads a structured CSV or Excel file using ingestion.structured_data.

def main() -> None:

    args = parse_args()

    # Portal.create_for_testing returns a Portal object suitable for most local unit
    # testing purposes including, for example, fetching type (JSON) schemas (via Portal.get_schema);
    # assuming run within a (pyenv) virtualenv which includes the portal "encoded" package.
    #
    # Portal.create_for_testing(True) returns a Portal object suitable for local integration
    # testing including, for example, fetching data (via Portal.get_metadata) from a locally running portal.
    #
    # Portal.create_portal_for_testing(ini_file) with a provided .ini file (e.g. development.ini)
    # returns a Portal object suitable for local integration testing including, for example,
    # loading data into the database of a locally running portal.
    with captured_output():
        if not args.env:
            if args.load or not args.norefs:
                portal = Portal.create_for_testing(args.portal or args.load)
            else:
                portal = Portal.create_for_testing()
        else:
            portal = Portal(args.env)

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

    PRINT(f"> Data:")
    PRINT("  ", end="")
    if args.yaml:
        PRINT("\n  ".join(yaml.dump(structured_data).split("\n")))
    else:
        PRINT("\n  ".join(json.dumps(structured_data, indent=4, default=str).split("\n")))
        PRINT()

    PRINT("> Portal:")
    if portal.env:
        PRINT(f"  - ENV: {portal.env}")
    if portal.keys_file:
        PRINT(f"  - Keys File: {portal.keys_file}")
    if portal.key:
        PRINT(f"  - Key: {portal.key_id}")
    if portal.secret:
        PRINT(f"  - Secret: {portal.secret[0]}*******")
    if portal.server:
        PRINT(f"  - Server: {portal.server}")
    if portal.ini_file:
        PRINT(f"  - INI File: {portal.ini_file}")
    if portal.vapp:
        PRINT(f"  - VAPP: ✓")
    PRINT(f"  - Ping: {'✓' if portal.ping() else '✗'}")
    PRINT()

    PRINT("> Types:")
    for type_name in structured_data_set.data:
        nobjects = len(structured_data_set.data[type_name])
        PRINT(f"  {type_name}: {nobjects} object{'s' if nobjects != 1 else ''}")

    PRINT(f"\n> Files:")
    if files := structured_data_set.upload_files_located(args.directory):
        for file in files:
            PRINT(f"  - {file.get('type')}: {file.get('file')}")
            if file.get('path'):
                PRINT(f"    Found -> {file.get('path')} -> {format_file_size(get_file_size(file.get('path')))}")
            else:
                PRINT(f"    Not found!")
    else:
        PRINT("  No files.")

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

    if not args.nodiffs:
        print_structured_data_status(portal, structured_data_set)

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
        [PRINT(f"  {item}") for item in load_summary]
        PRINT("\n> Load Results:")
        PRINT("  ", end="")
        PRINT("\n  ".join(yaml.dump(load_results).split("\n")))

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


def print_structured_data_status(portal: Portal, structured_data: StructuredDataSet) -> None:
    PRINT("\n> Object Create/Update Situation:")
    diffs = structured_data.compare()
    for object_type in diffs:
        PRINT(f"  TYPE: {object_type}")
        for object_info in diffs[object_type]:
            PRINT(f"  - OBJECT: {object_info.path}")
            if not object_info.uuid:
                PRINT(f"     Does not exist -> Will be CREATED")
            else:
                PRINT(f"     Already exists -> {object_info.uuid} -> Will be UPDATED", end="")
                if not object_info.diffs:
                    PRINT(" (but NO substantive diffs)")
                else:
                    PRINT(" (substantive DIFFs below)")
                    for diff_path in object_info.diffs:
                        if (diff := object_info.diffs[diff_path]).creating_value:
                            PRINT(f"      CREATE {diff_path}: {diff.value}")
                        elif diff.updating_value:
                            PRINT(f"      UPDATE {diff_path}: {diff.updating_value} -> {diff.value}")
                        elif (diff := object_info.diffs[diff_path]).deleting_value:
                            PRINT(f"      DELETE {diff_path}: {diff.value}")


def get_file_size(file: str) -> int:
    return os.path.getsize(file)


def format_file_size(nbytes: int) -> str:
    for unit in ["b", "Kb", "Mb", "Gb", "Tb", "Pb", "Eb", "Zb"]:
        if abs(nbytes) < 1024.0:
            return f"{nbytes:3.1f}{unit}"
        nbytes /= 1024.0
    return f"{nbytes:.1f}Yb"


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
    parser.add_argument("--yaml", required=False, action="store_true",
                        default=False, help=f"YAML (rather than JSON) output for loaded/displayed data.")
    parser.add_argument("--env", default=False, help=f"Environment name for Portal (e.g. via ~/.smaht-keys.json).")
    parser.add_argument("--load", nargs="?", action=argparse_optional, const=True,
                        default=False, help=f"Load data into local portal/database (optionally specify .ini file to use).")
    parser.add_argument("--portal", nargs="?", action=argparse_optional, const=True,
                        default=False,
                        help=f"Use local portal/database for checking references (optionally specify .ini file to use).")
    parser.add_argument("--post-only", required=False, action="store_true",
                        default=False, help=f"Only perform updates (POST) when loading data.")
    parser.add_argument("--patch-only", required=False, action="store_true",
                        default=False, help=f"Only perform updates (PATCH) when loading data.")
    parser.add_argument("--validate-only", required=False, action="store_true",
                        default=False, help=f"Only perform validation when loading data.")
    parser.add_argument("--nodiffs", required=False, action="store_true",
                        default=False, help=f"Disable output of object create/update/diff status.")
    parser.add_argument("--directory", "-d", type=str, nargs="?", help=f"Directory in which to look for upload files.")
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
