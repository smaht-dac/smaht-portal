from typing import List, Dict, Any

import re
from snovault import collection, load_schema
from snovault.util import debug_log, get_item_or_none
from snovault.elasticsearch import ELASTIC_SEARCH
from snovault.search.search_utils import make_search_subreq
from pyramid.view import view_config
from encoded.validator_decorators import link_related_validator

from .sample import Sample

from .submitted_item import (
    SUBMITTED_ITEM_ADD_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PUT_VALIDATORS,
)

from .base import collection_add, item_edit, Item
from .utils import (
    get_properties,
    get_property_for_validation,
)
from ..item_utils import (
    tissue as tissue_utils,
    tissue_sample as tissue_sample_utils,
    item as item_utils,
)

NDRI_TPC_ID = "ndri_tpc"
NDRI_TPC_DT = "NDRI TPC"


@collection(
    name="tissue-samples",
    unique_key="submitted_id",
    properties={
        "title": "Tissue Samples",
        "description": "Samples derived from a tissue",
    },
)
class TissueSample(Sample):
    item_type = "tissue_sample"
    schema = load_schema("encoded:schemas/tissue_sample.json")
    embedded_list = Sample.embedded_list

    class Collection(Item.Collection):
        pass


def get_request_data_for_edit(context, request):
    """Return properties ."""
    existing = get_properties(context)
    to_update = get_properties(request)
    # Merge (with `to_update` taking precedence)
    return {**existing, **to_update}


def assert_external_id_category_match(external_id: str, category: str):
    """Check that external_id pattern matches for category."""
    if category in ["Homogenate", "Liquid", "Cells"]:
        return tissue_sample_utils.is_homogenate_external_id(external_id)
    elif category == "Specimen":
        return tissue_sample_utils.is_specimen_external_id(external_id)
    elif category == "Core":
        return tissue_sample_utils.is_core_external_id(external_id)
    else:
        return ""


def assert_tissue_category_match(category: str, external_id: str):
    """
    Check that category is Liquid or Cells if protocol id of external_id is among certain types.

    Current types are blood, buccal swab (both Liquid), and fibroblast cell culture (Cells).
    """
    liquid_protocol_ids = ["3A", "3B"]
    cells_protocol_ids = ["3AC"]
    match = True
    correct_category = None
    protocol_id = tissue_sample_utils.get_protocol_id_from_external_id(external_id)
    if protocol_id in liquid_protocol_ids:
        correct_category = "Liquid"
        match = category == correct_category
    elif protocol_id in cells_protocol_ids:
        correct_category = "Cells"
        match = category == correct_category
    return match, correct_category


def assert_external_id_tissue_match(external_id: str, tissue: Dict[str, Any]):
    """Check that start of tissue sample external_id matches tissue external_id."""
    tissue_id = item_utils.get_external_id(tissue)
    tissue_kit_id = tissue_sample_utils.get_tissue_kit_id_from_external_id(external_id)
    return tissue_id == tissue_kit_id


def get_property_value(name, context, request, mode, data=None):
    """Get property value unified for add/edit."""
    # think about modifying to use dictionary merging approach?
    if mode == "add":
        return data.get(name)
    else:
        existing = get_properties(context)
        to_update = get_properties(request)
        return get_property_for_validation(name, existing, to_update)


def is_tpc_submission(request, submission_centers):
    """Check if this submission is from NDRI TPC."""
    return any(
        item_utils.get_identifier(
            get_item_or_none(request, center, "submission-centers")
        )
        == NDRI_TPC_ID
        for center in submission_centers
    )


def run_external_id_validation(request, tissue, external_id, category):
    """Core logic for external_id validation."""
    if not (study := tissue_utils.get_study(tissue)):
        return

    tissue_category_match = assert_tissue_category_match(category, external_id)

    if not assert_external_id_category_match(external_id, category):
        msg = (
            f"external_id {external_id} does not match {study} nomenclature "
            f"for {category} samples."
        )
        return request.errors.add("body", "TissueSample: invalid property", msg)

    if not tissue_category_match[0]:
        msg = (
            f"category {category} should be {tissue_category_match[1]} for TissueSample "
            f"items with protocol ID: "
            f"{tissue_sample_utils.get_protocol_id_from_external_id(external_id)}."
        )
        return request.errors.add("body", "TissueSample: invalid property", msg)

    if not assert_external_id_tissue_match(external_id, tissue):
        msg = (
            f"external_id {external_id} does not match Tissue external_id "
            f"{item_utils.get_external_id(tissue)}."
        )
        return request.errors.add("body", "TissueSample: invalid link", msg)

    return request.validated.update({})


def run_sample_metadata_validation(context, request, data, mode):
    """Logic for comparing GCC sample metadata with TPC records."""
    submitted_id = get_property_value("submitted_id", context, request, mode, data)
    external_id = get_property_value("external_id", context, request, mode, data)
    submission_centers = get_property_value(
        "submission_centers", context, request, mode, data
    )
    if "force_pass" in request.query_string:
        return

    sample_source_ids = get_property_value(
        "sample_sources", context, request, mode, data
    )
    sample_source = get_item_or_none(request, sample_source_ids[0], "sample-sources")
    if not (tissue_utils.get_study(sample_source) in ["Benchmarking", "Production"]):
        return

    """
    NOTE: there is non-standard validation that depends on ELASTICSEARCH and therefore
    there could be inconsistency with the database state. This generally should be avoided
    but in this case we need to compare against existing TPC TissueSample records with search.
    """
    if ELASTIC_SEARCH not in request.registry:
        return

    # search for all tissue samples with this external_id
    ts_search_url = f"/search/?type=TissueSample&external_id={external_id}"
    ts_req = make_search_subreq(request, ts_search_url)
    ts_resp = request.invoke_subrequest(ts_req, True)
    samples = ts_resp.json_body.get("@graph", [])

    tpc_samples = [
        s
        for s in samples
        if NDRI_TPC_DT
        in [sc.get("display_title") for sc in item_utils.get_submission_centers(s)]
    ]
    non_tpc_samples = [
        s
        for s in samples
        if NDRI_TPC_DT
        not in [sc.get("display_title") for sc in item_utils.get_submission_centers(s)]
    ]

    check_properties = ["category", "preservation_type"]
    from_tpc = is_tpc_submission(request, submission_centers)
    if from_tpc:
        return
    elif len(tpc_samples) == 0:
        return request.errors.add(
            "body",
            f"TissueSample: No TPC Tissue Sample found with external_id {external_id}",
        )

    # At this point we know this is a non-TPC submission and we have exactly one TPC sample
    if mode == "add" and non_tpc_samples:
        return request.errors.add(
            "body",
            f"TissueSample: A non-TPC sample with external_id {external_id} already exists",
        )

    # now we check against TPC sample as we know we have one of each
    tpc_sample = tpc_samples[0]
    found = tpc_sample["accession"]  # for error message
    tpc_sample_source_uid = tpc_sample["sample_sources"][0]["uuid"]
    gcc_uuid = item_utils.get_uuid(sample_source)
    if tpc_sample_source_uid != gcc_uuid:
        return request.errors.add(
            "body",
            f"TissueSample: metadata mismatch, sample_sources {gcc_uuid} "
            f"does not match TPC Tissue Sample {found} sample_sources {tpc_sample_source_uid}",
        )

    # Compare core properties
    for prop in check_properties:
        gcc_value = get_property_value(prop, context, request, mode, data)
        if gcc_value and prop in tpc_sample and tpc_sample[prop] != gcc_value:
            # NB: the tissue sample should always have these properties but just in case
            return request.errors.add(
                "body",
                f"TissueSample: metadata mismatch, {prop} {gcc_value} "
                f"does not match value {tpc_sample[prop]} in TPC Tissue Sample {found}",
            )

    return request.validated.update({})


@link_related_validator
def validate_external_id_on_add(context, request):
    if "force_pass" in request.query_string:
        return
    data = request.json
    sample_sources = data["sample_sources"]
    category = data["category"]
    external_id = data["external_id"]
    tissue = get_item_or_none(request, sample_sources[0], "sample-sources")
    return run_external_id_validation(request, tissue, external_id, category)


@link_related_validator
def validate_external_id_on_edit(context, request):
    if "force_pass" in request.query_string:
        return
    data = get_request_data_for_edit(context, request)
    sample_sources = get_property_value(
        "sample_sources", context, request, "edit", data
    )
    category = get_property_value("category", context, request, "edit", data)
    external_id = get_property_value("external_id", context, request, "edit", data)
    tissue = get_item_or_none(request, sample_sources[0], "sample-sources")
    return run_external_id_validation(request, tissue, external_id, category)


@link_related_validator
def validate_tissue_sample_metadata_on_add(context, request):
    data = request.json
    return run_sample_metadata_validation(context, request, data, "add")


@link_related_validator
def validate_tissue_sample_metadata_on_edit(context, request):
    data = get_request_data_for_edit(context, request)
    return run_sample_metadata_validation(context, request, data, "edit")


TISSUE_SAMPLE_ADD_VALIDATORS = SUBMITTED_ITEM_ADD_VALIDATORS + [
    validate_external_id_on_add,
    validate_tissue_sample_metadata_on_add,
]


@view_config(
    context=TissueSample.Collection,
    permission="add",
    request_method="POST",
    validators=TISSUE_SAMPLE_ADD_VALIDATORS,
)
@debug_log
def tissue_sample_add(context, request, render=None):
    return collection_add(context, request, render)


TISSUE_SAMPLE_EDIT_PATCH_VALIDATORS = SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS + [
    validate_external_id_on_edit,
    validate_tissue_sample_metadata_on_edit,
]

TISSUE_SAMPLE_EDIT_PUT_VALIDATORS = SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + [
    validate_external_id_on_edit,
    validate_tissue_sample_metadata_on_edit,
]


@view_config(
    context=TissueSample,
    permission="edit",
    request_method="PUT",
    validators=TISSUE_SAMPLE_EDIT_PUT_VALIDATORS,
)
@view_config(
    context=TissueSample,
    permission="edit",
    request_method="PATCH",
    validators=TISSUE_SAMPLE_EDIT_PATCH_VALIDATORS,
)
@debug_log
def tissue_sample_edit(context, request, render=None):
    return item_edit(context, request, render)
