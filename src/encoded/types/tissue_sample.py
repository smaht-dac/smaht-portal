from typing import List

import re
from snovault import collection, load_schema
from snovault.util import debug_log, get_item_or_none
from pyramid.view import view_config
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
)

HOMOGENATE_EXTERNAL_ID_REGEX = "^[A-Z0-9]{3,}-[0-9][A-Z]-[0-9]{3}X$"
SPECIMEN_EXTERNAL_ID_REGEX = "^[A-Z0-9]{3,}-[0-9][A-Z]-[0-9]{3}[S-W][1-9]$"
CORE_EXTERNAL_ID_REGEX = "^[A-Z0-9]{3,}-[0-9][A-Z]-[0-9]{3}[A-F][1-6]$"


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


def validate_external_id_on_add(context, request):
    """Check that `external_id` is consistent with `category` nomenclature if the sample_source.donor is a Benchmarking or Production tissue on add."""
    data = request.json
    external_id = data['external_id']
    sample_sources = data["sample_sources"]
    category = data['category']
    tissue = get_item_or_none(request, sample_sources[0], 'sample-sources')
    if (study := tissue_utils.get_study(tissue)):
        if not assert_external_id_category_match(external_id, category):
            msg = f"external_id {external_id} does not match {study} nomenclature for {category} samples."
            return request.errors.add('body', 'TissueSample: invalid property', msg)
        else:
            return request.validated.update({}) 


def validate_external_id_on_edit(context, request):
    """Check that `external_id` is consistent with `category` nomenclature if the sample_source is a Benchmarking or Production tissue on edit."""
    existing_properties = get_properties(context)
    properties_to_update = get_properties(request)
    sample_sources = get_property_for_validation('sample_sources',existing_properties,properties_to_update)
    category = get_property_for_validation('category',existing_properties,properties_to_update)
    external_id = get_property_for_validation('external_id',existing_properties,properties_to_update)
    tissue = get_item_or_none(request, sample_sources[0], 'sample-sources')
    if (study:=tissue_utils.get_study(tissue)):
        if not assert_external_id_category_match(external_id, category):
            msg = f"external_id {external_id} does not match {study} nomenclature for {category} samples."
            return request.errors.add('body', 'TissueSample: invalid property', msg)
        else:
            return request.validated.update({})  


def assert_external_id_category_match(external_id: str, category: str):
    """Check that external_id pattern matches for category."""
    pattern = ""
    if category == "Homogenate":
        pattern = HOMOGENATE_EXTERNAL_ID_REGEX
    elif category == "Specimen":
        pattern = SPECIMEN_EXTERNAL_ID_REGEX
    elif category == "Core":
        pattern = CORE_EXTERNAL_ID_REGEX
    return re.match(pattern, external_id)
    


TISSUE_SAMPLE_ADD_VALIDATORS = SUBMITTED_ITEM_ADD_VALIDATORS + [
    validate_external_id_on_add
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
    validate_external_id_on_edit
]

TISSUE_SAMPLE_EDIT_PUT_VALIDATORS = SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + [
    validate_external_id_on_edit
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