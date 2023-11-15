import argparse
import json
from jsonschema import Draft7Validator as JsonSchemaValidator
from typing import List, Optional, Tuple
import yaml
from dcicutils.bundle_utils import load_items as sheet_utils_load_items, RefHint
from encoded.ingestion.loadxl_extensions import load_data_into_database
from encoded.ingestion.structured_data import Portal, Schema, StructuredDataSet
from encoded.project.loadxl import ITEM_INDEX_ORDER

# For dev/testing only.
# Parsed and optionally loads a structured CSV or Excel file
# using either ingestion.structured_data or dcicutils.sheet_utils.

def main() -> None:
    parser = argparse.ArgumentParser(description="Parse local structured data file for dev/testing purposes.")
    parser.add_argument("file", type=str, help=f"File to parse.")
    parser.add_argument("--new", required=False, action="store_true", default=False,
                        help=f"Use new structure_data_parser rather than sheet_utils.")
    parser.add_argument("--schemas", required=False, action="store_true",
                        default=False, help=f"Only output the loaded schema(s).")
    parser.add_argument("--noschemas", required=False, action="store_true",
                        default=False, help=f"Do not use schemes.")
    parser.add_argument("--noref", required=False, action="store_true",
                        default=False, help=f"Do not try to resolve schema linkTo references.")
    parser.add_argument("--validate", required=False, action="store_true",
                        default=False, help=f"Validation using JSON schema.")
    parser.add_argument("--no-format-validate", required=False, action="store_true",
                        default=False, help=f"Do not do format checking on JSON schema validation.")
    parser.add_argument("--load", required=False, action="store_true",
                        default=False, help=f"Load data into database.")
    parser.add_argument("--load-ini", required=False, type=str,
                        default=None, help=f"The .ini file to use for load into database (via --load).")
    parser.add_argument("--local", required=False, action="store_true",
                        default=False, help=f"Using portal vapp for locally running instance.")
    parser.add_argument("--verbose", required=False, action="store_true",
                        default=False, help=f"Verbose output.")
    args = parser.parse_args()

    if args.noref:
        if args.new:
            # Manually override the Schema._map_function_ref function to not check for linkTo references.
            Schema._map_function_ref = lambda self, type_info: lambda value: value
        else:
            # Manually override the RefHint._apply_ref_hint function to not check for linkTo references.
            RefHint._apply_ref_hint = lambda self, value: value

    if args.load or args.local:
        portal = Portal.create_for_local_testing(ini_file=args.load_ini)
    else:
        portal = Portal.create_for_unit_testing()

    if args.verbose:
        print(f">>> Loading structured data", end="")
        if args.validate:
            print(" with validation", end="")
        print(f" from: {args.file} ...")

    structured_data_set, problems = parse_structured_data(file=args.file,
                                                          portal=portal,
                                                          new=args.new,
                                                          validate=args.validate,
                                                          noschemas=args.noschemas)

    print(f">>> Structured Data:")
    print(json.dumps(structured_data_set, indent=4, default=str))

    if args.validate:
        print(f">>> Validation Results:")
        print(yaml.dump(problems))

    if args.schemas:
        if args.verbose:
            print(">>> Dumping schemas referenced by structured data ...")
        for data_type in structured_data_set:
            data_of_type = structured_data_set[data_type]
            schema = Schema.load_by_name(data_type, portal)
            schema = schema.data if schema else None
            if schema:
                print(f">>> Schema: {data_type}")
                print(json.dumps(schema, indent=4, default=str))
            elif args.verbose:
                print(f">>> No schema found for type: {data_type}")
        return

    if args.load:
        if args.verbose:
            print(">>> Loading structured data into local database ...")
        results = load_data_into_database(data=structured_data_set, portal_vapp=portal.vapp, validate_only=False)
        print(yaml.dump(results))

    if args.verbose:
        print(">>> Done.")


def parse_structured_data(file: str,
                          portal: Optional[Portal],
                          validate: bool = False,
                          new: bool = False,
                          noschemas: bool = False) -> Tuple[Optional[dict], Optional[List[str]]]:
    if new:
        if noschemas:
            portal = None
        structured_data = StructuredDataSet(file, portal=portal, order=ITEM_INDEX_ORDER)
        problems = structured_data.validate() if validate else []
        data = structured_data.data
    else:
        data = sheet_utils_load_items(file, portal_vapp=portal.vapp if portal else None,
                                      validate=validate, apply_heuristics=True,
                                      sheet_order=ITEM_INDEX_ORDER, noschemas=noschemas)
        if not noschemas and validate:
            problems = data[1] or []
            data = data[0]
        else:
            problems = []
    return data, problems


if __name__ == "__main__":
    main()
