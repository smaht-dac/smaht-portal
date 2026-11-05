import argparse
from pathlib import Path
from typing import Any, Dict

import structlog
from dcicutils import schema_utils
from dcicutils.creds_utils import SMaHTKeyManager
from dcicutils.misc_utils import to_camel_case, to_snake_case
from snovault.schema_views import _annotate_submittable_props, _get_submittable_props

from encoded.commands.write_submission_spreadsheets import dir_path, write_spreadsheets
from encoded.item_utils.utils import RequestHandler

log = structlog.getLogger(__name__)


def get_profile_schema(item: str, request_handler: RequestHandler) -> Dict[str, Any]:
    """Get the full (non-submittable-filtered) profile schema for the item."""
    return request_handler.get_item(f"/profiles/{to_snake_case(item)}.json")


def build_pseudo_submission_schema(profile_schema: Dict[str, Any]) -> Dict[str, Any]:
    """Build a submission-schema-shaped dict for an item that isn't submittable.

    Reuses snovault's own submission-schema field filtering/annotation
    (`_get_submittable_props`/`_annotate_submittable_props`), skipping only the
    `_is_submittable_schema` gate that requires a `submitted_id` property.
    """
    properties = schema_utils.get_properties(profile_schema)
    submittable_properties = _get_submittable_props(profile_schema, properties)
    submittable_properties = _annotate_submittable_props(profile_schema, submittable_properties)
    return {
        "$id": profile_schema.get("$id"),
        "title": profile_schema.get("title"),
        "properties": submittable_properties,
    }


def get_pseudo_submission_schemas(
    items: list, request_handler: RequestHandler
) -> Dict[str, Dict[str, Any]]:
    """Build pseudo submission schemas for the given (non-submittable) items."""
    return {
        to_camel_case(item): build_pseudo_submission_schema(
            get_profile_schema(item, request_handler)
        )
        for item in items
    }


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Write submission-style spreadsheets for item types that are not"
            " submittable (e.g. Sequencer, ReferenceGenome), reusing the same"
            " column/formatting logic as write-submission-spreadsheets."
        )
    )
    parser.add_argument("--output", help="Output file directory", type=dir_path, required=True)
    parser.add_argument("--env", help="Environment", default="data")
    parser.add_argument("--item", help="Item name(s)", nargs="+", required=True)
    parser.add_argument(
        "--separate", help="Add comments as separate cells", action="store_true"
    )
    args = parser.parse_args()

    keys = SMaHTKeyManager().get_keydict_for_env(args.env)
    log.info(f"Found keys for {args.env}")
    request_handler = RequestHandler(auth_key=keys)

    submission_schemas = get_pseudo_submission_schemas(args.item, request_handler)
    log.info(f"Writing spreadsheets to {args.output} for items: {list(submission_schemas.keys())}")
    write_spreadsheets(args.output, submission_schemas, request_handler, separate_comments=args.separate)


if __name__ == "__main__":
    main()
