from copy import deepcopy
from typing import Any

import pytest
from snovault.elasticsearch.create_mapping import schema_mapping

from .utils import load_schema, validate_schema


BASE_TERM = {
    "identifier": "UBERON:0008952",
    "title": "upper lobe of left lung",
    "ontologies": ["UBERON"],
    "consortia": ["smaht"],
}


def test_ontology_term_schema_maps_tissue_metadata_fields() -> None:
    schema = load_schema("ontology_term")
    properties = schema_mapping("*", schema)["properties"]

    assert properties["internal_code"]["type"] == "text"
    assert properties["standardized_recovery_description"]["type"] == "text"
    assert "initial_tissue_configuration" not in properties
    assert "aliquot_specifications" not in properties
    assert "aliquot_preparation_notes" not in properties


@pytest.mark.parametrize("code", ["BLOO", "LUNG", "BRHL", "TESR"])
def test_internal_code_accepts_four_uppercase_letters(code: str) -> None:
    schema = load_schema("ontology_term")
    term = deepcopy(BASE_TERM)
    term["internal_code"] = code

    assert not validate_schema(schema, term)


@pytest.mark.parametrize(
    "code", ["lung", "LUNG1", "LUN", "LUNG-", "", 123, ["LUNG"]]
)
def test_internal_code_rejects_values_without_source_shape(code: Any) -> None:
    schema = load_schema("ontology_term")
    term = deepcopy(BASE_TERM)
    term["internal_code"] = code

    assert validate_schema(schema, term)


def test_standardized_recovery_description_is_optional_and_curated() -> None:
    schema = load_schema("ontology_term")
    term = deepcopy(BASE_TERM)
    term["standardized_recovery_description"] = "Inferior segment of left upper lobe"

    assert not validate_schema(schema, term)


def test_existing_protocol_ids_and_preferred_name_remain_unchanged() -> None:
    schema = load_schema("ontology_term")
    term = deepcopy(BASE_TERM)
    term.update(
        {
            "preferred_name": "3Q - Lung",
            "valid_protocol_ids": ["3Q", "3R", "1D_Frozen", "1F_Fixed"],
            "internal_code": "LUNG",
        }
    )

    assert not validate_schema(schema, term)


@pytest.mark.parametrize("field", ["internal_code", "standardized_recovery_description"])
def test_new_ontology_term_fields_reject_null(field: str) -> None:
    schema = load_schema("ontology_term")
    term = deepcopy(BASE_TERM)
    term[field] = None

    assert validate_schema(schema, term)


@pytest.mark.parametrize(
    "field,value",
    [
        ("initial_tissue_configuration", "5.5 cm x 3 cm x 1 cm"),
        ("aliquot_specifications", []),
        ("aliquot_preparation_notes", "Preserve contiguous aliquots when possible"),
        ("frozen_aliquot_specification", {}),
        ("fixed_aliquot_specification", {}),
        ("tpc_code", "3Q"),
        ("aliquot_group", "frozen"),
    ],
)
def test_removed_and_excluded_fields_are_rejected(field: str, value: Any) -> None:
    schema = load_schema("ontology_term")
    term = deepcopy(BASE_TERM)
    term[field] = value

    assert validate_schema(schema, term)
