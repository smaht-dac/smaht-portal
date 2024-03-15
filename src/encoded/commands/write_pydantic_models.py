import argparse
from pathlib import Path
from typing import Any, Dict, List

from datamodel_code_generator import DataModelType, InputFileType, generate
from dcicutils import ff_utils
from dcicutils.creds_utils import SMaHTKeyManager
from dcicutils.misc_utils import camel_case_to_snake_case


DEFAULT_OUTPUT_DIRECTORY = Path(__file__).parent.parent.joinpath("models")


def generate_models(schemas: List[Dict[str, Any]], output_directory: Path) -> None:
    """Generate Pydantic models from schemas."""
    input_file_type = InputFileType.JsonSchema
    output_model_type = DataModelType.PydanticV2BaseModel
    for item, schema in schemas.items():
        item_snake_case = f"{camel_case_to_snake_case(item)}"
        model_path = output_directory.joinpath(f"{item_snake_case}.py")
        schema_to_model = prepare_schema_for_model(schema)
        schema_string = str(schema_to_model)
        generate(
            schema_string,
            input_file_type=input_file_type,
            input_filename=f"{item_snake_case}.json",
            output_model_type=output_model_type,
            output=model_path,
        )


def prepare_schema_for_model(schema: Dict[str, Any]) -> Dict[str, Any]:
    """Remove specific keys that create multiple models per item type."""
    return {
        key: value for key, value in schema.items()
        if key not in {"anyOf", "allOf", "oneOf"}
    }


def main() -> None:
    """Generate Pydantic models from schemas.

    Currently creating models only deployed to given environment. Can
    be extended to create models based on current schemas.
    """
    parser = argparse.ArgumentParser("Write Pydantic models")
    parser.add_argument(
        "env",
        type=str,
        help="The environment to use to pull schemas",
    )
    parser.add_argument(
        "--output-directory",
        "-o",
        type=Path,
        help="Path to the output directory where the models will be written",
        default=DEFAULT_OUTPUT_DIRECTORY,
    )
    args = parser.parse_args()
    key = SMaHTKeyManager().get_keydict_for_env(args.env)
    schemas = ff_utils.get_schemas(key)
    generate_models(schemas, args.output_directory)


if __name__ == "__main__":
    main()
