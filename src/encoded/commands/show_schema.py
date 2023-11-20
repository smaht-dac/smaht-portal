# test edit
import argparse
import json
from encoded.ingestion.structured_data import Portal, Schema
from encoded.commands.captured_output import captured_output

# For dev/testing only.
# Dumps the specified schema to stdout.  

def main() -> None:
    parser = argparse.ArgumentParser(description="Show schemas for dev/testing purposes.")
    parser.add_argument("schema", type=str, help=f"Schema to show.")
    args = parser.parse_args()

    # The Portal.create_for_unit_testing function returns a Portal object suitable for most local unit
    # testing purposes including, for example, fetching type (JSON) schemas (via Portal.get_schema);
    # assuming run within a (pyenv) virtualenv which includes the portal "encoded" package.
    #
    # The Portal.create_for_local_testing function returns a Portal object suitable for local integration
    # testing including, for example, fetching data (via Portal.get_metadata) from a locally running portal.
    #
    # The create_for_local_testing function with a provided .ini file (e.g. development.ini)
    # returns a Portal object suitable for local integration testing including, for example,
    # loading data into the database of a locally running portal.

    with captured_output():
        portal = Portal.create_for_testing()

    schema = Schema.load_by_name(args.schema, portal)
    print(json.dumps(schema.data, indent=4, default=str))
    return


if __name__ == "__main__":
    main()
