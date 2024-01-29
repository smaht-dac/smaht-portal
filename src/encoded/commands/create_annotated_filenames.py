from __future__ import annotations

import argparse
import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, List, Optional, Union

from dcicutils import ff_utils
from dcicutils.creds_utils import SMaHTKeyManager


logger = logging.getLogger(__name__)


DEFAULT_CONSORTIUM_CODE = "SMHT"


class PortalConstants:

    ACCESSION = "accession"
    ANALYTES = "analytes"
    CELL_CULTURE = "cell_culture"
    CELL_CULTURE_MIXTURE_TYPE = "CellCultureMixture"
    CELL_CULTURE_TYPE = "CellCulture"
    CODE = "code"
    COMPONENTS = "components"
    LIBRARIES = "libraries"
    REFERENCE_GENOME = "reference_genome"
    SAMPLES = "samples"
    SOFTWARE = "software"
    STANDARD_FILE_EXTENSION = "standard_file_extension"
    TISSUE_TYPE = "Tissue"
    TYPE = "@type"
    VERSION = "version"


@dataclass(frozen=True)
class FilenameInfo:

    SEPARATOR: str = "_"

    def update(self, **kwargs: Any) -> FilenameInfo:
        """Update dataclass with given kwargs.

        Generates new dataclass with updated values, since frozen.
        """
        return FilenameInfo(**self.__dict__, **kwargs)

    def to_string(self) -> str:
        """Convert info to formatted string for filename."""
        raise NotImplementedError


@dataclass(frozen=True)
class InvalidInfo(FilenameInfo):
    pass


@dataclass(frozen=True)
class SampleSourceInfo:
    pass


@dataclass(frozen=True)
class TissueInfo(SampleSourceInfo):

    kit_id: str = ""
    protocol_id: str = ""
    aliquot_id: str = ""
    core_id: str = ""


@dataclass(frozen=True)
class CellLineInfo(SampleSourceInfo):
    pass


@dataclass(frozen=True)
class DonorInfo(FilenameInfo):

    sex: str = ""
    age: str = ""


@dataclass(frozen=True)
class SampleInfo(FilenameInfo):

    sample_source_info: Union[InvalidInfo, SampleSourceInfo] = InvalidInfo()
    donor_info: Union[InvalidInfo, DonorInfo] = InvalidInfo()


@dataclass(frozen=True)
class ExperimentInfo(FilenameInfo):

    sequencing_code: str = ""
    assay_code: str = ""


@dataclass(frozen=True)
class FileInfo(FilenameInfo):

    consortium_code: str = DEFAULT_CONSORTIUM_CODE
    center_code: str = ""
    accession: str = ""
    software: str = ""
    software_version: str = ""
    genome: str = ""
    variant_type: str = ""
    file_extension: str = ""


@dataclass(frozen=True)
class AnnotatedFilename:

    file: Dict[str, Any]
    sample_info: SampleInfo
    experiment_info: ExperimentInfo
    file_info: FileInfo


def create_annotated_filenames(
    search: str,
    identifiers: List[str],
    auth_key: Dict[str, str],
    dry_run: bool = False,
) -> None:
    """Create annotated filenames for given files.

    NOTE: Algorithm here is highly dependent on data model and items on
    the portal.
    """
    file_items = get_file_items(search, identifiers, auth_key)
    annonated_filenames = get_annotated_filenames(file_items, auth_key)
    if dry_run:
        log_dry_run(annonated_filenames)
    else:
        patch_annotated_filenames(annonated_filenames, auth_key)


def get_file_items(
    search: str,
    identifiers: List[str],
    auth_key: Dict[str, str],
) -> List[Dict[str, Any]]:
    """Get file items from given search query and idenitfiers."""
    return get_file_items_from_search(search, auth_key) + get_file_items_from_identifiers(
        identifiers, auth_key
    )


def get_file_items_from_search(search_query: str, auth_key: Dict[str, str]) -> List[str]:
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
    item: Union[str, Dict[str, Any]], auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """GET item from given input (identifier or embedded item)."""
    if isinstance(item, str):
        return get_item_from_identifier(item, auth_key)
    if isinstance(item, dict):
        identifier = get_uuid(item)
        return get_item_from_identifier(identifier, auth_key)
    raise ValueError(f"Invalid input: {item}")


def get_uuid(item: Dict[str, Any]) -> str:
    """Get UUID from item."""
    return item.get(PortalConstants.UUID, "")


@lru_cache
def get_item_from_identifier(
    identifier: str, auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get item metadata from given identifier.

    Handle and log error if item not found.
    """
    result = {}
    try:
        result = ff_utils.get_metadata(identifier, key=auth_key)
    except Exception as e:
        logger.error(f"Error getting item {identifier}: {e}")
    return result


def get_annotated_filenames(
    file_items: List[Dict[str, Any]], auth_key: Dict[str, str]
) -> List[AnnotatedFilename]:
    """Get annotated filenames for given file items."""
    return [get_annotated_filename(file_item, auth_key) for file_item in file_items]


def get_annotated_filename(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> AnnotatedFilename:
    """Get annotated filename for given file item."""
    return AnnotatedFilename(
        file_item,
        sample_info=get_sample_info(file_item, auth_key),
        experiment_info=get_experiment_info(file_item, auth_key),
        file_info=get_file_info(file_item, auth_key),
    )


def get_sample_info(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> SampleInfo:
    """Get sample info for given file item."""
    sample_source_info = get_sample_source_info(file_item, auth_key)
    donor_info = get_donor_info(file_item, auth_key)
    return SampleInfo(
        sample_source_info=sample_source_info,
        donor_info=donor_info,
    )


def get_sample_source_info(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Union[InvalidInfo, SampleSourceInfo]:
    """Get tissue info for file."""
    sample = get_sample_from_file(file_item, auth_key)
    if is_tissue_sample(sample, auth_key):
        return get_tissue_info_from_sample(sample)
    if is_cell_culture_sample(sample, auth_key):
        return get_cell_line_info_from_sample(sample)
    return InvalidInfo()


def is_tissue_sample(sample_item: Dict[str, Any], auth_key: Dict[str, str]) -> bool:
    """Check if sample derives from tissue."""
    sample_sources = get_sample_sources_from_sample(sample_item, auth_key)
    return any(
        [is_tissue(sample_source) for sample_source in sample_sources]
    )


def is_tissue(sample_source: Dict[str, Any]) -> bool:
    """Is sample source a Tissue item?"""
    source_types = get_type_info(sample_source)
    if PortalConstants.TISSUE_TYPE in source_types:
        return True
    return False


def is_cell_culture_sample(sample_item: Dict[str, Any], auth_key: Dict[str, str]) -> bool:
    """Check if sample derives from cell culture."""
    sample_sources = get_sample_sources_from_sample(sample_item, auth_key)
    return any(
        [is_cell_culture(sample_source) for sample_source in sample_sources]
    )


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
    sample_sources = sample_item.get(PortalConstants.SAMPLE_SOURCES_PROPERTY, [])
    return [get_item(item, auth_key) for item in sample_sources]


def get_tissue_info_from_sample(sample_item: Dict[str, Any]) -> TissueInfo:
    raise NotImplementedError("Not prepared to handle tissue samples yet")


def get_cell_line_info_from_sample(sample_item: Dict[str, Any]) -> CellLineInfo:
    return CellLineInfo()


def get_sample_from_file(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get sample for file by walking the data model."""
    result = {}
    samples = get_samples_from_file(file_item, auth_key)
    if not samples:
        logger.error(f"No sample found for file {file_item.get(PortalConstants.UUID)}")
    elif len(samples) > 1:
        logger.error(
            f"Multiple samples found for file {file_item.get(PortalConstants.UUID)}:"
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
    return get_items_from_property(libraries, PortalConstants.ANALYTES, auth_key)


def get_samples_from_analytes(
    analytes: List[Dict[str, Any]], auth_key: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Get samples for analytes."""
    return get_items_from_property(analytes, PortalConstants.SAMPLES, auth_key)


def get_donor_info(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Union[InvalidInfo, DonorInfo]:
    """Get donor info for file."""
    donor = get_donor_from_file(file_item, auth_key)
    if donor:
        return get_donor_info_from_donor(donor)
    return InvalidInfo()


def get_donor_from_file(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get donor for file by walking the data model."""
    sample_sources = get_sample_sources_from_file(file_item, auth_key)
    donors = get_donors_from_sample_sources(sample_sources, auth_key)
    if not donors:
        logger.error(f"No donor found for file {file_item.get(PortalConstants.UUID)}")
    elif len(donors) > 1:
        logger.error(
            f"Multiple donors found for file {file_item.get(PortalConstants.UUID)}:"
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
        return get_donor_from_item(sample_source_item, auth_key)
    raise NotImplementedError(
        f"Not prepared to handle sample source: {sample_source_item}"
    )


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
        get_donor_from_item(cell_culture, auth_key)
        for cell_culture in cell_cultures
    ]
    unique_donors = deduplicate_items_by_uuid(donors)
    if not unique_donors:
        logger.error(
            f"No unique donor found for cell culture mixture"
            f" {cell_culture_mixture_item.get(PortalConstants.UUID)}"
        )
    elif len(unique_donors) > 1:
        logger.error(
            f"Multiple unique donors found for cell culture mixture"
            f" {cell_culture_mixture_item.get(PortalConstants.UUID)}:"
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


def get_donor_info_from_donor(donor_item: Dict[str, Any]) -> DonorInfo:
    """Populate DonorInfo from donor item."""
    return DonorInfo(
        sex=donor_item.get(PortalConstants.SEX, ""),
        age=donor_item.get(PortalConstants.AGE, ""),
    )


def get_experiment_info(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> ExperimentInfo:
    """Get experiment info for file."""
    return ExperimentInfo(
        sequencing_code=get_sequencing_code(file_item, auth_key),
        assay_code=get_assay_code(file_item, auth_key),
    )


def get_sequencing_code(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> str:
    """Get sequencing code for file."""
    result = ""
    sequencing_items = get_sequencing_items_from_file(file_item, auth_key)
    if not sequencing_items:
        logger.error(
            f"No sequencing items found for file {file_item.get(PortalConstants.UUID)}"
        )
    elif len(sequencing_items) > 1:
        logger.error(
            f"Multiple sequencing items found for file {file_item.get(PortalConstants.UUID)}:"
            f" {sequencing_items}"
        )
    else:
        result = get_code(sequencing_items[0])
    return result


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
    return [
        get_sequencing_from_file_set(file_set, auth_key) for file_set in file_sets
    ]


def get_sequencing_from_file_set(
    file_set_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get sequencing item for file set."""
    sequencing = file_set_item.get(PortalConstants.SEQUENCING, {})
    return get_item(sequencing, auth_key)


def get_code(item: Dict[str, Any]) -> str:
    """Get file naming code from item."""
    return item.get(PortalConstants.CODE, "")


def get_assay_code(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> str:
    result = ""
    assays = get_assays_from_file(file_item, auth_key)
    if not assays:
        logger.error(
            f"No assays found for file {file_item.get(PortalConstants.UUID)}"
        )
    elif len(assays) > 1:
        logger.error(
            f"Multiple assays found for file {file_item.get(PortalConstants.UUID)}:"
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


def get_file_info(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> FileInfo:
    """Get file info for file."""
    return FileInfo(
        consortium_code=get_consortium_code(file_item, auth_key),
        center_code=get_center_code(file_item, auth_key),
        accession=get_accession(file_item, auth_key),
        software=get_software(file_item, auth_key),
        software_version=get_software_version(file_item, auth_key),
        genome=get_genome(file_item, auth_key),
        variant_type=get_variant_type(file_item),
        alignment_details=get_alignment_details(file_item),
        file_extension=get_file_extension(file_item, auth_key),
    )


def get_consortium_code(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> str:
    """Get consortium code for file.

    For now, just use default consortium code. Update when needed.
    """
    return DEFAULT_CONSORTIUM_CODE


def get_center_code(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> str:
    """Get center code for file.

    Assuming only one center per file.
    """
    result = ""
    submission_centers = get_submission_centers(file_item, auth_key)
    center_codes = get_unique_codes(submission_centers)
    if not center_codes:
        logger.error(
            f"No center codes found for file {file_item.get(PortalConstants.UUID)}"
        )
    elif len(center_codes) > 1:
        logger.error(
            f"Multiple center codes found for file {file_item.get(PortalConstants.UUID)}:"
            f" {center_codes}"
        )
    else:
        result = center_codes[0]
    return result


def get_submission_centers(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Get submission centers for file."""
    return [
        get_item(submission_center, auth_key)
        for submission_center in file_item.get(PortalConstants.SUBMISSION_CENTERS, [])
    ]


def get_unique_codes(items: List[Dict[str, Any]]) -> List[str]:
    """Get unique codes from items."""
    unique_codes = set(
        [get_code(item) for item in items if get_code(item)]
    )
    return list(unique_codes)


def get_accession(file_item: Dict[str, Any]) -> str:
    """Get file accession."""
    return file_item.get(PortalConstants.ACCESSION, "")


def get_software(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> str:
    """Get software for file.

    Assuming only one software per file.
    """
    result = ""
    software = get_software_from_file(file_item, auth_key)
    software_codes = get_unique_codes(software)
    if not software_codes:
        logger.error(
            f"No software codes found for file {file_item.get(PortalConstants.UUID)}"
        )
    elif len(software_codes) > 1:
        logger.error(
            f"Multiple software codes found for file {file_item.get(PortalConstants.UUID)}:"
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


def get_software_version(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> str:
    """Get software version for file.

    Assuming only one software version per file.
    """
    result = ""
    software = get_software_from_file(file_item, auth_key)
    software_with_codes = [
        software_item
        for software_item in software
        if get_code(software_item)
    ]
    if not software_with_codes:
        logger.error(
            f"No software version codes found for file {file_item.get(PortalConstants.UUID)}"
        )
    elif len(software_with_codes) > 1:
        logger.error(
            f"Multiple software version codes found for file {file_item.get(PortalConstants.UUID)}:"
            f" {software_with_codes}"
        )
    else:
        result = get_version(software_with_codes[0])
    return result


def get_version(item: Dict[str, Any]) -> str:
    """Get version from item."""
    return item.get(PortalConstants.VERSION, "")


def get_genome(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> str:
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
    result = ""
    variant_types = get_variant_types(file_item)
    if not variant_types:
        logger.error(
            f"No variant types found for file {file_item.get(PortalConstants.UUID)}"
        )
    elif len(variant_types) > 1:
        logger.error(
            f"Multiple variant types found for file {file_item.get(PortalConstants.UUID)}:"
            f" {variant_types}"
        )
    else:
        result = variant_types[0]
    return result


def get_variant_types(file_item: Dict[str, Any]) -> List[str]:
    """Get variant types for file."""
    return file_item.get(PortalConstants.VARIANT_TYPES, [])


def get_alignment_details(file_item: Dict[str, Any]) -> List[str]:
    """Get alignment details for file."""
    return file_item.get(PortalConstants.ALIGNMENT_DETAILS, [])


def get_file_extension(
    file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> str:
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


def log_dry_run(annotated_filenames: List[AnnotatedFilename]) -> None:
    """Log dry run output."""
    for annotated_filename in annotated_filenames:
        file_uuid = get_uuid(annotated_filename.file)
        try:
            generated_filename = annotated_filename.to_string()
            logger.info(
                f"File {file_uuid} would be updated with annotated filename:"
                f" {generated_filename}"
            )
        except Exception as e:
            logger.error(f"Error generating filename for file {file_uuid}: {e}")


def patch_annotated_filenames(
    annotated_filenames: List[AnnotatedFilename], auth_key: Dict[str, str]
) -> None:
    """Patch files with annotated filenames.

    Also, patch associated extra file filenames.
    """
    for annotated_filename in annotated_filenames:
        if is_valid_annotated_filename(annotated_filename):
            patch_file_with_annotated_filename(annotated_filename, auth_key)
        else:
            logger.error(
                f"Invalid annotated filename for file"
                f" {get_uuid(annotated_filename.file)}:"
                f" {annotated_filename.to_string()}"
            )


def patch_file_with_annotated_filename(
    annotated_filename: AnnotatedFilename, auth_key: Dict[str, str]
) -> None:
    file_uuid = get_uuid(annotated_filename.file)
    try:
        file_uuid = get_uuid(annotated_filename.file)
        patch_body = get_patch_body(annotated_filename)
        ff_utils.patch_metadata(
            patch_body, obj_id=file_uuid, key=auth_key
        )
        logger.info(f"Successfully updated file {file_uuid}")
    except Exception as e:
        logger.error(f"Error updating file {file_uuid}: {e}")


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
        logging.basicConfig(level=logging.DEBUG)
    auth_key = SMaHTKeyManager.get_keydict_for_env(args.env)
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
