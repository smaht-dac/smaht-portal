import pytest
from dcicutils.schema_utils import get_property

from .utils import load_schema, validate_schema


@pytest.mark.parametrize(
    "version,error_expected",
    [
        ("0", True),
        ("0.1", True),
        ("0.1.0b0", True),
        ("0.1.0", False),
        ("1.1.1", False),
        ("11.11.11", False),
    ],
)
def test_version_pattern(version: str, error_expected: bool):
    """Test version pattern validation."""
    schema = load_schema("basecalling")
    version_property = get_property(schema, "version")
    validation_error = validate_schema(version_property, version)
    if error_expected:
        assert validation_error
    else:
        assert not validation_error
