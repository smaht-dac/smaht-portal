from pyramid.view import view_config
from pyramid.response import Response
from snovault.util import debug_log
from dcicutils.misc_utils import ignored
from snovault.search.search import (
    get_iterable_search_results, search
)
from snovault.search.search_utils import make_search_subreq
from typing import Tuple, NamedTuple, List
from urllib.parse import urlencode
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


# Encode manifest file types
FILE = 0
CLINICAL = 1
SAMPLE = 2
EXPERIMENT = 3
EXPERIMENT_ANALYTE = 4
EXPERIMENT_LIBRARY = 5


# This field is special because it is a transformation applied from other fields
FILE_GROUP = 'FileGroup'


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
                                  field_name=['annotated_filename', 'filename', 'display_title']),
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
        'DataType': TSVDescriptor(field_type=FILE,
                                  field_name=['data_type'],
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
        'AnalyteAccessions': TSVDescriptor(field_type=FILE,
                                           field_name=['analytes.accession'],
                                           use_base_metadata=True),
        'Sequencer': TSVDescriptor(field_type=FILE,
                                   field_name=['sequencing.sequencer.display_title'],
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
                                       field_name=['quality_metrics.overall_quality_status'],
                                       use_base_metadata=True),
        FILE_GROUP: TSVDescriptor(field_type=FILE,
                                  field_name=['file_sets.file_group'],
                                  use_base_metadata=False)   # omit this field on extra files
    },

    # Clinical (Donor) manifest - method TBD, this will be complex as it cannot all be resolved from
    # one search but rather several types that do not have direct link
    CLINICAL: {
        'dummy': TSVDescriptor(field_type=CLINICAL,
                               field_name=['dummy'],
                               use_base_metadata=True)
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
        'TissueProsecutorNotes': TSVDescriptor(field_type=SAMPLE,
                                               field_name=['sample_sources.prosecutor_notes'],
                                               use_base_metadata=True),
        'TissueRecoveryDatetime': TSVDescriptor(field_type=SAMPLE,
                                                field_name=['sample_sources.recovery_datetime'],
                                                use_base_metadata=True),
        'TissueSize': TSVDescriptor(field_type=SAMPLE,
                                    field_name=['sample_sources.size'],
                                    use_base_metadata=True),
        'TissueSizeUnit': TSVDescriptor(field_type=SAMPLE,
                                        field_name=['sample_sources.size_unit'],
                                        use_base_metadata=True),
        'TissueUberonId': TSVDescriptor(field_type=SAMPLE,
                                        field_name=['sample_sources.uberon_id'],
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
                                      field_name=['sample_sources.code'],
                                      use_base_metadata=True),
        'CellLineParentCellLines': TSVDescriptor(field_type=SAMPLE,
                                                 field_name=['sample_sources.parent_cell_lines'],
                                                 use_base_metadata=True),
        'CellLineSource': TSVDescriptor(field_type=SAMPLE,
                                        field_name=['sample_sources.source'],
                                        use_base_metadata=True),
        'CellLineUrl': TSVDescriptor(field_type=SAMPLE,
                                     field_name=['sample_sources.url'],
                                     use_base_metadata=True),

    },
    EXPERIMENT_ANALYTE: {
        # Top level fields
        'FileSetAccession': TSVDescriptor(field_type=EXPERIMENT, field_name=['accession']),
        'SampleAccession': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.analytes.samples.accession']),
        'DonorAccession': TSVDescriptor(field_type=EXPERIMENT, field_name=['donors.accession']),

        # Analyte Fields
        'AnalyteMolecule': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.analytes.molecule']),
        'AnalyteMoleculeDetail': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.analytes.molecule_detail']),
        'AnalyteA260A280Ratio': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.analytes.a260_a280_ratio']),
        'AnalyteAverageFragmentSize': TSVDescriptor(field_type=EXPERIMENT,
                                                    field_name=['libraries.analytes.average_fragment_size']),
        'AnalyteConcentration': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.analytes.concentration']),
        'AnalyteConcentrationUnit': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.analytes.concentration_unit']),
        'AnalyteDescription': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.analytes.description']),
        'AnalyteDnaIntegrityNumber': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.analytes.dna_integrity_number']),
        'AnalyteDnaIntegrityNumberInstrument': TSVDescriptor(field_type=EXPERIMENT,
                                                             field_name=['libraries.analytes.dna_integrity_number_instrument']),
        'AnalyteDnaQualityNumber': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.analytes.dna_quality_number']),
        'AnalyteDnaQualityNumberInstrument': TSVDescriptor(field_type=EXPERIMENT,
                                                           field_name=['libraries.analytes.dna_quality_number_instrument']),
        'AnalyteDnaQualitySizeThreshold': TSVDescriptor(field_type=EXPERIMENT,
                                                        field_name=['libraries.analytes.dna_quality_size_threshold']),
        'AnalyteExternalId': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.analytes.external_id']),
        'AnalyteGenomicQualityNumber': TSVDescriptor(field_type=EXPERIMENT,
                                                     field_name=['libraries.analytes.genomic_quality_number']),
        'AnalyteGenomicQualityNumberInstrument': TSVDescriptor(field_type=EXPERIMENT,
                                                               field_name=['libraries.analytes.genomic_quality_number_instrument']),
        'AnalyteGenomicQualityNumberSizeThreshold': TSVDescriptor(field_type=EXPERIMENT,
                                                                  field_name=['libraries.analytes.genomic_quality_number_size_threshold']),
        'AnalyteQuantitationMethod': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.analytes.quantitation_method']),
        'AnalyteRibosomalRnaRatio': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.analytes.ribosomal_rna_ratio']),
        'AnalyteRnaIntegrityNumber': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.analytes.rna_integrity_number']),
        'AnalyteRnaIntegrityNumberInstrument': TSVDescriptor(field_type=EXPERIMENT,
                                                             field_name=['libraries.analytes.rna_integrity_number_instrument']),
        'AnalyteSampleQuantity': TSVDescriptor(field_type=EXPERIMENT,
                                               field_name=['libraries.analytes.sample_quantity']),
        'AnalyteSampleQuantityUnit': TSVDescriptor(field_type=EXPERIMENT,
                                                   field_name=['libraries.analytes.sample_quantity_unit']),
        'AnalyteTotalYield': TSVDescriptor(field_type=EXPERIMENT,
                                           field_name=['libraries.analytes.total_yield']),
        'AnalyteVolume': TSVDescriptor(field_type=EXPERIMENT,
                                       field_name=['libraries.analytes.volume']),
        'AnalyteVolumeUnit': TSVDescriptor(field_type=EXPERIMENT,
                                           field_name=['libraries.analytes.volume unit']),
        'AnalyteYieldPerUnit': TSVDescriptor(field_type=EXPERIMENT,
                                             field_name=['libraries.analytes.yield_per_unit']),
        'AnalyteYieldUnit': TSVDescriptor(field_type=EXPERIMENT,
                                          field_name=['libraries.analytes.yield_unit']),

        # Analyte preperation fields
        'AnalytePreparationCellLysisMethod': TSVDescriptor(field_type=EXPERIMENT,
                                                           field_name=['libraries.analytes.analyte_preparation.cell_lysis_method']),
        'AnalytePreparationDescription': TSVDescriptor(field_type=EXPERIMENT,
                                                       field_name=['libraries.analytes.analyte_preparation.description']),
        'AnalytePreparationExtractionMethod': TSVDescriptor(field_type=EXPERIMENT,
                                                            field_name=['libraries.analytes.analyte_preparation.extraction_method']),
        'AnalytePreparationHomogenizationMethod': TSVDescriptor(field_type=EXPERIMENT,
                                                                field_name=['libraries.analytes.analyte_preparation.homogenization_method']),
        'AnalytePreparationSuspensionType': TSVDescriptor(field_type=EXPERIMENT,
                                                          field_name=['libraries.analytes.analyte_preparation.suspension_type']),
        'AnalytePreparationTreatmentAgent': TSVDescriptor(field_type=EXPERIMENT,
                                                          field_name=['libraries.analytes.analyte_preparation.treatment.agent']),
        'AnalytePreparationTreatmentConcentration': TSVDescriptor(field_type=EXPERIMENT,
                                                                  field_name=['libraries.analytes.analyte_preparation.treatment.concentration']),
        'AnalytePreparationTreatmentConcentrationUnits': TSVDescriptor(field_type=EXPERIMENT,
                                                                       field_name=['libraries.analytes.analyte_preparation.treatment.concentration_units']),
        'AnalytePreparationTreatmentDuration (min)': TSVDescriptor(field_type=EXPERIMENT,
                                                                   field_name=['libraries.analytes.analyte_preparation.treatment.duration']),
        'AnalytePreparationTreatmentTemperature (C)': TSVDescriptor(field_type=EXPERIMENT,
                                                                    field_name=['libraries.analytes.analyte_preparation.treatment.temperature']),
        'AnalytePreparationPreparationKitTitle': TSVDescriptor(field_type=EXPERIMENT,
                                                               field_name=['libraries.analytes.analyte_preparation.preparation_kit.title']),
        'AnalytePreparationPreparationKitCatalogNumber': TSVDescriptor(field_type=EXPERIMENT,
                                                                       field_name=['libraries.analytes.analyte_preparation.preparation_kit.catalog_number']),
        'AnalytePreparationPreparationKitVendor': TSVDescriptor(field_type=EXPERIMENT,
                                                                field_name=['libraries.analytes.analyte_preparation.preparation_kit.vendor']),
        'AnalytePreparationPreparationKitVersion': TSVDescriptor(field_type=EXPERIMENT,
                                                                 field_name=['libraries.analytes.analyte_preparation.preparation_kit.version'])
    },
    EXPERIMENT_LIBRARY: {
        # Top level fields
        'FileSetAccession': TSVDescriptor(field_type=EXPERIMENT, field_name=['accession']),
        'SampleAccession': TSVDescriptor(field_type=EXPERIMENT, field_name=['libraries.analytes.samples.accession']),
        'DonorAccession': TSVDescriptor(field_type=EXPERIMENT, field_name=['donors.accession']),

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
                                                          field_name=['libraries.library_preparation.treatment.agent']),
        'LibraryTreatmentConcentration': TSVDescriptor(field_type=EXPERIMENT,
                                                       field_name=['libraries.treatment.concentration']),
        'LibraryPreparationTreatmentConcentrationUnits': TSVDescriptor(field_type=EXPERIMENT,
                                                                       field_name=['libraries.library_preparation.treatment.concentration_units']),
        'LibraryPreparationTreatmentDuration (min)': TSVDescriptor(field_type=EXPERIMENT,
                                                                   field_name=['libraries.library_preparation.treatment.duration']),
        'LibraryPreparationTreatmentTemperature (C)': TSVDescriptor(field_type=EXPERIMENT,
                                                                    field_name=['libraries.library_preparation.treatment.temperature']),
        'LibraryPreparationPreparationKitTitle': TSVDescriptor(field_type=EXPERIMENT,
                                                               field_name=['libraries.library_preparation.preparation_kit.title']),
        'LibraryPreparationPreparationKitCatalogNumber': TSVDescriptor(field_type=EXPERIMENT,
                                                                       field_name=['libraries.library_preparation.preparation_kit.catalog_number']),
        'LibraryPreparationPreparationKitVendor': TSVDescriptor(field_type=EXPERIMENT,
                                                                field_name=['libraries.library_preparation.preparation_kit.vendor']),
        'LibraryPreparationPreparationKitVersion': TSVDescriptor(field_type=EXPERIMENT,
                                                                 field_name=['libraries.library_preparation.preparation_kit.version']),

        # Sequencing fields
        'SequencingSequencer': TSVDescriptor(field_type=EXPERIMENT,
                                             field_name=['sequencing.sequencer.name']),
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
                                                       field_name=['sequencing.preparation_kit.title']),
        'SequencingPreparationKitCatalogNumber': TSVDescriptor(field_type=EXPERIMENT,
                                                               field_name=['sequencing.preparation_kit.catalog_number']),
        'SequencingPreparationKitVendor': TSVDescriptor(field_type=EXPERIMENT,
                                                        field_name=['sequencing.preparation_kit.vendor']),
        'SequencingPreparationKitVersion': TSVDescriptor(field_type=EXPERIMENT,
                                                         field_name=['sequencing.preparation_kit.version'])
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
    """ Helper function that generates a suitable header for the File download, generating 22 columns"""
    header1 = ['###', 'Metadata TSV Download', 'Column Count', '18'] + ([''] * 18)  # length 22
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
                    f'&& aws s3 cp "$download_url" "$1"')] + ([''] * 18)
    else:
        header2 = ['Suggested command to download: ', '', '',
                   "cut -f 1,3 ./{} | tail -n +4 | grep -v ^# | xargs -n 2 -L 1 sh -c 'curl -L "
                   "--user <access_key_id>:<access_key_secret> $0 --output $1'".format(download_file_name)] + (
                              [''] * 18)
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
    """
    for possible_field in field_names:
        field_parts = possible_field.split('.')
        values = extract_values(prop, field_parts)

        if not values:
            continue

        # Special handling for 'href'
        if possible_field == 'href':
            href = values[0]
            if not cli:
                return f'{request.scheme}://{request.host}{href}'
            return f'{request.scheme}://{request.host}{href.replace("@@download", "@@download_cli")}'

        # file_sets.file_group: return first valid value
        if possible_field == 'file_sets.file_group':
            val = values[0]
            if isinstance(val, Mapping):
                return val.get('file_group')
            return val

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


def handle_file_group(field: dict) -> str:
    """ Transforms the file_group into a single string """
    if field:
        sc_part = field['submission_center']
        sample_source_part = field['sample_source']
        sequencing_part = field['sequencing']
        assay_part = field['assay']
        return f'{sc_part}-{sample_source_part}-{sequencing_part}-{assay_part}'
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
            manifest_enum = post_params.get('manifest_enum', FILE)
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
        manifest_enum = post_params.get('manifest_enum', FILE)
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
        download_file_name = 'smaht_manifest_' + datetime.utcnow().strftime('%Y-%m-%d-%Hh-%Mm') + '.tsv'

    # Generate a header, resolve mapping
    header = generate_manifest_header(download_file_name, manifest_enum, cli=cli)
    tsv_mapping = TSV_MAPPING[manifest_enum]
    return MetadataArgs(accessions, manifest_enum, sort_param, type_param, status, include_extra_files,
                        download_file_name, header, tsv_mapping, cli)


@view_config(route_name='peek_metadata', request_method=['GET', 'POST'])
@debug_log
def peek_metadata(context, request):
    """ Helper for the UI that will retrieve faceting information about data retrieved from /metadata """
    # get arguments from helper
    args = handle_metadata_arguments(context, request)
    if isinstance(args, Response):
        # dmichaels/2024-12-16: Hackish fix for now; handle_metadata_arguments not returning MetadataArgs for ...
        subreq = make_search_subreq(request, '{}?{}'.format('/search', urlencode(request.params, True)), inherit_user=True)
        result = search(context, subreq)
        return result['facets']

    # Generate search
    search_param = {}
    if not args.type_param:
        search_param['type'] = 'File'
    else:
        search_param['type'] = args.type_param
    if args.accessions:
        search_param['accession'] = args.accessions
    if args.sort_param:
        search_param['sort'] = args.sort_param
    if args.status:
        search_param['status'] = args.status
    search_param['limit'] = [1]  # we don't care about results, just the facets
    search_param['additional_facet'] = ['file_size']
    if args.include_extra_files:
        search_param['additional_facet'].append('extra_files.file_size')
    subreq = make_search_subreq(request, '{}?{}'.format('/search', urlencode(search_param, True)), inherit_user=True)
    result = search(context, subreq)
    return result['facets']


def generate_file_manifest(request, args, search_iter, cli):
    """ Helper that executes the file manifest generation, factored out now to support
        multiple manifest files
    """
    # Process search iter
    data_lines = []
    for file in search_iter:
        line = []
        for field_name, tsv_descriptor in args.tsv_mapping.items():
            traversal_path = tsv_descriptor.field_name()
            if field_name == FILE_GROUP:
                field = descend_field(request, file, traversal_path, cli=cli) or ''
                if field:  # requires special care
                    field = handle_file_group(field)
            else:
                field = descend_field(request, file, traversal_path, cli=cli) or ''
            line.append(field)
        data_lines += [line]

        # Repeat the above process for extra files
        # This requires extra care - most fields we take from extra_files directly,
        # but some must be taken from the parent metadata, such as anything related to library/assay/sample
        # or the file merge group
        if args.include_extra_files and 'extra_files' in file:
            efs = file.get('extra_files')
            for ef in efs:
                ef_line = []
                for field_name, tsv_descriptor in args.tsv_mapping.items():
                    traversal_path = tsv_descriptor.field_name()
                    if tsv_descriptor.use_base_metadata():
                        field = descend_field(request, file, traversal_path, cli=cli) or ''
                        if field_name == FILE_GROUP:  # requires special care
                            field = handle_file_group(field)
                    else:
                        field = descend_field(request, ef, traversal_path, cli=cli) or ''
                    ef_line.append(field)
                data_lines += [ef_line]

    return data_lines


def generate_sample_manifest(request, args, search_iter):
    """ For the sample manifest, we first traverse the original search_iter for sample IDs, then
        execute another search to retrieve all those samples and write the manifest from
        that search
    """
    # Extract sample IDs
    samples = []
    for f in search_iter:
        sample = f.get('samples', [])
        if sample and sample[0]['uuid'] not in samples:
            samples.append(sample[0]['uuid'])

    # Generate, execute iter for sample search
    search_param = {
        'type': 'Sample',
        'uuid': samples
    }
    sample_search_iter = get_iterable_search_results(request, param_lists=search_param)
    data_lines = []
    for sample in sample_search_iter:
        line = []
        for field_name, tsv_descriptor in args.tsv_mapping.items():
            traversal_path = tsv_descriptor.field_name()
            field = descend_field(request, sample, traversal_path) or ''
            line.append(field)
        data_lines += [line]
    return data_lines


def generate_experimental_manifest(request, args, search_iter):
    """ Generates data lines for an experimental manifest file, similar to sample
        but based on fileset - both versions of the experiment manifest focus on
        fileset, so the same functionality can be used with different tsv mappings
    """
    # Extract file set IDs, only the first
    file_sets = []
    for f in search_iter:
        fs = f.get('file_sets', [])
        if fs and fs[0]['uuid'] not in file_sets:
            file_sets.append(fs[0]['uuid'])

    # Generate, execute iter for file set search
    search_param = {
        'type': 'FileSet',
        'uuid': file_sets
    }
    file_set_search_iter = get_iterable_search_results(request, param_lists=search_param)
    data_lines = []
    for fs in file_set_search_iter:
        line = []
        for field_name, tsv_descriptor in args.tsv_mapping.items():
            traversal_path = tsv_descriptor.field_name()
            field = descend_field(request, fs, traversal_path) or ''
            line.append(field)
        data_lines += [line]
    return data_lines


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
    # get arguments from helper
    args = handle_metadata_arguments(context, request)

    # Generate search
    search_param = {}
    if not args.type_param:
        search_param['type'] = 'File'
    else:
        search_param['type'] = args.type_param
    if args.accessions:
        search_param['accession'] = args.accessions
    if args.sort_param:
        search_param['sort'] = args.sort_param
    if args.status:
        search_param['status'] = args.status
    cli = args.cli
    search_iter = get_iterable_search_results(request, param_lists=search_param)
    if args.manifest_enum == SAMPLE:
        data_lines = generate_sample_manifest(request, args, search_iter)
    elif args.manifest_enum == FILE:
        data_lines = generate_file_manifest(request, args, search_iter, cli)
    elif args.manifest_enum in [EXPERIMENT_ANALYTE, EXPERIMENT_LIBRARY]:
        data_lines = generate_experimental_manifest(request, args, search_iter)
    elif args.manifest_enum == CLINICAL:
        raise Exception('EXPERIMENT manifests not supported at this time')
    else:
        raise Exception('Invalid manifest enum provided')
    return Response(
        content_type='text/tsv',
        app_iter=generate_tsv(args.header, data_lines),
        content_disposition=f'attachment;filename={args.download_file_name}'
    )
