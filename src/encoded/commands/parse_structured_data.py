import argparse
import json
from typing import Optional
from dcicutils.bundle_utils import load_items as sheet_utils_load_items
from ..ingestion.structured_data import Portal, StructuredDataSet


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse local structured data file for dev/testing purposes.")
    parser.add_argument("file", type=str, help=f"File to parse.")
    parser.add_argument("--new", required=False, action="store_true", default=False, help=f"Use new parser.")
    args = parser.parse_args()
    data = parse_structured_data(args.file, new=args.new)
    print(json.dumps(data, indent=4, default=str))

def parse_structured_data(file_name: str, portal: Optional[Portal] = None, new: bool = False) -> Optional[dict]:
    if not portal:
        portal = Portal.create_for_testing()
    if new:
        data = StructuredDataSet(file_name, portal)
        data = data.data
    else:
        data = sheet_utils_load_items(file_name, portal_vapp=portal.vapp, validate=True, apply_heuristics=True)
        _ = data[1]  # problems unused the moment
        data = data[0]
    return data


if __name__ == "__main__":
    main()
