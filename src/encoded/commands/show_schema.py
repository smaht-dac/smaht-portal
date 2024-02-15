import argparse
import json
from typing import Optional
import yaml
from dcicutils.structured_data import Portal, Schema
from encoded.commands.captured_output import captured_output

# For dev/testing only.
# Dumps the specified schema to stdout.  

def main() -> None:
    parser = argparse.ArgumentParser(description="Show schemas for dev/testing purposes.")
    parser.add_argument("schema", type=str, help=f"Schema to show.")
    parser.add_argument("--env", type=str, required=False, default=None,
                        help=f"Environment name (e.g. via ~/.smaht-keys.json).")
    parser.add_argument("--raw", required=False, action="store_true",
                        default=False, help=f"Raw JSON output with no formating.") 
    parser.add_argument("--yaml", required=False, action="store_true",
                        default=False, help=f"YAML output rather than JSON.") 
    parser.add_argument("--debug", required=False, action="store_true",
                        default=False, help=f"Debugging mode.")  # Turns off captured_output (use when pdb-ing)
    args = parser.parse_args()

    with captured_output():
        portal = Portal(args.env) if args.env else Portal.create_for_testing()

    if args.schema.lower() == "all":
        schema = portal.get_schemas()
    else:
        schema = Schema.load_by_name(args.schema, portal)
        if not schema:
            if schema_name := rummage_for_schema_name(portal, args.schema):
                schema = Schema.load_by_name(schema_name, portal)
            if not schema:
                print(f"Schema not found: {args.schema}")
                exit(1)
        schema = schema.data
    if args.yaml:
        print(yaml.dump(schema))
    elif args.raw:
        print(json.dumps(schema, default=str))
    else:
        print(json.dumps(schema, indent=4, default=str))


def rummage_for_schema_name(portal: Portal, schema_name: str) -> Optional[str]:
    if schemas := portal.get_schemas():
        for schema in schemas:
            if schema.lower() == schema_name.lower():
                return schema


if __name__ == "__main__":
    main()
