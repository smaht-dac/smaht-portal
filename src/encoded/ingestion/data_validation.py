import jsonschema
import re
from typing import Dict, List, Optional
from dcicutils.ff_utils import get_schema
from dcicutils.misc_utils import get_error_message, VirtualApp
from dcicutils.task_utils import pmap
from snovault.loadxl import get_identifying_value
from .submission_folio import SmahtSubmissionFolio


def validate_data_against_schemas(data: Dict[str, List[Dict]],
                                  portal_vapp: Optional[VirtualApp] = None,
                                  schemas: Optional[Dict] = None) -> Optional[Dict]:
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
    items in the data, then returns a dictionary with an itemized description of each of these errors,
    otherwise returns None if there are no problems. Note that an unidentified item is one which has
    no value for uuid nor any of the other identifying property values as defined by the schema.

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

    This function might return someting like this (assuming these errors existed):
        {
            "errors": [
                {   "type": "file_format",
                    "unidentified": true,
                    "index": 2
                    "identifying_properties": [ "uuid", "file_format" ]
                },
                {   "type": "file_format",
                    "item": "vcf_gz",
                    "index": 1
                    "missing_properties": [ "standard_file_format" ]
                },
                {   "type": "file_submitted",
                    "item": "ebcfa32f-8eea-4591-a784-449fa5cd9ae9",
                    "index": 3
                    "extraneous_properties": [ "xyzzy", "foobar" ]
                }
                {   "error": "No schema found for: some_undefined_type"
                }
            ]
        }

    The "item" is the identifying value for the specified object (uuid or another defined by the schema).
    The "index" is the (0-indexed) ordinal position of the object within the list within the type within
    the given data, which can be useful in identifying the object in the source data if it is unidentified.
    """

    def fetch_relevant_schemas(schema_names: list, portal_vapp: VirtualApp) -> list:
        def fetch_schema(schema_name: str) -> Optional[Dict]:
            return schema_name, get_schema(schema_name, portal_vapp=portal_vapp)
        return {schema_name: schema for schema_name, schema in pmap(fetch_schema, schema_names)}

    errors = []

    if not schemas:
        if not portal_vapp:
            raise Exception("Must specify portal_vapp if no schemas specified.")
        try:
            schema_names = [data_type for data_type in data]
            schemas = fetch_relevant_schemas(schema_names, portal_vapp=portal_vapp)
        except Exception as e:
            errors.append({"exception": f"Exception fetching relevant schemas: {get_error_message(e)}"})
            schemas = {}

    for data_type in data:
        schema = schemas.get(data_type)
        if not schema:
            errors.append({"error": f"No schema found for: {data_type}"})
            continue
        data_errors = validate_data_items_against_schemas(data[data_type], data_type, schema)
        errors.extend(data_errors)
    return {"errors": errors} if errors else None


def validate_data_items_against_schemas(data_items: List[Dict], data_type: str, schema: Dict) -> List[Dict]:
    """"
    Like validate_data_against_schemas but for a simple list of data items each of the same given data type.
    """
    errors = []
    for data_item_index, data_item in enumerate(data_items):
        data_item_errors = validate_data_item_against_schemas(data_item, data_type, data_item_index, schema)
        errors.extend(data_item_errors)
    return errors


def validate_data_item_against_schemas(data_item: Dict, data_type: str,
                                       data_item_index: Optional[int], schema: Dict) -> List[Dict]:
    """"
    Like validate_data_against_schemas but for a single data item of the given data type.
    The given data item index is just for informational purposes; it corresponds to the
    ordinal index of the data item in its containing list. Uses the standard jsonschema
    package to do the heavy lifting of actual schema validation, but exerts extra effort to
    specifically itemize/aggregate the most common (missing and extraneous properties) errors.
    """
    errors = []

    identifying_properties = schema.get("identifyingProperties", [])
    identifying_value = get_identifying_value(data_item, identifying_properties)
    if not identifying_value:
        errors.append({
            "type": data_type,
            "unidentified": True,
            "index": data_item_index,
            "identifying_properties": identifying_properties
        })

    def extract_single_quoted_strings(message: str) -> List[str]:
        return re.findall(r"'(.*?)'", message)

    schema_validator = jsonschema.Draft7Validator(schema)
    for schema_validation_error in schema_validator.iter_errors(data_item):
        if schema_validation_error.validator == "required":
            missing_properties = list(set(schema_validation_error.validator_value) - set(schema_validation_error.instance))
            errors.append({
                "type": data_type,
                "item" if identifying_value else "unidentified": identifying_value if identifying_value else True,
                "index": data_item_index,
                "missing_properties": missing_properties})
            continue
        if schema_validation_error.validator == "additionalProperties":
            properties = extract_single_quoted_strings(schema_validation_error.message)
            if properties:
                errors.append({
                    "type": data_type,
                    "item" if identifying_value else "unidentified": identifying_value if identifying_value else True,
                    "index": data_item_index,
                    "extraneous_properties": properties})
                continue
        errors.append({
            "type": data_type,
            "item" if identifying_value else "unidentified": identifying_value if identifying_value else True,
            "index": data_item_index,
            "unclassified_error": schema_validation_error.message,
            "validator": str(schema_validation_error.validator),
            "context": str(schema_validation_error.context)})

    return errors


def summary_of_data_validation_errors(data_validation_errors: Dict, submission: SmahtSubmissionFolio) -> List[str]:
    """
    Summarize the given data validation errors into a simple short list of English phrases;
    this will end up going into the additional_properties of the IngestionSubmission object
    in the Portal database (see SubmissionFolio.record_results); this is what will get
    displayed, if any errors, by the submitr tool when it detects processing has completed.
    """
    errors = data_validation_errors.get("errors")
    if not errors:
        return []

    unidentified_count = 0
    missing_properties_count = 0
    extraneous_properties_count = 0
    unclassified_error_count = 0
    exception_count = 0

    for error in errors:
        if error.get("unidentified"):
            unidentified_count += 1
        if error.get("missing_properties"):
            missing_properties_count += 1
        if error.get("extraneous_properties"):
            extraneous_properties_count += 1
        if error.get("unclassified_error_count"):
            unclassified_error_count += 1
        if error.get("exception"):
            exception_count += 1

    return [
        f"Ingestion data validation error summary:",
        f"Data file: {submission.data_file_name}",
        f"Data file in S3: {submission.s3_data_file_location}",
        f"Items unidentified: {unidentified_count}",
        f"Items missing properties: {missing_properties_count}",
        f"Items with extraneous properties: {extraneous_properties_count}",
        f"Other errors: {unclassified_error_count}",
        f"Exceptions: {exception_count}",
        f"Details: {submission.s3_details_location}"
    ]

