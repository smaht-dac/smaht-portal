from pyramid.view import view_config
from pyramid.response import Response
from snovault.elasticsearch import ELASTIC_SEARCH
from snovault.util import debug_log
from dcicutils.misc_utils import ignored
from snovault.search.search import search
from snovault.search.search_utils import (
    build_permission_filter,
    execute_streaming_search,
    get_es_index,
    make_search_subreq,
)
from typing import Tuple, NamedTuple, List
from urllib.parse import urlencode
from webob.multidict import MultiDict
import csv
import json
from datetime import datetime
from collections.abc import Mapping, Sequence
import structlog


log = structlog.getLogger(__name__)


def includeme(config):
    config.add_route('peek_metadata', '/peek-metadata/')
    config.add_route('metadata', '/metadata/')
    config.add_route('metadata_redirect', '/metadata/{search_params}/{tsv}')
    config.scan(__name__)


TSV_WIDTH = 35 # There are 35 columns in the file manifest
# Encode manifest file types
FILE = 0
CLINICAL = 1
SAMPLE = 2
EXPERIMENT = 3
EXPERIMENT_ANALYTE = 4
EXPERIMENT_LIBRARY = 5


# This field is special because it is a transformation applied from other fields
FILE_GROUP = 'FileGroup'
SAMPLE_TYPE = 'SampleType'
SAMPLE_TYPE_LIST = ['TissueSample','CellSample','CellCultureSample']
SAMPLE_SOURCE_TYPE = 'SampleSourceType'
SAMPLE_SOURCE_TYPE_LIST = ['Tissue','CellCultureMixture','CellCulture']


class MetadataArgs(NamedTuple):
    """ NamedTuple that holds all the args passed to the /metadata and /peek-metadata endpoints """
    accessions: List[str]
    manifest_enum: int
    sort_param: str
    type_param: str
    status: str
    include_extra_files: bool
    download_file_name: str
    header: Tuple[List[str], List[str], List[str]]
    tsv_mapping: dict
    cli: bool


class TSVDescriptor:
    """ Dataclass that holds the structure """
    def __init__(self, *, field_type: int, field_name: List[str],
                 deduplicate: bool = True, use_base_metadata: bool = False):
        """ field_type is str, int or float, field_name is a list of possible
            paths when searched can retrieve the field value, deduplicate is unused,
            use_base_metadata means to rely on top level object instead of sub object
            (only used for extra files)
        """
        self._field_type = field_type
        self._field_name = field_name
        self._deduplicate = deduplicate
        self._use_base_metadata = use_base_metadata

    def field_type(self) -> int:
        """ Note this is an int enum """
        return self._field_type

    def field_name(self) -> List[str]:
        """ Field name in this case is a list of possible paths to search """
        return self._field_name

    def deduplicate(self) -> bool:
        return self._deduplicate

    def use_base_metadata(self) -> bool:
        return self._use_base_metadata


class DummyFileInterfaceImplementation(object):
    """ This is used to simulate a file interface for streaming the TSV output """
    def __init__(self):
        self._line = None
    def write(self, line):  # noqa
        self._line = line
    def read(self):  # noqa
        return self._line


# This dictionary is a key --> 3-tuple mapping that encodes options for the /metadata/ endpoint
# given a field description. This also describes the order that fields show up in the TSV.
# VERY IMPORTANT NOTE WHEN ADDING FIELDS - right now support for arrays generally is limited.
# The limitations are: array of terminal values are fine, but arrays of dictionaries will only
# traverse one additional level of depth ie:
# item contains dictionary d1, where d1 has property that is array of object
#   --> d1.arr --> d1.array.dict --> d1.array.dict.value
# TODO: move to another file or write in JSON
TSV_MAPPING = {

    # Standard file manifest
    FILE: {
        'FileDownloadURL': TSVDescriptor(field_type=FILE,
                                         field_name=['href']),
        'FileAccession': TSVDescriptor(field_type=FILE,
                                       field_name=['accession']),
        'FileName': TSVDescriptor(field_type=FILE,
                                  field_name=['annotated_filename', 'filename', 'display_title']), # NOTE: This row should not be changed. Needed for file download
        'FileSetAccession': TSVDescriptor(field_type=FILE,
                                          field_name=['file_sets.accession']),
        'AnalyteAccessions': TSVDescriptor(field_type=FILE,
                                           field_name=['file_sets.libraries.analytes.accession']),
        'SampleAccessions': TSVDescriptor(field_type=FILE,
                                          field_name=['file_sets.libraries.analytes.samples.accession']),
        'DonorAccession': TSVDescriptor(field_type=FILE,
                                        field_name=['file_sets.libraries.analytes.samples.sample_sources.donor.accession']),
        'FileStatus': TSVDescriptor(field_type=FILE,
                                    field_name=['status'],
                                    use_base_metadata=True),
        'RetractedReason': TSVDescriptor(field_type=FILE,
                                         field_name=['retracted_reason'],
                                         use_base_metadata=True),
        'Size(B)': TSVDescriptor(field_type=FILE,
                                 field_name=['file_size']),
        'md5sum': TSVDescriptor(field_type=FILE,
                                field_name=['md5sum']),
        'DataCategory': TSVDescriptor(field_type=FILE,
                                     field_name=['data_category'],
                                     use_base_metadata=True),  # do not traverse extra_files for this
        'DataType': TSVDescriptor(field_type=FILE,
                                  field_name=['data_type'],
                                  use_base_metadata=True),  # do not traverse extra_files for this
        'DataDescription': TSVDescriptor(field_type=FILE,
                                         field_name=['data_description'],
                                         use_base_metadata=True),  # do not traverse extra_files for this
        'AnalysisDetails': TSVDescriptor(field_type=FILE,
                                         field_name=['analysis_details'],
                                         use_base_metadata=True),  # do not traverse extra_files for this
        'AlignmentDetails': TSVDescriptor(field_type=FILE,
                                          field_name=['alignment_details'],
                                          use_base_metadata=True),  # do not traverse extra_files for this
        'AnnotationDetails': TSVDescriptor(field_type=FILE,
                                           field_name=['annotation.display_title'],
                                           use_base_metadata=True),  # do not traverse extra_files for this
        'FilteringMethods': TSVDescriptor(field_type=FILE,
                                          field_name=['filtering_methods'],
                                           use_base_metadata=True),  # do not traverse extra_files for this
        'ComparatorDescription': TSVDescriptor(field_type=FILE,
                                               field_name=['comparator_description'],
                                               use_base_metadata=True),  # do not traverse extra_files for this
        'FileFormat': TSVDescriptor(field_type=FILE,
                                    field_name=['file_format.display_title']),
        'SampleName': TSVDescriptor(field_type=FILE,
                                    field_name=['sample_summary.sample_names'],
                                    use_base_metadata=True),  # do not traverse extra_files for this
        'SampleStudies': TSVDescriptor(field_type=FILE,
                                       field_name=['sample_summary.studies'],
                                       use_base_metadata=True),  # do not traverse extra_files for this
        'SampleTissues': TSVDescriptor(field_type=FILE,
                                       field_name=['sample_summary.tissues'],
                                       use_base_metadata=True),  # do not traverse extra_files for this
        'SampleDonors': TSVDescriptor(field_type=FILE,
                                      field_name=['sample_summary.donor_ids'],
                                      use_base_metadata=True),  # do not traverse extra_files for this
        'SampleSource': TSVDescriptor(field_type=FILE,
                                      field_name=['sample_summary.sample_descriptions'],
                                      use_base_metadata=True),  # do not traverse extra_files for this
        'Analytes': TSVDescriptor(field_type=FILE,
                                  field_name=['sample_summary.analytes'],
                                  use_base_metadata=True),
        'Sequencer': TSVDescriptor(field_type=FILE,
                                   field_name=['sequencers.display_title'],
                                   use_base_metadata=True),
        'Assay': TSVDescriptor(field_type=FILE,
                               field_name=['assays.display_title'],
                               use_base_metadata=True),
        'SoftwareName/Version': TSVDescriptor(field_type=FILE,
                                              field_name=['analysis_summary.software'],
                                              use_base_metadata=True),
        'ReferenceGenome': TSVDescriptor(field_type=FILE,
                                         field_name=['analysis_summary.reference_genome'],
                                         use_base_metadata=True),
        'FinalQCStatus': TSVDescriptor(field_type=FILE,
                                       field_name=['quality_metrics.overall_quality_status_display'],
                                       use_base_metadata=True),
        'QCComments': TSVDescriptor(field_type=FILE,
                                    field_name=['qc_comments'],
                                    use_base_metadata=True),
        'QCNotes': TSVDescriptor(field_type=FILE,
                                 field_name=['quality_metrics.qc_notes'],
                                 use_base_metadata=True),
        'FileNotes': TSVDescriptor(field_type=FILE,
                                   field_name=['tsv_notes'],
                                   use_base_metadata=True),
        FILE_GROUP: TSVDescriptor(field_type=FILE,
                                  field_name=['file_sets.file_group'],
                                  use_base_metadata=False)   # omit this field on extra files
    },

    # Clinical (Donor) manifest - method TBD, this will be complex as it cannot all be resolved from
    # one search but rather several types that do not have direct link
    CLINICAL: {
        'DonorAccession': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['accession'],
                                        use_base_metadata=True),
        'DemographicInternationalMilitaryBase': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['demographic.international_military_base'],
                                        use_base_metadata=True),
        'DemographicInternationalMilitaryBaseDetails': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['demographic.international_military_base_details'],
                                        use_base_metadata=True),
        'DemographicMilitaryAssociation': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['demographic.military_association'],
                                        use_base_metadata=True),
        'DeathCircumstancesBloodTransfusion': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['death_circumstances.blood_transfusion'],
                                        use_base_metadata=True),
        'DeathCircumstancesBloodTransfusionProducts': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['death_circumstances.blood_transfusion_products'],
                                        use_base_metadata=True),
        'DeathCircumstancesCauseOfDeathImmediate': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['death_circumstances.cause_of_death_immediate'],
                                        use_base_metadata=True),
        'DeathCircumstancesCauseOfDeathImmediateInterval (h)': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['death_circumstances.cause_of_death_immediate_interval'],
                                        use_base_metadata=True),
        'DeathCircumstancesCauseOfDeathInitial': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['death_circumstances.cause_of_death_initial'],
                                        use_base_metadata=True),
        'DeathCircumstancesCauseOfDeathLastUnderlying': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['death_circumstances.cause_of_death_last_underlying'],
                                        use_base_metadata=True),
        'DeathCircumstancesCircumstancesOfDeath': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['death_circumstances.circumstances_of_death'],
                                        use_base_metadata=True),
        'DeathCircumstancesDeathPronouncedInterval (h)': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['death_circumstances.death_pronounced_interval'],
                                        use_base_metadata=True),
        'DeathCircumstancesDonorStream': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['death_circumstances.donor_stream'],
                                        use_base_metadata=True),
        'DeathCircumstancesPlaceOfDeath': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['death_circumstances.place_of_death'],
                                        use_base_metadata=True),
        'DeathCircumstancesRegionOfDeath': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['death_circumstances.region_of_death'],
                                        use_base_metadata=True),
        'DeathCircumstancesSeasonOfDeath': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['death_circumstances.season_of_death'],
                                        use_base_metadata=True),
        'DeathCircumstancesSepsisAtDeath': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['death_circumstances.sepsis_at_death'],
                                        use_base_metadata=True),
        'DeathCircumstancesVentilatorAtDeath': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['death_circumstances.ventilator_at_death'],
                                        use_base_metadata=True),
        'DeathCircumstancesVentilatorTime (h)': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['death_circumstances.cause_of_death_immediate'],
                                        use_base_metadata=True),
        'MedicalHistoryAlcoholUse': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.alcohol_use'],
                                        use_base_metadata=True),
        'MedicalHistoryAllergens': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.allergens'],
                                        use_base_metadata=True),
        'MedicalHistoryAllergies': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.allergies'],
                                        use_base_metadata=True),
        'MedicalHistoryAutograftTransplantation': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.autograft_transplantation'],
                                        use_base_metadata=True),
        'MedicalHistoryAutograftTransplantationDetails': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.autograft_transplantation_details'],
                                        use_base_metadata=True),
        'MedicalHistoryBodyMassIndex': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.body_mass_index'],
                                        use_base_metadata=True),
        'MedicalHistoryCancerChemotherapy': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.cancer_chemotherapy'],
                                        use_base_metadata=True),
        'MedicalHistoryCancerCurrent': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.cancer_current'],
                                        use_base_metadata=True),
        'MedicalHistoryCancerHistory': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.cancer_history'],
                                        use_base_metadata=True),
        'MedicalHistoryCancerRadiationTherapy': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.cancer_radiation_therapy'],
                                        use_base_metadata=True),
        'MedicalHistoryCancerType': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.cancer_type'],
                                        use_base_metadata=True),
        'MedicalHistoryCmvTotalAntibody': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.cmv_total_antibody'],
                                        use_base_metadata=True),
        'MedicalHistoryCmvIggAntibody': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.cmv_igg_antibody'],
                                        use_base_metadata=True),
        'MedicalHistoryCmvIgmAntibody': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.cmv_igm_antibody'],
                                        use_base_metadata=True),
        'MedicalHistoryCovid19Pcr': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.covid_19_pcr'],
                                        use_base_metadata=True),
        'MedicalHistoryEbvIggAntibody': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.ebv_igg_antibody'],
                                        use_base_metadata=True),
        'MedicalHistoryEbvIgmAntibody': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.ebv_igm_antibody'],
                                        use_base_metadata=True),
        'MedicalHistoryFamilyBreastCancer': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.family_breast_cancer'],
                                        use_base_metadata=True),
        'MedicalHistoryFamilyCancerUnder50': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.family_cancer_under_50'],
                                        use_base_metadata=True),
        'MedicalHistoryFamilyDiabetes': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.family_diabetes'],
                                        use_base_metadata=True),
        'MedicalHistoryFamilyHeartDisease': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.family_heart_disease'],
                                        use_base_metadata=True),
        'MedicalHistoryFamilyOvarianPancreaticProstateCancer': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.family_ovarian_pancreatic_prostate_cancer'],
                                        use_base_metadata=True),
        'MedicalHistoryHeight (m)': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.height'],
                                        use_base_metadata=True),
'MedicalHistoryHepatitisBCoreAntibody': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.hepatitis_b_core_antibody'],
                                        use_base_metadata=True),
        'MedicalHistoryHepatitisBSurfaceAntibody': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.hepatitis_b_surface_antibody'],
                                        use_base_metadata=True),
        'MedicalHistoryHepatitisBSurfaceAntigen': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.hepatitis_b_surface_antigen'],
                                        use_base_metadata=True),
        'MedicalHistoryHepatitisCAntibody': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.hepatitis_c_antibody'],
                                        use_base_metadata=True),
        'MedicalHistoryHepatitisCNat': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.hepatitis_c_nat'],
                                        use_base_metadata=True),
        'MedicalHistoryHiv12Antibody': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.hiv_1_2_antibody'],
                                        use_base_metadata=True),
        'MedicalHistoryHivNat': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.hiv_nat'],
                                        use_base_metadata=True),
        'MedicalHistoryIllicitDrugUse': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.illicit_drug_use'],
                                        use_base_metadata=True),
        'MedicalHistoryPregnancyCount': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.pregnancy_count'],
                                        use_base_metadata=True),
        'MedicalHistoryPregnancyMaleFetus': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.pregnancy_male_fetus'],
                                        use_base_metadata=True),
        'MedicalHistorySyphilisRpr': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.syphilis_rpr'],
                                        use_base_metadata=True),
        'MedicalHistoryTobaccoUse': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.tobacco_use'],
                                        use_base_metadata=True),
        'MedicalHistoryTwinOrMultipleBirth': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.twin_or_multiple_birth'],
                                        use_base_metadata=True),
        'MedicalHistoryTwinOrMultipleBirthDetails': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.twin_or_multiple_birth_details'],
                                        use_base_metadata=True),
        'MedicalHistoryWeight (kg)': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.weight'],
                                        use_base_metadata=True),
        'MedicalHistoryXenograftTransplantation': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.xenograft_transplantation'],
                                        use_base_metadata=True),
        'MedicalHistoryXenograftTransplantationDetails': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.xenograft_transplantation_details'],
                                        use_base_metadata=True),
        'TissueCollectionCollectionSite': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['tissue_collection.collection_site'],
                                        use_base_metadata=True),
        'TissueCollectionIschemicTime (h)': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['tissue_collection.collection_site'],
                                        use_base_metadata=True),
        'TissueCollectionOrganTransplant': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['tissue_collection.organ_transplant'],
                                        use_base_metadata=True),
        'TissueCollectionOrgansTransplanted': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['tissue_collection.organs_transplanted'],
                                        use_base_metadata=True),
        'TissueCollectionRecoveryDatetime': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['tissue_collection.recovery_datetime'],
                                        use_base_metadata=True),
        'TissueCollectionRecoveryInterval (min)': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['tissue_collection.recovery_interval'],
                                        use_base_metadata=True),
        'TissueCollectionRefrigerationPriorToProcurement': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['tissue_collection.refrigeration_prior_to_procurement'],
                                        use_base_metadata=True),
        'TissueCollectionRefrigerationPriorToProcurementTime (h)': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['tissue_collection.refrigeration_prior_to_procurement_time'],
                                        use_base_metadata=True),
        'FamilyHistoryDisease': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['family_history.disease'],
                                        use_base_metadata=True),
        'FamilyHistoryRelatives': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['family_history.relatives'],
                                        use_base_metadata=True),
        'MedicalTreatmentsTitle': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.medical_treatments.title'],
                                        use_base_metadata=True),
        'MedicalTreatmentsCategory': TSVDescriptor(field_type=CLINICAL, 
                                        field_name=['medical_history.medical_treatments.category'],
                                        use_base_metadata=True),
        'MedicalTreatmentsComments': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.medical_treatments.comments'],
                                        use_base_metadata=True),
        'MedicalTreatmentsCounts': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.medical_treatments.counts'],
                                        use_base_metadata=True),
        'MedicalTreatmentsYearEnd': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.medical_treatments.year_end'],
                                        use_base_metadata=True),
        'MedicalTreatmentsYearStart': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.medical_treatments.year_start'],
                                        use_base_metadata=True),
        'DiagnosesDisease': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.diagnoses.disease'],
                                        use_base_metadata=True),
        'DiagnosesAgeAtDiagnosis': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.diagnoses.age_at_diagnosis'],
                                        use_base_metadata=True),
        'DiagnosesAgeAtResolution': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.diagnoses.age_at_resolution'],
                                        use_base_metadata=True),
        'DiagnosesComments': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.diagnoses.comments'],
                                        use_base_metadata=True),
        'ExposuresCategory': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.exposures.category'],
                                        use_base_metadata=True),
        'ExposuresSubstance': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.exposures.substance'],
                                        use_base_metadata=True),
        'ExposuresCessation': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.exposures.cessation'],
                                        use_base_metadata=True),
        'ExposuresCessationDuration (y)': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.exposures.cessation'],
                                        use_base_metadata=True),
        'ExposuresComments': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.exposures.comments'],
                                        use_base_metadata=True),
        'ExposuresDuration (y)': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.exposures.duration'],
                                        use_base_metadata=True),
        'ExposuresFrequencyCategory': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.exposures.frequency_category'],
                                        use_base_metadata=True),
        'ExposuresQuantity': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.exposures.quantity'],
                                        use_base_metadata=True),
        'ExposuresQuantityUnit': TSVDescriptor(field_type=CLINICAL,
                                        field_name=['medical_history.exposures.quantity_unit'],
                                        use_base_metadata=True),                           
    },

    # Sample manifest
    # Method - traverse files selected extracting sample ID, search for sample IDs, generate manifest
    # from that search
    SAMPLE: {
        'SampleAccession': TSVDescriptor(field_type=SAMPLE,
                                         field_name=['accession'],
                                         use_base_metadata=True),
        'DonorAccession': TSVDescriptor(field_type=SAMPLE,
                                        field_name=['sample_sources.donor.accession'],
                                        use_base_metadata=True),
        'SampleType': TSVDescriptor(field_type=SAMPLE,
                                    field_name=['@type'],
                                    use_base_metadata=True),
        'SampleSourceType': TSVDescriptor(field_type=SAMPLE,
                                          field_name=['sample_sources.@type'],
                                          use_base_metadata=True),
        'SampleExternalID': TSVDescriptor(field_type=SAMPLE,
                                          field_name=['external_id'],
                                          use_base_metadata=True),
        'SampleCategory': TSVDescriptor(field_type=SAMPLE,
                                        field_name=['category'],
                                        use_base_metadata=True),
        'SampleCoreSize (mm)': TSVDescriptor(field_type=SAMPLE,
                                             field_name=['core_size'],
                                             use_base_metadata=True),
        'SampleDescription': TSVDescriptor(field_type=SAMPLE,
                                           field_name=['description'],
                                           use_base_metadata=True),
        'SamplePreservationMedium': TSVDescriptor(field_type=SAMPLE,
                                                  field_name=['preservation_medium'],
                                                  use_base_metadata=True),
        'SamplePreservationType': TSVDescriptor(field_type=SAMPLE,
                                                field_name=['preservation_type'],
                                                use_base_metadata=True),
        'SampleProcessingDate': TSVDescriptor(field_type=SAMPLE,
                                              field_name=['processing_date'],
                                              use_base_metadata=True),
        'SampleProcessingNotes': TSVDescriptor(field_type=SAMPLE,
                                               field_name=['processing_notes'],
                                               use_base_metadata=True),
        'SampleWeight (mg)': TSVDescriptor(field_type=SAMPLE,
                                           field_name=['weight'],
                                           use_base_metadata=True),
        'SampleCellCount': TSVDescriptor(field_type=SAMPLE,
                                         field_name=['cell_count'],
                                         use_base_metadata=True),
        'SampleCellDensity': TSVDescriptor(field_type=SAMPLE,
                                           field_name=['cell_density'],
                                           use_base_metadata=True),
        'SampleVolume (ml)': TSVDescriptor(field_type=SAMPLE,
                                           field_name=['volume'],
                                           use_base_metadata=True),
        'SampleCellOntologyId': TSVDescriptor(field_type=SAMPLE,
                                              field_name=['cell_ontology_id'],
                                              use_base_metadata=True),
        'SampleSourceDescription': TSVDescriptor(field_type=SAMPLE,
                                                 field_name=['sample_sources.description'],
                                                 use_base_metadata=True),
        'SampleSourceExternalId': TSVDescriptor(field_type=SAMPLE,
                                                field_name=['sample_sources.external_id'],
                                                use_base_metadata=True),
        'SampleSourceSampleCount': TSVDescriptor(field_type=SAMPLE,
                                                 field_name=['sample_sources.sample_count'],
                                                 use_base_metadata=True),

        # Tissue specific fields
        'TissueAnatomicalLocation': TSVDescriptor(field_type=SAMPLE,
                                                  field_name=['sample_sources.anatomical_location'],
                                                  use_base_metadata=True),
        'TissueIschemicTime (h)': TSVDescriptor(field_type=SAMPLE,
                                                field_name=['sample_sources.ischemic_time'],
                                                use_base_metadata=True),
        'TissuePathologyNotes': TSVDescriptor(field_type=SAMPLE,
                                              field_name=['sample_sources.pathology_notes'],
                                              use_base_metadata=True),
        'TissuePH': TSVDescriptor(field_type=SAMPLE,
                                  field_name=['sample_sources.ph'],
                                  use_base_metadata=True),
        'TissuePreservationMedium': TSVDescriptor(field_type=SAMPLE,
                                                  field_name=['sample_sources.preservation_medium'],
                                                  use_base_metadata=True),
        'TissuePreservationType': TSVDescriptor(field_type=SAMPLE,
                                                field_name=['sample_sources.preservation_type'],
                                                use_base_metadata=True),
        'TissueProsectorNotes': TSVDescriptor(field_type=SAMPLE,
                                               field_name=['sample_sources.prosector_notes'],
                                               use_base_metadata=True),
        'TissueSize': TSVDescriptor(field_type=SAMPLE,
                                    field_name=['sample_sources.size'],
                                    use_base_metadata=True),
        'TissueSizeUnit': TSVDescriptor(field_type=SAMPLE,
                                        field_name=['sample_sources.size_unit'],
                                        use_base_metadata=True),
        'TissueUberonId': TSVDescriptor(field_type=SAMPLE,
                                        field_name=['sample_sources.uberon_id.identifier'],
                                        use_base_metadata=True),
        'TissueVolume (ml)': TSVDescriptor(field_type=SAMPLE,
                                           field_name=['sample_sources.volume'],
                                           use_base_metadata=True),
        'TissueWeight (g)': TSVDescriptor(field_type=SAMPLE,
                                          field_name=['sample_sources.weight'],
                                          use_base_metadata=True),

        # Cell Culture Fields
        'CellCultureCultureDuration (d)': TSVDescriptor(field_type=SAMPLE,
                                                        field_name=['sample_sources.culture_duration'],
                                                        use_base_metadata=True),
        'CellCultureHarvestDate': TSVDescriptor(field_type=SAMPLE,
                                                field_name=['sample_sources.culture_harvest_date'],
                                                use_base_metadata=True),
        'CellCultureStartDate': TSVDescriptor(field_type=SAMPLE,
                                              field_name=['sample_sources.culture_start_date'],
                                              use_base_metadata=True),
        'CellCultureGrowthMedium': TSVDescriptor(field_type=SAMPLE,
                                                 field_name=['sample_sources.growth_medium'],
                                                 use_base_metadata=True),
        'CellCultureKaryotype': TSVDescriptor(field_type=SAMPLE,
                                              field_name=['sample_sources.karyotype'],
                                              use_base_metadata=True),

        # Cell line fields
        'CellLineCode': TSVDescriptor(field_type=SAMPLE,
                                      field_name=['sample_sources.cell_line.code'],
                                      use_base_metadata=True),
        'CellLineSource': TSVDescriptor(field_type=SAMPLE,
                                        field_name=['sample_sources.cell_line.source'],
                                        use_base_metadata=True),
        'CellLineUrl': TSVDescriptor(field_type=SAMPLE,
                                     field_name=['sample_sources.cell_line.url'],
                                     use_base_metadata=True),

    },
    EXPERIMENT_ANALYTE: {
        # Top level fields
        'AnalyteAccession': TSVDescriptor(field_type=EXPERIMENT, field_name=['accession']),
        'SampleAccession': TSVDescriptor(field_type=EXPERIMENT, field_name=['samples.accession']),
        'DonorAccession': TSVDescriptor(field_type=EXPERIMENT, field_name=['samples.sample_sources.donor.accession']),

        # Analyte Fields
        'AnalyteMolecule': TSVDescriptor(field_type=EXPERIMENT, field_name=['molecule']),
        'AnalyteMoleculeDetail': TSVDescriptor(field_type=EXPERIMENT, field_name=['molecule_detail']),
        'AnalyteA260A280Ratio': TSVDescriptor(field_type=EXPERIMENT, field_name=['a260_a280_ratio']),
        'AnalyteAverageFragmentSize': TSVDescriptor(field_type=EXPERIMENT,
                                                    field_name=['average_fragment_size']),
        'AnalyteConcentration': TSVDescriptor(field_type=EXPERIMENT, field_name=['concentration']),
        'AnalyteConcentrationUnit': TSVDescriptor(field_type=EXPERIMENT, field_name=['concentration_unit']),
        'AnalyteDescription': TSVDescriptor(field_type=EXPERIMENT, field_name=['description']),
        'AnalyteDnaIntegrityNumber': TSVDescriptor(field_type=EXPERIMENT, field_name=['dna_integrity_number']),
        'AnalyteDnaIntegrityNumberInstrument': TSVDescriptor(field_type=EXPERIMENT,
                                                             field_name=['dna_integrity_number_instrument']),
        'AnalyteDnaQualityNumber': TSVDescriptor(field_type=EXPERIMENT, field_name=['dna_quality_number']),
        'AnalyteDnaQualityNumberInstrument': TSVDescriptor(field_type=EXPERIMENT,
                                                           field_name=['dna_quality_number_instrument']),
        'AnalyteDnaQualitySizeThreshold': TSVDescriptor(field_type=EXPERIMENT,
                                                        field_name=['dna_quality_size_threshold']),
        'AnalyteExternalId': TSVDescriptor(field_type=EXPERIMENT, field_name=['external_id']),
        'AnalyteGenomicQualityNumber': TSVDescriptor(field_type=EXPERIMENT,
                                                     field_name=['genomic_quality_number']),
        'AnalyteGenomicQualityNumberInstrument': TSVDescriptor(field_type=EXPERIMENT,
                                                               field_name=['genomic_quality_number_instrument']),
        'AnalyteGenomicQualityNumberSizeThreshold': TSVDescriptor(field_type=EXPERIMENT,
                                                                  field_name=['genomic_quality_size_threshold']),
        'AnalyteQuantitationMethod': TSVDescriptor(field_type=EXPERIMENT, field_name=['quantitation_method']),
        'AnalyteRibosomalRnaRatio': TSVDescriptor(field_type=EXPERIMENT, field_name=['ribosomal_rna_ratio']),
        'AnalyteRnaIntegrityNumber': TSVDescriptor(field_type=EXPERIMENT, field_name=['rna_integrity_number']),
        'AnalyteRnaIntegrityNumberInstrument': TSVDescriptor(field_type=EXPERIMENT,
                                                             field_name=['rna_integrity_number_instrument']),
        'AnalyteSampleQuantity': TSVDescriptor(field_type=EXPERIMENT,
                                               field_name=['sample_quantity']),
        'AnalyteSampleQuantityUnit': TSVDescriptor(field_type=EXPERIMENT,
                                                   field_name=['sample_quantity_unit']),
        'AnalyteTotalYield': TSVDescriptor(field_type=EXPERIMENT,
                                           field_name=['total_yield']),
        'AnalyteVolume': TSVDescriptor(field_type=EXPERIMENT,
                                       field_name=['volume']),
        'AnalyteVolumeUnit': TSVDescriptor(field_type=EXPERIMENT,
                                           field_name=['volume_unit']),
        'AnalyteYieldPerUnit': TSVDescriptor(field_type=EXPERIMENT,
                                             field_name=['yield_per_unit']),
        'AnalyteYieldUnit': TSVDescriptor(field_type=EXPERIMENT,
                                          field_name=['yield_unit']),

        # Analyte preparation fields
        'AnalytePreparationCellLysisMethod': TSVDescriptor(field_type=EXPERIMENT,
                                                           field_name=['analyte_preparation.cell_lysis_method']),
        'AnalytePreparationDescription': TSVDescriptor(field_type=EXPERIMENT,
                                                       field_name=['analyte_preparation.description']),
        'AnalytePreparationExtractionMethod': TSVDescriptor(field_type=EXPERIMENT,
                                                            field_name=['analyte_preparation.extraction_method']),
        'AnalytePreparationHomogenizationMethod': TSVDescriptor(field_type=EXPERIMENT,
                                                                field_name=['analyte_preparation.homogenization_method']),
        'AnalytePreparationSuspensionType': TSVDescriptor(field_type=EXPERIMENT,
                                                          field_name=['analyte_preparation.suspension_type']),
        'AnalytePreparationTreatmentAgent': TSVDescriptor(field_type=EXPERIMENT,
                                                          field_name=['analyte_preparation.treatments.agent']),
        'AnalytePreparationTreatmentConcentration': TSVDescriptor(field_type=EXPERIMENT,
                                                                  field_name=['analyte_preparation.treatments.concentration']),
        'AnalytePreparationTreatmentConcentrationUnits': TSVDescriptor(field_type=EXPERIMENT,
                                                                       field_name=['analyte_preparation.treatments.concentration_units']),
        'AnalytePreparationTreatmentDuration (min)': TSVDescriptor(field_type=EXPERIMENT,
                                                                   field_name=['analyte_preparation.treatments.duration']),
        'AnalytePreparationTreatmentTemperature (C)': TSVDescriptor(field_type=EXPERIMENT,
                                                                    field_name=['analyte_preparation.treatments.temperature']),
        'AnalytePreparationPreparationKitTitle': TSVDescriptor(field_type=EXPERIMENT,
                                                               field_name=['analyte_preparation.preparation_kits.title']),
        'AnalytePreparationPreparationKitCatalogNumber': TSVDescriptor(field_type=EXPERIMENT,
                                                                       field_name=['analyte_preparation.preparation_kits.catalog_number']),
        'AnalytePreparationPreparationKitVendor': TSVDescriptor(field_type=EXPERIMENT,
                                                                field_name=['analyte_preparation.preparation_kits.vendor']),
        'AnalytePreparationPreparationKitVersion': TSVDescriptor(field_type=EXPERIMENT,
                                                                 field_name=['analyte_preparation.preparation_kits.version'])
    },
    EXPERIMENT_LIBRARY: {
        # Top level fields
        'FileSetAccession': TSVDescriptor(field_type=EXPERIMENT, field_name=['accession']),
        'AnalyteAccessions': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.analytes.accession']),
        'SampleAccession': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.analytes.samples.accession']),
        'DonorAccession': TSVDescriptor(field_type=EXPERIMENT,
                                        field_name=['libraries.analytes.samples.sample_sources.donor.accession']),

        # Library fields
        'LibraryAssay': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.assay.identifier']),
        'LibraryA260A280Ratio': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.a260_a280_ratio']),
        'LibraryAdapterName': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.adapter_name']),
        'LibraryAdapterSequence': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.adapter_sequence']),
        'LibraryAmplificationCycles': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.amplification_cycles']),
        'LibraryAnalyteWeight (mg)': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.analyte_weight']),
        'LibraryAntibody': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.antibody']),
        'LibraryBarcodeSequences': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.barcode_sequences']),
        'LibraryComments': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.comments']),
        'LibraryConcatenatedReads': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.concatenated_reads']),
        'LibraryDescription': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.description']),
        'LibraryDnaTarget': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.dna_target']),
        'LibraryExternalId': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.external_id']),
        'LibraryFragmentMeanLength': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.fragment_mean_length']),
        'LibraryGuideSequence': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.guide_sequence']),
        'LibraryInsertCoefficientOfVariation': TSVDescriptor(field_type=EXPERIMENT,
                                                             field_name=['libraries.insert_coefficient_of_variation']),
        'LibraryInsertMaximumLength': TSVDescriptor(field_type=EXPERIMENT,
                                                    field_name=['libraries.insert_maximum_length']),
        'LibraryInsertMeanLength': TSVDescriptor(field_type=EXPERIMENT,
                                                 field_name=['libraries.insert_mean_length']),
        'LibraryInsertMinimumLength': TSVDescriptor(field_type=EXPERIMENT,
                                                    field_name=['libraries.insert_minimum_length']),
        'LibraryPreparationDate': TSVDescriptor(field_type=EXPERIMENT,
                                                field_name=['libraries.preparation_date']),
        'LibraryTargetFragmentSize': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.target_fragment_size']),
        'LibraryTargetInsertMaximumLength': TSVDescriptor(field_type=EXPERIMENT,
                                                          field_name=['libraries.target_insert_maximum_length']),
        'LibraryTargetInsertMinimumLength': TSVDescriptor(field_type=EXPERIMENT,
                                                          field_name=['libraries.target_insert_minimum_length']),
        'LibraryTargetMonomerSize': TSVDescriptor(field_type=EXPERIMENT,
                                                  field_name=['libraries.target_monomer_size']),
        'LibraryPreparationAdapterInclusionMethod': TSVDescriptor(field_type=EXPERIMENT,
                                                                  field_name=['libraries.library_preparation.adapter_inclusion_method']),
        'LibraryPreparationAmplificationMethod': TSVDescriptor(field_type=EXPERIMENT,
                                                               field_name=['libraries.library_preparation.amplification_method']),
        'LibraryPreparationDescription': TSVDescriptor(field_type=EXPERIMENT,
                                                       field_name=['libraries.library_preparation.description']),
        'LibraryPreparationEnzymes': TSVDescriptor(field_type=EXPERIMENT,
                                                   field_name=['libraries.library_preparation.enzymes']),
        'LibraryPreparationFragmentationMethod': TSVDescriptor(field_type=EXPERIMENT,
                                                               field_name=['libraries.library_preparation.fragmentation_method']),
        'LibraryPreparationInsertSelectionMethod': TSVDescriptor(field_type=EXPERIMENT,
                                                                 field_name=['libraries.library_preparation.insert_selection_method']),
        'LibraryPreparationSizeSelectionMethod': TSVDescriptor(field_type=EXPERIMENT,
                                                               field_name=['libraries.library_preparation.size_selection_method']),
        'LibraryPreparationStrand': TSVDescriptor(field_type=EXPERIMENT,
                                                  field_name=['libraries.library_preparation.strand']),
        'LibraryPreparationTrimAdapterSequence': TSVDescriptor(field_type=EXPERIMENT,
                                                               field_name=['libraries.library_preparation.trim_adapter_sequence']),
        'LibraryPreparationTreatmentAgent': TSVDescriptor(field_type=EXPERIMENT,
                                                          field_name=['libraries.library_preparation.treatments.agent']),
        'LibraryTreatmentConcentration': TSVDescriptor(field_type=EXPERIMENT,
                                                       field_name=['libraries.library_preparation.treatments.concentration']),
        'LibraryPreparationTreatmentConcentrationUnits': TSVDescriptor(field_type=EXPERIMENT,
                                                                       field_name=['libraries.library_preparation.treatments.concentration_units']),
        'LibraryPreparationTreatmentDuration (min)': TSVDescriptor(field_type=EXPERIMENT,
                                                                   field_name=['libraries.library_preparation.treatments.duration']),
        'LibraryPreparationTreatmentTemperature (C)': TSVDescriptor(field_type=EXPERIMENT,
                                                                    field_name=['libraries.library_preparation.treatments.temperature']),
        'LibraryPreparationPreparationKitTitle': TSVDescriptor(field_type=EXPERIMENT,
                                                               field_name=['libraries.library_preparation.preparation_kits.title']),
        'LibraryPreparationPreparationKitCatalogNumber': TSVDescriptor(field_type=EXPERIMENT,
                                                                       field_name=['libraries.library_preparation.preparation_kits.catalog_number']),
        'LibraryPreparationPreparationKitVendor': TSVDescriptor(field_type=EXPERIMENT,
                                                                field_name=['libraries.library_preparation.preparation_kits.vendor']),
        'LibraryPreparationPreparationKitVersion': TSVDescriptor(field_type=EXPERIMENT,
                                                                 field_name=['libraries.library_preparation.preparation_kits.version']),

        # Sequencing fields
        'SequencingSequencer': TSVDescriptor(field_type=EXPERIMENT,
                                             field_name=['sequencing.sequencer.identifier']),
        'SequencingAdditionalNotes': TSVDescriptor(field_type=EXPERIMENT,
                                             field_name=['sequencing.additional_notes']),
        'SequencingFlowCell': TSVDescriptor(field_type=EXPERIMENT,
                                            field_name=['sequencing.flow_cell']),
        'SequencingMovieLength': TSVDescriptor(field_type=EXPERIMENT, field_name=['sequencing.movie_length']),
        'SequencingOnTargetRate': TSVDescriptor(field_type=EXPERIMENT, field_name=['sequencing.on_target_rate']),
        'SequencingReadType': TSVDescriptor(field_type=EXPERIMENT, field_name=['sequencing.read_type']),
        'SequencingTargetCoverage': TSVDescriptor(field_type=EXPERIMENT, field_name=['sequencing.target_coverage']),
        'SequencingTargetMonomerLength': TSVDescriptor(field_type=EXPERIMENT,
                                                       field_name=['sequencing.target_monomer_length']),
        'SequencingTargetReadCount': TSVDescriptor(field_type=EXPERIMENT,
                                                   field_name=['sequencing.target_read_count']),
        'SequencingTargetReadLength': TSVDescriptor(field_type=EXPERIMENT,
                                                    field_name=['sequencing.target_read_length']),
        'SequencingPreparationKitTitle': TSVDescriptor(field_type=EXPERIMENT,
                                                       field_name=['sequencing.preparation_kits.title']),
        'SequencingPreparationKitCatalogNumber': TSVDescriptor(field_type=EXPERIMENT,
                                                               field_name=['sequencing.preparation_kits.catalog_number']),
        'SequencingPreparationKitVendor': TSVDescriptor(field_type=EXPERIMENT,
                                                        field_name=['sequencing.preparation_kits.vendor']),
        'SequencingPreparationKitVersion': TSVDescriptor(field_type=EXPERIMENT,
                                                         field_name=['sequencing.preparation_kits.version'])
    }
}


def generate_manifest_header(download_file_name: str, manifest_enum: int, cli=False):
    """ Entrypoint for generating a header for manifest files """
    if manifest_enum == FILE:
        return generate_file_download_header(download_file_name, cli=cli)
    return generate_other_manifest_header(manifest_enum)


def generate_other_manifest_header(manifest_enum):
    """ Helper that generates a header for non-file manifests """
    header_length = len(list(TSV_MAPPING[manifest_enum].keys()))
    header1 = ['###', 'Metadata TSV Download', 'Column Count', f'{header_length}'] + ([''] * (header_length - 4))
    header2 = ['###', 'Metadata sheet ONLY, download file manifest for file downloads', 'Column Count',
               f'{header_length}'] + ([''] * (header_length - 4))
    header3 = list(TSV_MAPPING[manifest_enum].keys())
    return header1, header2, header3


def generate_file_download_header(download_file_name: str, cli=False):
    """ Helper function that generates a suitable header for the File download.
    
        Number of columns generated set in TSV_WIDTH
    """
    header1 = ['###', 'Metadata TSV Download', 'Column Count', TSV_WIDTH] + ([''] * (TSV_WIDTH-4))  # length 31
    if cli:
        header2 = ['Suggested command to download: ', '', '',
                   (f'cut -f 1,3 ./{download_file_name} | tail -n +4 | grep -v ^# | '
                    f'xargs -n 2 -L 1 sh -c \'credentials=$(curl -s -L '
                    f'--user <access_key_id>:<access_key_secret> "$0" '
                    '| jq -r ".download_credentials | {AccessKeyId, SecretAccessKey, SessionToken, download_url}") '
                    f'&& export AWS_ACCESS_KEY_ID=$(echo $credentials | jq -r ".AccessKeyId") '
                    f'&& export AWS_SECRET_ACCESS_KEY=$(echo $credentials | jq -r ".SecretAccessKey") '
                    f'&& export AWS_SESSION_TOKEN=$(echo $credentials | jq -r ".SessionToken") '
                    f'&& download_url=$(echo $credentials | jq -r ".download_url") '
                    f'&& aws s3 cp "$download_url" "$1"')] + ([''] * (TSV_WIDTH-4))
    else:
        header2 = ['Suggested command to download: ', '', '',
                   "cut -f 1,3 ./{} | tail -n +4 | grep -v ^# | xargs -n 2 -L 1 sh -c 'curl -L "
                   "--user <access_key_id>:<access_key_secret> $0 --output $1'".format(download_file_name)] + (
                              [''] * (TSV_WIDTH-4))
    header3 = list(TSV_MAPPING[FILE].keys())
    return header1, header2, header3


def extract_values(obj, field_parts):
    """
    Recursively traverses the object to extract values from nested dicts/lists
    according to the given path.
    """
    if obj is None:
        return []

    if not field_parts:
        if isinstance(obj, list):
            return obj
        return [obj]

    current_field = field_parts[0]
    remaining_fields = field_parts[1:]

    results = []

    if isinstance(obj, Mapping):
        next_obj = obj.get(current_field)
        return extract_values(next_obj, remaining_fields)

    elif isinstance(obj, Sequence) and not isinstance(obj, (str, bytes)):
        for item in obj:
            results.extend(extract_values(item, field_parts))

    return results


def descend_field(request, prop, field_names, cli=False):
    """
    Traverses the given property object according to potential field name paths.
    Handles nested dicts/lists and flattens multiple values into a sorted string,
    preserving native number types when applicable.

    Note: for tight per-row loops over thousands of search hits, prefer
    `descend_field_compiled` which avoids re-splitting paths on every call.
    """
    return descend_field_compiled(
        request, prop, field_names, [p.split('.') for p in field_names], cli=cli
    )


def descend_field_compiled(request, prop, raw_paths, split_paths, cli=False):
    """
    Same as `descend_field` but takes pre-split paths so the dot-split is
    hoisted out of the per-row loop. `raw_paths[i]` and `split_paths[i]` must
    correspond to the same logical path.
    """
    for raw_path, field_parts in zip(raw_paths, split_paths):
        values = extract_values(prop, field_parts)

        if not values:
            continue

        # Special handling for 'href'
        if raw_path == 'href':
            href = values[0]
            if not cli:
                return f'{request.scheme}://{request.host}{href}'
            return f'{request.scheme}://{request.host}{href.replace("@@download", "@@download_cli")}'

        # file_sets.file_group: return first valid value
        if raw_path == 'file_sets.file_group':
            val = values[0]
            if isinstance(val, Mapping) and 'file_group' in val:  # make resistent to further nesting
                return val.get('file_group')
            return val  # should always be the case

        # If only one value and it's a primitive, return it as-is
        if len(values) == 1:
            return values[0]

        # If list of primitives, return comma-separated values (strings for display),
        # but don't stringify numbers
        flat_values = [v for v in values if v is not None]
        if flat_values and all(isinstance(v, (str, int, float, bool)) for v in flat_values):
            sorted_vals = sorted(flat_values, key=lambda x: str(x))
            return ','.join(map(str, sorted_vals))

    return None


def _compile_tsv_mapping(tsv_mapping):
    """Precompute per-row constants for a TSV mapping.

    Returns a list of (field_name, raw_paths, split_paths, use_base_metadata)
    tuples. Hoisting `.field_name()`, the split on '.', and `.use_base_metadata()`
    out of the per-row loop saves ~3 attribute/method calls per (file × column),
    which is non-trivial for thousands of files × ~27 columns.
    """
    compiled = []
    for field_name, tsv_descriptor in tsv_mapping.items():
        raw_paths = tsv_descriptor.field_name()
        split_paths = [p.split('.') for p in raw_paths]
        compiled.append((field_name, raw_paths, split_paths, tsv_descriptor.use_base_metadata()))
    return compiled


# ES batch size for streaming /metadata queries. With search_after pagination
# (used by execute_streaming_search) there's no per-page upper bound, so we
# size for fewer round trips against thousands of accessions while staying
# below typical ES coordinator memory budgets.
_METADATA_ES_BATCH_SIZE = 1000

# Per-batch timeout for direct ES calls. Each search_after page must complete
# within this; the total streaming duration is allowed to exceed it.
_METADATA_ES_TIMEOUT = '60s'


def _build_metadata_es_filter(request, type_param, accessions=None,
                              status=None, uuids=None):
    """Construct the ES `bool.filter` for a /metadata query.

    Reproduces only the filters relevant to /metadata:
    - the standard view-permission filter (so the caller can't read items
      they're not authorized to see),
    - a type filter on the indexed @type list (so subtypes match — e.g.
      `File` matches OutputFile/SubmittedFile/ReferenceFile),
    - optional accession / status / uuid filters.

    Deliberately omits snovault's default status!=deleted and status!=replaced
    exclusions because /metadata callers pass explicit accession lists and
    expect those items returned regardless of status. If that turns out to be
    wrong for some workflow, add the exclusion here, gated on `status` being
    unset by the caller.
    """
    item_type = type_param or 'File'
    filter_clauses = [
        build_permission_filter(request),
        {'terms': {'embedded.@type.raw': [item_type]}},
    ]
    if accessions:
        filter_clauses.append({'terms': {'embedded.accession.raw': list(accessions)}})
    if uuids:
        filter_clauses.append({'terms': {'embedded.uuid.raw': list(uuids)}})
    if status:
        filter_clauses.append({'terms': {'embedded.status.raw': [status]}})
    return {'bool': {'filter': filter_clauses}}


def _stream_metadata_items(request, *, type_param, accessions=None, status=None,
                           uuids=None, source_fields, sort_param=None):
    """Stream `embedded` views of items matching the metadata query.

    This is the workhorse that lets /metadata scale to thousands of files
    without timing out. It bypasses snovault.search.search() entirely —
    that function computes ALL default facets for the item type on every
    paginated batch, and uses from/size pagination (O(N^2) total). Both
    were dominating wall-clock time for large manifests.

    Yields one `embedded` dict per hit. Source filtering keeps each hit's
    payload to the columns the TSV actually reads.
    """
    es = request.registry[ELASTIC_SEARCH]
    es_index = get_es_index(request, [type_param or 'File'])

    # search_after needs a stable, unique sort. The user's sort_param is
    # applied as the primary key when present; uuid acts as the unique
    # tiebreaker so we never skip or duplicate documents at page boundaries.
    sort_fields = []
    if sort_param:
        sort_fields.append({f'embedded.{sort_param}.raw': {'order': 'asc'}})
    sort_fields.append({'embedded.uuid.raw': {'order': 'asc'}})

    source_includes = (
        [f'embedded.{p}' for p in source_fields]
        + ['embedded.@id', 'embedded.@type', 'embedded.uuid']
    )

    query = _build_metadata_es_filter(
        request, type_param, accessions=accessions, status=status, uuids=uuids,
    )
    for source in execute_streaming_search(
        es,
        index=es_index,
        query=query,
        source_includes=source_includes,
        sort_fields=sort_fields,
        batch_size=_METADATA_ES_BATCH_SIZE,
        timeout=_METADATA_ES_TIMEOUT,
    ):
        # `_source` is shaped `{'embedded': {...}}` because we asked for
        # `embedded.*` includes. Hand the embedded view to the caller —
        # that's what the existing generators expect.
        yield source.get('embedded', {})


def _facets_via_search(request, params):
    """Forward to snovault `/search` and return its `facets` array as-is.

    Plain pass-through — snovault knows how to build the filter (nested-field
    handling, type-subtype expansion, default `status!=deleted/replaced`
    exclusions, principal filtering) and produces the facet array shape every
    peek-metadata UI consumer already reads. Reusing it avoids re-implementing
    those details in Python.

    `limit=0` suppresses hit fetching since callers only read `result['facets']`.

    For the File-with-thousands-of-accessions case the POST path uses the
    streaming aggregator instead — that's a different problem (URL bloat +
    aggregation coordination timeout). Everything else goes through here.
    """
    forwarded = MultiDict()
    for key in params.keys():
        if key in ('limit', 'from'):
            continue
        for value in params.getall(key):
            forwarded.add(key, value)
    forwarded.add('limit', '0')

    subreq = make_search_subreq(
        request,
        '/search?{}'.format(urlencode(list(forwarded.items()), True)),
        inherit_user=True,
    )
    return search(None, subreq).get('facets', []) or []


def _aggregate_metadata_file_size(request, *, type_param, accessions=None,
                                  status=None, include_extra_files=False):
    """Compute the peek-metadata file_size summary by streaming matching docs.

    Why this is faster than an ES aggregation: /metadata already proves that
    streaming the same filter set with search_after is quick (each batch
    returns ~1000 hits in a few hundred ms). The previous implementations
    asked ES to produce a single aggregated answer — that forces every shard
    to scan every matched document and the coordinator to wait for the
    slowest shard before responding. For multi-shard, multi-index queries
    (File spans every File-subtype index) that's been pushing past the
    upstream 30s timeout.

    Streaming the matching docs and summing in Python avoids the
    aggregation phase entirely while reusing /metadata's already-fast
    `execute_streaming_search` path. For 5K matching docs that's roughly
    5 ES batches × a few hundred ms each — well within the timeout.

    We only ask ES for the fields we'll actually read, so each hit's
    payload is tiny.
    """
    source_fields = ['file_size']
    if include_extra_files:
        # Include the whole extra_files array per doc; we walk it client-side.
        # extra_files isn't nested-mapped in this schema, so a nested ES
        # aggregation would have either errored or matched nothing — the
        # client-side walk sidesteps that entire question.
        source_fields.append('extra_files')

    # Two counts: `total` is "matched docs" (analog of `hits.total.value`),
    # `file_size_count` is "matched docs that have file_size set" (analog of
    # an ES `stats` aggregation's count, which the UI reads as facet.count).
    # The distinction matters for item types where not every record carries
    # a file_size — without it, we'd inflate the count vs the previous
    # ES-aggregation-based implementation.
    total = 0
    file_size_count = 0
    file_size_sum = 0
    file_size_min = None
    file_size_max = None
    extra_files_size_sum = 0
    extra_files_count = 0
    extra_files_size_min = None
    extra_files_size_max = None

    for source in _stream_metadata_items(
        request,
        type_param=type_param,
        accessions=accessions,
        status=status,
        source_fields=source_fields,
    ):
        total += 1
        fs = source.get('file_size')
        if fs is not None:
            file_size_count += 1
            file_size_sum += fs
            if file_size_min is None or fs < file_size_min:
                file_size_min = fs
            if file_size_max is None or fs > file_size_max:
                file_size_max = fs
        if include_extra_files:
            for ef in source.get('extra_files') or ():
                ef_size = ef.get('file_size') if isinstance(ef, Mapping) else None
                if ef_size is not None:
                    extra_files_size_sum += ef_size
                    extra_files_count += 1
                    if extra_files_size_min is None or ef_size < extra_files_size_min:
                        extra_files_size_min = ef_size
                    if extra_files_size_max is None or ef_size > extra_files_size_max:
                        extra_files_size_max = ef_size

    aggs = {
        'file_size': {
            'count': file_size_count,
            'min': file_size_min,
            'max': file_size_max,
            'avg': (file_size_sum / file_size_count) if file_size_count else None,
            'sum': file_size_sum,
        },
    }
    if include_extra_files:
        # Mirror the shape the response formatter already handles for
        # ES-returned nested aggregations — full stats (count/min/max/avg/sum)
        # so consumers can use the same fields they would on the file_size facet.
        aggs['extra_files_file_size'] = {
            'sum': {'value': extra_files_size_sum},
            'count': extra_files_count,
            'min': extra_files_size_min,
            'max': extra_files_size_max,
            'avg': (extra_files_size_sum / extra_files_count) if extra_files_count else None,
        }

    return {
        'hits': {'total': {'value': total}},
        'aggregations': aggs,
    }


def _collect_source_fields(tsv_mapping, include_extra_files):
    """Collect the set of embedded paths needed to populate a TSV.

    Used to pass `field=` params to the search so Elasticsearch returns only
    the source fields actually consumed by the manifest generator, instead of
    the full embedded document per file (which can be multi-MB for large
    Files with many file_sets, libraries, samples, donors, etc).

    Returns a sorted list of unique paths.
    """
    fields = set()
    for tsv_descriptor in tsv_mapping.values():
        for path in tsv_descriptor.field_name():
            fields.add(path)
    if include_extra_files:
        # `extra_files` is a list of nested objects mirroring the parent file
        # for the fields where `use_base_metadata=False`. Pull both the bare
        # `extra_files` (so the iteration loop sees the array) and any
        # per-extra-file paths the manifest will read.
        fields.add('extra_files')
        for tsv_descriptor in tsv_mapping.values():
            if not tsv_descriptor.use_base_metadata():
                for path in tsv_descriptor.field_name():
                    fields.add(f'extra_files.{path}')
    return sorted(fields)


def handle_file_group(field: dict) -> str:
    """ Transforms the file_group into a single string """
    if field:
        sc_part = field['submission_center']
        sample_source_part = field['sample_source']
        sequencing_part = field['sequencing']
        assay_part = field['assay']
        group_str = f'{sc_part}-{sample_source_part}-{sequencing_part}-{assay_part}'
        if (group_tag := field['group_tag']):
            group_str = group_str+f"-{group_tag}"
        return group_str
    return ''


def handle_sample_type(field: dict) -> str:
    """Transforms the sample type to return most specific value."""
    if field:
        field_types = field.split(',')
        for sample in SAMPLE_TYPE_LIST:
            if sample in field_types:
                return sample
    return ''


def handle_sample_source_type(field: dict) -> str:
    """Transforms the sample source type to return most specific value."""
    if field:
        field_types = field.split(',')
        for sample_source in SAMPLE_SOURCE_TYPE_LIST:
            if sample_source in field_types:
                return sample_source
    return ''


def generate_tsv(header: Tuple, data_lines: list):
    """ Helper function that actually generates the TSV """
    line = DummyFileInterfaceImplementation()
    writer = csv.writer(line, delimiter='\t')
    # write the header
    for header_row in header:
        writer.writerow(
            header_row
        )
        yield line.read().encode('utf-8')

    # write the data
    for entry in data_lines:
        writer.writerow(entry)
        yield line.read().encode('utf-8')


def handle_metadata_arguments(context, request):
    """ Helper function that processes arguments for the metadata.tsv related API endpoints """
    ignored(context)
    # Process arguments
    if request.content_type == 'application/json':
        try:
            post_params = request.json_body
            manifest_enum = int(post_params.get('manifest_enum', FILE))
            accessions = post_params.get('accessions', [])
            type_param = post_params.get('type')
            sort_param = post_params.get('sort')
            status = post_params.get('status')
            cli = post_params.get('cli', False)
            download_file_name = post_params.get('download_file_name')
            include_extra_files = post_params.get('include_extra_files', False)
        except json.JSONDecodeError:
            return Response("Invalid JSON format", status=400)
    elif request.content_type == 'application/x-www-form-urlencoded':
        post_params = request.POST
        accessions = json.loads(post_params.get('accessions', ''))
        manifest_enum = int(post_params.get('manifest_enum', FILE))
        type_param = post_params.get('type')
        sort_param = post_params.get('sort')
        status = post_params.get('status')
        cli = post_params.get('cli', False)
        download_file_name = post_params.get('download_file_name')
        include_extra_files = post_params.get('include_extra_files', False)
    else:
        return Response("Unsupported media type", status=415)

    # One of type param or accessions must be passed
    if not type_param and 'accessions' not in post_params:
        return Response("Invalid parameters", status=400)

    if download_file_name is None:
        download_file_name = f'smaht_manifest_{manifest_enum}' + datetime.utcnow().strftime('%Y-%m-%d-%Hh-%Mm') + '.tsv'

    # Generate a header, resolve mapping
    header = generate_manifest_header(download_file_name, manifest_enum, cli=cli)
    tsv_mapping = TSV_MAPPING[manifest_enum]
    return MetadataArgs(accessions, manifest_enum, sort_param, type_param, status, include_extra_files,
                        download_file_name, header, tsv_mapping, cli)


@view_config(route_name='peek_metadata', request_method=['GET', 'POST'])
@debug_log
def peek_metadata(context, request):
    """ Lightweight preview endpoint used by the UI to summarize a manifest
        before download (file count, total size).

        Implementation: a single ES aggregation query. The previous
        implementation went through snovault.search() which forced computation
        of every default facet for the type (~15-20 aggregations for File),
        each scanning every document matching the (often thousands of)
        accessions — that was the source of upstream 504s.
    """
    args = handle_metadata_arguments(context, request)

    # GET path — forward URL params verbatim to /search. Type-agnostic; the
    # caller gets the same facets `/search?<their-params>` would return,
    # which is what the legacy fallback did. This preserves callers like
    # ProtectedDonorViewDataCards.js that read default facets (e.g. `type`)
    # from the response.
    if isinstance(args, Response):
        return _facets_via_search(request, request.params)

    # POST path — always use the streaming aggregator. peek-metadata POSTs
    # come from File-related callers (SelectAllAboveTableComponent + the
    # legacy file_size summary use case) and the only facet they read off
    # the response is `file_size` / `extra_files.file_size`. The streaming
    # aggregator:
    #   - returns a stats-shaped facet regardless of how the schema's facets
    #     config is set (necessary for the test assertions that check
    #     count/min/max/sum, which would otherwise depend on whether the
    #     smaht-portal schema specifies aggregation_type=stats for file_size
    #     — it currently does not),
    #   - completes in O(N) document scans without an ES stats aggregation
    #     coordination step (avoiding the upstream-timeout class of bugs
    #     when accessions lists are large),
    #   - works for File and every File subtype (OutputFile, SubmittedFile,
    #     etc.) since `_stream_metadata_items` resolves the type to the right
    #     index set via `get_es_index`.
    es_result = _aggregate_metadata_file_size(
        request,
        type_param=args.type_param,
        accessions=args.accessions,
        status=args.status,
        include_extra_files=args.include_extra_files,
    )
    return _format_file_size_facets(es_result, args.include_extra_files)


def _format_file_size_facets(es_result, include_extra_files) -> list:
    """Format the streaming-aggregation result into snovault's facets array shape.

    Only used by the File download summary fast path; the general path lets
    snovault.search() emit the facets array directly.
    """
    aggs = es_result.get('aggregations') or {}
    file_size_stats = aggs.get('file_size') or {}
    total = ((es_result.get('hits') or {}).get('total') or {}).get('value', 0)

    facets = [{
        'field': 'file_size',
        'title': 'File Size',
        'aggregation_type': 'stats',
        'total': total,
        'count': file_size_stats.get('count', 0),
        'min': file_size_stats.get('min'),
        'max': file_size_stats.get('max'),
        'avg': file_size_stats.get('avg'),
        'sum': file_size_stats.get('sum', 0),
    }]

    if include_extra_files:
        ef_agg = aggs.get('extra_files_file_size') or {}
        ef_sum = ((ef_agg.get('sum') or {}).get('value')) or 0
        facets.append({
            'field': 'extra_files.file_size',
            'title': 'Extra Files Size',
            'aggregation_type': 'stats',
            'total': total,
            'count': ef_agg.get('count', 0),
            'min': ef_agg.get('min'),
            'max': ef_agg.get('max'),
            'avg': ef_agg.get('avg'),
            'sum': ef_sum,
        })

    return facets


def generate_file_manifest(request, args, search_iter, cli):
    """ Generator that yields one TSV row at a time for the file manifest.

    Yielding rows (vs. accumulating into a list) keeps memory constant in the
    number of files. For thousands of files × ~27 columns, the old list-based
    approach buffered the entire TSV in memory before any bytes left the server.
    """
    compiled = _compile_tsv_mapping(args.tsv_mapping)
    for file in search_iter:
        line = []
        for field_name, raw_paths, split_paths, _use_base in compiled:
            field = descend_field_compiled(request, file, raw_paths, split_paths, cli=cli) or ''
            if field and field_name == FILE_GROUP:  # requires special care
                field = handle_file_group(field)
            line.append(field)
        yield line

        # Repeat the above process for extra files
        # This requires extra care - most fields we take from extra_files directly,
        # but some must be taken from the parent metadata, such as anything related to library/assay/sample
        # or the file merge group
        if args.include_extra_files and 'extra_files' in file:
            for ef in file.get('extra_files') or ():
                ef_line = []
                for field_name, raw_paths, split_paths, use_base in compiled:
                    source = file if use_base else ef
                    field = descend_field_compiled(request, source, raw_paths, split_paths, cli=cli) or ''
                    if use_base and field and field_name == FILE_GROUP:  # requires special care
                        field = handle_file_group(field)
                    ef_line.append(field)
                yield ef_line


def generate_sample_manifest(request, args, search_iter):
    """ For the sample manifest, we first traverse the original search_iter for sample IDs, then
        execute another search to retrieve all those samples and write the manifest from
        that search. Yields one TSV row at a time so memory stays constant.
    """
    # Extract unique sample UUIDs using a set for O(1) dedupe (was O(n) per insertion)
    samples = set()
    for f in search_iter:
        for sample in f.get('samples', []) or ():
            uuid = sample.get('uuid') if isinstance(sample, Mapping) else sample
            if uuid:
                samples.add(uuid)

    # if no samples detected, manifest is empty
    if not samples:
        return

    # Direct ES streaming search — no default facets, no URL serialization
    # of the (possibly thousands of) sample UUIDs, search_after pagination.
    sample_search_iter = _stream_metadata_items(
        request,
        type_param='Sample',
        uuids=samples,
        source_fields=_collect_source_fields(args.tsv_mapping, include_extra_files=False),
    )

    compiled = _compile_tsv_mapping(args.tsv_mapping)
    for sample in sample_search_iter:
        line = []
        for field_name, raw_paths, split_paths, _use_base in compiled:
            field = descend_field_compiled(request, sample, raw_paths, split_paths) or ''
            if field:
                if field_name == SAMPLE_TYPE:
                    field = handle_sample_type(field)
                elif field_name == SAMPLE_SOURCE_TYPE:
                    field = handle_sample_source_type(field)
            line.append(field)
        yield line


def generate_analyte_manifest(request, args, search_iter):
    """ For the experiment manifest (analyte), we can extract analytes from files to get
        the various fields. Yields one TSV row at a time so memory stays constant.
    """
    analytes = set()
    for f in search_iter:
        for analyte in f.get('analytes', []) or ():
            uuid = analyte.get('uuid') if isinstance(analyte, Mapping) else analyte
            if uuid:
                analytes.add(uuid)

    if not analytes:
        return

    analyte_search_iter = _stream_metadata_items(
        request,
        type_param='Analyte',
        uuids=analytes,
        source_fields=_collect_source_fields(args.tsv_mapping, include_extra_files=False),
    )

    compiled = _compile_tsv_mapping(args.tsv_mapping)
    for analyte in analyte_search_iter:
        line = []
        for _field_name, raw_paths, split_paths, _use_base in compiled:
            field = descend_field_compiled(request, analyte, raw_paths, split_paths) or ''
            line.append(field)
        yield line


def generate_experimental_manifest(request, args, search_iter):
    """ Generates data lines for an experimental manifest file, similar to sample
        but based on fileset - both versions of the experiment manifest focus on
        fileset, so the same functionality can be used with different tsv mappings.
        Yields one TSV row at a time so memory stays constant.
    """
    # Extract the FIRST file_set UUID per file (preserving existing semantics)
    file_sets = set()
    for f in search_iter:
        fs = f.get('file_sets', [])
        if fs:
            first = fs[0]
            uuid = first.get('uuid') if isinstance(first, Mapping) else first
            if uuid:
                file_sets.add(uuid)

    if not file_sets:
        return

    file_set_search_iter = _stream_metadata_items(
        request,
        type_param='FileSet',
        uuids=file_sets,
        source_fields=_collect_source_fields(args.tsv_mapping, include_extra_files=False),
    )

    compiled = _compile_tsv_mapping(args.tsv_mapping)
    for fs in file_set_search_iter:
        line = []
        for _field_name, raw_paths, split_paths, _use_base in compiled:
            field = descend_field_compiled(request, fs, raw_paths, split_paths) or ''
            line.append(field)
        yield line


@view_config(route_name='metadata', request_method=['GET', 'POST'])
@debug_log
def metadata_tsv(context, request):
    """
    In Fourfront, there is custom structure looking for what is referred to as 'accession_triples', which is essentially
    a 3-tuple containing lists of accesions that are either experiment sets, experiments or files

    In SMaHT, in order to preserve similar structure, we eliminate logic for the first two (ExpSet and Exp) presuming
    we will want to use those slots later, and provide only the files slot for now.

    Alternatively, can accept a GET request wherein all files from ExpSets matching search query params are included.
    """
    args = handle_metadata_arguments(context, request)

    # Pick the source fields the top-level streaming search needs to fetch.
    # For FILE the manifest reads from these documents directly, so we need
    # every TSV column path. For sub-entity manifests we only need the
    # discriminator the secondary search keys off — the rest of the columns
    # are fetched by that secondary call.
    if args.manifest_enum == FILE:
        source_fields = _collect_source_fields(
            args.tsv_mapping, include_extra_files=args.include_extra_files,
        )
    elif args.manifest_enum == SAMPLE:
        source_fields = ['samples.uuid']
    elif args.manifest_enum == EXPERIMENT_ANALYTE:
        source_fields = ['analytes.uuid']
    elif args.manifest_enum == EXPERIMENT_LIBRARY:
        source_fields = ['file_sets.uuid']
    else:
        source_fields = []

    # Stream the top-level matches directly from Elasticsearch. The previous
    # path went through snovault.search() / get_iterable_search_results, which
    # computed every default facet for the type on every paginated batch and
    # used O(N^2) from/size pagination — together that was the source of
    # 504s on requests with thousands of accessions.
    cli = args.cli
    search_iter = _stream_metadata_items(
        request,
        type_param=args.type_param,
        accessions=args.accessions,
        status=args.status,
        sort_param=args.sort_param,
        source_fields=source_fields,
    )
    if args.manifest_enum == SAMPLE:
        data_lines = generate_sample_manifest(request, args, search_iter)
    elif args.manifest_enum == FILE:
        data_lines = generate_file_manifest(request, args, search_iter, cli)
    elif args.manifest_enum == EXPERIMENT_LIBRARY:
        data_lines = generate_experimental_manifest(request, args, search_iter)
    elif args.manifest_enum == EXPERIMENT_ANALYTE:
        data_lines = generate_analyte_manifest(request, args, search_iter)
    elif args.manifest_enum == CLINICAL:
        raise Exception('EXPERIMENT manifests not supported at this time')
    else:
        raise Exception('Invalid manifest enum provided')
    return Response(
        content_type='text/tsv',
        app_iter=generate_tsv(args.header, data_lines),
        content_disposition=f'attachment;filename={args.download_file_name}'
    )
