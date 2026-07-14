import pytest

from ..schema_formats import is_accession


@pytest.mark.parametrize(
    "instance,expected",
    [
        # Valid "real" accession: SMA + 2 letters + 7 chars from [1-9A-Z]
        ("SMAAB1234567", True),
        ("SMAZZ9ABCDEF", True),
        # Valid "test" accession: TST + 2 letters + 7 digits [0-9]
        ("TSTAB0000000", True),
        ("TSTZZ1234567", True),
        # Real accessions disallow "0" in the 7-char suffix
        ("SMAAB0234567", False),
        # Test accessions require digits only in the suffix
        ("TSTAB123456X", False),
        # Wrong prefix
        ("XYZAB1234567", False),
        # Too short (only one letter before the suffix)
        ("SMAA1234567", False),
        # Too long
        ("SMAAB12345678", False),
        # Lowercase not allowed
        ("smaab1234567", False),
        # Empty / junk
        ("", False),
        ("not-an-accession", False),
    ],
)
def test_is_accession(instance: str, expected: bool) -> None:
    assert is_accession(instance) is expected
