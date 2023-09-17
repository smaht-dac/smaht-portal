import jsonschema
import re
from typing import Optional
from dcicutils.ff_utils import get_schema
from dcicutils.misc_utils import get_error_message, VirtualApp
from dcicutils.task_utils import pmap
from snovault.loadxl import get_identifying_value
from .submission_folio import SmahtSubmissionFolio


# TODO: Duh, there is an extant jsonschema package available to do this.

def validate_data_against_schemas(data: dict[str, list[dict]],
                                  portal_vapp: Optional[VirtualApp] = None,
                                  schemas: Optional[dict[dict]] = None) -> Optional[dict]:
    """
    TODO: This is just until this schema validation is fully supported in sheet_utils.

    Validates the given data against the corresponding schema(s). The given data is assumed to
    be in a format as returned by sheet_utils, i.e. a dictionary of lists of objects where each
    top-level dictionary property is the name of a data type for the contained list of objects.
    If no schemas are passed then they will be fetched from the Portal using the given portal_vapp
    to access them; the schemas are in a form similar to the data - a dictionary of schema objects,
    where each top-level dictionary property is the name of the data type for the contained schema.
    These data types are (strings) assumed to be in snake-case form, e.g. "file_submitted".

    If there are any missing required properties, any extraneous properties, or any undentified
    items in the data, then returns a dictionary with an itemized description of each of these
    problems, grouped by problem type, otherwise returns None if there are no problems.
    Note that an unidentified item is one which has no value for uuid nor any of the
    other identifying property values as defined by the schema.

    For example given data that looks something like this:
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
                "identifying_properties": [ "uuid", "file_format" ]
            },
            "missing": [
                "type": "file_format",
                "item": "vcf_gz",
                "index": 1
                "missing_properties": [ "standard_file_format" ]
            },
            "extraneous": [
                "type": "file_submitted",
                "item": "ebcfa32f-8eea-4591-a784-449fa5cd9ae9",
                "index": 3
                "extraneous_properties": [ "xyzzy", "foobar" ]
            }
        }

    The "item" is the identifying value for the specified object (uuid or another defined by the schema).
    The "index" is the (0-indexed) ordinal position of the object within the list within the type within
    the given data, which can be useful in identifying the object in the source data if it is unidentified.
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
            errors.append(f"Exception fetching relevant schemas: {get_error_message(e)}")
            schemas = {}

    for data_type in data:
        schema = schemas.get(data_type)
        if not schema:
            errors.append(f"No schema found for: {data_type}")
            continue
        _merge_problems(problems, validate_data_items_against_schemas(data[data_type], data_type, schema))
    if errors:
        problems["error"] = errors
    return problems if problems else None


def validate_data_items_against_schemas(data_items: list[dict],
                                        data_type: str,
                                        schema: dict) -> Optional[dict]:
    """"
    Like validate_data_against_schemas but for a simple list of data items each of the same given data type.
    """
    problems = {}
    for data_item_index, data_item in enumerate(data_items):
        _merge_problems(problems, validate_data_item_against_schemas(data_item, data_type, data_item_index, schema))
    return problems if problems else None


def validate_data_item_against_schemas(data_item: dict,
                                       data_type: str,
                                       data_item_index: Optional[int],
                                       schema: dict) -> Optional[dict]:
    """"
    Like validate_data_against_schemas but for a single data item of the given data type.
    The given data item index is just for informational purposes; it corresponds to the
    ordinal index of the data item in its containing list. Uses the standard jsonschema
    package to do the heavy lifting of actual schema validation, but exerts extra effort to
    specifically itemize/aggregate the most common (missing and extraneous properties) errors.
    """
    problems = {}
    unidentified = []
    missing_properties = []
    extraneous_properties = []
    other_problems = []

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

    def extract_single_quoted_strings(message: str) -> list[str]:
        return re.findall(r"'(.*?)'", message)

    schema_validator = jsonschema.Draft7Validator(schema)
    for schema_validation_error in schema_validator.iter_errors(data_item):
        if schema_validation_error.validator == "required":
            missing_properties.append({
                "type": data_type,
                "item": identifying_value,
                "index": data_item_index,
                "missing_properties": schema_validation_error.validator_value})
            continue
        if schema_validation_error.validator == "additionalProperties":
            properties = extract_single_quoted_strings(schema_validation_error.message)
            if properties:
                extraneous_properties.append({
                    "type": data_type,
                    "item": identifying_value,
                    "index": data_item_index,
                    "extraneous_properties": properties})
                continue
        other_problems.append({
            "type": data_type,
            "item": identifying_value,
            "index": data_item_index,
            "message": schema_validation_error.message})

    if unidentified:
        problems["unidentified"] = unidentified
    if missing_properties:
        problems["missing"] = missing_properties
    if extraneous_properties:
        problems["extraneous"] = extraneous_properties
    if other_problems:
        problems["error"] = other_problems
    return problems if problems else None


def summarize_validate_data_problems(data_validation_problems: dict,
                                     submission: SmahtSubmissionFolio) -> list[str]:
    """
    Summarize the given data validation problems into a simple short list of English phrases;
    this will end up going into the additional_properties of the IngestionSubmission object
    in the Portal database (see SubmissionFolio.record_results); this is what will get
    displayed, if any errors, by the submitr tool when it detects processing has completed.
    """
    return [
        f"Ingestion data validation problem summary:",
        f"Data file: {submission.data_file_name}",
        f"Data file in S3: {submission.s3_data_file_location}",
        f"Items unidentified: {len(data_validation_problems.get('unidentified', []))}",
        f"Items missing properties: {len(data_validation_problems.get('missing', []))}",
        f"Items with extraneous properties: {len(data_validation_problems.get('extraneous', []))}",
        f"Other errors: {len(data_validation_problems.get('error', []))}",
        f"Details: {submission.s3_details_location}"
    ]


def _merge_problems(problems: dict, additional_problems: Optional[dict]) -> None:
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
        if additional_problems.get("error"):
            if not problems.get("error"):
                problems["error"] = []
            problems["error"].extend(additional_problems["error"])
