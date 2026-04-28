from typing import List, Dict, Any

from snovault import collection, load_schema
from snovault.util import debug_log
from pyramid.view import view_config
from encoded.validator_decorators import link_related_validator

from .pathology_report import PathologyReport
from .submitted_item import (
    SUBMITTED_ITEM_ADD_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PUT_VALIDATORS,
)
from .base import collection_add, item_edit, Item
from .utils import get_properties


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_ITEM_TYPE = "BrainPathologyReport"
_BRAIN_SUBREGIONS_PROPERTY = "brain_subregions"
_PRESENT_SUFFIX = "_present"
_DESCRIPTION_SUFFIX = "_description"
_AGE_RELATED_STAINING_PERFORMED = "additional_age-related_staining_performed"

_AGE_RELATED_STAINING_FIELDS = [
    "abc_score_A",
    "abc_score_B",
    "abc_score_C",
    "cerad_score",
    "ad_neuropathologic_change_level",
    "braak_pd",
    "small_vessel_disease",
    "braak_and_braak_ad",
    "thal",
    "caa_vonsattel",
    "mckeith",
    "vonsattel_hd",
]


@collection(
    name="brain-pathology-reports",
    unique_key="submitted_id",
    properties={
        "title": "Brain Pathology Reports",
        "description": "Pathology reports for brain tissue samples",
    },
)
class BrainPathologyReport(PathologyReport):
    item_type = "brain_pathology_report"
    schema = load_schema("encoded:schemas/brain_pathology_report.json")
    embedded_list = PathologyReport.embedded_list

    class Collection(Item.Collection):
        pass


def get_request_data_for_edit(context, request):
    """Return merged existing + incoming properties for edit validation."""
    existing = get_properties(context)
    to_update = get_properties(request)
    return {**existing, **to_update}


# ---------------------------------------------------------------------------
# validation helpers
# ---------------------------------------------------------------------------
def run_neuropathology_present_validation(request, data):
    """
    Validates all top-level *_present / *_description field pairs.

    For every field whose name ends with '_present' and whose value is "Yes",
    the corresponding '<stem>_description' field must be provided and non-empty.
    """
    for field, value in data.items():
        if not field.endswith(_PRESENT_SUFFIX) or value != "Yes":
            continue

        stem = field[: -len(_PRESENT_SUFFIX)]
        description_field = f"{stem}{_DESCRIPTION_SUFFIX}"
        description = data.get(description_field)

        if description is None or (
            isinstance(description, str) and description.strip() == ""
        ):
            request.errors.add(
                "body",
                f"{_ITEM_TYPE}: invalid property",
                f"when {field} is 'Yes', {description_field} must be provided",
            )

    return request.validated.update({})


def run_brain_subregions_validation(request, data):
    """
    Validates brain_subregions conditional logic.

    - is_present == "Yes" → tissue_autolysis_score must be provided
    - is_present == "No"  → tissue_autolysis_score must be absent
    """
    brain_subregions = data.get(_BRAIN_SUBREGIONS_PROPERTY)
    if not isinstance(brain_subregions, list):
        return request.validated.update({})

    for index, subregion in enumerate(brain_subregions):
        subregion_name = subregion.get("subregion", "unknown")
        is_present = subregion.get("is_present")
        autolysis_score = subregion.get("tissue_autolysis_score")

        if is_present == "Yes":
            if autolysis_score is None:
                request.errors.add(
                    "body",
                    f"{_ITEM_TYPE}: invalid property",
                    f"{_BRAIN_SUBREGIONS_PROPERTY}[{index}] "
                    f"(subregion: {subregion_name}): "
                    f"when is_present is 'Yes', "
                    f"tissue_autolysis_score must be provided",
                )

        elif is_present == "No":
            if autolysis_score is not None:
                request.errors.add(
                    "body",
                    f"{_ITEM_TYPE}: invalid property",
                    f"{_BRAIN_SUBREGIONS_PROPERTY}[{index}] "
                    f"(subregion: {subregion_name}): "
                    f"when is_present is 'No', "
                    f"tissue_autolysis_score must be absent",
                )

    return request.validated.update({})


def run_age_related_staining_validation(request, data):
    """
    Validates additional_age-related_staining_performed conditional logic.

    When the field is "Yes", at least one field from _AGE_RELATED_STAINING_FIELDS
    must carry a non-empty value.
    """
    staining_performed = data.get(_AGE_RELATED_STAINING_PERFORMED)
    if staining_performed != "Yes":
        return request.validated.update({})

    has_any_value = any(
        data.get(field) not in (None, "")
        for field in _AGE_RELATED_STAINING_FIELDS
    )
    if not has_any_value:
        request.errors.add(
            "body",
            f"{_ITEM_TYPE}: invalid property",
            f"when {_AGE_RELATED_STAINING_PERFORMED} is 'Yes', "
            f"at least one of the following fields must be provided: "
            f"{', '.join(_AGE_RELATED_STAINING_FIELDS)}",
        )

    return request.validated.update({})


# ---------------------------------------------------------------------------
# Link-related validators (add / edit entry points)
# ---------------------------------------------------------------------------
@link_related_validator
def validate_brain_pathology_on_add(context, request):
    if "force_pass" in request.query_string:
        return
    data = request.json
    run_neuropathology_present_validation(request, data)
    run_brain_subregions_validation(request, data)
    run_age_related_staining_validation(request, data)


@link_related_validator
def validate_brain_pathology_on_edit(context, request):
    if "force_pass" in request.query_string:
        return
    data = get_request_data_for_edit(context, request)
    run_neuropathology_present_validation(request, data)
    run_brain_subregions_validation(request, data)
    run_age_related_staining_validation(request, data)


# ---------------------------------------------------------------------------
# Validator lists and view configs
# ---------------------------------------------------------------------------
BRAIN_PATHOLOGY_REPORT_ADD_VALIDATORS = SUBMITTED_ITEM_ADD_VALIDATORS + [
    validate_brain_pathology_on_add,
]


@view_config(
    context=BrainPathologyReport.Collection,
    permission="add",
    request_method="POST",
    validators=BRAIN_PATHOLOGY_REPORT_ADD_VALIDATORS,
)
@debug_log
def brain_pathology_report_add(context, request, render=None):
    return collection_add(context, request, render)


BRAIN_PATHOLOGY_REPORT_EDIT_PATCH_VALIDATORS = SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS + [
    validate_brain_pathology_on_edit,
]

BRAIN_PATHOLOGY_REPORT_EDIT_PUT_VALIDATORS = SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + [
    validate_brain_pathology_on_edit,
]


@view_config(
    context=BrainPathologyReport,
    permission="edit",
    request_method="PUT",
    validators=BRAIN_PATHOLOGY_REPORT_EDIT_PUT_VALIDATORS,
)
@view_config(
    context=BrainPathologyReport,
    permission="edit",
    request_method="PATCH",
    validators=BRAIN_PATHOLOGY_REPORT_EDIT_PATCH_VALIDATORS,
)
@debug_log
def brain_pathology_report_edit(context, request, render=None):
    return item_edit(context, request, render)