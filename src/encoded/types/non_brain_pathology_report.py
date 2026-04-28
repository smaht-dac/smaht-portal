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
_ITEM_TYPE = "NonBrainPathologyReport"
_TARGET_TISSUES_PROPERTY = "target_tissues"
_NON_TARGET_TISSUES_PROPERTY = "non_target_tissues"
_PATHOLOGIC_FINDINGS_PROPERTY = "pathologic_findings"


@collection(
    name="non-brain-pathology-reports",
    unique_key="submitted_id",
    properties={
        "title": "Non-Brain Pathology Reports",
        "description": "Pathology reports for non-brain tissues",
    },
)
class NonBrainPathologyReport(PathologyReport):
    item_type = "non_brain_pathology_report"
    schema = load_schema("encoded:schemas/non_brain_pathology_report.json")
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
def run_target_tissues_validation(request, data):
    """
    Validates target_tissues conditional logic.

    - target_tissue_present == "No"  → percentage must be "0";
                                        autolysis_score must be absent
    - target_tissue_present == "Yes" → percentage must be provided and non-"0";
                                        autolysis_score must be provided
    """
    target_tissues = data.get(_TARGET_TISSUES_PROPERTY)
    if not isinstance(target_tissues, list):
        return request.validated.update({})

    for index, target_tissue in enumerate(target_tissues):
        subtype = target_tissue.get("target_tissue_subtype", "unknown")
        present = target_tissue.get("target_tissue_present")
        percentage = target_tissue.get("target_tissue_percentage")
        autolysis_score = target_tissue.get("target_tissue_autolysis_score")

        if present == "No":
            if percentage != "0":
                request.errors.add(
                    "body",
                    f"{_ITEM_TYPE}: invalid property",
                    f"{_TARGET_TISSUES_PROPERTY}[{index}] "
                    f"(target_tissue_subtype: {subtype}): "
                    f"when target_tissue_present is 'No', "
                    f"target_tissue_percentage must be '0'",
                )
            if autolysis_score is not None:
                request.errors.add(
                    "body",
                    f"{_ITEM_TYPE}: invalid property",
                    f"{_TARGET_TISSUES_PROPERTY}[{index}] "
                    f"(target_tissue_subtype: {subtype}): "
                    f"when target_tissue_present is 'No', "
                    f"target_tissue_autolysis_score must be empty",
                )

        elif present == "Yes":
            if percentage is None:
                request.errors.add(
                    "body",
                    f"{_ITEM_TYPE}: invalid property",
                    f"{_TARGET_TISSUES_PROPERTY}[{index}] "
                    f"(target_tissue_subtype: {subtype}): "
                    f"when target_tissue_present is 'Yes', "
                    f"target_tissue_percentage must be provided",
                )
            elif percentage == "0":
                request.errors.add(
                    "body",
                    f"{_ITEM_TYPE}: invalid property",
                    f"{_TARGET_TISSUES_PROPERTY}[{index}] "
                    f"(target_tissue_subtype: {subtype}): "
                    f"when target_tissue_present is 'Yes', "
                    f"target_tissue_percentage cannot be '0'",
                )
            if autolysis_score is None:
                request.errors.add(
                    "body",
                    f"{_ITEM_TYPE}: invalid property",
                    f"{_TARGET_TISSUES_PROPERTY}[{index}] "
                    f"(target_tissue_subtype: {subtype}): "
                    f"when target_tissue_present is 'Yes', "
                    f"target_tissue_autolysis_score must be provided",
                )

    return request.validated.update({})


def run_non_target_tissues_validation(request, data):
    """
    Validates non_target_tissues conditional logic.

    - non_target_tissue_present == "Yes" → percentage must be provided
    - non_target_tissue_present == "No"  → percentage must be absent
    """
    non_target_tissues = data.get(_NON_TARGET_TISSUES_PROPERTY)
    if not isinstance(non_target_tissues, list):
        return request.validated.update({})

    for index, non_target_tissue in enumerate(non_target_tissues):
        subtype = non_target_tissue.get("non_target_tissue_subtype", "unknown")
        present = non_target_tissue.get("non_target_tissue_present")
        percentage = non_target_tissue.get("non_target_tissue_percentage")

        if present == "Yes":
            if percentage is None or percentage == "":
                request.errors.add(
                    "body",
                    f"{_ITEM_TYPE}: invalid property",
                    f"{_NON_TARGET_TISSUES_PROPERTY}[{index}] "
                    f"(non_target_tissue_subtype: {subtype}): "
                    f"when non_target_tissue_present is 'Yes', "
                    f"non_target_tissue_percentage must be provided",
                )

        elif present == "No":
            if percentage is not None and percentage != "":
                request.errors.add(
                    "body",
                    f"{_ITEM_TYPE}: invalid property",
                    f"{_NON_TARGET_TISSUES_PROPERTY}[{index}] "
                    f"(non_target_tissue_subtype: {subtype}): "
                    f"when non_target_tissue_present is 'No', "
                    f"non_target_tissue_percentage must be empty",
                )

    return request.validated.update({})


def run_pathologic_findings_validation(request, data):
    """
    Validates pathologic_findings conditional logic.

    - finding_present == "Yes" → finding_description and finding_percentage
                                   must both be provided
    - finding_present == "No"  → finding_percentage must be absent or empty
    """
    pathologic_findings = data.get(_PATHOLOGIC_FINDINGS_PROPERTY)
    if not isinstance(pathologic_findings, list):
        return request.validated.update({})

    for index, finding in enumerate(pathologic_findings):
        finding_type = finding.get("finding_type", "unknown")
        present = finding.get("finding_present")
        description = finding.get("finding_description")
        percentage = finding.get("finding_percentage")

        if present == "Yes":
            if description is None or (
                isinstance(description, str) and description.strip() == ""
            ):
                request.errors.add(
                    "body",
                    f"{_ITEM_TYPE}: invalid property",
                    f"{_PATHOLOGIC_FINDINGS_PROPERTY}[{index}] "
                    f"(finding_type: {finding_type}): "
                    f"when finding_present is 'Yes', "
                    f"finding_description must be provided",
                )
            if percentage is None or percentage == "":
                request.errors.add(
                    "body",
                    f"{_ITEM_TYPE}: invalid property",
                    f"{_PATHOLOGIC_FINDINGS_PROPERTY}[{index}] "
                    f"(finding_type: {finding_type}): "
                    f"when finding_present is 'Yes', "
                    f"finding_percentage must be provided",
                )

        elif present == "No":
            if percentage is not None and percentage != "":
                request.errors.add(
                    "body",
                    f"{_ITEM_TYPE}: invalid property",
                    f"{_PATHOLOGIC_FINDINGS_PROPERTY}[{index}] "
                    f"(finding_type: {finding_type}): "
                    f"when finding_present is 'No', "
                    f"finding_percentage must be empty",
                )

    return request.validated.update({})


# ---------------------------------------------------------------------------
# Link-related validators (add / edit entry points)
# ---------------------------------------------------------------------------
@link_related_validator
def validate_non_brain_pathology_on_add(context, request):
    if "force_pass" in request.query_string:
        return
    data = request.json
    run_target_tissues_validation(request, data)
    run_non_target_tissues_validation(request, data)
    run_pathologic_findings_validation(request, data)


@link_related_validator
def validate_non_brain_pathology_on_edit(context, request):
    if "force_pass" in request.query_string:
        return
    data = get_request_data_for_edit(context, request)
    run_target_tissues_validation(request, data)
    run_non_target_tissues_validation(request, data)
    run_pathologic_findings_validation(request, data)


# ---------------------------------------------------------------------------
# Validator lists and view configs
# ---------------------------------------------------------------------------
NON_BRAIN_PATHOLOGY_REPORT_ADD_VALIDATORS = SUBMITTED_ITEM_ADD_VALIDATORS + [
    validate_non_brain_pathology_on_add,
]


@view_config(
    context=NonBrainPathologyReport.Collection,
    permission="add",
    request_method="POST",
    validators=NON_BRAIN_PATHOLOGY_REPORT_ADD_VALIDATORS,
)
@debug_log
def non_brain_pathology_report_add(context, request, render=None):
    return collection_add(context, request, render)


NON_BRAIN_PATHOLOGY_REPORT_EDIT_PATCH_VALIDATORS = SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS + [
    validate_non_brain_pathology_on_edit,
]

NON_BRAIN_PATHOLOGY_REPORT_EDIT_PUT_VALIDATORS = SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + [
    validate_non_brain_pathology_on_edit,
]


@view_config(
    context=NonBrainPathologyReport,
    permission="edit",
    request_method="PUT",
    validators=NON_BRAIN_PATHOLOGY_REPORT_EDIT_PUT_VALIDATORS,
)
@view_config(
    context=NonBrainPathologyReport,
    permission="edit",
    request_method="PATCH",
    validators=NON_BRAIN_PATHOLOGY_REPORT_EDIT_PATCH_VALIDATORS,
)
@debug_log
def non_brain_pathology_report_edit(context, request, render=None):
    return item_edit(context, request, render)