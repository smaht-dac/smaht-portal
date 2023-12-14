import argparse
import json
from dcicutils.structured_data import Portal, Schema
from encoded.commands.captured_output import captured_output

# For dev/testing only.
# Dumps the specified schema to stdout.  

def main() -> None:
    parser = argparse.ArgumentParser(description="Show schemas for dev/testing purposes.")
    parser.add_argument("schema", type=str, help=f"Schema to show.")
    parser.add_argument("--env", type=str, required=False, default=None,
                        help=f"Environment name (key from ~/.smaht-keys.json).")
    parser.add_argument("--debug", required=False, action="store_true",
                        default=False, help=f"Debugging mode.")  # Turns off captured_output (use when pdb-ing)
    args = parser.parse_args()

    with captured_output():
        portal = Portal(args.env) if args.env else Portal.create_for_testing()

    schema = Schema.load_by_name(args.schema, portal)
    print(json.dumps(schema.data, indent=4, default=str))
    return


if __name__ == "__main__":
    main()
