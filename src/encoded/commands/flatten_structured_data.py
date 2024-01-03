import argparse
import json
from typing import Any, List, Optional, Union

# For dev/testing only.
# Flattens a given JSON file into CSV or JSON;
# useful tool when creating test CSV files (from JSON) for ingestion.

def flatten_json(data: Union[dict, list, Any],
                 parent_key: Optional[str] = None,
                 flattened_json: Optional[dict] = None) -> dict:

    def is_scalar_array(value: List[Any]) -> bool:
        if not isinstance(value, list):
            return False
        for item in value:
            if isinstance(item, (dict, list)):
                return False
        return True

    def normalize_flattened_json(flattened_json: List[Any]) -> bool:
        # Make sure all objects have all properties of each other.
        header = set()
        for item in flattened_json:
            for key in item:
                header.add(key)
        for item in flattened_json:
            for header_item in header:
                if header_item not in item:
                    item[header_item] = None
        # Make sure all objects have their properties sorted by property name.
        sorted_flattened_json = []
        for item in flattened_json:
            sorted_flattened_json.append(dict(sorted(item.items())))
        return sorted_flattened_json


    if flattened_json is None:
        if isinstance(data, list):
            flattened_json = []
            for item in data:
                flattened_json.append(flatten_json(item))
            flattened_json = normalize_flattened_json(flattened_json)
            return flattened_json
        flattened_json = {}
    if isinstance(data, dict):
        for key, value in data.items():
            flattened_key = key if not parent_key else f"{parent_key}.{key}"
            flatten_json(value, parent_key=flattened_key, flattened_json=flattened_json)
    elif isinstance(data, list):
        if is_scalar_array(data):
            flattened_json[f"{parent_key}#"] = "|".join([str(item) for item in data if item is not None])
        else:
            for index, item in enumerate(data):
                flattened_key = key if not parent_key else f"{parent_key}#{index}"
                flatten_json(item, parent_key=flattened_key, flattened_json=flattened_json)
    elif parent_key:
        flattened_json[parent_key] = data
    return flattened_json


def write_flattened_json_to_csv(flattened_json: dict, output_csv_file: str) -> None:

    def rowify_simple_json(data: dict, keys: bool = False) -> List[List[Optional[Any]]]:
        values = []
        for key, value in data.items():
            if keys:
                values.append(key)
            else:
                values.append(str(value) if value is not None else "")
        return values

    def rowify_flattened_json(flattened_json: dict) -> List[List[Optional[Any]]]:
        rows = []
        if isinstance(flattened_json, list):
            for index, item in enumerate(flattened_json):
                if index == 0:
                    rows.append(rowify_simple_json(item, keys=True))
                rows.append(rowify_simple_json(item))
        elif isinstance(flattened_json, dict):
            rows.append(rowify_simple_json(flattened_json))
        return rows

    rows = rowify_flattened_json(flattened_json)
    with open(output_csv_file, "w") as f:
        for row in rows:
            for value in row: 
                if value is not None:
                    f.write(str(value))
                    f.write(",")
            f.write("\n")


def flatten_json_to_csv(data: dict, output_csv_file: str) -> None:
    write_flattened_json_to_csv(flatten_json(data), output_csv_file)


def flatten_json_to_json(data: dict, output_csv_file: str) -> None:
    data = flatten_json(data)
    with open(output_csv_file, "w") as f:
        json.dump(data, f, indent=4)


def main():
    parser = argparse.ArgumentParser(description="Flatten JSON data file for dev/testing purposes.")
    parser.add_argument("file", type=str, help=f"File to parse.")
    parser.add_argument("--csv", required=False, action="store_true", default=True,
                        help=f"Flatten to CSV format.")
    parser.add_argument("--json", required=False, action="store_true", default=False,
                        help=f"Flatten to JSON format.")
    args = parser.parse_args()

    with open(args.file) as f:
        data = json.load(f)
        if isinstance(data, dict):
            data = [data]
        if args.json:
            flatten_json_to_json(data, "/dev/stdout")
        else:
            flatten_json_to_csv(data, "/dev/stdout")


if __name__ == "__main__":
    main()
