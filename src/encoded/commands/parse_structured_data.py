import argparse
import json
from jsonschema import Draft7Validator as JsonSchemaValidator
from typing import Optional
import yaml
from dcicutils.bundle_utils import load_items as sheet_utils_load_items
from encoded.ingestion.loadxl_extensions import load_data_into_database
from encoded.ingestion.structured_data import Portal, Schema, StructuredDataSet
from encoded.project.loadxl import ITEM_INDEX_ORDER


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse local structured data file for dev/testing purposes.")
    parser.add_argument("file", type=str, help=f"File to parse.")
    parser.add_argument("--new", required=False, action="store_true", default=False,
                        help=f"Use new structure_data_parser rather than sheet_utils.")
    parser.add_argument("--schemas", required=False, action="store_true",
                        default=False, help=f"Only output the loaded schema(s).")
    parser.add_argument("--noschemas", required=False, action="store_true",
                        default=False, help=f"Do not use schemes.")
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

    if args.noschemas:
        if args.schemas:
            print("Cannot specify both --schemas and --noschemas.")
            #exit(1)

    if args.load or args.local:
        portal = Portal.create_for_local_testing(ini_file=args.load_ini)
    else:
        #portal = Portal.create_for_unit_testing() if not args.noschemas else None
        portal = Portal.create_for_unit_testing()

    if args.verbose:
        print(f">>> Loading structured data from: {args.file} ...")
    structured_data_set = parse_structured_data(file=args.file, portal=portal, new=args.new, noschemas=args.noschemas)
    print(f">>> Structured Data:")
    print(json.dumps(structured_data_set, indent=4, default=str))

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

    if args.validate:
        if args.verbose:
            print(">>> Validating structured data using associated schemas ...")
        for data_type in structured_data_set:
            data_of_type = structured_data_set[data_type]
            schema = Schema.load_by_name(data_type, portal)
            schema = schema.data if schema else None
            if schema:
                schema_format_checker = JsonSchemaValidator.FORMAT_CHECKER if not args.no_format_validate else None
                schema_validator = JsonSchemaValidator(schema, format_checker=schema_format_checker)
                for index, data in enumerate(data_of_type):
                    for validation_error in schema_validator.iter_errors(data):
                        print(f">>> Validation Error: {data_type} [{index}]:")
                        print(validation_error)
            elif args.verbose:
                print(f">>> No schema found for type: {data_type}")

    if args.load:
        if args.verbose:
            print(">>> Loading structured data into local database ...")
        results = load_data_into_database(data=structured_data_set, portal_vapp=portal.vapp, validate_only=False)
        print(yaml.dump(results))

    if args.verbose:
        print(">>> Done.")


def parse_structured_data(file: str, portal: Optional[Portal],
                          new: bool = False, noschemas: bool = False) -> Optional[dict]:
    if new:
        if noschemas:
            portal = None
        data = StructuredDataSet(file, portal=portal, order=ITEM_INDEX_ORDER).data
    else:
        portal_vapp = portal.vapp if portal else None
        data = sheet_utils_load_items(file, portal_vapp=portal_vapp,
                                      validate=True, apply_heuristics=False,
                                      sheet_order=ITEM_INDEX_ORDER, noschemas=noschemas)
        if not noschemas:
            _ = data[1]  # problems unused the moment
            data = data[0]
    return data


if __name__ == "__main__":
    main()
