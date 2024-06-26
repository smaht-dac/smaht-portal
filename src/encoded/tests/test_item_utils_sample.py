from typing import Any, Dict, List

import pytest
from webtest import TestApp

from .utils import get_search
from ..item_utils import constants, item
from ..item_utils.sample import (
    BENCHMARKING_ID_REGEX,
    PRODUCTION_ID_REGEX,
    get_aliquot_id,
    get_sample_descriptions,
    get_sample_names,
    get_study,
    get_studies,
)
from ..item_utils.utils import RequestHandler


@pytest.mark.workbook
def test_get_sample_names(es_testapp: TestApp, workbook: None) -> None:
    """Test sample names extracted from Sample."""
    sample_search = get_search(es_testapp, "?type=Sample&tags=test_sample_names")
    assert sample_search
    assert_expected_sample_types_included(sample_search)

    request_handler = RequestHandler(test_app=es_testapp)
    for sample in sample_search:
        result = get_sample_names(sample, request_handler=request_handler)
        expected = get_expected_sample_names(sample)
        assert result == expected


def assert_expected_sample_types_included(sample_search: List[Dict[str, Any]]) -> None:
    """Ensure expected sample types are included in the search results.

    Currently, looking for TissueSample, CellSample, and CellCultureSample.
    Update accordingly for new sample types, but not strictly checking
    here.
    """
    sample_types = set([item.get_type(sample) for sample in sample_search])
    assert len(sample_types) == 3


def get_expected_sample_names(sample: Dict[str, Any]) -> List[str]:
    """Get expected sample names from the sample from tags.

    A little cheeky, but simplifies testing to have expected values
    directly on the inserts.
    """
    expected_sample_name_tag_start = "sample_names-"
    tags = item.get_tags(sample)
    expected_sample_name_tags = [
        tag for tag in tags if tag.startswith(expected_sample_name_tag_start)
    ]
    return [
        value
        for tag in expected_sample_name_tags
        for value in tag.split(expected_sample_name_tag_start)[1].split("|")
    ]


@pytest.mark.workbook
def test_get_sample_descriptions(es_testapp: TestApp, workbook: None) -> None:
    """Test sample descriptions extracted from Sample."""
    sample_search = get_search(es_testapp, "?type=Sample&tags=test_sample_descriptions")
    assert sample_search
    assert_expected_sample_types_included(sample_search)

    request_handler = RequestHandler(test_app=es_testapp)
    for sample in sample_search:
        result = get_sample_descriptions(sample, request_handler=request_handler)
        expected = get_expected_sample_descriptions(sample)
        assert len(result) == len(expected)
        assert set(result) == set(expected)


def get_expected_sample_descriptions(sample: Dict[str, Any]) -> List[str]:
    """Get expected sample descriptions from the sample from tags.

    NOTE: Pulling expected values directly from tags on inserts.
    """
    expected_sample_description_tag_start = "sample_descriptions-"
    tags = item.get_tags(sample)
    expected_sample_description_tags = [
        tag for tag in tags if tag.startswith(expected_sample_description_tag_start)
    ]
    return [
        value
        for tag in expected_sample_description_tags
        for value in tag.split(expected_sample_description_tag_start)[1].split("|")
        if value
    ]


@pytest.mark.workbook
def test_get_sample_studies(es_testapp: TestApp, workbook: None) -> None:
    """Test sample studies extracted from Sample."""
    sample_search = get_search(es_testapp, "?type=Sample&tags=test_sample_studies")
    assert sample_search
    assert_expected_sample_types_included(sample_search)

    request_handler = RequestHandler(test_app=es_testapp)
    for sample in sample_search:
        result = get_studies(sample, request_handler=request_handler)
        expected = get_expected_sample_studies(sample)
        assert result == expected


def get_expected_sample_studies(sample: Dict[str, Any]) -> str:
    """Get expected sample study from the sample from tags.

    NOTE: Pulling expected values directly from tags on inserts.
    """
    expected_sample_study_tag = "sample_studies-"
    tags = item.get_tags(sample)
    expected_sample_study_tags = [
        tag for tag in tags if tag.startswith(expected_sample_study_tag)
    ]
    return [
        value
        for tag in expected_sample_study_tags
        for value in tag.split(expected_sample_study_tag)[1].split("|")
    ]


@pytest.mark.parametrize(
    "string,expected",
    [
        ("", False),
        ("ST001-1A-XX", False),  # Only 1 X expected
        ("ST001-1A-100XX", False),  # Only 1 X expected
        ("ST001-1A-1000X", False),  # Only 3 digits in aliquot ID expected
        ("ST001-1A-1000A5", False),  # Only 3 digits in aliquot ID expected
        ("ST001-1A-1000T8", False),  # Only 3 digits in aliquot ID expected
        ("ST001-1A-100M5", False),  # Aliquot ID letter not expected
        ("ST001-1A-100A0", False),  # Core ID number too low
        ("ST001-1A-100A7", False),  # Core ID number too high
        ("ST001-1A-100T0", False),  # Core ID number too low
        ("ST001-1A-100T10", False),  # Core ID number too high
        ("ST001-1A-X", True),
        ("ST001-1A-100X", True),
        ("ST001-1A-100A5", True),
        ("ST001-1A-100T8", True),
    ],
)
def test_benchmarking_id_regex(string: str, expected: bool) -> None:
    """Test benchmarking ID regex."""
    return bool(BENCHMARKING_ID_REGEX.match(string)) == expected


@pytest.mark.parametrize(
    "string,expected",
    [
        ("", False),
        ("SMHT001-1A-XX", False),  # Only 1 X expected
        ("SMHT001-1A-100XX", False),  # Only 1 X expected
        ("SMHT001-1A-1000X", False),  # Only 3 digits in aliquot ID expected
        ("SMHT001-1A-1000A5", False),  # Only 3 digits in aliquot ID expected
        ("SMHT001-1A-1000T8", False),  # Only 3 digits in aliquot ID expected
        ("SMHT001-1A-100M5", False),  # Aliquot ID letter not expected
        ("SMHT001-1A-100A0", False),  # Core ID number too low
        ("SMHT001-1A-100A7", False),  # Core ID number too high
        ("SMHT001-1A-100T0", False),  # Core ID number too low
        ("SMHT001-1A-100T10", False),  # Core ID number too high
        ("SMHT001-1A-X", True),
        ("SMHT001-1A-100X", True),
        ("SMHT001-1A-100A5", True),
        ("SMHT001-1A-100T8", True),
    ],
)
def test_production_id_regex(string: str, expected: bool) -> None:
    """Test production ID regex."""
    return bool(PRODUCTION_ID_REGEX.match(string)) == expected


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, ""),
        ({"external_id": "FooBar"}, ""),
        ({"external_id": "ST001-1A-100D6"}, constants.BENCHMARKING_STUDY),
        ({"external_id": "SMHT001-1A-101A3"}, constants.PRODUCTION_STUDY),
    ],
)
def test_get_study(properties: Dict[str, Any], expected: str) -> None:
    """Test study retrieval for sample properties."""
    assert get_study(properties) == expected


@pytest.mark.parametrize(
    "properties,expected",
    [
        ({}, ""),
        ({"external_id": "FooBar"}, ""),
        ({"external_id": "ST001-1A-100D6"}, "100D6"),
        ({"external_id": "SMHT001-1A-101A3"}, "101A3"),
    ],
)
def test_get_aliquot_id(properties: Dict[str, Any], expected: str) -> None:
    """Test aliquot ID retrieval for sample properties."""
    assert get_aliquot_id(properties) == expected
