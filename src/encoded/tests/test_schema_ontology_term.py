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
        "preservation": "Snap Frozen",
        "source_text": "Eight aliquots from the recovered tissue block",
        "status": "normative",
        "variability": "fixed",
        "count": 8,
        "count_unit": "aliquots",
        "count_scope": "per organ",
        "dimensions": {
            "unit": "cm",
            "ordered": [
                {"value": 1},
                {"value": 1.5},
                {"value": 1},
            ],
        },
    }
    specification.update(overrides)
    return specification


def make_term_with_specifications(*specifications: Dict[str, Any]) -> Dict[str, Any]:
    term = deepcopy(BASE_TERM)
    term["aliquot_specifications"] = list(specifications)
    return term


def test_ontology_term_has_generalized_tissue_metadata_fields() -> None:
    schema = load_schema("ontology_term")
    properties = schema["properties"]

    assert {
        "internal_code",
        "standardized_recovery_description",
        "initial_tissue_configuration",
        "aliquot_specifications",
        "aliquot_preparation_notes",
    } <= properties.keys()
    assert "frozen_aliquot_specification" not in properties
    assert "fixed_aliquot_specification" not in properties
    assert "tpc_code" not in properties
    assert "aliquot_group" not in properties


@pytest.mark.parametrize(
    "code",
    [
        "BLOO",
        "BUCC",
        "ESOP",
        "COAS",
        "CODS",
        "LIVR",
        "ADGL",
        "ADGR",
        "AORT",
        "LUNG",
        "HART",
        "TESL",
        "TESR",
        "OVAL",
        "OVAR",
        "FBRO",
        "SKSE",
        "SKNE",
        "MUSC",
        "BRFL",
        "BRTL",
        "BRCE",
        "BRHL",
        "BRHR",
    ],
)
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


def test_valid_preservation_specific_specifications_are_independent_array_entries() -> None:
    schema = load_schema("ontology_term")
    term = make_term_with_specifications(
        make_aliquot_specification(),
        make_aliquot_specification(
            preservation="Fixed",
            source_text="Six fixed aliquots",
            count=6,
            dimensions={
                "unit": "cm",
                "ordered": [
                    {"value": 1},
                    {"value": 0.5},
                    {"value": 1},
                ],
            },
        ),
    )

    assert not validate_schema(schema, term)


def test_per_half_counts_preserve_explicit_total_scope_without_derivation() -> None:
    schema = load_schema("ontology_term")
    term = make_term_with_specifications(
        make_aliquot_specification(
            count=3,
            count_scope="per half",
            total_count=6,
            total_scope="per organ",
        )
    )

    assert not validate_schema(schema, term)


def test_full_thickness_dimensions_preserve_ordered_qualifier_without_depth() -> None:
    schema = load_schema("ontology_term")
    term = make_term_with_specifications(
        make_aliquot_specification(
            count=6,
            count_scope="per tissue",
            dimensions={
                "unit": "cm",
                "ordered": [
                    {"value": 1},
                    {"value": 1.5},
                    {"qualifier": "full_thickness"},
                ],
            },
        )
    )

    assert not validate_schema(schema, term)


def test_whole_blood_volume_preserves_collection_and_aliquot_scopes() -> None:
    schema = load_schema("ontology_term")
    term = make_term_with_specifications(
        {
            "preservation": "Snap Frozen",
            "source_text": "12 mL collected and pooled, then twelve 1 mL aliquots",
            "status": "normative",
            "variability": "fixed",
            "count": 12,
            "count_unit": "aliquots",
            "count_scope": "per collection",
            "volumes": [
                {"value": 12, "unit": "mL", "scope": "per collection"},
                {"value": 1, "unit": "mL", "scope": "per aliquot"},
            ],
        }
    )

    assert not validate_schema(schema, term)


def test_unspecified_and_inapplicable_entries_need_no_false_quantities() -> None:
    schema = load_schema("ontology_term")
    term = make_term_with_specifications(
        {
            "preservation": "Fresh",
            "source_text": "Fresh buccal swab",
            "status": "inapplicable",
            "variability": "unspecified",
        },
        {
            "preservation": "Unspecified",
            "source_text": "No tissue-specific aliquot rule supplied",
            "status": "unspecified",
        },
    )

    assert not validate_schema(schema, term)


def test_aggregate_and_lateral_ownership_are_preserved_without_inference() -> None:
    schema = load_schema("ontology_term")
    term = make_term_with_specifications(
        make_aliquot_specification(
            preservation="Fixed",
            source_text="Representative left hemisphere aggregate",
            status="representative",
            variability="variable",
            count=1,
            count_scope="aggregate",
            dimensions=None,
            scope={
                "kind": "aggregate",
                "owner": "left hemisphere",
                "laterality": "left",
            },
        ),
        make_aliquot_specification(
            preservation="Snap Frozen",
            source_text="Four aliquots per half; source calls the total bilateral",
            count=4,
            count_scope="per bilateral organ",
            total_count=8,
            total_scope="per bilateral organ",
            scope={
                "kind": "per bilateral organ",
                "owner": "left ovary",
                "laterality": "left",
            },
        ),
    )
    term["aliquot_specifications"][0].pop("dimensions")

    assert not validate_schema(schema, term)


def test_empty_specifications_array_is_valid_and_preserves_omission_semantics() -> None:
    schema = load_schema("ontology_term")
    term = deepcopy(BASE_TERM)
    term["aliquot_specifications"] = []

    assert not validate_schema(schema, term)


def test_full_thickness_rejects_an_extra_numeric_depth() -> None:
    schema = load_schema("ontology_term")
    term = make_term_with_specifications(
        make_aliquot_specification(
            dimensions={
                "unit": "cm",
                "ordered": [
                    {"value": 1},
                    {"value": 1.5},
                    {"qualifier": "full_thickness"},
                    {"value": 1},
                ],
            }
        )
    )

    assert validate_schema(schema, term)


def test_existing_protocol_ids_and_preferred_name_remain_unchanged() -> None:
    schema = load_schema("ontology_term")
    term = deepcopy(BASE_TERM)
    term.update(
        {
            "preferred_name": "3Q - Lung",
            "valid_protocol_ids": ["3Q", "3R", "1D_Frozen", "1F_Fixed"],
        }
    )

    assert not validate_schema(schema, term)
    assert term["preferred_name"] == "3Q - Lung"
    assert term["valid_protocol_ids"] == [
        "3Q",
        "3R",
        "1D_Frozen",
        "1F_Fixed",
    ]


@pytest.mark.parametrize(
    "field",
    [
        "internal_code",
        "standardized_recovery_description",
        "initial_tissue_configuration",
        "aliquot_specifications",
        "aliquot_preparation_notes",
    ],
)
def test_new_ontology_term_fields_reject_null(field: str) -> None:
    schema = load_schema("ontology_term")
    term = deepcopy(BASE_TERM)
    term[field] = None

    assert validate_schema(schema, term)


@pytest.mark.parametrize(
    "field,value",
    [
        ("frozen_aliquot_specification", make_aliquot_specification()),
        ("fixed_aliquot_specification", make_aliquot_specification()),
        ("tpc_code", "3Q"),
        ("aliquot_group", "frozen"),
    ],
)
def test_replaced_or_excluded_fields_are_rejected(field: str, value: Any) -> None:
    schema = load_schema("ontology_term")
    term = deepcopy(BASE_TERM)
    term[field] = value

    assert validate_schema(schema, term)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda spec: spec.pop("preservation"),
        lambda spec: spec.pop("source_text"),
        lambda spec: spec.update(source_text=""),
        lambda spec: spec.pop("status"),
        lambda spec: spec.update(preservation="Unknown"),
        lambda spec: spec.update(status="unknown"),
        lambda spec: spec.update(variability="unknown"),
        lambda spec: spec.update(count=0),
        lambda spec: spec.update(count=1.5),
        lambda spec: spec.pop("count_unit"),
        lambda spec: spec.pop("count_scope"),
        lambda spec: spec.update(count_scope="per sample"),
        lambda spec: spec.update(total_count=6),
        lambda spec: spec.update(total_scope="per organ"),
        lambda spec: spec.update(volumes=[{"value": 0, "unit": "mL", "scope": "per aliquot"}]),
        lambda spec: spec.update(volumes=[{"value": 1, "scope": "per aliquot"}]),
        lambda spec: spec["dimensions"].pop("unit"),
        lambda spec: spec["dimensions"]["ordered"].append({"value": 2}),
        lambda spec: spec["dimensions"]["ordered"].__setitem__(0, {"value": 0}),
        lambda spec: spec["dimensions"]["ordered"].__setitem__(2, {"qualifier": "not_full_thickness"}),
        lambda spec: spec["dimensions"]["ordered"].extend([{"qualifier": "full_thickness"}]),
        lambda spec: spec.update(scope={"kind": "aggregate"}),
        lambda spec: spec.update(scope={"kind": "aggregate", "owner": "left", "laterality": "middle"}),
        lambda spec: spec.update(extra="not allowed"),
    ],
)
def test_invalid_aliquot_specifications_are_rejected(mutate: Any) -> None:
    schema = load_schema("ontology_term")
    specification = make_aliquot_specification()
    mutate(specification)
    term = make_term_with_specifications(specification)

    assert validate_schema(schema, term)


def test_aggregate_count_scope_requires_matching_owned_scope() -> None:
    schema = load_schema("ontology_term")
    specification = make_aliquot_specification(
        count_scope="aggregate",
        scope={"kind": "per tissue", "owner": "left hemisphere"},
    )
    term = make_term_with_specifications(specification)

    assert validate_schema(schema, term)
