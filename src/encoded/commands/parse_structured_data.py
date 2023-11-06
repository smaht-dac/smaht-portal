import argparse
import json
import jsonschema
from typing import Optional
from dcicutils.bundle_utils import load_items as sheet_utils_load_items
from ..ingestion.structured_data import Portal, Schema, StructuredDataSet


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse local structured data file for dev/testing purposes.")
    parser.add_argument("file", type=str, help=f"File to parse.")
    parser.add_argument("--new", required=False, action="store_true", default=False, help=f"Use new parser.")
    parser.add_argument("--validate", required=False, action="store_true", default=False, help=f"Validation using JSON schema.")
    args = parser.parse_args()

    portal = Portal.create_for_testing()

    parsed_data = parse_structured_data(file=args.file, portal=portal, new=args.new)
    print(json.dumps(parsed_data, indent=4, default=str))

    if args.validate:
        for data_type in parsed_data:
            data_of_type = parsed_data[data_type]
            schema = Schema.load_by_name(data_type).data
            schema_validator = jsonschema.Draft7Validator(schema)
            for index, data in enumerate(data_of_type):
                for validation_error in schema_validator.iter_errors(data):
                    print(f"VALIDATION ERROR: {data_type} [{index}]:")
                    print(validation_error)
                    import pdb ; pdb.set_trace()
                pass
            pass

def parse_structured_data(file: str, portal: Optional[Portal], new: bool = False) -> Optional[dict]:
    if new:
        data = StructuredDataSet(file, portal)
        data = data.data
    else:
        data = sheet_utils_load_items(file, portal_vapp=portal.vapp, validate=True, apply_heuristics=True)
        _ = data[1]  # problems unused the moment
        data = data[0]
    return data


if __name__ == "__main__":
    main()
