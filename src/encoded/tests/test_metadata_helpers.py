from typing import Any, Optional

import pytest

from ..metadata import (
    _neutralize_formula_injection,
    handle_file_group,
    handle_sample_source_type,
    handle_sample_type,
)


@pytest.mark.parametrize(
    "value,expected",
    [
        # Each of the four spreadsheet-formula lead characters gets quoted
        ("=1+1", "'=1+1"),
        ("+cmd", "'+cmd"),
        ("-2+3", "'-2+3"),
        ("@SUM(A1)", "'@SUM(A1)"),
        # A value that is *only* a lead char is still neutralized
        ("=", "'="),
        # Benign strings are returned unchanged
        ("safe", "safe"),
        ("a=b", "a=b"),  # lead char not first
        ("", ""),
        # Non-string values pass through untouched (no quoting, no crash)
        (5, 5),
        (None, None),
        (["=danger"], ["=danger"]),
        (0, 0),
    ],
)
def test_neutralize_formula_injection(value: Any, expected: Any) -> None:
    """CSV/TSV formula-injection guard (CWE-1236): only leading-char strings
    are prefixed with a single quote; everything else is returned as-is."""
    assert _neutralize_formula_injection(value) == expected


def test_handle_file_group_without_group_tag() -> None:
    field = {
        "submission_center": "smaht",
        "sample_source": "src",
        "sequencing": "seq",
        "assay": "assay",
        "group_tag": "",
    }
    assert handle_file_group(field) == "smaht-src-seq-assay"


def test_handle_file_group_with_group_tag() -> None:
    field = {
        "submission_center": "smaht",
        "sample_source": "src",
        "sequencing": "seq",
        "assay": "assay",
        "group_tag": "batch1",
    }
    assert handle_file_group(field) == "smaht-src-seq-assay-batch1"


@pytest.mark.parametrize("field", [{}, None, ""])
def test_handle_file_group_empty(field: Any) -> None:
    assert handle_file_group(field) == ""


def test_handle_file_group_missing_key_raises() -> None:
    # A required subfield being absent is a programming error, not a
    # silently-swallowed empty result. Pin that it raises.
    with pytest.raises(KeyError):
        handle_file_group({"submission_center": "smaht"})


@pytest.mark.parametrize(
    "field,expected",
    [
        # Precedence follows SAMPLE_TYPE_LIST order, not the input order:
        # TissueSample wins even when listed last in the input.
        ("CellCultureSample,TissueSample", "TissueSample"),
        ("CellCultureSample,CellSample", "CellSample"),
        ("CellCultureSample", "CellCultureSample"),
        # A value not in the list yields empty
        ("SomethingElse", ""),
        ("", ""),
        (None, ""),
    ],
)
def test_handle_sample_type(field: Optional[str], expected: str) -> None:
    assert handle_sample_type(field) == expected


@pytest.mark.parametrize(
    "field,expected",
    [
        # Precedence follows SAMPLE_SOURCE_TYPE_LIST order
        ("CellCulture,Tissue", "Tissue"),
        ("CellCulture,CellCultureMixture", "CellCultureMixture"),
        ("CellCulture", "CellCulture"),
        ("SomethingElse", ""),
        ("", ""),
        (None, ""),
    ],
)
def test_handle_sample_source_type(field: Optional[str], expected: str) -> None:
    assert handle_sample_source_type(field) == expected
