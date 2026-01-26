from __future__ import annotations

import argparse
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple, Union

from dcicutils import ff_utils

from encoded.commands.utils import get_auth_key
from encoded.item_utils import (
    constants,
    assay as assay_utils,
    cell_culture_mixture as cell_culture_mixture_utils,
    cell_line as cell_line_utils,
    donor as donor_utils,
    file as file_utils,
    file_format as file_format_utils,
    file_set as file_set_utils,
    item as item_utils,
    sample as sample_utils,
    sample_source as sample_source_utils,
    supplementary_file as supp_file_utils,
    submitted_file as submitted_file_utils,
    tissue as tissue_utils,
    tissue_sample as tissue_sample_utils,
    donor_specific_assembly as dsa_utils,
    reference_genome as rg_utils
)
from encoded.item_utils.constants import file as file_constants
from encoded.item_utils.utils import RequestHandler


logger = logging.getLogger(__name__)

FILENAME_SEPARATOR = "-"
ANALYSIS_INFO_SEPARATOR = "_"
CHAIN_FILE_INFO_SEPARATOR = "To"
DSA_INFO_VALUE = "DSA"

RNA_DATA_CATEGORY = "RNA Quantification"
GENE_DATA_TYPE = "Gene Expression"
ISOFORM_DATA_TYPE = "Transcript Expression"
CONSENSUS_DATA_CATEGORY = "Consensus Reads"
DUPLEX_ASSAY_CATEGORY = "Duplex-seq WGS"
KINNEX_ASSAY_ID = "bulk_mas_iso_seq"
TRANSCRIPT_SEQUENCE_DATA_TYPE = "Transcript Sequence"
TRANSCRIPT_MODEL_DATA_TYPE = "Transcript Model"
SEQUENCING_READS_DATA_CATEGORY = "Sequencing Reads"
ALIGNED_READS_DATA_TYPE = "Aligned Reads"

DEFAULT_PROJECT_ID = constants.PRODUCTION_PREFIX
DEFAULT_ABSENT_FIELD = "X"
ABSENT_AGE = "N"
ABSENT_SEX = ABSENT_AGE

ALIGNED_READS_EXTENSION = "aligned"
PHASED_EXTENSION = "phased"
SORTED_EXTENSION = "sorted"

MALE_SEX_ABBREVIATION = "M"
FEMALE_SEX_ABBREVIATION = "F"


@dataclass(frozen=True)
class FilenamePart:
    value: str
    errors: Tuple[str]  # Hashable so class can be used in set


@dataclass(frozen=True)
class AnnotatedFilename:
    project_id: str
    sample_source_id: str
    protocol_id: str
    aliquot_id: str
    donor_sex_and_age: str
    sequencing_and_assay_codes: str
    sequencing_center_code: str
    accession: str
    analysis_info: str
    file_extension: str
    errors: List[str]

    def __str__(self) -> str:
        return get_annotated_filename_string(self)


def get_identifier(annotated_filename: AnnotatedFilename) -> str:
    """Get identifier for annotated filename."""
    return annotated_filename.accession


@dataclass(frozen=True)
class AssociatedItems:

    file: Dict[str, Any]
    file_format: Dict[str, Any]
    sequencing_center: Dict[str, Any]
    software: List[Dict[str, Any]]
    reference_genome: Dict[str, Any]
    gene_annotations: Dict[str, Any]
    file_sets: List[Dict[str, Any]]
    donor_specific_assembly: Dict[str, Any]
    assays: List[Dict[str, Any]]
    sequencers: List[Dict[str, Any]]
    sample_sources: List[Dict[str, Any]]
    cell_culture_mixtures: List[Dict[str, Any]]
    cell_lines: List[Dict[str, Any]]
    tissue_samples: List[Dict[str, Any]]
    tissues: List[Dict[str, Any]]
    donors: List[Dict[str, Any]]
    target_assembly: Dict[str, Any]
    source_assembly: Dict[str, Any]


def get_associated_items(
    file: Dict[str, Any],
    request_handler: RequestHandler,
    file_sets: Optional[List[Dict[str, Any]]] = None,
) -> AssociatedItems:
    """Get associated items for given file for annotated filename.

    If provided, use file sets in addition to the file itself, so
    annotated filename can be created during release process.
    """
    sequencing_center = get_sequencing_center(file, request_handler)
    file_format = get_file_format(file, request_handler)
    software = get_software(file, request_handler)
    reference_genome = get_reference_genome(file, request_handler)
    gene_annotations = get_gene_annotations(file, request_handler)
    donor_specific_assembly = get_donor_specific_assembly(file, request_handler)
    if donor_specific_assembly:
        file_sets = get_derived_from_file_sets(file, request_handler)
        target_assembly = get_target_assembly(file, request_handler)
        source_assembly = get_source_assembly(file, request_handler)
    else:
        file_sets = get_file_sets(file, request_handler, file_sets=file_sets)
        target_assembly = []
        source_assembly = []
    assays = get_assays(file_sets, request_handler)
    sequencers = get_sequencers(file_sets, request_handler)
    samples = get_samples(file_sets, request_handler)
    tissue_samples = get_tissue_samples(samples)
    sample_sources = get_sample_sources(samples, request_handler)
    cell_culture_mixtures = get_cell_culture_mixtures(sample_sources)
    tissues = get_tissues(sample_sources)
    cell_lines = get_cell_lines(sample_sources, request_handler)
    donors = get_donors(tissues, cell_lines, request_handler)
    return AssociatedItems(
        file=file,
        sequencing_center=sequencing_center,
        file_format=file_format,
        software=software,
        reference_genome=reference_genome,
        gene_annotations=gene_annotations,
        file_sets=file_sets,
        donor_specific_assembly=donor_specific_assembly,
        assays=assays,
        sequencers=sequencers,
        tissue_samples=tissue_samples,
        sample_sources=sample_sources,
        cell_culture_mixtures=cell_culture_mixtures,
        tissues=tissues,
        cell_lines=cell_lines,
        donors=donors,
        target_assembly=target_assembly,
        source_assembly=source_assembly
    )


def get_item(
    identifier: Union[str, Dict[str, Any]], request_handler: RequestHandler
) -> Dict[str, Any]:
    """Get item from identifier."""
    return request_handler.get_item(identifier)


def get_items(
    identifiers: Union[str, Dict[str, Any]], request_handler: RequestHandler
) -> List[Dict[str, Any]]:
    """Get items from identifiers."""
    return request_handler.get_items(identifiers)


def get_file_sets(
    file: Dict[str, Any],
    request_handler: RequestHandler,
    file_sets: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Get file sets for file."""
    file_sets = file_sets or []
    to_get = file_utils.get_file_sets(file) + file_sets
    return get_items(to_get, request_handler)


def get_derived_from_file_sets(
    file: Dict[str, Any],
    request_handler: RequestHandler
) -> List[Dict[str, Any]]:
    """Get file sets from derived_from files."""
    to_get = supp_file_utils.get_derived_from_file_sets(file,request_handler)
    return get_items(to_get,request_handler)


def get_donor_specific_assembly(
    file: Dict[str, Any],
    request_handler: RequestHandler,
) -> List[Dict[str, Any]]:
    """Get donor_specific_assembly for supplementary file."""
    if supp_file_utils.is_supplementary_file(file):
        to_get = supp_file_utils.get_donor_specific_assembly(file)
        return get_item(to_get, request_handler)
    return


def get_file_format(
    file: Dict[str, Any], request_handler: RequestHandler
) -> Dict[str, Any]:
    """Get file format for file."""
    return get_item(file_utils.get_file_format(file), request_handler)


def get_sequencing_center(
    file: Dict[str, Any], request_handler: RequestHandler
) -> Dict[str, Any]:
    """Get sequencing center for file."""
    if submitted_file_utils.is_submitted_file(file):
        return get_items(item_utils.get_submission_centers(file), request_handler)[0]
    return get_item(file_utils.get_sequencing_center(file), request_handler)


def get_reference_genome(
    file: Dict[str, Any], request_handler: RequestHandler
) -> Dict[str, Any]:
    """Get reference genome for file."""
    return get_item(file_utils.get_reference_genome(file), request_handler)


def get_target_assembly(
    file: Dict[str, Any], request_handler: RequestHandler
) -> List[Dict[str, Any]]:
    """Get target assembly for file."""
    return get_reference_genome_search(supp_file_utils.get_target_assembly(file), request_handler)


def get_source_assembly(
    file: Dict[str, Any], request_handler: RequestHandler
) -> List[Dict[str, Any]]:
    """Get source assembly for file."""
    return get_reference_genome_search(supp_file_utils.get_source_assembly(file), request_handler)


def get_reference_genome_search(
        value: str,
        request_handler: RequestHandler
    ) -> List[Dict[str, Any]]:
    """
    Search Reference Genomes by code and title and return unique code for chain file output.
    
    NOTE: This relies on manual setting of ReferenceGenome `code` values internally. 
    `title` for DSAs is submitter-provided and may be variable.
    """
    code_search = f"/search/?type=ReferenceGenome&code={value}"
    title_search = f"/search/?type=ReferenceGenome&title={value}"
    result = ff_utils.search_metadata(code_search, key=request_handler.auth_key) + ff_utils.search_metadata(title_search, key=request_handler.auth_key)
    return result


def get_gene_annotations(
    file: Dict[str, Any], request_handler: RequestHandler
) -> Dict[str, Any]:
    """Get gene annotations for file."""
    return get_items(file_utils.get_annotation(file), request_handler)


def get_software(
    file: Dict[str, Any], request_handler: RequestHandler
) -> List[Dict[str, Any]]:
    """Get software for file."""
    return get_items(file_utils.get_software(file), request_handler)


def get_assays(
    file_sets: List[Dict[str, Any]], request_handler: RequestHandler
) -> List[Dict[str, Any]]:
    """Get assays for file sets."""
    assays = [
        item
        for file_set in file_sets
        for item in file_set_utils.get_assays(request_handler, file_set)
    ]
    return get_items(assays, request_handler)


def get_sequencers(
    file_sets: List[Dict[str, Any]], request_handler: RequestHandler
) -> List[Dict[str, Any]]:
    """Get sequencers for file sets."""
    sequencers = [
        file_set_utils.get_sequencer(request_handler, file_set)
        for file_set in file_sets
    ]
    return get_items(sequencers, request_handler)


def get_samples(
    file_sets: List[Dict[str, Any]], request_handler: RequestHandler
) -> List[Dict[str, Any]]:
    """Get samples for file sets."""
    samples = [
        item
        for file_set in file_sets
        for item in file_set_utils.get_samples(file_set, request_handler)
    ]
    return get_items(samples, request_handler)


def get_tissue_samples(samples: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Filter samples to get tissue samples."""
    return [sample for sample in samples if sample_utils.is_tissue_sample(sample)]


def get_sample_sources(
    samples: List[Dict[str, Any]], request_handler: RequestHandler
) -> List[Dict[str, Any]]:
    """Get sample sources for samples."""
    sample_sources = [
        item for sample in samples for item in sample_utils.get_sample_sources(sample)
    ]
    return get_items(sample_sources, request_handler)


def get_cell_culture_mixtures(
    sample_sources: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Get cell culture mixtures from sample sources."""
    return [
        source
        for source in sample_sources
        if cell_culture_mixture_utils.is_cell_culture_mixture(source)
    ]


def get_tissues(sample_sources: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Get tissues from sample sources."""
    return [source for source in sample_sources if tissue_utils.is_tissue(source)]


def get_cell_lines(
    sample_sources: List[Dict[str, Any]], request_handler: RequestHandler
) -> List[Dict[str, Any]]:
    """Get cell lines from sample sources."""
    cell_lines = [
        item
        for source in sample_sources
        for item in sample_source_utils.get_cell_lines(request_handler, source)
    ]
    return get_items(cell_lines, request_handler)


def get_donors(
    tissues: List[Dict[str, Any]],
    cell_lines: List[Dict[str, Any]],
    request_handler: RequestHandler,
) -> List[Dict[str, Any]]:
    """Get donors from tissues and cell lines."""
    donor_ids = [tissue_utils.get_donor(tissue) for tissue in tissues] + [
        cell_line_utils.get_donor(cell_line) for cell_line in cell_lines
    ]
    return get_items(donor_ids, request_handler)


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
    request_handler = RequestHandler(auth_key=auth_key)
    files = get_files(search, identifiers, request_handler)
    logger.info(f"Found {len(files)} files to process")
    annotated_filenames = get_annotated_filenames(files, request_handler)
    logger.info(f"Generated {len(annotated_filenames)} annotated filenames")
    log_annotated_filenames(annotated_filenames)
    if dry_run:
        logger.info("Dry run: not patching filenames")
    else:
        patch_annotated_filenames(annotated_filenames, auth_key)


def get_files(
    search: str,
    identifiers: List[str],
    request_handler: RequestHandler,
) -> List[Dict[str, Any]]:
    """Get file items from given search query and idenitfiers."""
    return get_files_from_search(
        search, request_handler.auth_key
    ) + get_files_from_identifiers(identifiers, request_handler)


def get_files_from_search(search_query: str, auth_key: Dict[str, str]) -> List[str]:
    """Get file items from given search query."""
    if search_query:
        return get_files_from_search_query(search_query, auth_key)
    return []


def get_files_from_search_query(
    search_query: str, auth_key: Dict[str, str]
) -> List[str]:
    """Get file items from given search query."""
    try:
        search_result = ff_utils.search_metadata(search_query, key=auth_key)
        result = filter_files(search_result)
    except Exception as e:
        logger.error(f"Error searching for files: {e}")
        result = []
    return result


def filter_files(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Get files from given items."""
    return [item for item in items if file_utils.is_file(item)]


def get_files_from_identifiers(
    identifiers: List[str], request_handler: RequestHandler
) -> List[str]:
    """Get file items from given identifiers."""
    items = request_handler.get_items(identifiers)
    return filter_files(items)


def get_annotated_filenames(
    files: List[Dict[str, Any]], request_handler: RequestHandler
) -> List[AnnotatedFilename]:
    """Get annotated filenames for given files."""
    return [get_annotated_filename(file_item, request_handler) for file_item in files]


def get_annotated_filename(
    file: Dict[str, Any],
    request_handler: RequestHandler,
    file_sets: Optional[Dict[str, List[str]]] = None,
) -> AnnotatedFilename:
    """Get annotated filename for given file.

    Collect all filename parts, recording either the value or any errors
    encountered in the process to be logged later.
    `derived_from` applies to SupplementaryFiles
    """
    associated_items = get_associated_items(file, request_handler, file_sets=file_sets)
    project_id = get_project_id(
        associated_items.cell_culture_mixtures,
        associated_items.cell_lines,
        associated_items.tissues,
    )
    sample_source_id = get_sample_source_id(
        associated_items.sample_sources,
        associated_items.cell_culture_mixtures,
        associated_items.cell_lines,
        associated_items.tissues,
    )
    protocol_id = get_protocol_id(
        associated_items.cell_culture_mixtures,
        associated_items.cell_lines,
        associated_items.tissues,
    )
    aliquot_id = get_aliquot_id(
        associated_items.cell_culture_mixtures,
        associated_items.cell_lines,
        associated_items.tissue_samples,
    )
    donor_sex_and_age = get_donor_sex_and_age(
        associated_items.donors, associated_items.sample_sources
    )
    sequencing_and_assay_codes = get_sequencing_and_assay_codes(
        associated_items.file, 
        associated_items.sequencers, 
        associated_items.assays
    )
    sequencing_center_code = get_sequencing_center_code(
        associated_items.sequencing_center
    )
    accession = get_accession(file)
    file_extension = get_file_extension(file, associated_items.file_format)
    analysis_info = get_analysis(
        file,
        associated_items.assays,
        associated_items.software,
        associated_items.reference_genome,
        associated_items.gene_annotations,
        associated_items.file_format,
        associated_items.target_assembly,
        associated_items.source_assembly,
        associated_items.donor_specific_assembly,
    )
    errors = collect_errors(
        project_id,
        sample_source_id,
        protocol_id,
        aliquot_id,
        donor_sex_and_age,
        sequencing_and_assay_codes,
        sequencing_center_code,
        accession,
        analysis_info,
        file_extension,
    )
    return AnnotatedFilename(
        project_id=project_id.value,
        sample_source_id=sample_source_id.value,
        protocol_id=protocol_id.value,
        aliquot_id=aliquot_id.value,
        donor_sex_and_age=donor_sex_and_age.value,
        sequencing_and_assay_codes=sequencing_and_assay_codes.value,
        sequencing_center_code=sequencing_center_code.value,
        accession=accession.value,
        analysis_info=analysis_info.value,
        file_extension=file_extension.value,
        errors=errors,
    )


def get_filename_part(
    value: str = "", errors: Optional[List[str]] = None
) -> FilenamePart:
    """Get filename part with given value and errors."""
    if errors:
        return FilenamePart(value, tuple(errors))
    return FilenamePart(value=value, errors=tuple())


def get_exclusive_filename_part(
    filename_parts: List[FilenamePart], part_name: str
) -> FilenamePart:
    """Get exclusive filename part from given collection.

    If no filename part or multiple found, return an error.

    Idea is that only one value expected for these and anything else
    suggests either a problem with the data that needs investigation.
    """
    unique_parts = set(filename_parts)
    if not unique_parts:
        return get_filename_part(errors=[f"No value found for {part_name}"])
    if len(unique_parts) > 1:
        values = set([part.value for part in unique_parts])
        errors = [error for part in unique_parts for error in part.errors]
        if len(values) > 1:
            errors += [f"Multiple values found for {part_name}: {values}"]
        return get_filename_part(errors=errors)
    return filename_parts[0]


def get_filename_part_for_values(
    values: List[str], part_name: str, source_name: str = ""
) -> FilenamePart:
    """Get filename part for given values.

    If no values or multiple found, provide an error message.
    Otherwise, return the single value.
    """
    if not values:
        error_message = f"No value found for {part_name}"
        if source_name:
            error_message += f" from {source_name}"
        return get_filename_part(errors=[error_message])
    if len(set(values)) > 1:
        if source_name:
            error_message = (
                f"Multiple values found for {part_name} from {source_name}:"
                f" {values}"
            )
        else:
            error_message = f"Multiple values found for {part_name}: {values}"
        empty_values = any(not value for value in values)
        if empty_values:
            error_message += " (including empty values)"
        return get_filename_part(errors=[error_message])
    return get_filename_part(value=values[0])


def get_project_id(
    cell_culture_mixtures: List[Dict[str, Any]],
    cell_lines: List[Dict[str, Any]],
    tissues: List[Dict[str, Any]],
) -> FilenamePart:
    """Get project ID for file.

    If cell culture mixture or cell line-derived, use default project ID,
    as assuming to be from benchmarking cell line data.

    If tissue-derived, parse project ID from tissue item, which should
    hold ID from TPC.
    """
    parts = []
    if cell_culture_mixtures or cell_lines:
        parts.append(get_filename_part(value=DEFAULT_PROJECT_ID))
    if tissues:
        parts.append(get_project_id_from_tissues(tissues))
    return get_exclusive_filename_part(parts, "project ID")


def get_project_id_from_tissues(tissues: List[Dict[str, Any]]) -> FilenamePart:
    """Get project ID from tissue item."""
    project_ids = [tissue_utils.get_project_id(tissue) for tissue in tissues]
    return get_filename_part_for_values(project_ids, "project ID", source_name="tissue")


def get_sample_source_id(
    sample_sources: List[Dict[str, Any]],
    cell_culture_mixtures: List[Dict[str, Any]],
    cell_lines: List[Dict[str, Any]],
    tissues: List[Dict[str, Any]],
) -> FilenamePart:
    """Get sample source ID for file.

    If only cell culture mixture-derived, use mixture code, and don't
    attempt to get cell line IDs (which likely exist).
    """
    if is_only_cell_culture_mixture_derived(sample_sources):
        return get_cell_culture_mixture_code(cell_culture_mixtures)
    parts = []
    if cell_culture_mixtures:
        parts.append(get_cell_culture_mixture_code(cell_culture_mixtures))
    if cell_lines:
        parts.append(get_cell_line_id(cell_lines))
    if tissues:
        parts.append(get_donor_kit_id(tissues))
    return get_exclusive_filename_part(parts, "sample source ID")


def is_only_cell_culture_mixture_derived(sample_sources: List[Dict[str, Any]]) -> bool:
    """Check if only cell culture mixture-derived."""
    return all(
        cell_culture_mixture_utils.is_cell_culture_mixture(source)
        for source in sample_sources
    )


def get_cell_culture_mixture_code(
    cell_culture_mixtures: List[Dict[str, Any]],
) -> FilenamePart:
    """Get mixture code for file naming."""
    codes = [
        item_utils.get_code(cell_culture_mixture)
        for cell_culture_mixture in cell_culture_mixtures
    ]
    return get_filename_part_for_values(
        codes, "sample source ID", source_name="cell culture mixture"
    )


def get_cell_line_id(
    cell_lines: List[Dict[str, Any]],
) -> FilenamePart:
    """Get cell line ID for file naming."""
    codes = [item_utils.get_code(cell_line) for cell_line in cell_lines]
    return get_filename_part_for_values(
        codes, "sample source ID", source_name="cell line"
    )


def get_donor_kit_id(tissues: List[Dict[str, Any]]) -> FilenamePart:
    """Get donor kit ID for file naming."""
    donor_kit_ids = [tissue_utils.get_donor_kit_id(tissue) for tissue in tissues]
    return get_filename_part_for_values(
        donor_kit_ids, "sample source ID", source_name="tissue"
    )


def get_protocol_id(
    cell_culture_mixtures: List[Dict[str, Any]],
    cell_lines: List[Dict[str, Any]],
    tissues: List[Dict[str, Any]],
) -> FilenamePart:
    """Get protocol ID for file."""
    parts = []
    if cell_culture_mixtures or cell_lines:
        parts.append(get_filename_part(value=DEFAULT_ABSENT_FIELD))
    if tissues:
        parts.append(get_protocol_id_from_tissues(tissues))
    return get_exclusive_filename_part(parts, "protocol ID")


def get_protocol_id_from_tissues(tissues: List[Dict[str, Any]]) -> FilenamePart:
    """Get protocol ID from tissue items."""
    protocol_ids = [tissue_utils.get_protocol_id(tissue) for tissue in tissues]
    return get_filename_part_for_values(
        protocol_ids, "protocol ID", source_name="tissue"
    )


def get_aliquot_id(
    cell_culture_mixtures: List[Dict[str, Any]],
    cell_lines: List[Dict[str, Any]],
    tissue_samples: List[Dict[str, Any]],
) -> FilenamePart:
    """Get tissue aliquot ID for file."""

    parts = []
    if cell_culture_mixtures or cell_lines:
        parts.append(get_filename_part(value=DEFAULT_ABSENT_FIELD))
    if tissue_samples:
        parts.append(get_aliquot_id_from_samples(tissue_samples))
    return get_exclusive_filename_part(parts, "tissue aliquot ID")


def get_aliquot_id_from_samples(tissue_samples: List[Dict[str, Any]]) -> FilenamePart:
    """Get aliquot ID from sample items.

    Some special handling required to transform aliquot ID from
    metadata to that of the filename.
    Duplicate tissue samples from TPC are ignored by grabbing only unique aliquot_ids.
    If the external_id indicates it is a benchmarking or production tissue_sample, check for mergability of tissue sample aliquots
    """
    aliquot_ids = [
        get_aliquot_id_from_tissue_sample(sample) for sample in tissue_samples
    ]
    aliquot_ids = [id for id in set(aliquot_ids)] # Get unique ids to remove TPC duplicates
    bench_or_prod = [ tissue_sample_utils.is_benchmarking(sample) or tissue_sample_utils.is_production(sample) for sample in tissue_samples]
    if all(bench_or_prod):
        if len(aliquot_ids) > 1:
            aliquot_ids = get_multiple_aliquot_id_from_samples(aliquot_ids)
    return get_filename_part_for_values(
        aliquot_ids, "tissue aliquot ID", source_name="sample"
    )


def get_multiple_aliquot_id_from_samples(ids: List[str]):
    """Get filename part for files merged from multiple tissue sample aliquots.
    
    `aliquot_id` is the first two or three numbers indicating the tissue sample aliquot (e.g. 01 or 001) and `core_id` is the last two values which are either an alpha-numeric code for Core or Specimen samples (e.g. A1), or XX for samples without spatial information (Homogenate and Liquid).
    """
    aliquot_ids = []
    core_ids = []
    for id in ids:
        aliquot_id = id[:-2]
        core_id = id[-2:] # grab last two alphanumerals
        aliquot_ids.append(aliquot_id) if aliquot_id not in aliquot_ids else aliquot_ids
        core_ids.append(core_id) if core_id not in core_ids else core_ids
    if len(aliquot_ids) == 1 and len(core_ids) > 1:
        aliquot_core_id =  [f"{aliquot_ids[0]}MC"]
    else:
       aliquot_core_id = ["MAMC"]
    return aliquot_core_id


def get_aliquot_id_from_tissue_sample(tissue_sample: Dict[str, Any]) -> str:
    """Get aliquot ID from tissue sample item.

    If TissueSample is does not contain spatial information in external id (Homogenate or Liquid), provide default value.

    Otherwise, return the aliquot ID from the metadata.
    """
    if not tissue_sample_utils.has_spatial_information(tissue_sample):
        return DEFAULT_ABSENT_FIELD * 2
    return sample_utils.get_aliquot_id(tissue_sample)


def get_donor_sex_and_age(
    donors: List[Dict[str, Any]],
    sample_sources: List[Dict[str, Any]],
) -> FilenamePart:
    """Get donor sex and age for file.

    Special handling for cell culture mixture-derived files, as these
    may have multiple donors or none.
    """
    if not donors:
        if is_only_cell_culture_mixture_derived(sample_sources):
            return get_filename_part(value=get_null_sex_and_age())
        return get_filename_part(errors=["No donors found"])
    sex_and_age_parts = get_sex_and_age_parts(donors)
    if len(sex_and_age_parts) > 1 and is_only_cell_culture_mixture_derived(
        sample_sources
    ):
        return get_filename_part(value=get_null_sex_and_age())
    return get_exclusive_filename_part(sex_and_age_parts, "donor age and sex")


def get_null_sex_and_age() -> str:
    """Get default null sex and age string."""
    return f"{ABSENT_SEX}{ABSENT_AGE}"


def get_sex_and_age_parts(donors: List[str]) -> List[FilenamePart]:
    """Get donor and age parts for all donors."""
    return [get_sex_and_age_part(donor) for donor in donors]


def get_sex_and_age_part(donor: Dict[str, Any]) -> FilenamePart:
    """Get donor and age part for given donor."""
    sex = get_sex_abbreviation(donor_utils.get_sex(donor))
    age = donor_utils.get_age(donor)
    if sex and age:
        return get_filename_part(value=f"{sex}{age}")
    errors = []
    if not sex:
        errors += [f"Unknown sex for donor {item_utils.get_uuid(donor)}"]
    if not age:
        errors += [f"Unknown age for donor {item_utils.get_uuid(donor)}"]
    return get_filename_part(errors=errors)


def get_sex_abbreviation(sex: str) -> str:
    """Translate sex to abbreviation for file naming."""
    if sex == "Male":
        return MALE_SEX_ABBREVIATION
    if sex == "Female":
        return FEMALE_SEX_ABBREVIATION
    if sex == "Unknown":
        return ABSENT_SEX
    return ""


def get_sequencing_and_assay_codes(
    file: Dict[str, Any],
    sequencers: List[Dict[str, Any]],
    assays: List[Dict[str, Any]],
) -> FilenamePart:
    """Get sequencing and assay codes for file.
    
    Returns XX for Genome Assembly and Reference Conversion files.
    """
    sequencing_codes = get_sequencing_codes(sequencers)
    assay_codes = get_assay_codes(assays)
    if len(sequencing_codes) == 1 and len(assay_codes) == 1:
        return get_filename_part(value=f"{sequencing_codes[0]}{assay_codes[0]}")
    elif supp_file_utils.is_genome_assembly(file) or supp_file_utils.is_reference_conversion(file):
        return get_filename_part(value="XX")
    errors = []
    if not sequencing_codes:
        errors.append("No sequencing code found")
    else:
        errors.append(f"Multiple sequencing codes found: {sequencing_codes}")
    if not assay_codes:
        errors.append("No assay code found")
    else:
        errors.append(f"Multiple assay codes found: {assay_codes}")
    return get_filename_part(errors=errors)


def get_sequencing_codes(sequencers: List[Dict[str, Any]]) -> List[str]:
    """Get sequencing code for file."""
    return list(set([item_utils.get_code(sequencer) for sequencer in sequencers]))


def get_assay_codes(assays: List[Dict[str, Any]]) -> List[str]:
    """Get assay code for file."""
    return list(set([item_utils.get_code(assay) for assay in assays]))


def get_sequencing_center_code(sequencing_center: Dict[str, Any]) -> FilenamePart:
    """Get sequencing center code for file."""
    code = item_utils.get_code(sequencing_center)
    if code:
        return get_filename_part(value=code.lower())
    return get_filename_part(errors=["Unknown sequencing center code"])


def get_accession(file: Dict[str, Any]) -> FilenamePart:
    """Get accession for file."""
    accession = item_utils.get_accession(file)
    if accession:
        return get_filename_part(value=accession)
    return get_filename_part(errors=["Unknown accession"])


def get_analysis(
    file: Dict[str, Any],
    assay: List[Dict[str, Any]],
    software: List[Dict[str, Any]],
    reference_genome: Dict[str, Any],
    gene_annotations: Dict[str, Any],
    file_extension: Dict[str, Any],
    target_assembly: List[Dict[str, Any]],
    source_assembly: List[Dict[str, Any]],
    donor_specific_assembly: Dict[str, Any],
) -> FilenamePart:
    """Get analysis info for file.

    Some error handling here for missing data by file type, but not
    exhaustive and allowing for some flexibility in what is expected.
    """
    software_and_versions = get_software_and_versions(software)
    reference_genome_code = item_utils.get_code(reference_genome)
    gene_annotation_code = get_annotations_and_versions(gene_annotations)
    transcript_info_code = get_rna_seq_tsv_value(file, file_extension)
    haplotype_code = get_haplotype_value(file, file_extension, donor_specific_assembly)
    kinnex_info_code = get_kinnex_value(file, assay)
    consensus_read_flag = get_consensus_value(file, assay)
    chain_code = get_chain_file_value(file, target_assembly, source_assembly, file_extension)
    value = get_analysis_value(
        software_and_versions,
        reference_genome_code,
        gene_annotation_code,
        transcript_info_code,
        chain_code,
        haplotype_code,
        consensus_read_flag,
        kinnex_info_code
    )
    errors = get_analysis_errors(
        file,
        reference_genome_code,
        gene_annotation_code,
        transcript_info_code,
        chain_code,
        haplotype_code,
        file_extension,
        assay,
    )
    if errors:
        return get_filename_part(errors=errors)
    if not value:
        if file_utils.is_unaligned_reads(file):  # Think this is the only case (?)
            return get_filename_part(value=DEFAULT_ABSENT_FIELD)
        return get_filename_part(errors=["Unknown analysis info"])
    return get_filename_part(value=value)


def get_analysis_errors(
    file: Dict[str, Any], 
    reference_genome_code: str,
    gene_annotation_code: str,
    transcript_info_code:  str,
    chain_code: str,
    haplotype_code: str,
    file_extension: Dict[str, Any],
    assays: List[Dict[str, Any]],
) -> List[str]:
    """Get analysis errors for file by file type."""
    errors = []
    if file_utils.is_unaligned_reads(file):
        if reference_genome_code:
            errors.append("Unexpected reference genome code found")
    if file_utils.is_aligned_reads(file):
        if not reference_genome_code:
            errors.append("No reference genome code found")
    if file_utils.is_variant_calls(file):
        if not reference_genome_code:
            errors.append("No reference genome code found")
    if RNA_DATA_CATEGORY in file_utils.get_data_category(file):
        if not gene_annotation_code and KINNEX_ASSAY_ID not in get_assay_ids(assays):
            errors.append("No gene annotation code found")
        elif file_format_utils.is_tsv_file(file_extension) and not transcript_info_code:
            errors.append("No gene or isoform code found")
    if file_format_utils.is_chain_file(file_extension):
        if not chain_code:
            errors.append("No chain code found")
    if CONSENSUS_DATA_CATEGORY in file_utils.get_data_category(file):
        if len(get_assay_categories(assays)) == 0:
            errors.append("No assay categories found.")
        elif len(get_assay_categories(assays)) > 1:
            errors.append("Multiple assay categories found.")
    return errors


def get_analysis_value(
    software_and_versions: str,
    reference_genome_code: str,
    gene_annotation_code: str,
    transcript_info_code: str,
    chain_code: str,
    haplotype_code: str,
    consensus_read_flag: str,
    kinnex_info_code: str,
) -> str:
    """Get analysis value for filename."""
    to_write = [
        string
        for string in [software_and_versions, reference_genome_code, gene_annotation_code, transcript_info_code, chain_code, haplotype_code, consensus_read_flag, kinnex_info_code]
        if string
    ]
    return ANALYSIS_INFO_SEPARATOR.join(to_write)


def get_annotations_and_versions(gene_annotations: List[Dict[str, Any]]) -> str:
    """Get gene annotation codes and accompanying versions for file.

    Currently only looking for items with codes, as these are
    expected to be the annotations used for naming.
    """
    annotations_with_codes = get_annotations_with_codes(gene_annotations)
    if not annotations_with_codes:
        return ""
    annotations_with_codes_and_versions = get_annotations_with_versions(annotations_with_codes)
    if len(annotations_with_codes) == len(annotations_with_codes_and_versions):
        return get_annotations_and_versions_string(annotations_with_codes_and_versions)
    missing_versions = get_annotation_codes_missing_versions(annotations_with_codes)
    logger.warning(f"Missing versions for annotation items: {missing_versions}.")
    return ""


def get_annotations_with_codes(
    annotation_items: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Get annotation reference file items with codes."""
    return [item for item in annotation_items if item_utils.get_code(item)]


def get_annotations_with_versions(
    annotation_items: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Get annotation reference file items with versions."""
    return [item for item in annotation_items if item_utils.get_version(item)]


def get_annotations_and_versions_string(annotation_items: List[Dict[str, Any]]) -> str:
    """Get string representation of annotation code and versions."""
    sorted_annotation_items = sorted(annotation_items, key=item_utils.get_code)
    return ANALYSIS_INFO_SEPARATOR.join(
        [
            f"{item_utils.get_code(item)}{ANALYSIS_INFO_SEPARATOR}"
            f"{item_utils.get_version(item)}"
            for item in sorted_annotation_items
        ]
    )


def get_annotation_codes_missing_versions(
    annotation_items: List[Dict[str, Any]]
) -> List[str]:
    """Get annotation reference file items missing versions."""
    return [
        item_utils.get_code(item)
        for item in annotation_items
        if not item_utils.get_version(item)
    ]


def get_software_and_versions(software: List[Dict[str, Any]]) -> str:
    """Get software and accompanying versions for file.

    Currently looking for software items with codes, as these are expected to be the software used for naming.
    """
    software_with_codes = get_software_with_codes(software)
    if not software_with_codes:
        return ""
    software_with_codes_and_versions = get_software_with_versions(software_with_codes)
    if len(software_with_codes) == len(software_with_codes_and_versions):
        return get_software_and_versions_string(software_with_codes_and_versions)
    missing_versions = get_software_codes_missing_versions(software_with_codes)
    logger.warning(f"Missing versions for software items: {missing_versions}.")
    return ""


def get_software_with_codes(
    software_items: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Get software items with codes."""
    return [item for item in software_items if item_utils.get_code(item)]


def get_software_with_versions(
    software_items: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Get software items with versions."""
    return [item for item in software_items if item_utils.get_version(item)]


def get_software_and_versions_string(
        software_items: List[Dict[str, Any]]
    ) -> str:
    """Get string representation of software and versions."""
    sorted_software_items = sorted(software_items, key=item_utils.get_code)
    return ANALYSIS_INFO_SEPARATOR.join(
        [
            f"{item_utils.get_code(item)}{ANALYSIS_INFO_SEPARATOR}"
            f"{item_utils.get_version(item)}"
            for item in sorted_software_items
        ]
    )


def get_software_codes_missing_versions(
    software_items: List[Dict[str, Any]]
) -> List[str]:
    """Get software items missing versions."""
    return [
        item_utils.get_code(item)
        for item in software_items
        if not item_utils.get_version(item)
    ]


def get_chain_file_value(
        file: Dict[str, Any],
        target_assembly: List[Dict[str, Any]],
        source_assembly: List[Dict[str, Any]],
        file_extension: Dict[str, Any]
    ) -> str:
    """Get genome conversion direction for chain files."""
    if file_format_utils.is_chain_file(file_extension):
        target_value = get_reference_genome_code(target_assembly)
        source_value = get_reference_genome_code(source_assembly)
        if target_value and source_value:
            return CHAIN_FILE_INFO_SEPARATOR.join([source_value,target_value])
    return ""


def get_reference_genome_code(assemblies: List[Dict[str, Any]]) -> str:
    """Get unique code for reference genomes from search result."""
    # If any of the reference genomes are DSAs, we can assume all of them are; use DSA value
    if any([dsa_utils.is_donor_specific_assembly(ref) for ref in assemblies]):
        return DSA_INFO_VALUE
    # Get unique code values from result
    ref_code = []
    for ref in assemblies:
        if (new_code := item_utils.get_code(ref)) not in ref_code:
            ref_code.append(new_code)
    # If there is more than one unique code in the returned reference genomes, return empty to raise error
    if len(ref_code) != 1:
        return ""
    return ref_code[0]


def get_haplotype_value(
        file: Dict[str, Any],
        file_extension: Dict[str, Any],
        donor_specific_assembly: Dict[str, Any]
    ):
    """Get haplotype value for fasta file."""
    if file_format_utils.is_fasta_file(file_extension):
        if (haplotype := supp_file_utils.get_haplotype(file)):
            return haplotype
        elif donor_specific_assembly:
            return DSA_INFO_VALUE
    return ""


def get_rna_seq_tsv_value(file: Dict[str, Any], file_extension: Dict[str, Any]) -> str:
    """Get isoform or gene from data type for RNA-seq tsv files."""
    if RNA_DATA_CATEGORY in file_utils.get_data_category(file):
        if GENE_DATA_TYPE in file_utils.get_data_type(file):
            return "gene"
        elif ISOFORM_DATA_TYPE in file_utils.get_data_type(file):
            return "isoform"
    else:
        return ""
    

def get_assay_categories(assays: List[Dict[str, Any]]) -> List[str]:
    """Get assay category for assays."""
    return list(set([assay_utils.get_category(assay) for assay in assays]))


def get_assay_ids(assays: List[Dict[str, Any]]) -> List[str]:
    """Get assay ids for assays."""
    return list(set([item_utils.get_identifier(assay) for assay in assays]))


def get_consensus_value(file: Dict[str, Any], assays: List[Dict[str, Any]]) -> str:
    """Get consensus from data_category for Duplex-Seq files."""
    assay_cats = get_assay_categories(assays)

    if CONSENSUS_DATA_CATEGORY in file_utils.get_data_category(file) and DUPLEX_ASSAY_CATEGORY in assay_cats:
        return "consensus"
    else:
        return ""


def get_kinnex_value(file: Dict[str, Any], assays: List[Dict[str, Any]]) -> str:
    "Get suffixes for Kinnex files"
    assay_ids = get_assay_ids(assays)
    if KINNEX_ASSAY_ID in assay_ids:
        data_categories = file_utils.get_data_category(file)
        data_types = file_utils.get_data_type(file)

        if TRANSCRIPT_SEQUENCE_DATA_TYPE in data_types:
            return "isoform"
        elif TRANSCRIPT_MODEL_DATA_TYPE in data_types:
            return "junction"
        elif SEQUENCING_READS_DATA_CATEGORY in data_categories and ALIGNED_READS_DATA_TYPE in data_types:
            return "flnc"
    
    return ""


def get_file_extension(
    file: Dict[str, Any], file_format: Dict[str, Any]
) -> FilenamePart:
    """Get file format for file."""
    result = []
    file_extension = file_format_utils.get_standard_file_extension(file_format)
    if file_utils.is_aligned_reads(file):
        result += [ALIGNED_READS_EXTENSION]
    if file_utils.are_reads_sorted(file):
        result += [SORTED_EXTENSION]
    if file_utils.are_reads_phased(file):
        result += [PHASED_EXTENSION]
    result += [file_extension]
    if file_extension:
        return get_filename_part(value=".".join(result))
    return get_filename_part(errors=["Unknown file extension"])


def collect_errors(*filename_parts: FilenamePart) -> List[str]:
    """Collect errors from filename parts."""
    return [error for part in filename_parts for error in part.errors]


def has_errors(annotated_filename: AnnotatedFilename) -> bool:
    """Check if annotated filename has errors."""
    return bool(annotated_filename.errors)


def log_annotated_filenames(annotated_filenames: List[AnnotatedFilename]) -> None:
    """Log annotated filenames."""
    for annotated_filename in annotated_filenames:
        if has_errors(annotated_filename):
            logger.error(
                f"Errors found for file {get_identifier(annotated_filename)}:"
                f" {annotated_filename.errors}"
            )
        else:
            logger.info(
                f"Annotated filename for file {get_identifier(annotated_filename)}:"
                f" {get_annotated_filename_string(annotated_filename)}"
            )


def get_annotated_filename_string(annotated_filename: AnnotatedFilename) -> str:
    """Get string representation of annotated filename."""
    before_extension = FILENAME_SEPARATOR.join(
        [
            f"{annotated_filename.project_id}{annotated_filename.sample_source_id}",
            annotated_filename.protocol_id,
            annotated_filename.aliquot_id,
            annotated_filename.donor_sex_and_age,
            annotated_filename.sequencing_and_assay_codes,
            annotated_filename.sequencing_center_code,
            annotated_filename.accession,
            annotated_filename.analysis_info,
        ]
    )
    return f"{before_extension}.{annotated_filename.file_extension}"


def patch_annotated_filenames(
    annotated_filenames: List[AnnotatedFilename],
    auth_key: Dict[str, str],
    dry_run: bool = False,
) -> None:
    """Generate and patch files with annotated filenames.

    Also, patch associated extra file filenames.

    If dry run, only log filenames generated and patch bodies.
    """
    for annotated_filename in annotated_filenames:
        if has_errors(annotated_filename):
            logger.info(
                f"Skipping file {get_identifier(annotated_filename)} due to errors."
            )
            continue
        patch_body = get_patch_body(annotated_filename, auth_key)
        if dry_run:
            logger.info(
                f"Would patch file {get_identifier(annotated_filename)} with:"
                f" {patch_body}"
            )
        else:
            patch_file(annotated_filename, patch_body, auth_key)


def get_patch_body(
    annotated_filename: AnnotatedFilename, auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get patch body for annotated filename."""
    filename_patch = get_filename_patch(annotated_filename)
    extra_files_patch = get_extra_files_patch(annotated_filename, auth_key)
    return {**filename_patch, **extra_files_patch}


def get_filename_patch(annotated_filename: AnnotatedFilename) -> Dict[str, Any]:
    """Get filename patch for annotated filename."""
    filename = get_annotated_filename_string(annotated_filename)
    return {file_constants.ANNOTATED_FILENAME: filename}


def get_extra_files_patch(
    annotated_filename: AnnotatedFilename, auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get extra files patch body with annotated filename variant."""
    file_raw_view = ff_utils.get_metadata(
        get_identifier(annotated_filename), key=auth_key, add_on="frame=raw"
    )
    extra_files = get_extra_files(file_raw_view)
    extra_files_to_patch = [
        get_extra_file_patch(extra_file, annotated_filename, auth_key)
        for extra_file in extra_files
    ]
    if extra_files_to_patch:
        return {file_constants.EXTRA_FILES: extra_files_to_patch}
    return {}


def get_extra_files(file_item: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Check if file has any extra files."""
    return file_item.get(file_constants.EXTRA_FILES, [])


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
        file_constants.FILENAME: annotated_extra_file_name,
    }


def get_extra_file_format_extension(
    extra_file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> str:
    """Get extra file format extension."""
    extra_file_format = get_extra_file_format(extra_file_item, auth_key)
    return file_format_utils.get_standard_file_extension(extra_file_format)


def get_extra_file_format(
    extra_file_item: Dict[str, Any], auth_key: Dict[str, str]
) -> Dict[str, Any]:
    """Get extra file format."""
    file_format = file_utils.get_file_format(extra_file_item)
    return ff_utils.get_metadata(file_format, key=auth_key)


def get_annotated_extra_file_name(
    annotated_filename: AnnotatedFilename, extra_file_format_extension: str
) -> str:
    """Get annotated extra file name."""
    filename_without_extension = get_filename_without_extension(
        get_annotated_filename_string(annotated_filename)
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
            obj_id=get_identifier(annotated_filename),
            key=auth_key,
        )
        logger.info(f"Patched file {get_identifier(annotated_filename)}")
    except Exception as e:
        logger.error(f"Error patching file {get_identifier(annotated_filename)}: {e}")


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
