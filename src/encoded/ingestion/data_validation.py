from typing import Optional
from dcicutils.ff_utils import get_schema
from dcicutils.misc_utils import VirtualApp
from dcicutils.task_utils import pmap
from snovault.loadxl import get_identifying_value
from .submission_folio import SmahtSubmissionFolio


def validate_data_against_schemas(data: dict[str, list[dict]],
                                  portal_vapp: Optional[VirtualApp] = None,
                                  schemas: Optional[list[dict]] = None) -> Optional[dict]:
    """
    TODO: This is just until this schema validation is fully supported in sheet_utils.

    Validates the given data, in a format as returned by sheet_utils, validates against
    the corresponding schema.

    If there are any missing required properties, any extraneous properties, or any undentified
    items in the data, then returns a dictionary with an itemized description of each of these
    problems, grouped by problem type, otherwise returns None if there are no problems.
    An unidentified item is one which has no value for uuid nor any of the other
    identifying properties as defined by the schema.

    For example give data that looks something like this:
        {
            "file_format": [
                <object-for-this-type>,
                <another-object-for-this-type>,
                <et-cetera>
            ],
            "file_submitted": [
                <object-for-this-type>,
                <another-object-for-this-type>,
                <et-cetera>
            ]
        }

    This function might return someting like this (assuming these problems existed):
        {
            "unidentified": [
                "type": "file_format",
                "item": "<unidentified>",
                "index": 2
                "identifying_properties": [
                    "uuid",
                    "file_format"
                ]
            },
            "missing": [
                "type": "file_format",
                "item": "vcf_gz",
                "index": 1
                "missing_properties": [
                    "standard_file_format"
                ]
            },
            "extraneous": [
                "type": "file_submitted",
                "item": "ebcfa32f-8eea-4591-a784-449fa5cd9ae9",
                "index": 3
                "extraneous_properties": [
                    "xyzzy",
                    "foobar"
                ]
            }
        }

    The "item" is the identifying value for the specified object (uuid or another if defined by the schema).
    The "index" is the (0-indexed) ordinal position of the object within the list within the type within the
    given data, which can be useful in identifying the object in the source data if it is unidentified.
    """

    def fetch_relevant_schemas(schema_names: list, portal_vapp: VirtualApp) -> list:
        def fetch_schema(schema_name: str) -> Optional[dict]:
            return schema_name, get_schema(schema_name, portal_vapp=portal_vapp)
        return {schema_name: schema for schema_name, schema in pmap(fetch_schema, schema_names)}

    problems = {}
    errors = []

    if not schemas:
        if not portal_vapp:
            raise Exception("Must specify portal_vapp if no schemas specified.")
        try:
            schema_names = [data_type for data_type in data]
            schemas = fetch_relevant_schemas(schema_names, portal_vapp=portal_vapp)
        except Exception as e:
            errors.append(f"Exception fetching relevant schemas: {str(e)}")

    for data_type in data:
        schema = schemas.get(data_type)
        if not schema:
            errors.append(f"No schema found for: {data_type}")
            continue
        _merge_problems(problems, validate_data_items_against_schemas(data[data_type], data_type, schema))
    if errors:
        problems["errors"] = errors
    return problems if problems else None


def validate_data_items_against_schemas(data_items: list[dict],
                                        data_type: str,
                                        schema: dict) -> Optional[dict]:
    problems = {}
    for data_item_index, data_item in enumerate(data_items):
        _merge_problems(problems, validate_data_item_against_schemas(data_item, data_type, data_item_index, schema))
    return problems if problems else None


def validate_data_item_against_schemas(data_item: dict,
                                       data_type: str,
                                       data_item_index: Optional[int],
                                       schema: dict) -> Optional[dict]:
    problems = {}
    unidentified = []
    missing_properties = []
    extraneous_properties = []

    allowed_properties = schema.get("properties", {}).keys()
    required_properties = schema.get("required", [])
    identifying_properties = schema.get("identifyingProperties", [])

    identifying_value = get_identifying_value(data_item, identifying_properties)
    if not identifying_value:
        identifying_value = "<unidentified>"
        unidentified.append({
            "type": data_type,
            "item": identifying_value,
            "index": data_item_index,
            "identifying_properties": identifying_properties
        })
    missing = [required for required in required_properties if required not in data_item]
    if missing:
        missing_properties.append({
            "type": data_type,
            "item": identifying_value,
            "index": data_item_index,
            "missing_properties": missing
            })
    extraneous = [not_allowed for not_allowed in data_item if not_allowed not in allowed_properties]
    if extraneous:
        extraneous_properties.append({
            "type": data_type,
            "item": identifying_value,
            "index": data_item_index,
            "extraneous_properties": extraneous
        })

    if unidentified:
        problems["unidentified"] = unidentified
    if missing_properties:
        problems["missing"] = missing_properties
    if extraneous_properties:
        problems["extraneous"] = extraneous_properties
    return problems if problems else None


def _merge_problems(problems: dict, additional_problems: Optional[dict]):
    if additional_problems:
        if additional_problems.get("unidentified"):
            if not problems.get("unidentified"):
                problems["unidentified"] = []
            problems["unidentified"].extend(additional_problems["unidentified"])
        if additional_problems.get("missing"):
            if not problems.get("missing"):
                problems["missing"] = []
            problems["missing"].extend(additional_problems["missing"])
        if additional_problems.get("extraneous"):
            if not problems.get("extraneous"):
                problems["extraneous"] = []
            problems["extraneous"].extend(additional_problems["extraneous"])


def summary_from_data_validation_problems(data_validation_problems: dict,
                                          submission: SmahtSubmissionFolio) -> list[str]:
    return [
        f"Data validation problems:",
        f"Items missing identifying property: {len(data_validation_problems.get('unidentified', []))}",
        f"Items missing required properties: {len(data_validation_problems.get('missing', []))}",
        f"Items with extraneous properties: {len(data_validation_problems.get('extraneous', []))}",
        f"Other errors: {len(data_validation_problems.get('errors', []))}",
        f"Details: s3://{submission.s3_data_bucket}/{submission.id}/submission.json"
    ]
