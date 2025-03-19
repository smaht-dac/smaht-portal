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

from .base import (
    collection_add,
    item_edit,
    Item
)
from .utils import (
    get_properties,
    get_property_for_validation,
)
from ..item_utils import (
    tissue as tissue_utils,
    tissue_sample as tissue_sample_utils,
    donor as donor_utils,
    item as item_utils
)


def _build_tissue_sample_embedded_list() -> List[str]:
    return [
        # Columns/facets for search
        "sample_sources.external_id",
        "sample_sources.donor.external_id",
    ]


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
    embedded_list = _build_tissue_sample_embedded_list()

    class Collection(Item.Collection):
        pass


@link_related_validator
def validate_external_id_on_add(context, request):
    """
    Check that `external_id` is valid.
    
    Check is consistent with `category` nomenclature if the sample_source.donor is a Benchmarking or Production tissue on add (TPC-submitted items only for now).
    Check that `external_id` matches linked tissue `external_id` if Benchmarking or Production tissue sample on add.
    """
    if 'force_pass' in request.query_string:
        return
    data = request.json
    external_id = data['external_id']
    sample_sources = data["sample_sources"]
    category = data['category']
    tissue = get_item_or_none(request, sample_sources[0], 'sample-sources')
    submission_centers = data['submission_centers']
    is_tpc_submitted = "ndri_tpc" in [ item_utils.get_identifier(get_item_or_none(request, submission_center, 'submission-centers')) for submission_center in submission_centers ]
    if (study := tissue_utils.get_study(tissue)):
        if is_tpc_submitted and not assert_external_id_category_match(external_id, category):
            msg = f"external_id {external_id} does not match {study} nomenclature for {category} samples."
            return request.errors.add('body', 'TissueSample: invalid property', msg)
        elif not assert_external_id_tissue_match(external_id, tissue):
            msg = f"external_id {external_id} does not match Tissue external_id {item_utils.get_external_id(tissue)}."
            return request.errors.add('body', 'TissueSample: invalid link', msg)
        elif not assert_tissue_category_match(category, external_id):
            msg = f"category {category} should be Liquid for TissueSample items with external_id {tissue_sample_utils.get_protocol_id_from_external_id(external_id)}."
            return request.errors.add('body', 'TissueSample: invalid property', msg)
        else:
            return request.validated.update({}) 


@link_related_validator
def validate_external_id_on_edit(context, request):
    """
    Check that `external_id` is valid.

    Check that `external_id` is consistent with `category` nomenclature if the sample_source is a Benchmarking or Production tissue on edit (TPC-submitted items only for now).
    Check that `external_id` matches linked tissue `external_id` if Benchmarking or Production tissue sample on edit.
    """
    if 'force_pass' in request.query_string:
        return
    existing_properties = get_properties(context)
    properties_to_update = get_properties(request)
    sample_sources = get_property_for_validation('sample_sources',existing_properties,properties_to_update)
    category = get_property_for_validation('category',existing_properties,properties_to_update)
    external_id = get_property_for_validation('external_id',existing_properties,properties_to_update)
    tissue = get_item_or_none(request, sample_sources[0], 'sample-sources')
    submission_centers = get_property_for_validation('submission_centers', existing_properties, properties_to_update)
    is_tpc_submitted = "ndri_tpc" in [ item_utils.get_identifier(get_item_or_none(request, submission_center, 'submission-centers')) for submission_center in submission_centers ]
    if (study:=tissue_utils.get_study(tissue)):
        if is_tpc_submitted and not assert_external_id_category_match(external_id, category):
            msg = f"external_id {external_id} does not match {study} nomenclature for {category} samples."
            return request.errors.add('body', 'TissueSample: invalid property', msg)
        elif not assert_external_id_tissue_match(external_id, tissue):
            msg = f"external_id {external_id} does not match Tissue external_id {item_utils.get_external_id(tissue)}."
            return request.errors.add('body', 'TissueSample: invalid link', msg)
        elif not assert_tissue_category_match(category, external_id):
            msg = f"category {category} should be Liquid for TissueSample items with external_id {tissue_sample_utils.get_protocol_id_from_external_id(external_id)}."
            return request.errors.add('body', 'TissueSample: invalid property', msg)
        else:
            return request.validated.update({})


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
    protocol_id = tissue_sample_utils.get_protocol_id_from_external_id(external_id)
    if protocol_id in liquid_protocol_ids:
        return category == "Liquid"
    elif protocol_id in cells_protocol_ids:
        return category == "Cells"
    return True


def assert_external_id_tissue_match(external_id: str, tissue: Dict[str, Any]):
    """Check that start of tissue sample external_id matches tissue external_id."""
    tissue_id = item_utils.get_external_id(tissue)
    tissue_kit_id = tissue_sample_utils.get_tissue_kit_id_from_external_id(external_id)
    return tissue_id == tissue_kit_id


@link_related_validator
def validate_tissue_sample_metadata_on_edit(context, request):
    """Check that metadata matches with TPC-submitted tissue sample items with the same external_id, unless you tell it not to, on edit
    """
    existing_properties = get_properties(context)
    properties_to_update = get_properties(request)
    external_id = get_property_for_validation('external_id', existing_properties, properties_to_update)
    submission_centers = get_property_for_validation('submission_centers', existing_properties, properties_to_update)
    is_tpc_submitted = "ndri_tpc" in [ item_utils.get_identifier(get_item_or_none(request, submission_center, 'submission-centers')) for submission_center in submission_centers ]
    check_properties = [
        "category",
        "preservation_type",
        "core_size"
    ]
    if 'force_pass' in request.query_string:
        return
    if is_tpc_submitted:
        return
    search_url = f"/search/?type=TissueSample&submission_centers.display_title=NDRI+TPC&external_id={external_id}"
    if ELASTIC_SEARCH in request.registry:
        search = make_search_subreq(request, search_url)
        search_resp = request.invoke_subrequest(search, True)
        conn = request.registry['connection']
        if search_resp.status_int >= 400:
            # No TPC item in database with matching external_id
            return
        else:  # find it in the database
            for check_property in check_properties:
                gcc_property = get_property_for_validation(check_property,existing_properties,properties_to_update)
                if gcc_property:
                    res = search_resp.json_body['@graph'][0]
                    if check_property in res:
                        if res[check_property] != gcc_property:
                        # property does not match
                            found = res['accession']
                            request.errors.add('body', f"TissueSample: metadata mismatch, {check_property}{gcc_property} does not match TPC Tissue Sample {found}")
            sample_source_ids = get_property_for_validation('sample_sources', existing_properties, properties_to_update)
            sample_source_res = search_resp.json_body['@graph'][0]['sample_sources'][0]['uuid']
            gcc_uuid = item_utils.get_uuid(get_item_or_none(request, sample_source_ids[0], 'sample-sources'))        
            if sample_source_res != gcc_uuid:
                # property does not match
                found = res['accession']
                request.errors.add('body', f"TissueSample: metadata mismatch, sample_sources {gcc_uuid} does not match TPC Tissue Sample {found}sample_sources {sample_source_res}")
            return request.validated.update({})
        

@link_related_validator
def validate_tissue_sample_metadata_on_add(context, request):
    """Check that metadata matches with TPC-submitted tissue sample items with the same external_id, unless you tell it not to, on add
    """
    data = request.json
    external_id = data['external_id']
    submission_centers = data['submission_centers']
    is_tpc_submitted = "ndri_tpc" in [ item_utils.get_identifier(get_item_or_none(request, submission_center, 'submission-centers')) for submission_center in submission_centers ]
    check_properties = [
        "category",
        "preservation_type",
        "core_size"
    ]
    if 'force_pass' in request.query_string:
        return
    if is_tpc_submitted:
        return
    search_url = f"/search/?type=TissueSample&submission_centers.display_title=NDRI+TPC&external_id={external_id}"
    if ELASTIC_SEARCH in request.registry:
        search = make_search_subreq(request, search_url)
        search_resp = request.invoke_subrequest(search, True)
        conn = request.registry['connection']
        if search_resp.status_int >= 400:
            # No TPC item in database with matching external_id
            return
        else:  # find it in the database
            for check_property in check_properties:
                if check_property in data:
                    gcc_property = data[check_property]
                    res = search_resp.json_body['@graph'][0]
                    if check_property in res:
                        if res[check_property] != gcc_property:
                        # property does not match
                            found = res['accession']
                            request.errors.add('body', f"TissueSample: metadata mismatch, {check_property} {gcc_property} does not match TPC Tissue Sample {found}")
            sample_source_ids = data['sample_sources']
            sample_source_res = search_resp.json_body['@graph'][0]['sample_sources'][0]['uuid']
            gcc_uuid = item_utils.get_uuid(get_item_or_none(request, sample_source_ids[0], 'sample-sources'))        
            if sample_source_res != gcc_uuid:
                # property does not match
                found = res['accession']
                request.errors.add('body', f"TissueSample: metadata mismatch, sample_sources {gcc_uuid} does not match TPC Tissue Sample {found} sample_sources {sample_source_res}")
            return request.validated.update({})  



TISSUE_SAMPLE_ADD_VALIDATORS = SUBMITTED_ITEM_ADD_VALIDATORS + [
    validate_external_id_on_add,
    validate_tissue_sample_metadata_on_add,
]

@view_config(
    context=TissueSample.Collection,
    permission='add',
    request_method='POST',
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
    permission='edit',
    request_method='PUT',
    validators=TISSUE_SAMPLE_EDIT_PUT_VALIDATORS,
)
@view_config(
    context=TissueSample,
    permission='edit',
    request_method='PATCH',
    validators=TISSUE_SAMPLE_EDIT_PATCH_VALIDATORS,
)
@debug_log
def tissue_sample_edit(context, request, render=None):
    return item_edit(context, request, render)