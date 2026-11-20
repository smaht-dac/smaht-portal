from copy import deepcopy
from typing import Any, Dict

import pytest

from .utils import load_schema, validate_schema


BASE_TERM: Dict[str, Any] = {
    "identifier": "UBERON:0008952",
    "title": "upper lobe of left lung",
    "ontologies": ["UBERON"],
    "consortia": ["smaht"],
}


def make_aliquot_specification(**overrides: Any) -> Dict[str, Any]:
    specification: Dict[str, Any] = {
        "count": 8,
        "count_scope": "per organ",
        "dimensions_cm": {
            "length": 1,
            "width": 1.5,
            "depth": 1,
            "full_thickness": False,
        },
    }
    specification.update(overrides)
    return specification


@pytest.mark.parametrize(
    "field,value",
    [
        ("tpc_code", "3Q"),
        ("aliquot_group", "frozen"),
        ("internal_code", "LUNG-UL"),
    ],
)
def test_excluded_tissue_metadata_fields_are_rejected(field: str, value: str) -> None:
    schema = load_schema("ontology_term")
    term = deepcopy(BASE_TERM)
    term[field] = value

    assert validate_schema(schema, term)


@pytest.mark.parametrize(
    "field,value",
    [
        (
            "frozen_aliquot_specification",
            make_aliquot_specification(),
        ),
        (
            "fixed_aliquot_specification",
            make_aliquot_specification(
                count=6,
                dimensions_cm={
                    "length": 1,
                    "width": 0.5,
                    "depth": 1,
                    "full_thickness": False,
                },
            ),
        ),
        (
            "frozen_aliquot_specification",
            make_aliquot_specification(
                count=3,
                count_scope="per half",
                total_count=6,
                total_scope="per organ",
            ),
        ),
        (
            "fixed_aliquot_specification",
            make_aliquot_specification(
                count=1,
                count_scope="per half",
                total_count=2,
                total_scope="per bilateral organ",
            ),
        ),
        (
            "frozen_aliquot_specification",
            make_aliquot_specification(
                count=6,
                count_scope="per tissue",
                dimensions_cm={
                    "length": 1,
                    "width": 1.5,
                    "full_thickness": True,
                },
            ),
        ),
    ],
)
def test_valid_preservation_specific_aliquot_specifications(
    field: str, value: Dict[str, Any]
) -> None:
    schema = load_schema("ontology_term")

    assert not validate_schema(schema["properties"][field], value)


def test_frozen_and_fixed_specifications_are_independently_optional() -> None:
    schema = load_schema("ontology_term")

    frozen_term = deepcopy(BASE_TERM)
    frozen_term["frozen_aliquot_specification"] = make_aliquot_specification()
    assert not validate_schema(schema, frozen_term)

    fixed_term = deepcopy(BASE_TERM)
    fixed_term["fixed_aliquot_specification"] = make_aliquot_specification(
        count=6,
        dimensions_cm={
            "length": 1,
            "width": 0.5,
            "depth": 1,
            "full_thickness": False,
        },
    )
    assert not validate_schema(schema, fixed_term)


def test_unspecified_aliquot_rules_are_valid_when_omitted() -> None:
    schema = load_schema("ontology_term")

    assert not validate_schema(schema, BASE_TERM)


@pytest.mark.parametrize(
    "field,value",
    [
        ("standardized_recovery_description", "Inferior segment of left upper lobe"),
        ("initial_tissue_configuration", "5.5 cm x 3 cm x 1 cm"),
        ("aliquot_preparation_notes", "Preserve contiguous aliquots when possible"),
    ],
)
def test_curated_tissue_metadata_strings_are_optional(field: str, value: str) -> None:
    schema = load_schema("ontology_term")
    term = deepcopy(BASE_TERM)
    term[field] = value

    assert not validate_schema(schema, term)


def test_existing_protocol_ids_and_preferred_name_remain_valid() -> None:
    schema = load_schema("ontology_term")
    term = deepcopy(BASE_TERM)
    term.update(
        {
            "preferred_name": "3Q - Lung",
            "valid_protocol_ids": ["3Q", "3R", "1D_Frozen", "1F_Fixed"],
        }
    )

    assert not validate_schema(schema, term)


@pytest.mark.parametrize(
    "field",
    [
        "standardized_recovery_description",
        "initial_tissue_configuration",
        "frozen_aliquot_specification",
        "fixed_aliquot_specification",
        "aliquot_preparation_notes",
    ],
)
def test_new_ontology_term_fields_reject_null(field: str) -> None:
    schema = load_schema("ontology_term")
    term = deepcopy(BASE_TERM)
    term[field] = None

    assert validate_schema(schema, term)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda spec: spec.pop("count"),
        lambda spec: spec.update(count=0),
        lambda spec: spec.update(count=-1),
        lambda spec: spec.update(count=1.5),
        lambda spec: spec.update(count_scope="per aliquot"),
        lambda spec: spec.update(total_count=0),
        lambda spec: spec.update(total_count=6),
        lambda spec: spec.update(total_scope="per organ"),
        lambda spec: spec["dimensions_cm"].pop("length"),
        lambda spec: spec["dimensions_cm"].update(width=0),
        lambda spec: spec["dimensions_cm"].update(depth=-1),
        lambda spec: spec["dimensions_cm"].update(full_thickness=True, depth=1),
        lambda spec: spec["dimensions_cm"].pop("depth"),
        lambda spec: spec["dimensions_cm"].update(extra=1),
        lambda spec: spec.update(extra="not allowed"),
        lambda spec: spec.update(count=None),
    ],
)
def test_invalid_aliquot_specifications_are_rejected(mutate: Any) -> None:
    schema = load_schema("ontology_term")
    specification = make_aliquot_specification()
    mutate(specification)

    assert validate_schema(schema["properties"]["frozen_aliquot_specification"], specification)


def test_full_thickness_requires_boolean_depth_semantics() -> None:
    schema = load_schema("ontology_term")
    specification = make_aliquot_specification()
    dimensions = specification["dimensions_cm"]

    dimensions["full_thickness"] = "true"
    assert validate_schema(schema["properties"]["frozen_aliquot_specification"], specification)

    dimensions["full_thickness"] = False
    dimensions["depth"] = None
    assert validate_schema(schema["properties"]["frozen_aliquot_specification"], specification)
