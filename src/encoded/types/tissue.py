from typing import List, Dict, Any, Optional

from snovault import collection, load_schema, calculated_property
from snovault.util import debug_log, get_item_or_none
from pyramid.view import view_config
from pyramid.request import Request
from encoded.validator_decorators import link_related_validator

from .base import (
    collection_add,
    item_edit,
    Item
)
from .utils import (
    get_properties,
    get_property_for_validation,
)
from .submitted_item import (
    SUBMITTED_ITEM_ADD_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PUT_VALIDATORS,
)
from .sample_source import SampleSource
from ..item_utils import (
    tissue as tissue_utils,
    tissue_sample as tissue_sample_utils,
    pathology_report as pathology_report_utils,
    donor as donor_utils,
    item as item_utils,
    ontology_term as ot_utils,
)

from ..item_utils.utils import (
    RequestHandler,
    get_property_value_from_identifier,
    get_property_values,
)

def _build_tissue_embedded_list() -> List[str]:
    return [
        "donor.external_id",
        "donor.sex",
        "donor.age",
        "donor.status",
        "donor.protected_donor",
        "donor.study",
        "donor.tags",
        "uberon_id.identifier",
        "uberon_id.grouping_term",
    ]


@collection(
    name="tissues",
    unique_key="submitted_id",
    properties={
        "title": "Tissues",
        "description": "Tissues collected from an individual",
    },
)
class Tissue(SampleSource):
    item_type = "tissue"
    schema = load_schema("encoded:schemas/tissue.json")
    embedded_list = _build_tissue_embedded_list()

    rev = {
        "tissue_samples": ("TissueSample", "sample_sources")
    }

    class Collection(Item.Collection):
        pass

    @calculated_property(
        schema={
            "title": "Tissue Samples",
            "description": "Tissue samples derived from this tissue",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "TissueSample",
            },
        },
    )
    def tissue_samples(self, request: Request) -> Optional[List[str]]:
        result = self.rev_link_atids(request, "tissue_samples")
        if result:
            return result
        return

    @calculated_property(
        schema={
            "title": "Pathology Summary",
            "description": (
                "Findings aggregated from pathology reports covering this tissue's"
                " samples, via Tissue -> TissueSample -> PathologyReport."
            ),
            "type": "object",
            "properties": {
                "autolysis_score": {
                    "title": "Autolysis Score",
                    "description": "Highest autolysis score across pathology reports for this tissue.",
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 3,
                },
                "non_target_tissue_present": {
                    "title": "Non-Target Tissue Present",
                    "type": "boolean",
                },
                "pathologic_finding_present": {
                    "title": "Pathologic Finding Present",
                    "type": "boolean",
                },
                "target_tissue_percentage": {
                    "title": "Target Tissue Percentage",
                    "description": "Highest target tissue percentage band across pathology reports for this tissue.",
                    "type": "string",
                    "enum": pathology_report_utils.TARGET_TISSUE_PERCENTAGE_ORDER,
                },
                "histology_images": {
                    "title": "Histology Images",
                    "type": "array",
                    "items": {
                        "type": "string",
                        "linkTo": "HistologyImage",
                    },
                },
            },
        },
    )
    def pathology_summary(self, request: Request) -> Optional[Dict[str, Any]]:
        """Roll up pathology report findings for this tissue's samples.

        Walks the Tissue -> TissueSample -> PathologyReport rev-link chain
        (no forward link exists for this), since PathologyReport data isn't
        submitted against Tissue directly.
        """
        request_handler = RequestHandler(request=request)
        tissue_sample_atids = self.rev_link_atids(request, "tissue_samples")
        if not tissue_sample_atids:
            return None
        tissue_samples = request_handler.get_items(tissue_sample_atids)
        pathology_report_atids = get_property_values(
            tissue_samples, tissue_sample_utils.get_pathology_reports
        )
        if not pathology_report_atids:
            return None
        pathology_reports = request_handler.get_items(pathology_report_atids)
        if not pathology_reports:
            return None

        autolysis_scores = [
            score
            for score in (
                pathology_report_utils.get_tissue_autolysis_score(report)
                for report in pathology_reports
            )
            if score is not None
        ]
        non_target_flags = [
            flag
            for flag in (
                pathology_report_utils.has_non_target_tissue_presence(report)
                for report in pathology_reports
            )
            if flag is not None
        ]
        finding_flags = [
            flag
            for flag in (
                pathology_report_utils.has_pathologic_finding(report)
                for report in pathology_reports
            )
            if flag is not None
        ]
        target_tissue_bands = [
            band
            for band in (
                pathology_report_utils.get_target_tissue_percentage(report)
                for report in pathology_reports
            )
            if band is not None
        ]
        histology_images = get_property_values(
            pathology_reports, pathology_report_utils.get_histology_images
        )

        return {
            "autolysis_score": max(autolysis_scores) if autolysis_scores else None,
            "non_target_tissue_present": any(non_target_flags) if non_target_flags else None,
            "pathologic_finding_present": any(finding_flags) if finding_flags else None,
            "target_tissue_percentage": (
                max(target_tissue_bands, key=pathology_report_utils.TARGET_TISSUE_PERCENTAGE_ORDER.index)
                if target_tissue_bands
                else None
            ),
            "histology_images": histology_images or None,
        }

    @calculated_property(
        schema={
            "title": "Category",
            "description": "Category of tissue type",
            "type": "string"
        }
    )
    def category(self, request: Request):
        """Get category of tissue type (either germ layer from OntologyTerm, Germ Cells, or Clinically Accessible).
        Special case for Fibroblasts (3AC) as they are mostly Mesoderm but OntologyTerm links to Ectoderm for Skin.
        """
        request_handler = RequestHandler(request=request)
        category = tissue_utils.get_category(self.properties, request_handler=request_handler)
        return category or None

    @calculated_property(
        schema={
            "title": "Tissue Type",
            "description": "Tissue type",
            "type": "string"
        }
    )
    def tissue_type(self, request: Request):
        """Get the tissue type from the properties.
        """
        request_handler = RequestHandler(request=request)
        tissue_type = tissue_utils.get_tissue_type(self.properties, request_handler=request_handler)
        return tissue_type or None


@link_related_validator
def validate_external_id_on_add(context, request):
    """Check that `external_id` and donor links are correct if Benchmarking or Production tissue on add."""
    data = request.json
    external_id = data['external_id']
    donor = data["donor"]
    preservation_type = data.get("preservation_type")
    donor_item = get_item_or_none(request, donor, 'donors')
    uberon_id = data["uberon_id"]
    uberon_item = get_item_or_none(request, uberon_id, 'ontology-terms')
    if (study := donor_utils.get_study(donor_item)):
        if not assert_valid_external_id(external_id):
            msg = f"external_id {external_id} does not match {study} nomenclature."
            return request.errors.add('body', 'Tissue: invalid property', msg)
        elif not assert_external_id_donor_match(external_id, donor_item):
            msg = f"external_id {external_id} does not match Donor external_id {item_utils.get_external_id(donor_item)}."
            return request.errors.add('body', 'Tissue: invalid link', msg)
        elif not assert_uberon_id_external_id_match(external_id, uberon_item):
            msg = f"external_id {external_id} does not match valid ids for Uberon ID {item_utils.get_identifier(uberon_item)}:{item_utils.get_display_title(uberon_item)}."
            return request.errors.add('body', 'Tissue: invalid link', msg)
        elif assert_preservation_type_and_code_mismatch(external_id, preservation_type, uberon_item):
            msg = f"external_id {external_id} does not match valid tissue code for preservation_type {preservation_type}"
            return request.errors.add('body', 'Tissue: invalid property', msg)
        else:
            return request.validated.update({}) 


@link_related_validator
def validate_external_id_on_edit(context, request):
    """Check that `external_id` and donor links are correct if Benchmarking or Production tissue on edit."""
    existing_properties = get_properties(context)
    properties_to_update = get_properties(request)
    donor = get_property_for_validation('donor', existing_properties, properties_to_update)
    external_id = get_property_for_validation('external_id', existing_properties, properties_to_update)
    preservation_type = get_property_for_validation('preservation_type', existing_properties, properties_to_update)
    donor_item = get_item_or_none(request, donor, 'sample-sources')
    uberon_id = get_property_for_validation('uberon_id', existing_properties, properties_to_update)
    uberon_item = get_item_or_none(request, uberon_id, 'ontology-terms')
    if (study:=donor_utils.get_study(donor_item)):
        if not assert_valid_external_id(external_id):
            msg = f"external_id {external_id} does not match {study} nomenclature."
            return request.errors.add('body', 'Tissue: invalid property', msg)
        elif not assert_external_id_donor_match(external_id, donor_item):
            msg = f"external_id {external_id} does not match Donor external_id {item_utils.get_external_id(donor_item)}."
            return request.errors.add('body', 'Tissue: invalid link', msg)
        elif not assert_uberon_id_external_id_match(external_id, uberon_item):
            msg = f"external_id {external_id} does not match valid ids for Uberon ID {item_utils.get_identifier(uberon_item)}:{item_utils.get_display_title(uberon_item)}."
            return request.errors.add('body', 'Tissue: invalid link', msg)
        elif assert_preservation_type_and_code_mismatch(external_id, preservation_type, uberon_item):
            msg = f"external_id {external_id} does not match valid tissue code for preservation_type {preservation_type}"
            return request.errors.add('body', 'Tissue: invalid property', msg)
        else:
            return request.validated.update({})


def assert_preservation_type_and_code_mismatch(external_id: str, preservation_type: str, uberon_item: Dict[str, Any]):
    """Check that if there are any expected preservation types associated with the codes in the valid_protocol_ids of the uberon item
        and the first part of the code is in the external_id, then there is not a mismatch between the expected preservation type
        and the provided preservation type. 
    """
    if (ot_codes := ot_utils.get_valid_protocol_ids(uberon_item)):
        for code in ot_codes:
            tissue_code, expected_preservation_type = (code.split('_', 1) + [''])[:2]
            if expected_preservation_type and tissue_code in external_id:
                return expected_preservation_type not in preservation_type
    return False


def assert_valid_external_id(external_id: str):
    """Check that external_id pattern matches Benchmarking or Production."""
    return tissue_utils.is_valid_external_id(external_id)


def assert_external_id_donor_match(external_id, donor):
    """Check that start of tissue external_id matches donor external_id."""
    donor_id = item_utils.get_external_id(donor)
    tissue_kit_id = tissue_utils.get_donor_id_from_external_id(external_id)
    return donor_id == tissue_kit_id


def assert_uberon_id_external_id_match(external_id: str, uberon_item: Dict[str, Any]):
    """Check that the protocol id of the external_id is in valid_protocol_ids for uberon_id."""
    protocol_id = tissue_utils.get_protocol_id_from_external_id(external_id)
    if (ot_codes := ot_utils.get_valid_protocol_ids(uberon_item)):
        valid_ids = [code.split('_')[0] for code in ot_codes]
        return protocol_id in valid_ids
    return True


TISSUE_ADD_VALIDATORS = SUBMITTED_ITEM_ADD_VALIDATORS + [
    validate_external_id_on_add
]

@view_config(
    context=Tissue.Collection,
    permission='add',
    request_method='POST',
    validators=TISSUE_ADD_VALIDATORS,
)
@debug_log
def tissue_add(context, request, render=None):
    return collection_add(context, request, render)


TISSUE_EDIT_PATCH_VALIDATORS = SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS + [
    validate_external_id_on_edit
]

TISSUE_EDIT_PUT_VALIDATORS = SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + [
    validate_external_id_on_edit
]

@view_config(
    context=Tissue,
    permission='edit',
    request_method='PUT',
    validators=TISSUE_EDIT_PUT_VALIDATORS,
)
@view_config(
    context=Tissue,
    permission='edit',
    request_method='PATCH',
    validators=TISSUE_EDIT_PATCH_VALIDATORS,
)
@debug_log
def tissue_edit(context, request, render=None):
    return item_edit(context, request, render)