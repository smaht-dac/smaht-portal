import argparse
import json
import logging
from pathlib import Path
from typing import Any, Dict, Iterator, List

from dcicutils import schema_utils
from snovault import load_schema

from encoded.types.submitted_item import (
    SUBMITTED_ID_CENTER_CODE_PATTERN,
    SUBMITTED_ID_IDENTIFIER_PATTERN,
    SUBMITTED_ID_PROPERTY,
    SubmittedIdPattern,
    parse_submitted_id_pattern,
)


logger = logging.getLogger(__name__)


def update_submitted_id_patterns(
    submission_center_code_pattern: str,
    identifier_pattern: str,
) -> None:
    """Run through schemas and update submitted_id patterns."""
    for schema_path in get_schema_file_paths():
        update_submitted_id_pattern(
            schema_path, submission_center_code_pattern, identifier_pattern
        )


def get_schema_file_paths() -> List[Path]:
    """Get list of all schemas in encoded/schemas.

    Smell the file to ensure actual item schema.
    """
    return [
        path for path in get_json_file_paths_in_schema_dir()
        if is_schema_file(path)
    ]


def get_json_file_paths_in_schema_dir() -> Iterator[Path]:
    """Get all JSON file paths in encoded/schemas/."""
    encoded_dir = Path(__file__).parent.parent
    schema_dir = encoded_dir.joinpath("schemas/")
    return schema_dir.glob("*.json")


def is_schema_file(file_path: Path) -> bool:
    """Use simple heuristic to ensure item schema."""
    file_content = load_json_file(file_path)
    if (
        isinstance(file_content, dict)
        and schema_utils.is_object_schema(file_content)
        and schema_utils.has_property(file_content, "schema_version")
    ):
        return True
    return False


def load_json_file(file_path: Path) -> Any:
    """Load given file as JSON."""
    result = {}
    try:
        with file_path.open() as file_handle:
            result = json.load(file_handle)
    except json.decoder.JSONDecodeError:
        logger.warning(f"Unable to load file: {file_path}")
    return result


def update_submitted_id_pattern(
    schema_path: Path,
    submission_center_code_pattern: str,
    identifier_pattern: str,
) -> None:
    """Update `submitted_id` property's pattern.

    If no pattern present, create it with assumed format.

    If `submitted_id` not present in the schema, nothing to do.
    """
    resolved_schema = load_resolved_schema(schema_path)
    resolved_submitted_id_schema = get_submitted_id_schema(resolved_schema)
    raw_schema = load_json_file(schema_path)
    raw_submitted_id_schema = get_submitted_id_schema(raw_schema)
    if (
        resolved_submitted_id_schema
        and does_pattern_require_update(
            raw_submitted_id_schema, submission_center_code_pattern, identifier_pattern
        )
    ):
        write_pattern_to_schema_file(
            schema_path,
            submission_center_code_pattern,
            identifier_pattern,
        )


def get_submitted_id_schema(schema: Dict[str, Any]) -> Dict[str, Any]:
    """Get `submitted_id` schema from properties."""
    return schema_utils.get_property(schema, SUBMITTED_ID_PROPERTY)


def load_resolved_schema(schema_path: Path) -> Dict[str, Any]:
    """Load schema with all references resolved.

    Catch errors with reference resolution and keep moving.
    """
    result = {}
    try:
        result = load_schema(str(schema_path.absolute()))
    except Exception as e:
        logger.warning(f"Unable to load resolved schema for {schema_path}: {e}")
    return result


def does_pattern_require_update(
    submitted_id_schema: Dict[str, Any],
    submission_center_code_pattern: str,
    identifier_pattern: str,
) -> bool:
    """Does current `submitted_id` pattern meet expectations?

    Note: Explicitly assumes format of the pattern.
    """
    pattern = schema_utils.get_pattern(submitted_id_schema)
    if not pattern:
        return True
    if not is_pattern_up_to_date(pattern, submitted_id_schema, identifier_pattern):
        return True
    return False


def is_pattern_up_to_date(
    submitted_id_pattern: str,
    submission_center_code_pattern: str,
    identifier_pattern: str,
) -> bool:
    """Does given pattern match expectations?"""
    current_pattern = parse_submitted_id_pattern(submitted_id_pattern)
    if (
        current_pattern.center_code != submission_center_code_pattern
        or current_pattern.identifier != identifier_pattern
    ):
        return True
    return False


def write_pattern_to_schema_file(
    schema_path: Path,
    submission_center_code_pattern: str,
    identifier_pattern: str,
) -> None:
    """Update the schema file to contain an updated pattern.

    If raw schema lacks `submitted_id` under property (e.g. defined
    only in mixins), then add it there with the pattern. If present but
    without pattern, add the pattern.
    """
    raw_schema = load_raw_schema(schema_path)
    if schema_utils.has_property(raw_schema, SUBMITTED_ID_PROPERTY):
        update_existing_pattern(
            raw_schema,
            schema_path,
            submission_center_code_pattern,
            identifier_pattern
        )
    else:
        add_new_pattern(
            raw_schema,
            schema_path,
            submission_center_code_pattern,
            identifier_pattern
        )


def update_existing_pattern(
    schema: Dict[str, Any],
    schema_path: Path,
    submission_center_code_pattern: str,
    identifier_pattern: str
) -> None:
    """Update `submitted_id` pattern and overwrite schema."""
    submitted_id_schema = schema_utils.get_property(schema, "submitted_id")
    existing_pattern = schema_utils.get_pattern(submitted_id_schema)
    updated_pattern = get_updated_pattern_from_existing(
        existing_pattern, submission_center_code_pattern, identifier_pattern
    )
    if updated_pattern != existing_pattern:
        logger.info(
            f"Updating submitted_id pattern from {existing_pattern}"
            f" to {updated_pattern} for schema {schema_path.name}"
        )
        update_schema_and_write_file(schema, updated_pattern, schema_path)


def get_updated_pattern_from_existing(
    existing_pattern: str,
    submission_center_code_pattern: str,
    identifier_pattern: str,
) -> str:
    """Update existing pattern with given elements."""
    parsed_existing_pattern = parse_submitted_id_pattern(existing_pattern)
    new_pattern = SubmittedIdPattern(
        submission_center_code_pattern or parsed_existing_pattern.center_code,
        parsed_existing_pattern.item_type,
        identifier_pattern or parsed_existing_pattern.identifier,
    )
    return new_pattern.to_string()


def add_new_pattern(
    schema: Dict[str, Any],
    schema_path: Path,
    submission_center_code_pattern: str,
    identifier_pattern: str,
) -> None:
    """Create pattern for item's schema, add to the submitted_id property,
    and write the updated schema to file.
    """
    item_type = get_pattern_item_type(schema_path)
    submitted_id_pattern = SubmittedIdPattern(
        submission_center_code_pattern, item_type, identifier_pattern
    ).to_string()
    logger.info(
        f"Adding submitted_id pattern {submitted_id_pattern} for schema"
        f" {schema_path.name}"
    )
    update_schema_and_write_file(schema, submitted_id_pattern, schema_path)


def get_pattern_item_type(schema_path: Path) -> str:
    """Infer item type from schema file name."""
    return schema_path.stem.upper().replace("_", "-")


def update_schema_and_write_file(
    schema: Dict[str, Any], submitted_id_pattern: str, schema_path: Path
) -> None:
    """Create schema with pattern and write content to file.

    Since dealing with raw schema, not merged schema, check to see if
    `submitted_id` present as property to overwrite mixin; if so, add to that,
    otherwise create override.
    """
    submitted_id_property = get_submitted_id_property_with_pattern(
        schema, submitted_id_pattern
    )
    update_schema(schema, submitted_id_property)
    write_schema_file(schema_path, schema)


def get_submitted_id_property_with_pattern(
    schema: Dict[str, Any], submitted_id_pattern: str
) -> Dict[str, Any]:
    """Update or create `submitted_id` property for schema."""
    existing_property = schema_utils.get_property(schema, SUBMITTED_ID_PROPERTY)
    return {
        **existing_property,
        schema_utils.SchemaConstants.PATTERN: submitted_id_pattern
    }


def update_schema(
    schema: Dict[str, Any], submitted_id_property: Dict[str, Any]
) -> None:
    """Overwrite or add `submitted_id` with pattern to raw schema."""
    schema[schema_utils.SchemaConstants.PROPERTIES][
        SUBMITTED_ID_PROPERTY
    ] = submitted_id_property


def load_raw_schema(schema_path: Path) -> Dict[str, Any]:
    """Load schema is it's written (i.e. without resolving refs)."""
    with schema_path.open() as file_handle:
        return json.load(file_handle)


def write_schema_file(
    schema_path: Path, schema_contents: Dict[str, Any]
) -> None:
    """Write schema content to path."""
    with schema_path.open("w") as file_handle:
        json.dump(schema_contents, file_handle, indent=4)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Update `submitted_id` pattern in all schemas"
    )
    parser.add_argument(
        "--center-code",
        "-c",
        type=str,
        help="Update SubmissionCenter `submitted_id_code` portion of pattern",
        default=SUBMITTED_ID_CENTER_CODE_PATTERN,
    )
    parser.add_argument(
        "--identifier",
        "-i",
        type=str,
        help="Update identifier portion of pattern",
        default=SUBMITTED_ID_IDENTIFIER_PATTERN,
    )
    parser.add_argument(
        "--verbose",
        "-v",
        help="Log info statements",
        action="store_true",
        default=False,
    )
    args = parser.parse_args()
    if args.verbose:
        logger.setLevel(logging.INFO)
    update_submitted_id_patterns(args.center_code, args.identifier)


if __name__ == "__main__":
    main()
