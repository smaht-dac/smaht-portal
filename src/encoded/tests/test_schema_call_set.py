from typing import Any, Dict

import pytest
from jsonschema import Draft202012Validator
from snovault.schema_utils import load_schema


SCHEMAS_WITH_CALL_SET = [
    "encoded:schemas/external_output_file.json",
    "encoded:schemas/output_file.json",
]


@pytest.mark.parametrize("schema_path", SCHEMAS_WITH_CALL_SET)
@pytest.mark.parametrize(
    "call_set,is_valid",
    [
        ({"name": "SNV V1", "category": "Somatic"}, True),
        ({"name": "SNV V2", "category": "Somatic"}, True),
        ({"name": "Phased Germline: non-blood", "category": "Germline"}, True),
        ({"name": "SNV V1", "category": "Germline"}, False),
        ({"name": "SNV V2", "category": "Germline"}, False),
        ({"name": "Phased Germline: non-blood", "category": "Somatic"}, False),
        ({"name": "SNV V3", "category": "Somatic"}, True),  # suggested_enum
        ({"name": "SNV V3", "category": "Germline"}, True),  # no pairing rule
        ({"name": "SNV V1", "category": "Other"}, False),
        ({"name": "SNV V1"}, False),
        ({"category": "Somatic"}, False),
        ({"name": "SNV V1", "category": "Somatic", "extra": "x"}, False),
    ],
)
def test_call_set_validation(
    schema_path: str, call_set: Dict[str, Any], is_valid: bool
) -> None:
    """Ensure call_set enums and name/category pairing are enforced."""
    schema = load_schema(schema_path)
    validator = Draft202012Validator(schema["properties"]["call_set"])
    assert validator.is_valid(call_set) == is_valid


@pytest.mark.parametrize("schema_path", SCHEMAS_WITH_CALL_SET)
def test_call_set_is_admin_only(schema_path: str) -> None:
    """Ensure call_set is restricted, which also excludes it from submission templates."""
    schema = load_schema(schema_path)
    assert schema["properties"]["call_set"]["permission"] == "restricted_fields"
