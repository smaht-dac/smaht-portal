from typing import List, Union
from copy import deepcopy

from pyramid.request import Request
from snovault import calculated_property, collection, load_schema
from .acl import ONLY_DBGAP_VIEW_ACL, ONLY_PUBLIC_DBGAP_VIEW_ACL

from .abstract_donor import AbstractDonor


def _build_protected_donor_embedded_list():
    """Embeds for search on protected donor."""
    return [
        # Embeds for donor manifest and Donor Overview page
        'demographic.international_military_base',
        'demographic.international_military_base_details',
        'demographic.military_association',
        'death_circumstances.blood_transfusion',
        'death_circumstances.blood_transfusion_products',
        'death_circumstances.cause_of_death_immediate',
        'death_circumstances.cause_of_death_immediate_interval',
        'death_circumstances.cause_of_death_initial',
        'death_circumstances.cause_of_death_last_underlying',
        'death_circumstances.circumstances_of_death',
        'death_circumstances.death_pronounced_interval',
        'death_circumstances.donor_stream',
        'death_circumstances.place_of_death',
        'death_circumstances.region_of_death',
        'death_circumstances.season_of_death',
        'death_circumstances.sepsis_at_death',
        'death_circumstances.ventilator_at_death',
        'death_circumstances.ventilator_time',
        'medical_history.alcohol_use',
        'medical_history.allergens',
        'medical_history.allergies',
        'medical_history.autograft_transplantation',
        'medical_history.autograft_transplantation_details',
        'medical_history.body_mass_index',
        'medical_history.cancer_chemotherapy',
        'medical_history.cancer_current',
        'medical_history.cancer_history',
        'medical_history.cancer_radiation_therapy',
        'medical_history.cancer_type',
        'medical_history.cmv_total_antibody',
        'medical_history.cmv_igg_antibody',
        'medical_history.cmv_igm_antibody',
        'medical_history.covid_19_pcr',
        'medical_history.ebv_igg_antibody',
        'medical_history.ebv_igm_antibody',
        'medical_history.family_breast_cancer',
        'medical_history.family_cancer_under_50',
        'medical_history.family_diabetes',
        'medical_history.family_heart_disease',
        'medical_history.family_ovarian_pancreatic_prostate_cancer',
        'medical_history.height',
        'medical_history.hepatitis_b_core_antibody',
        'medical_history.hepatitis_b_surface_antibody',
        'medical_history.hepatitis_b_surface_antigen',
        'medical_history.hepatitis_c_antibody',
        'medical_history.hepatitis_c_nat',
        'medical_history.hiv_1_2_antibody',
        'medical_history.hiv_nat',
        'medical_history.illicit_drug_use',
        'medical_history.pregnancy_count',
        'medical_history.pregnancy_male_fetus',
        'medical_history.syphilis_rpr',
        'medical_history.tobacco_use',
        'medical_history.toxic_exposure',
        'medical_history.twin_or_multiple_birth',
        'medical_history.twin_or_multiple_birth_details',
        'medical_history.weight',
        'medical_history.xenograft_transplantation',
        'medical_history.xenograft_transplantation_details',
        'tissue_collection.collection_site',
        'tissue_collection.ischemic_time',
        'tissue_collection.organ_transplant',
        'tissue_collection.organs_transplanted',
        'tissue_collection.recovery_datetime',
        'tissue_collection.recovery_interval',
        'tissue_collection.refrigeration_prior_to_procurement',
        'tissue_collection.refrigeration_prior_to_procurement_time',
        'family_history.disease',
        'family_history.relatives',

        'medical_history.medical_treatments.title',
        'medical_history.medical_treatments.category',
        'medical_history.medical_treatments.comments',
        'medical_history.medical_treatments.counts',
        'medical_history.medical_treatments.year_end',
        'medical_history.medical_treatments.year_start',
        'medical_history.diagnoses.age_at_diagnosis',
        'medical_history.diagnoses.age_at_resolution',
        'medical_history.diagnoses.comments',
        'medical_history.diagnoses.disease',

        'medical_history.exposures.category',
        'medical_history.exposures.cessation',
        'medical_history.exposures.cessation_duration',
        'medical_history.exposures.comments',
        'medical_history.exposures.duration',
        'medical_history.exposures.frequency_category',
        'medical_history.exposures.quantity',
        'medical_history.exposures.quantity_unit',
        'medical_history.exposures.route',
        'medical_history.exposures.substance'
    ]


@collection(
    name="protected-donors",
    unique_key="submitted_id",
    properties={
        "title": "Protected Donors",
        "description": "Individuals who donated tissues with protected data",
    })
class ProtectedDonor(AbstractDonor):
    item_type = "protected_donor"
    schema = load_schema("encoded:schemas/protected_donor.json")
    embedded_list = _build_protected_donor_embedded_list()

    rev = {
        "medical_history": ("MedicalHistory", "donor"),
        "demographic": ("Demographic", "donor"),
        "death_circumstances": ("DeathCircumstances", "donor"),
        "family_history": ("FamilyHistory", "donor"),
        "tissue_collection": ("TissueCollection", "donor"),
    }

    SUBMISSION_CENTER_STATUS_ACL = deepcopy(AbstractDonor.SUBMISSION_CENTER_STATUS_ACL)
    SUBMISSION_CENTER_STATUS_ACL.update({
        'protected-network': ONLY_DBGAP_VIEW_ACL,
        'protected': ONLY_PUBLIC_DBGAP_VIEW_ACL
    })
    CONSORTIUM_STATUS_ACL = deepcopy(AbstractDonor.CONSORTIUM_STATUS_ACL)
    CONSORTIUM_STATUS_ACL.update({
        'protected-network': ONLY_DBGAP_VIEW_ACL,
        'protected': ONLY_PUBLIC_DBGAP_VIEW_ACL
    })

    @calculated_property(
        schema={
            "title": "Medical History",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "MedicalHistory",
            },
        },
    )
    def medical_history(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "medical_history")
        return result or None

    @calculated_property(
        schema={
            "title": "Demographic",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "Demographic",
            },
        },
    )
    def demographic(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "demographic")
        return result or None

    @calculated_property(
        schema={
            "title": "Death Circumstances",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "DeathCircumstances",
            },
        },
    )
    def death_circumstances(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "death_circumstances")
        return result or None

    @calculated_property(
        schema={
            "title": "FamilyHistory",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "FamilyHistory",
            },
        },
    )
    def family_history(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "family_history")
        return result or None

    @calculated_property(
    schema={
        "title": "TissueCollection",
        "type": "array",
        "items": {
            "type": "string",
            "linkTo": "TissueCollection",
        },
    },
    )
    def tissue_collection(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "tissue_collection")
        return result or None