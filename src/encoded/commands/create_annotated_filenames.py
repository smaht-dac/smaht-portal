from __future__ import annotations

import argparse
import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, List, Union, Tuple

from dcicutils import ff_utils
from dcicutils.creds_utils import SMaHTKeyManager


logger = logging.getLogger(__name__)


DEFAULT_PROJECT_ID = "SMHT"
DEFAULT_ABSENT_FIELD = "X"
FILENAME_SEPARATOR = "-"
ANALYSIS_INFO_SEPARATOR = "_"

ALIGNED_READS_EXTENSION = "aligned"
BAM_EXTENSION = "bam"
FASTQ_EXTENSION = "fastq.gz"
PHASED_EXTENSION = "phased"
SORTED_EXTENSION = "sorted"
VCF_EXTENSION = "vcf.gz"

CNV_VARIANT_TYPE = "cnv"
MEI_VARIANT_TYPE = "mei"
SNV_VARIANT_TYPE = "snv"
SV_VARIANT_TYPE = "sv"

MALE_SEX_ABBREVIATION = "M"
FEMALE_SEX_ABBREVIATION = "F"


class PortalConstants:
    ACCESSION = "accession"
    AGE = "age"
    ALIGNED_READS = "Aligned Reads"
    ALIGNMENT_DETAILS = "alignment_details"
    ANALYTE = "analyte"
    ANNOTATED_FILENAME = "annotated_filename"
    ASSAY = "assay"
    CELL_CULTURE = "cell_culture"
    CELL_CULTURE_MIXTURE_TYPE = "CellCultureMixture"
    CELL_CULTURE_TYPE = "CellCulture"
    CELL_LINE = "cell_line"
    CODE = "code"
    COMPONENTS = "components"
    CONSORTIA = "consortia"
    COPY_NUMBER_VARIANT = "Copy Number Variant"
    DATA_TYPE = "data_type"
    DONOR = "donor"
    EXTRA_FILES = "extra_files"
    FEMALE_SEX = "Female"
    FILE_FORMAT = "file_format"
    FILE_SETS = "file_sets"
    FILENAME = "filename"
    LIBRARIES = "libraries"
    MALE_SEX = "Male"
    MOBILE_ELEMENT_INSERTION = "Mobile Element Insertion"
    PHASED = "Phased"
    REFERENCE_GENOME = "reference_genome"
    SAMPLE_SOURCES = "sample_sources"
    SAMPLES = "samples"
    SEQUENCER = "sequencer"
    SEQUENCING = "sequencing"
    SEQUENCING_CENTER = "sequencing_center"
    SEX = "sex"
    SINGLE_NUCLEOTIDE_VARIANT = "Single Nucleotide Variant"
    SOFTWARE = "software"
    SORTED = "Sorted"
    STANDARD_FILE_EXTENSION = "standard_file_extension"
    STRUCTURAL_VARIANT = "Structural Variant"
    SUBMISSION_CENTERS = "submission_centers"
    TISSUE_TYPE = "Tissue"
    TYPE = "@type"
    UUID = "uuid"
    VARIANT_TYPE = "variant_type"
    VERSION = "version"


@dataclass(frozen=True)
class InvalidData:
    pass


@dataclass(frozen=True)
class SampleSourceData:
    pass


@dataclass(frozen=True)
class TissueData(SampleSourceData):
    project_id: str = ""
    kit_id: str = ""
    protocol_id: str = ""
    aliquot_id: str = ""
    core_id: str = ""


@dataclass(frozen=True)
class CellLineData(SampleSourceData):
    project_id: str = DEFAULT_PROJECT_ID
    cell_line_id: str = ""


@dataclass(frozen=True)
class DonorData:
    sex: str = ""
    age: str = ""


@dataclass(frozen=True)
class SampleData:
    sample_source_data: Union[InvalidData, SampleSourceData]
    donor_data: Union[InvalidData, DonorData]


@dataclass(frozen=True)
class ExperimentData:
    sequencing_code: str = ""
    assay_code: str = ""


@dataclass(frozen=True)
class FileData:
    center_code: str = ""
    accession: str = ""
    software: str = ""
    software_version: str = ""
    genome: str = ""
    variant_type: str = ""
    data_type: str = ""
    alignment_details: str = ""
    file_extension: str = ""


@dataclass(frozen=True)
class FilenameData:
    file: Dict[str, Any]
    sample_data: SampleData
    experiment_data: ExperimentData
    file_data: FileData


@dataclass(frozen=True)
class FilenamePart:
    value: str
    errors: List[str]


@dataclass(frozen=True)
class AnnotatedFilename:
    uuid: str
    filename: str
    file: Dict[str, Any]
    errors: List[str]


def create_annotated_filenames(
    search: str,
    identifiers: List[str],
    auth_key: Dict[str, str],
    dry_run: bool = False,
) -> None:
    """Create annotated filenames for given files.

    NOTE: Algorithm here is highly dependent on data model and items on
    the portal as well as subjective choices made for the annotated
    filename. Will almost certainly need updates as different types of
    data included and whenever relevant data model changes are made.
    """
    file_items = get_file_items(search, identifiers, auth_key)
    filename_data = get_filename_data(file_items, auth_key)
    patch_annotated_filenames(filename_data, auth_key, dry_run=dry_run)


def get_file_items(
    search: str,
    identifiers: List[str],
    auth_key: Dict[str, str],
) -> List[Dict[str, Any]]:
    """Get file items from given search query and idenitfiers."""
    return get_file_items_from_search(
        search, auth_key
    ) + get_file_items_from_identifiers(identifiers, auth_key)


def get_file_items_from_search(
    search_query: str, auth_key: Dict[str, str]
) -> List[str]:
    """Get file items from given search query."""
    if search_query:
        return get_file_items_from_search_query(search_query, auth_key)
    return []


def get_file_items_from_search_query(
    search_query: str, auth_key: Dict[str, str]
) -> List[str]:
    """Get file items from given search query."""
    try:
        result = ff_utils.search_metadata(search_query, key=auth_key)
        logger.info(f"Found {len(result)} files from search query")
    except Exception as e:
        logger.error(f"Error searching for files: {e}")
        result = []
    return result


def get_file_items_from_identifiers(
    identifiers: List[str], auth_key: Dict[str, str]
) -> List[str]:
    """Get file items from given identifiers."""
    result = []
    if identifiers:
        for identifier in identifiers:
            item = get_item_from_identifier(identifier, auth_key)
            if item:
                result.append(item)
    return result


def get_item(
    item: Union[str, Dict[str, Any]], auth_key: Dict[str, str], add_on: str = ""
) -> Dict[str, Any]:
    """GET item from given input (identifier or embedded item)."""
    if isinstance(item, str):
        return get_item_from_identifier(item, auth_key, add_on=add_on)
    if isinstance(item, dict):
        identifier = get_uuid(item)
        return get_item_from_identifier(identifier, auth_key, add_on=add_on)
    raise ValueError(f"Invalid input: {item}")


def get_uuid(item: Dict[str, Any]) -> str:
    """Get UUID from item."""
    return item.get(PortalConstants.UUID, "")


def get_item_from_identifier(
    identifier: str, auth_key: Dict[str, str], add_on: str = ""
) -> Dict[str, Any]:
    """Get item metadata from given identifier.

    Handle and log error if item not found.
    """
    result = {}
    hashable_key = get_hashable_key(auth_key)
    try:
        result = get_item_from_identifier_cache(identifier, hashable_key, add_on=add_on)
    except Exception as e:
        logger.error(f"Error getting item {identifier}: {e}")
    return result


def get_hashable_key(
    auth_key: Dict[str, str]
) -> Tuple[Tuple[str, str], Tuple[str, str], Tuple[str, str]]:
    """Get hashable key from auth key."""
    return tuple(auth_key.items())


@lru_cache
def get_item_from_identifier_cache(
    identifier: str, hashable_key: Tuple[str, str], add_on: str = ""
) -> Dict[str, Any]:
    key = unhash_key(hashable_key)
    return ff_utils.get_metadata(identifier, add_on=add_on, key=key)


def unhash_key(hashable_key: Tuple[str, str]) -> Dict[str, str]:
    """Unhash key."""
    return dict(hashable_key)


def get_filename_data(
    file_items: List[Dict[str, Any]], auth_key: Dict[str, str]
) -> List[FilenameData]:
    """Collect all filename data for given file items."""
    return [get_filename_data_for_file(file_item, auth_key) for file_item in file_items]


def get_filename_data_for_file(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> FilenameData:
    """Get filename data for given file item."""
    return FilenameData(
        file_item,
        sample_data=get_sample_data(file_item, auth_key),
        experiment_data=get_experiment_data(file_item, auth_key),
        file_data=get_file_data(file_item, auth_key),
    )


def get_sample_data(file_item: Dict[str, Any], auth_key: Dict[str, str]) -> SampleData:
    """Get sample data for given file item."""
    sample_source_data = get_sample_source_data(file_item, auth_key)
    donor_data = get_donor_data(file_item, auth_key)
    return SampleData(
        sample_source_data=sample_source_data,
        donor_data=donor_data,
    )


def get_sample_source_data(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Union[InvalidData, SampleSourceData]:
    """Get tissue data for file."""
    sample = get_sample_from_file(file_item, auth_key)
    if is_tissue_sample(sample, auth_key):
        return get_tissue_data_from_sample(sample, auth_key)
    if is_cell_culture_sample(sample, auth_key):
        return get_cell_line_data_from_sample(sample, auth_key)
    return InvalidData()


def is_tissue_sample(sample_item: Dict[str, Any], auth_key: Dict[str, str]) -> bool:
    """Check if sample derives from tissue."""
    sample_sources = get_sample_sources_from_sample(sample_item, auth_key)
    return any([is_tissue(sample_source) for sample_source in sample_sources])


def is_tissue(sample_source: Dict[str, Any]) -> bool:
    """Is sample source a Tissue item?"""
    source_types = get_type_info(sample_source)
    if PortalConstants.TISSUE_TYPE in source_types:
        return True
    return False


def is_cell_culture_sample(
    sample_item: Dict[str, Any], auth_key: Dict[str, str]
) -> bool:
    """Check if sample derives from cell culture."""
    sample_sources = get_sample_sources_from_sample(sample_item, auth_key)
    return any([is_cell_culture(sample_source) for sample_source in sample_sources])


def is_cell_culture(sample_source: Dict[str, Any]) -> bool:
    """Is sample source a CellCulture?"""
    source_types = get_type_info(sample_source)
    if PortalConstants.CELL_CULTURE_TYPE in source_types:
        return True
    return False


def get_type_info(item: Dict[str, Any]) -> List[str]:
    return item.get(PortalConstants.TYPE, [])


def get_sample_sources_from_sample(
    sample_item: Dict[str, Any], auth_key: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Get all sample sources for given sample item."""
    sample_sources = sample_item.get(PortalConstants.SAMPLE_SOURCES, [])
    return [get_item(item, auth_key) for item in sample_sources]


def get_tissue_data_from_sample(sample_item: Dict[str, Any]) -> TissueData:
    raise NotImplementedError("Not prepared to handle tissue samples yet")


def get_cell_line_data_from_sample(
    sample_item: Dict[str, Any], auth_key: Dict[str, str]
) -> CellLineData:
    cell_line_id = ""
    sample_sources = get_sample_sources_from_sample(sample_item, auth_key)
    cell_line_ids = set(
        [
            get_cell_line_id_from_sample_source(sample_source, auth_key)
            for sample_source in sample_sources
        ]
    )
    if len(cell_line_ids) == 1:
        cell_line_id = cell_line_ids.pop()
    else:
        logger.error(
            f"Multiple cell line ids found for sample {get_uuid(sample_item)}:"
            f" {cell_line_ids}"
        )
    return CellLineData(cell_line_id=cell_line_id)


def get_cell_line_id_from_sample_source(
    sample_source_item: Dict[str, Any], auth_key: Dict[str, str]
) -> str:
    if is_cell_culture_mixture(sample_source_item):
        return get_code(sample_source_item)
    if is_cell_culture(sample_source_item):
        return get_cell_line_id_from_cell_culture(sample_source_item, auth_key)
    logger.info(
        f"Unknown sample source type for sample source {get_uuid(sample_source_item)}"
    )
    return ""


def get_cell_line_id_from_cell_culture(
    cell_culture_item: Dict[str, Any], auth_key: Dict[str, str]
) -> str:
    """Get cell line id from cell culture."""
    cell_line = get_cell_line_from_cell_culture(cell_culture_item, auth_key)
    return get_code(cell_line)


def get_cell_line_from_cell_culture(
    cell_culture_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get cell line from cell culture."""
    cell_line = cell_culture_item.get(PortalConstants.CELL_LINE, {})
    return get_item(cell_line, auth_key)


def get_sample_from_file(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get sample for file by walking the data model."""
    result = {}
    samples = get_samples_from_file(file_item, auth_key)
    if not samples:
        logger.error(f"No sample found for file {get_uuid(file_item)}")
    elif len(samples) > 1:
        logger.error(
            f"Multiple samples found for file {get_uuid(file_item)}:"
            f" {samples}"
        )
    else:
        result = samples[0]
    return result


def get_samples_from_file(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Walk data model to get samples for file."""
    file_sets = get_file_sets_from_file(file_item, auth_key)
    libraries = get_libraries_from_file_sets(file_sets, auth_key)
    analytes = get_analytes_from_libraries(libraries, auth_key)
    return get_samples_from_analytes(analytes, auth_key)


def get_file_sets_from_file(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Get file sets for file."""
    to_get = file_item.get(PortalConstants.FILE_SETS, [])
    return [get_item(item, auth_key) for item in to_get]


def get_items_from_property(
    items: List[Dict[str, Any]], property_name: str, auth_key: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Get items from given property."""
    result = []
    for item in items:
        to_get = item.get(property_name, [])
        result.extend([get_item(item, auth_key) for item in to_get])
    return result


def get_libraries_from_file_sets(
    file_sets: List[Dict[str, Any]], auth_key: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Get libraries for file sets."""
    return get_items_from_property(file_sets, PortalConstants.LIBRARIES, auth_key)


def get_analytes_from_libraries(
    libraries: List[Dict[str, Any]], auth_key: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Get analytes for libraries."""
    analytes = deduplicate_items_by_uuid(
        [get_analyte(library) for library in libraries]
    )
    return [get_item(get_uuid(analyte), auth_key) for analyte in analytes]


def get_analyte(item: Dict[str, Any]) -> Dict[str, Any]:
    """Get analyte property from item."""
    return item.get(PortalConstants.ANALYTE, {})


def get_samples_from_analytes(
    analytes: List[Dict[str, Any]], auth_key: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Get samples for analytes."""
    return get_items_from_property(analytes, PortalConstants.SAMPLES, auth_key)


def get_donor_data(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Union[InvalidData, DonorData]:
    """Get donor data for file."""
    donor = get_donor_from_file(file_item, auth_key)
    if donor:
        return get_donor_data_from_donor(donor)
    return InvalidData()


def get_donor_from_file(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get donor for file by walking the data model."""
    sample_sources = get_sample_sources_from_file(file_item, auth_key)
    donors = get_donors_from_sample_sources(sample_sources, auth_key)
    if not donors:
        logger.error(f"No donor found for file {get_uuid(file_item)}")
    elif len(donors) > 1:
        logger.error(
            f"Multiple donors found for file {get_uuid(file_item)}:"
            f" {donors}"
        )
    else:
        return donors[0]


def get_sample_sources_from_file(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Get sample sources for file by walking the data model."""
    samples = get_samples_from_file(file_item, auth_key)
    return get_sample_sources_from_samples(samples, auth_key)


def get_sample_sources_from_samples(
    samples: List[Dict[str, Any]], auth_key: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Get sample sources for samples."""
    result = []
    for sample in samples:
        sample_sources = get_sample_sources_from_sample(sample, auth_key)
        result.extend(sample_sources)
    return result


def get_donors_from_sample_sources(
    sample_sources: List[Dict[str, Any]], auth_key: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Get donors for sample sources."""
    return [
        get_donor_from_sample_source(sample_source, auth_key)
        for sample_source in sample_sources
    ]


def get_donor_from_sample_source(
    sample_source_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get donor for sample source."""
    if is_tissue(sample_source_item):
        return get_donor_from_item(sample_source_item, auth_key)
    if is_cell_culture_mixture(sample_source_item):
        return get_donor_from_cell_culture_mixture(sample_source_item, auth_key)
    if is_cell_culture(sample_source_item):
        return get_donor_from_cell_culture(sample_source_item, auth_key)
    return {}


def get_donor_from_cell_culture(
    cell_culture_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get donor from cell culture."""
    cell_line = get_cell_line_from_cell_culture(cell_culture_item, auth_key)
    return get_donor_from_cell_line(cell_line, auth_key)


def get_donor_from_cell_line(
    cell_line_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get donor from cell line."""
    return get_donor_from_item(cell_line_item, auth_key)


def get_donor_from_item(
    item: Dict[str, Any], auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get donor from item."""
    donor = item.get(PortalConstants.DONOR, {})
    return get_item(donor, auth_key)


def is_cell_culture_mixture(sample_source_item: Dict[str, Any]) -> bool:
    """Check if sample source is a CellCultureMixture."""
    source_types = get_type_info(sample_source_item)
    if PortalConstants.CELL_CULTURE_MIXTURE_TYPE in source_types:
        return True
    return False


def get_donor_from_cell_culture_mixture(
    cell_culture_mixture_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get donor from cell culture mixture."""
    result = {}
    cell_cultures = get_cell_cultures_from_cell_culture_mixture(
        cell_culture_mixture_item, auth_key
    )
    donors = [
        get_donor_from_cell_culture(cell_culture, auth_key)
        for cell_culture in cell_cultures
    ]
    unique_donors = deduplicate_items_by_uuid(donors)
    if not unique_donors:
        logger.error(
            f"No unique donor found for cell culture mixture"
            f" {get_uuid(cell_culture_mixture_item)}"
        )
    elif len(unique_donors) > 1:
        logger.error(
            f"Multiple unique donors found for cell culture mixture"
            f" {get_uuid(cell_culture_mixture_item)}:"
            f" {unique_donors}"
        )
    else:
        result = unique_donors[0]
    return result


def get_cell_cultures_from_cell_culture_mixture(
    cell_culture_mixture_item: Dict[str, Any], auth_key: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Get cell cultures from cell culture mixture."""
    cell_culture_links = [
        component.get(PortalConstants.CELL_CULTURE, {})
        for component in cell_culture_mixture_item.get(PortalConstants.COMPONENTS, [])
    ]
    return [get_item(item, auth_key) for item in cell_culture_links]


def deduplicate_items_by_uuid(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deduplicate items by UUID."""
    uuids = set()
    result = []
    for item in items:
        uuid = item.get(PortalConstants.UUID)
        if uuid not in uuids:
            uuids.add(uuid)
            result.append(item)
    return result


def get_donor_data_from_donor(donor_item: Dict[str, Any]) -> DonorData:
    """Populate DonorData from donor item."""
    return DonorData(
        sex=donor_item.get(PortalConstants.SEX, ""),
        age=donor_item.get(PortalConstants.AGE, ""),
    )


def get_experiment_data(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> ExperimentData:
    """Get experiment data for file."""
    return ExperimentData(
        sequencing_code=get_sequencing_code(file_item, auth_key),
        assay_code=get_assay_code(file_item, auth_key),
    )


def get_sequencing_code(file_item: Dict[str, Any], auth_key: Dict[str, str]) -> str:
    """Get sequencing code for file."""
    result = ""
    sequencing_items = get_sequencing_items_from_file(file_item, auth_key)
    sequencers = [
        get_sequencer_from_sequencing(sequencing_item, auth_key)
        for sequencing_item in sequencing_items
    ]
    if not sequencers:
        logger.error(
            f"No sequencers found for file {get_uuid(file_item)}"
        )
    elif len(sequencers) > 1:
        logger.error(
            f"Multiple sequencers found for file {get_uuid(file_item)}:"
            f" {sequencers}"
        )
    else:
        result = get_code(sequencers[0])
    return result


def get_sequencer_from_sequencing(
    sequencing_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get sequencer for sequencing."""
    sequencer = sequencing_item.get(PortalConstants.SEQUENCER, {})
    return get_item(sequencer, auth_key)


def get_sequencing_items_from_file(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Get sequencing items for file."""
    file_sets = get_file_sets_from_file(file_item, auth_key)
    return get_sequencing_from_file_sets(file_sets, auth_key)


def get_sequencing_from_file_sets(
    file_sets: List[Dict[str, Any]], auth_key: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Get sequencing items for file sets."""
    return [get_sequencing_from_file_set(file_set, auth_key) for file_set in file_sets]


def get_sequencing_from_file_set(
    file_set_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get sequencing item for file set."""
    sequencing = file_set_item.get(PortalConstants.SEQUENCING, {})
    return get_item(sequencing, auth_key)


def get_code(item: Dict[str, Any]) -> str:
    """Get file naming code from item."""
    return item.get(PortalConstants.CODE, "")


def get_assay_code(file_item: Dict[str, Any], auth_key: Dict[str, str]) -> str:
    result = ""
    assays = get_assays_from_file(file_item, auth_key)
    if not assays:
        logger.error(f"No assays found for file {get_uuid(file_item)}")
    elif len(assays) > 1:
        logger.error(
            f"Multiple assays found for file {get_uuid(file_item)}:"
            f" {assays}"
        )
    else:
        result = get_code(assays[0])
    return result


def get_assays_from_file(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Get assays for file."""
    file_sets = get_file_sets_from_file(file_item, auth_key)
    return get_assays_from_file_sets(file_sets, auth_key)


def get_assays_from_file_sets(
    file_sets: List[Dict[str, Any]], auth_key: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Get assays for file sets."""
    return [get_assay_from_file_set(file_set, auth_key) for file_set in file_sets]


def get_assay_from_file_set(
    file_set_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get assay for file set."""
    assay = file_set_item.get(PortalConstants.ASSAY, {})
    return get_item(assay, auth_key)


def get_file_data(file_item: Dict[str, Any], auth_key: Dict[str, str]) -> FileData:
    """Get file data for file."""
    return FileData(
        center_code=get_center_code(file_item, auth_key),
        accession=get_accession(file_item),
        software=get_software(file_item, auth_key),
        software_version=get_software_version(file_item, auth_key),
        genome=get_genome(file_item, auth_key),
        variant_type=get_variant_type(file_item),
        data_type=get_data_type(file_item),
        alignment_details=get_alignment_details(file_item),
        file_extension=get_file_extension(file_item, auth_key),
    )


def get_center_code(file_item: Dict[str, Any], auth_key: Dict[str, str]) -> str:
    """Get center code for file."""
    sequencing_center = get_sequencing_center_from_file(file_item, auth_key)
    return get_code(sequencing_center)


def get_sequencing_center_from_file(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get sequencing center for file."""
    return get_item(file_item.get(PortalConstants.SEQUENCING_CENTER, {}), auth_key)


def get_unique_codes(items: List[Dict[str, Any]]) -> List[str]:
    """Get unique codes from items."""
    unique_codes = set([get_code(item) for item in items if get_code(item)])
    return list(unique_codes)


def get_accession(file_item: Dict[str, Any]) -> str:
    """Get file accession."""
    return file_item.get(PortalConstants.ACCESSION, "")


def get_data_type(file_item: Dict[str, Any]) -> str:
    """Get data type for file."""
    result = file_item.get(PortalConstants.DATA_TYPE, "")
    if isinstance(result, list):
        return ",".join(result)
    return result


def get_software(file_item: Dict[str, Any], auth_key: Dict[str, str]) -> str:
    """Get software for file.

    Assuming only one software per file.
    """
    result = ""
    software = get_software_from_file(file_item, auth_key)
    software_codes = get_unique_codes(software)
    if not software_codes:
        logger.error(
            f"No software codes found for file {get_uuid(file_item)}"
        )
    elif len(software_codes) > 1:
        logger.error(
            f"Multiple software codes found for file {get_uuid(file_item)}:"
            f" {software_codes}"
        )
    else:
        result = software_codes[0]
    return result


def get_software_from_file(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Get software for file."""
    return [
        get_item(software, auth_key)
        for software in file_item.get(PortalConstants.SOFTWARE, [])
    ]


def get_software_version(file_item: Dict[str, Any], auth_key: Dict[str, str]) -> str:
    """Get software version for file.

    Assuming only one software version per file.
    """
    result = ""
    software = get_software_from_file(file_item, auth_key)
    software_with_codes = [
        software_item for software_item in software if get_code(software_item)
    ]
    if not software_with_codes:
        logger.error(
            f"No software version codes found for file {get_uuid(file_item)}"
        )
    elif len(software_with_codes) > 1:
        logger.error(
            f"Multiple software version codes found for file {get_uuid(file_item)}:"
            f" {software_with_codes}"
        )
    else:
        result = get_version(software_with_codes[0])
    return result


def get_version(item: Dict[str, Any]) -> str:
    """Get version from item."""
    return item.get(PortalConstants.VERSION, "")


def get_genome(file_item: Dict[str, Any], auth_key: Dict[str, str]) -> str:
    """Get genome for file."""
    reference_genome = get_reference_genome_from_file(file_item, auth_key)
    return get_code(reference_genome)


def get_reference_genome_from_file(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get reference genome for file."""
    reference_genome = file_item.get(PortalConstants.REFERENCE_GENOME, {})
    return get_item(reference_genome, auth_key)


def get_variant_type(file_item: Dict[str, Any]) -> str:
    """Get variant type for file."""
    return ",".join(get_variant_types(file_item))


def get_variant_types(file_item: Dict[str, Any]) -> List[str]:
    """Get variant types for file."""
    return file_item.get(PortalConstants.VARIANT_TYPE, [])


def get_alignment_details(file_item: Dict[str, Any]) -> List[str]:
    """Get alignment details for file."""
    return file_item.get(PortalConstants.ALIGNMENT_DETAILS, [])


def get_file_extension(file_item: Dict[str, Any], auth_key: Dict[str, str]) -> str:
    file_format = get_file_format_from_file(file_item, auth_key)
    return get_standard_extension(file_format)


def get_file_format_from_file(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get file format for file."""
    file_format = file_item.get(PortalConstants.FILE_FORMAT, {})
    return get_item(file_format, auth_key)


def get_standard_extension(file_format: Dict[str, Any]) -> str:
    """Get standard extension for file format."""
    return file_format.get(PortalConstants.STANDARD_FILE_EXTENSION, "")


def patch_annotated_filenames(
    filenames_data: List[FilenameData],
    auth_key: Dict[str, str],
    dry_run: bool = False,
) -> None:
    """Generate and patch files with annotated filenames.

    Also, patch associated extra file filenames.

    If dry run, only log filenames generated and patch bodies.
    """
    for filename_data in filenames_data:
        annotated_filename = create_annotated_filename(filename_data)
        if has_errors(annotated_filename):
            logger.error(
                f"Errors found for file {annotated_filename.uuid}:"
                f" {annotated_filename.errors}"
            )
            continue
        patch_body = get_patch_body(annotated_filename, auth_key)
        if dry_run:
            logger.info(
                f"Would patch file {annotated_filename.uuid} with: {patch_body}"
            )
        else:
            patch_file(annotated_filename, patch_body, auth_key)


def has_errors(annotated_filename: AnnotatedFilename) -> bool:
    """Check if annotated filename has errors."""
    return bool(annotated_filename.errors)


def get_patch_body(
    annotated_filename: AnnotatedFilename, auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get patch body for annotated filename."""
    filename_patch = get_filename_patch(annotated_filename)
    extra_files_patch = get_extra_files_patch(annotated_filename, auth_key)
    return {**filename_patch, **extra_files_patch}


def get_filename_patch(annotated_filename: AnnotatedFilename) -> Dict[str, Any]:
    """Get filename patch for annotated filename."""
    return {PortalConstants.ANNOTATED_FILENAME: annotated_filename.filename}


def get_extra_files_patch(
    annotated_filename: AnnotatedFilename, auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get extra files patch body with annotated filename variant."""
    file_raw_view = get_item(annotated_filename.uuid, auth_key, add_on="frame=raw")
    extra_files = get_extra_files(file_raw_view)
    extra_files_to_patch = [
        get_extra_file_patch(extra_file, annotated_filename, auth_key)
        for extra_file in extra_files
    ]
    if extra_files_to_patch:
        return {PortalConstants.EXTRA_FILES: extra_files_to_patch}
    return {}


def get_extra_files(file_item: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Check if file has any extra files."""
    return file_item.get(PortalConstants.EXTRA_FILES, [])


def get_extra_file_patch(
    extra_file_item: Dict[str, Any],
    annotated_filename: AnnotatedFilename,
    auth_key: Dict[str, str],
) -> Dict[str, Any]:
    """Get extra file patch with annotated filename variant."""
    extra_file_format_extension = get_extra_file_format_extension(
        extra_file_item, auth_key
    )
    annotated_extra_file_name = get_annotated_extra_file_name(
        annotated_filename, extra_file_format_extension
    )
    return {
        **extra_file_item,
        PortalConstants.FILENAME: annotated_extra_file_name,
    }


def get_extra_file_format_extension(
    extra_file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> str:
    """Get extra file format extension."""
    extra_file_format = get_extra_file_format(extra_file_item, auth_key)
    return get_standard_extension(extra_file_format)


def get_extra_file_format(
    extra_file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get extra file format."""
    file_format = get_file_format(extra_file_item)
    return get_item(file_format, auth_key)


def get_file_format(file_item: Dict[str, Any]) -> Dict[str, Any]:
    """Get file format for file."""
    return file_item.get(PortalConstants.FILE_FORMAT, {})


def get_annotated_extra_file_name(
    annotated_filename: AnnotatedFilename, extra_file_format_extension: str
) -> str:
    """Get annotated extra file name."""
    filename_without_extension = get_filename_without_extension(
        annotated_filename.filename
    )
    return f"{filename_without_extension}.{extra_file_format_extension}"


def get_filename_without_extension(filename: str) -> str:
    """Drop extension from filename."""
    return ".".join(filename.split(".")[:-1])


def patch_file(
    annotated_filename: AnnotatedFilename,
    patch_body: Dict[str, Any],
    auth_key: Dict[str, str],
) -> None:
    """Patch file with given patch body."""
    try:
        ff_utils.patch_metadata(
            patch_body,
            obj_id=annotated_filename.uuid,
            key=auth_key,
        )
        logger.info(f"Patched file {annotated_filename.uuid}")
    except Exception as e:
        logger.error(f"Error patching file {annotated_filename.uuid}: {e}")


def create_annotated_filename(filename_data: FilenameData) -> AnnotatedFilename:
    """Attempt to create annotated filename for given filename data.

    Accumulate errors on the dataclass for later logging.
    """
    filename, errors = create_filename(filename_data)
    return AnnotatedFilename(
        get_uuid(filename_data.file),
        filename,
        filename_data.file,
        errors=errors,
    )


def create_filename(filename_data: FilenameData) -> Tuple[str, List[str]]:
    """Create filename from given filename data."""
    sample_part = create_sample_part(filename_data)
    experiment_part = create_experiment_part(filename_data)
    file_part = create_file_part(filename_data)
    filename = join_filename_parts([sample_part, experiment_part, file_part])
    errors = collect_errors([sample_part, experiment_part, file_part])
    return filename, errors


def create_sample_part(filename_data: FilenameData) -> FilenamePart:
    """Create sample part of filename from given filename data."""
    sample_data = filename_data.sample_data
    sample_source_part = create_sample_source_part(sample_data.sample_source_data)
    donor_part = create_donor_part(sample_data.donor_data)
    sample_filename = join_filename_parts([sample_source_part, donor_part])
    sample_errors = collect_errors([sample_source_part, donor_part])
    return FilenamePart(sample_filename, sample_errors)


def create_sample_source_part(
    sample_source_data: Union[InvalidData, SampleSourceData]
) -> FilenamePart:
    """Create sample source part of filename from given sample source data."""
    if isinstance(sample_source_data, InvalidData):
        return FilenamePart("", ["No sample source data found"])
    if isinstance(sample_source_data, TissueData):
        return create_tissue_part(sample_source_data)
    if isinstance(sample_source_data, CellLineData):
        return create_cell_line_part(sample_source_data)
    return FilenamePart(
        "",
        [f"Invalid sample source data: {sample_source_data}"],
    )


def create_tissue_part(tissue_data: TissueData) -> FilenamePart:
    """Validate and create tissue part of filename."""
    errors = validate_tissue_data(tissue_data)
    filename = create_tissue_filename(tissue_data)
    return FilenamePart(filename, errors)


def validate_tissue_data(tissue_data: TissueData) -> List[str]:
    """Validate tissue data."""
    errors = []
    if not tissue_data.project_id:
        errors.append("No project ID found")
    if not tissue_data.kit_id:
        errors.append("No kit ID found")
    if not tissue_data.protocol_id:
        errors.append("No protocol ID found")
    if not tissue_data.aliquot_id:
        errors.append("No aliquot ID found")
    if not tissue_data.core_id:
        errors.append("No core ID found")
    return errors


def create_tissue_filename(tissue_data: TissueData) -> str:
    """Create tissue filename."""
    return (
        f"{tissue_data.project_id}"
        f"{tissue_data.kit_id}"
        f"{FILENAME_SEPARATOR}"
        f"{tissue_data.protocol_id}"
        f"{FILENAME_SEPARATOR}"
        f"{tissue_data.aliquot_id}"
        f"{tissue_data.core_id}"
    )


def create_cell_line_part(cell_line_data: CellLineData) -> FilenamePart:
    """Validate and create cell line part of filename."""
    errors = validate_cell_line_data(cell_line_data)
    filename = create_cell_line_filename(cell_line_data)
    return FilenamePart(filename, errors)


def validate_cell_line_data(cell_line_data: CellLineData) -> List[str]:
    """Validate cell line data."""
    errors = []
    if not cell_line_data.cell_line_id:
        errors.append("No cell line ID found")
    return errors


def create_cell_line_filename(cell_line_data: CellLineData) -> str:
    """Create cell line filename."""
    return (
        f"{DEFAULT_PROJECT_ID}"
        f"{cell_line_data.cell_line_id}"
        f"{FILENAME_SEPARATOR}"
        f"{DEFAULT_ABSENT_FIELD}"
        f"{FILENAME_SEPARATOR}"
        f"{DEFAULT_ABSENT_FIELD}"
    )


def create_donor_part(donor_data: Union[InvalidData, DonorData]) -> FilenamePart:
    """Validate and create donor part of filename."""
    errors = validate_donor_data(donor_data)
    filename = create_donor_filename(donor_data)
    return FilenamePart(filename, errors)


def create_donor_filename(donor_data: Union[InvalidData, DonorData]) -> str:
    """Create donor filename."""
    if isinstance(donor_data, DonorData):
        abbreviated_sex = get_donor_sex_abbreviation(donor_data)
        return f"{abbreviated_sex}" f"{donor_data.age}"
    return ""


def get_donor_sex_abbreviation(donor_data: DonorData) -> str:
    """Abbreviate sex for donor."""
    if donor_data.sex == PortalConstants.MALE_SEX:
        return MALE_SEX_ABBREVIATION
    if donor_data.sex == PortalConstants.FEMALE_SEX:
        return FEMALE_SEX_ABBREVIATION
    return ""


def validate_donor_data(donor_data: Union[InvalidData, DonorData]) -> List[str]:
    """Validate donor data."""
    if isinstance(donor_data, InvalidData):
        return ["No donor data found"]
    if isinstance(donor_data, DonorData):
        errors = []
        if not donor_data.sex:
            errors.append("No donor sex found")
        elif not get_donor_sex_abbreviation(donor_data):
            errors.append(f"Unexpected sex {donor_data.sex}")
        if not donor_data.age:
            errors.append("No donor age found")
        return errors
    return [f"Invalid donor data: {donor_data}"]


def create_experiment_part(filename_data: FilenameData) -> FilenamePart:
    """Create experiment part of filename."""
    experiment_data = filename_data.experiment_data
    errors = validate_experiment_data(experiment_data)
    filename = create_experiment_filename(experiment_data)
    return FilenamePart(filename, errors)


def validate_experiment_data(experiment_data: ExperimentData) -> List[str]:
    """Validate experiment data."""
    errors = []
    if not experiment_data.sequencing_code:
        errors.append("No sequencing code found")
    if not experiment_data.assay_code:
        errors.append("No assay code found")
    return errors


def create_experiment_filename(experiment_data: ExperimentData) -> str:
    """Create experiment filename."""
    return f"{experiment_data.sequencing_code}" f"{experiment_data.assay_code}"


def create_file_part(filename_data: FilenameData) -> FilenamePart:
    """Create file part of filename."""
    file_data = filename_data.file_data
    errors = validate_file_data(file_data)
    filename = create_file_filename(file_data)
    return FilenamePart(filename, errors)


def validate_file_data(file_data: FileData) -> List[str]:
    """Validate file data."""
    if is_bam_file(file_data):
        return validate_bam_file_data(file_data)
    if is_vcf_file(file_data):
        return validate_vcf_file_data(file_data)
    if is_fastq_file(file_data):
        return validate_fastq_file_data(file_data)
    return [f"Unexpected file data: {file_data}"]


def validate_bam_file_data(file_data: FileData) -> List[str]:
    """Validate BAM file data."""
    errors = []
    if not file_data.center_code:
        errors.append("No center code found")
    if not file_data.accession:
        errors.append("No accession found")
    if not file_data.software:
        errors.append("No software found")
    if not file_data.software_version:
        errors.append("No software version found")
    if not file_data.genome:
        errors.append("No genome found")
    if not file_data.data_type:
        errors.append("No data type found")
    if not file_data.alignment_details:
        errors.append("No alignment details found")
    if not file_data.file_extension:
        errors.append("No file extension found")
    if file_data.variant_type:
        errors.append("Unexpected variant type found")
    return errors


def validate_vcf_file_data(file_data: FileData) -> List[str]:
    """Validate VCF file data."""
    errors = []
    if not file_data.center_code:
        errors.append("No center code found")
    if not file_data.accession:
        errors.append("No accession found")
    if not file_data.software:
        errors.append("No software found")
    if not file_data.software_version:
        errors.append("No software version found")
    if not file_data.genome:
        errors.append("No genome found")
    if file_data.alignment_details:
        errors.append("Unexpected alignment details found")
    if not file_data.file_extension:
        errors.append("No file extension found")
    if not file_data.variant_type:
        errors.append("No variant type found")
    else:
        variant_type_for_name = get_variant_type_from_file_data(file_data)
        if not variant_type_for_name:
            errors.append("No expected variant type found")
    return errors


def validate_fastq_file_data(file_data: FileData) -> List[str]:
    """Validate FASTQ file data."""
    errors = []
    if not file_data.center_code:
        errors.append("No center code found")
    if not file_data.accession:
        errors.append("No accession found")
    if file_data.software:
        errors.append("Unexpected software found")
    if file_data.genome:
        errors.append("Unexpected genome found")
    if file_data.alignment_details:
        errors.append("Unexpected alignment details found")
    if file_data.variant_type:
        errors.append("Unexpected variant type found")
    if not file_data.file_extension:
        errors.append("No file extension found")
    return errors


def create_file_filename(file_data: FileData) -> str:
    """Create file filename."""
    if is_bam_file(file_data):
        return create_bam_filename(file_data)
    if is_vcf_file(file_data):
        return create_vcf_filename(file_data)
    if is_fastq_file(file_data):
        return create_fastq_filename(file_data)
    return ""


def is_bam_file(file_data: FileData) -> bool:
    """Check if file is a BAM file."""
    return file_data.file_extension == BAM_EXTENSION


def create_bam_filename(file_data: FileData) -> str:
    """Create BAM filename."""
    file_extension = get_bam_file_extension(file_data)
    return (
        f"{file_data.center_code}"
        f"{FILENAME_SEPARATOR}"
        f"{file_data.accession}"
        f"{FILENAME_SEPARATOR}"
        f"{file_data.software}"
        f"{ANALYSIS_INFO_SEPARATOR}"
        f"{file_data.software_version}"
        f"{ANALYSIS_INFO_SEPARATOR}"
        f"{file_data.genome}"
        f".{file_extension}"
    )


def get_bam_file_extension(file_data: FileData) -> List[str]:
    """Get BAM file extension.

    Adding on info from alignment details and data type to standard extension.
    """
    extensions = []
    if is_aligned_reads(file_data):
        extensions.append(ALIGNED_READS_EXTENSION)
    if is_sorted(file_data):
        extensions.append(SORTED_EXTENSION)
    if is_phased(file_data):
        extensions.append(PHASED_EXTENSION)
    extensions.append(file_data.file_extension)
    return ".".join(extensions)


def is_aligned_reads(file_data: FileData) -> bool:
    """Check if file is aligned reads."""
    return PortalConstants.ALIGNED_READS in file_data.data_type


def is_sorted(file_data: FileData) -> bool:
    """Check if file is sorted."""
    return PortalConstants.SORTED in file_data.alignment_details


def is_phased(file_data: FileData) -> bool:
    """Check if file is phased."""
    return PortalConstants.PHASED in file_data.alignment_details


def is_vcf_file(file_data: FileData) -> bool:
    """Check if file is a VCF file."""
    return file_data.file_extension == VCF_EXTENSION


def create_vcf_filename(file_data: FileData) -> str:
    """Create VCF filename."""
    variant_type = get_variant_type_from_file_data(file_data)
    return (
        f"{file_data.center_code}"
        f"{FILENAME_SEPARATOR}"
        f"{file_data.accession}"
        f"{FILENAME_SEPARATOR}"
        f"{file_data.software}"
        f"{ANALYSIS_INFO_SEPARATOR}"
        f"{file_data.software_version}"
        f"{ANALYSIS_INFO_SEPARATOR}"
        f"{file_data.genome}"
        f"{ANALYSIS_INFO_SEPARATOR}"
        f"{variant_type}"
        f".{file_data.file_extension}"
    )


def get_variant_type_from_file_data(file_data: FileData) -> str:
    """Get variant type from file data."""
    result = []
    if PortalConstants.SINGLE_NUCLEOTIDE_VARIANT in file_data.variant_type:
        result.append(SNV_VARIANT_TYPE)
    if PortalConstants.STRUCTURAL_VARIANT in file_data.variant_type:
        result.append(SV_VARIANT_TYPE)
    if PortalConstants.COPY_NUMBER_VARIANT in file_data.variant_type:
        result.append(CNV_VARIANT_TYPE)
    if PortalConstants.MOBILE_ELEMENT_INSERTION in file_data.variant_type:
        result.append(MEI_VARIANT_TYPE)
    if len(result) == 1:
        return result[0]
    return ""


def is_fastq_file(file_data: FileData) -> bool:
    """Check if file is a FASTQ file."""
    return file_data.file_extension == FASTQ_EXTENSION


def join_filename_parts(filename_parts: List[FilenamePart]) -> str:
    """Join filename parts into a filename."""
    return FILENAME_SEPARATOR.join([part.value for part in filename_parts])


def collect_errors(filename_parts: List[FilenamePart]) -> List[str]:
    """Collect errors from filename parts."""
    return [error for part in filename_parts for error in part.errors]


def get_auth_key(env: str) -> Dict[str, str]:
    """Get auth key for given environment."""
    key_manager = SMaHTKeyManager()
    return key_manager.get_keydict_for_env(env)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--search",
        "-s",
        help="Search query for files to create annotated filenames",
        default="",
    )
    parser.add_argument(
        "--identifiers",
        "-i",
        nargs="*",
        help="File identifiers to create annotated filenames",
        default=[],
    )
    parser.add_argument(
        "--env",
        "-e",
        help="Environment from keys file",
    )
    parser.add_argument(
        "--dry-run",
        "-d",
        action="store_true",
        default=False,
        help="Dry run: do not PATCH annotated filenames",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        default=False,
        help="Increase logging verbosity",
    )
    args = parser.parse_args()
    if args.verbose:
        logger.setLevel(logging.DEBUG)
    auth_key = get_auth_key(args.env)
    if not args.search and not args.identifiers:
        logger.error("Must provide either --search or --identifiers")
    else:
        create_annotated_filenames(
            args.search,
            args.identifiers,
            auth_key,
            dry_run=args.dry_run,
        )


if __name__ == "__main__":
    main()
