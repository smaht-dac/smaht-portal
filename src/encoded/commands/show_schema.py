import argparse
import json
from encoded.ingestion.structured_data import Schema
from encoded.commands.captured_output import captured_output
from encoded.commands.portal_for_testing import create_portal_for_testing

# For dev/testing only.
# Dumps the specified schema to stdout.  

def main() -> None:
    parser = argparse.ArgumentParser(description="Show schemas for dev/testing purposes.")
    parser.add_argument("schema", type=str, help=f"Schema to show.")
    parser.add_argument("--debug", required=False, action="store_true",
                        default=False, help=f"Debugging mode.")  # Turns off captured_output (use when pdb-ing)
    args = parser.parse_args()

    with captured_output():
        portal = create_portal_for_testing()

    schema = Schema.load_by_name(args.schema, portal)
    print(json.dumps(schema.data, indent=4, default=str))
    return


if __name__ == "__main__":
    main()
