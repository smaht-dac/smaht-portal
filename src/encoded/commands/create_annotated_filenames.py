from __future__ import annotations

import argparse
import logging
from dataclasses import dataclass
from functools import partial
from typing import Any, Dict, List, Optional, Tuple

from dcicutils import ff_utils
from dcicutils.creds_utils import SMaHTKeyManager

from encoded.item_utils import (
    constants,
    cell_culture_mixture as cell_culture_mixture_utils,
    donor as donor_utils,
    file as file_utils,
    file_format as file_format_utils,
    item as item_utils,
    sample as sample_utils,
    tissue as tissue_utils,
)
from encoded.item_utils.constants import file as file_constants
from encoded.item_utils.utils import (
    RequestHandler,
    get_property_values_from_identifiers,
    get_property_value_from_identifier,
)


logger = logging.getLogger(__name__)

FILENAME_SEPARATOR = "-"
ANALYSIS_INFO_SEPARATOR = "_"

DEFAULT_PROJECT_ID = constants.PRODUCTION_PREFIX
DEFAULT_ABSENT_FIELD = "X"
ABSENT_AGE = "N"
ABSENT_SEX = ABSENT_AGE

ALIGNED_READS_EXTENSION = "aligned"
PHASED_EXTENSION = "phased"
SORTED_EXTENSION = "sorted"

CNV_VARIANT_TYPE = "cnv"
MEI_VARIANT_TYPE = "mei"
SNV_VARIANT_TYPE = "snv"
SV_VARIANT_TYPE = "sv"

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


def get_identifier(annotated_filename: AnnotatedFilename) -> str:
    """Get identifier for annotated filename."""
    return annotated_filename.accession


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
        patch_report = patch_annotated_filenames(annotated_filenames, auth_key)
        log_patch_report(patch_report)


def get_files(
    search: str,
    identifiers: List[str],
    request_handler: RequestHandler,
) -> List[Dict[str, Any]]:
    """Get file items from given search query and idenitfiers."""
    return get_files_from_search(
        search, request_handler.auth_key
    ) + get_files_from_identifiers(identifiers, request_handler)


def get_files_from_search(
    search_query: str, auth_key: Dict[str, str]
) -> List[str]:
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
    return [
        get_annotated_filename(file_item, request_handler)
        for file_item in files
    ]


def get_annotated_filename(
    file: Dict[str, Any], request_handler: RequestHandler
) -> AnnotatedFilename:
    """Get annotated filename for given file.


    Collect all filename parts, recording either the value or any errors
    encountered in the process to be logged later.
    """
    project_id = get_project_id(file, request_handler)
    sample_source_id = get_sample_source_id(file, request_handler)
    protocol_id = get_protocol_id(file, request_handler)
    aliquot_id = get_aliquot_id(file, request_handler)
    donor_sex_and_age = get_donor_sex_and_age(file, request_handler)
    sequencing_and_assay_codes = get_sequencing_and_assay_codes(
        file, request_handler
    )
    sequencing_center_code = get_sequencing_center_code(file, request_handler)
    accession = get_accession(file)
    analysis_info = get_analysis(file, request_handler)
    file_extension = get_file_extension(file, request_handler)
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
        return get_filename_part(errors=[error_message])
    return get_filename_part(value=values[0])


def get_project_id(
    file: Dict[str, Any], request_handler: RequestHandler
) -> FilenamePart:
    """Get project ID for file.

    If cell culture mixture or cell line-derived, use default project ID,
    as assuming to be from benchmarking cell line data.

    If tissue-derived, parse project ID from tissue item, which should
    hold ID from TPC.
    """
    parts = []
    if file_utils.is_cell_culture_mixture_derived(file, request_handler):
        parts.append(get_filename_part(value=DEFAULT_PROJECT_ID))
    if file_utils.is_cell_line_derived(file, request_handler):
        parts.append(get_filename_part(value=DEFAULT_PROJECT_ID))
    if file_utils.is_tissue_derived(file, request_handler):
        parts.append(get_project_id_from_tissue(file, request_handler))
    return get_exclusive_filename_part(parts, "project ID")


def get_project_id_from_tissue(
    file: Dict[str, Any], request_handler: RequestHandler
) -> FilenamePart:
    """Get project ID from tissue item."""
    project_ids = get_property_values_from_identifiers(
        request_handler,
        file_utils.get_tissues(file, request_handler=request_handler),
        tissue_utils.get_project_id,
    )
    return get_filename_part_for_values(project_ids, "project ID", source_name="tissue")


def get_sample_source_id(
    file: Dict[str, Any], request_handler: RequestHandler
) -> FilenamePart:
    """Get sample source ID for file."""
    parts = []
    if file_utils.is_cell_culture_mixture_derived(file, request_handler):
        parts.append(get_cell_culture_mixture_code(file, request_handler))
    if file_utils.is_cell_line_derived(file, request_handler):
        parts.append(get_cell_line_id(file, request_handler))
    if file_utils.is_tissue_derived(file, request_handler):
        parts.append(get_donor_kit_id(file, request_handler))
    return get_exclusive_filename_part(parts, "sample source ID")


def get_cell_culture_mixture_code(
    file: Dict[str, Any], request_handler: RequestHandler
) -> FilenamePart:
    """Get mixture code for file naming."""
    codes = get_property_values_from_identifiers(
        request_handler,
        file_utils.get_cell_culture_mixtures(file, request_handler=request_handler),
        file_utils.get_code,
    )
    return get_filename_part_for_values(
        codes, "sample source ID", source_name="cell culture mixture"
    )


def get_cell_line_id(
    file: Dict[str, Any], request_handler: RequestHandler
) -> FilenamePart:
    """Get cell line ID for file naming."""
    cell_line_ids = get_property_values_from_identifiers(
        request_handler,
        file_utils.get_cell_lines(file, request_handler=request_handler),
        item_utils.get_code,
    )
    return get_filename_part_for_values(
        cell_line_ids, "sample source ID", source_name="cell line"
    )


def get_donor_kit_id(
    file: Dict[str, Any], request_handler: RequestHandler
) -> FilenamePart:
    """Get donor kit ID for file naming."""
    donor_kit_ids = get_property_values_from_identifiers(
        request_handler,
        file_utils.get_tissues(file, request_handler=request_handler),
        tissue_utils.get_donor_kit_id,
    )
    return get_filename_part_for_values(
        donor_kit_ids, "sample source ID", source_name="tissue"
    )


def get_protocol_id(
    file: Dict[str, Any], request_handler: RequestHandler
) -> FilenamePart:
    """Get protocol ID for file."""
    parts = []
    if file_utils.is_cell_culture_mixture_derived(file, request_handler):
        parts.append(get_filename_part(value=DEFAULT_ABSENT_FIELD))
    if file_utils.is_cell_line_derived(file, request_handler):
        parts.append(get_filename_part(value=DEFAULT_ABSENT_FIELD))
    if file_utils.is_tissue_derived(file, request_handler):
        parts.append(get_protocol_id_from_tissues(file, request_handler))
    return get_exclusive_filename_part(parts, "protocol ID")


def get_protocol_id_from_tissues(
    file: Dict[str, Any], request_handler: RequestHandler
) -> FilenamePart:
    """Get protocol ID from tissue items."""
    protocol_ids = get_property_values_from_identifiers(
        request_handler,
        file_utils.get_tissues(file, request_handler=request_handler),
        tissue_utils.get_protocol_id,
    )
    return get_filename_part_for_values(
        protocol_ids, "protocol ID", source_name="tissue"
    )


def get_aliquot_id(
    file: Dict[str, Any], request_handler: RequestHandler
) -> FilenamePart:
    """Get tissue aliquot ID for file."""
    parts = []
    if file_utils.is_cell_culture_mixture_derived(file, request_handler):
        parts.append(get_filename_part(value=DEFAULT_ABSENT_FIELD))
    if file_utils.is_cell_line_derived(file, request_handler):
        parts.append(get_filename_part(value=DEFAULT_ABSENT_FIELD))
    if file_utils.is_tissue_derived(file, request_handler):
        parts.append(get_aliquot_id_from_samples(file, request_handler))
    return get_exclusive_filename_part(parts, "tissue aliquot ID")


def get_aliquot_id_from_samples(
    file: Dict[str, Any], request_handler: RequestHandler
) -> FilenamePart:
    """Get aliquot ID from sample items."""
    aliquot_ids = get_property_values_from_identifiers(
        request_handler,
        file_utils.get_samples(file, request_handler=request_handler),
        sample_utils.get_aliquot_id,
    )
    return get_filename_part_for_values(
        aliquot_ids, "tissue aliquot ID", source_name="sample"
    )


def get_donor_sex_and_age(
    file: Dict[str, Any], request_handler: RequestHandler
) -> FilenamePart:
    """Get donor sex and age for file.

    Special handling for cell culture mixture-derived files, as these
    may have multiple donors.
    """
    donors = file_utils.get_donors(file, request_handler=request_handler)
    if not donors:
        return get_filename_part(errors=["No donors found"])
    sex_and_age_parts = get_sex_and_age_parts(donors, request_handler)
    if (
        len(sex_and_age_parts) > 1
        and file_utils.is_only_cell_culture_mixture_derived(file, request_handler)
    ):
        return get_filename_part(value=get_null_sex_and_age())
    return get_exclusive_filename_part(sex_and_age_parts, "donor age and sex")


def get_null_sex_and_age() -> str:
    """Get default null sex and age string."""
    return f"{ABSENT_SEX}{ABSENT_AGE}"


def get_sex_and_age_parts(
    donors: List[str], request_handler: RequestHandler
) -> List[FilenamePart]:
    """Get donor and age parts for all donors."""
    return [
        get_sex_and_age_part(donor, request_handler) for donor in donors
    ]


def get_sex_and_age_part(
    donor: Dict[str, Any], request_handler: RequestHandler
) -> FilenamePart:
    """Get donor and age part for given donor."""
    item = request_handler.get_item(donor)
    sex = get_sex_abbreviation(donor_utils.get_sex(item))
    age = donor_utils.get_age(item)
    if sex and age:
        return get_filename_part(value=f"{sex}{age}")
    errors = []
    if not sex:
        errors += [f"Unknown sex for donor {item_utils.get_uuid(item)}"]
    if not age:
        errors += [f"Unknown age for donor {item_utils.get_uuid(item)}"]
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
    file: Dict[str, Any], request_handler: RequestHandler
) -> FilenamePart:
    """Get sequencing and assay codes for file."""
    sequencing_codes = get_sequencing_codes(file, request_handler)
    assay_codes = get_assay_codes(file, request_handler)
    if len(sequencing_codes) == 1 and len(assay_codes) == 1:
        return get_filename_part(value=f"{sequencing_codes[0]}{assay_codes[0]}")
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


def get_sequencing_codes(
    file: Dict[str, Any], request_handler: RequestHandler
) -> List[str]:
    """Get sequencing code for file."""
    return get_property_values_from_identifiers(
        request_handler,
        file_utils.get_sequencers(file, request_handler=request_handler),
        item_utils.get_code,
    )


def get_assay_codes(
    file: Dict[str, Any], request_handler: RequestHandler
) -> List[str]:
    """Get assay code for file."""
    return get_property_values_from_identifiers(
        request_handler,
        file_utils.get_assays(file, request_handler=request_handler),
        item_utils.get_code,
    )


def get_sequencing_center_code(
    file: Dict[str, Any], request_handler: RequestHandler
) -> FilenamePart:
    """Get sequencing center code for file."""
    center_code = get_property_value_from_identifier(
        request_handler, file_utils.get_sequencing_center(file), item_utils.get_code
    )
    if center_code:
        return get_filename_part(value=center_code)
    return get_filename_part(errors=["Unknown sequencing center code"])


def get_accession(file: Dict[str, Any]) -> FilenamePart:
    """Get accession for file."""
    accession = item_utils.get_accession(file)
    if accession:
        return get_filename_part(value=accession)
    return get_filename_part(errors=["Unknown accession"])


def get_analysis(
    file: Dict[str, Any], request_handler: RequestHandler
) -> FilenamePart:
    """Get analysis info for file."""
    if file_utils.is_unaligned_reads(file):
        return get_filename_part(value=DEFAULT_ABSENT_FIELD)
    if file_utils.is_aligned_reads(file):
        return get_analysis_for_aligned_reads(file, request_handler)
    if file_utils.is_vcf(file, request_handler):
        return get_analysis_for_vcf(file, request_handler)
    return get_filename_part(errors=["Unknown analysis info"])


def get_analysis_for_aligned_reads(
    file: Dict[str, Any], request_handler: RequestHandler
) -> FilenamePart:
    """Get analysis info for aligned reads."""
    software_and_versions = get_software_and_versions(file, request_handler)
    reference_genome_code = file_utils.get_reference_genome_code(file, request_handler)
    if software_and_versions and reference_genome_code:
        return get_filename_part(
            value=f"{software_and_versions}{ANALYSIS_INFO_SEPARATOR}{reference_genome_code}"
        )
    errors = []
    if not software_and_versions:
        errors.append("No software and versions found")
    if not reference_genome_code:
        errors.append("No reference genome code found")
    return get_filename_part(errors=errors)


def get_software_and_versions(
    file: Dict[str, Any], request_handler: RequestHandler
) -> str:
    """Get software and accompanying versions for file.

    Currently only looking for software items with codes, as these are
    expected to be the software used for naming.
    """
    software = request_handler.get_items(file_utils.get_software(file))
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


def get_software_and_versions_string(software_items: List[Dict[str, Any]]) -> str:
    """Get string representation of software and versions."""
    return ANALYSIS_INFO_SEPARATOR.join(
        [
            f"{item_utils.get_code(item)}{ANALYSIS_INFO_SEPARATOR}"
            f"{item_utils.get_version(item)}"
            for item in software_items
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


def get_analysis_for_vcf(
    file: Dict[str, Any], request_handler: RequestHandler
) -> FilenamePart:
    """Get analysis info for VCF files."""
    software_and_versions = get_software_and_versions(file, request_handler)
    reference_genome_code = file_utils.get_reference_genome_code(file, request_handler)
    variant_types = get_variant_types(file)
    if software_and_versions and reference_genome_code and variant_types:
        return get_filename_part(
            value=(
                f"{software_and_versions}{ANALYSIS_INFO_SEPARATOR}"
                f"{reference_genome_code}{ANALYSIS_INFO_SEPARATOR}{variant_types}"
            )
        )
    errors = []
    if not variant_types:
        errors.append("No variant type found")
    if not software_and_versions:
        errors.append("No software and versions found")
    if not reference_genome_code:
        errors.append("No reference genome code found")
    return get_filename_part(errors=errors)


def get_variant_types(file: Dict[str, Any]) -> str:
    """Get variant types for VCF files."""
    result = []
    if file_utils.has_single_nucleotide_variants(file):
        result.append(SNV_VARIANT_TYPE)
    if file_utils.has_copy_number_variants(file):
        result.append(CNV_VARIANT_TYPE)
    if file_utils.has_structural_variants(file):
        result.append(SV_VARIANT_TYPE)
    if file_utils.has_mobile_element_insertions(file):
        result.append(MEI_VARIANT_TYPE)
    return ANALYSIS_INFO_SEPARATOR.join(sorted(result))


def get_file_extension(
    file: Dict[str, Any], request_handler: RequestHandler
) -> FilenamePart:
    """Get file format for file."""
    if file_utils.is_bam(file, request_handler):
        return get_bam_file_extensions(file, request_handler)
    if not (
        file_utils.is_fastq(file, request_handler)
        or file_utils.is_vcf(file, request_handler)
    ):
        logger.warning(
            f"Unexpected file format for file {item_utils.get_uuid(file)}:"
            f" {file_utils.get_file_format(file, request_handler)}."
            f" May warrant further investigation."
        )
    file_format = file_utils.get_file_extension(file, request_handler)
    if file_format:
        return get_filename_part(value=file_format)
    return get_filename_part(errors=["Unknown file extension"])


def get_bam_file_extensions(
    file: Dict[str, Any], request_handler: RequestHandler
) -> FilenamePart:
    """Get file extensions for BAM files.

    Note: Order of additional extensions important; expected to be:

        * aligned.sorted.phased.bam

    when all apply, and similarly if only some apply.
    """
    result = []
    if file_utils.is_aligned_reads(file):
        result += [ALIGNED_READS_EXTENSION]
    if file_utils.are_reads_sorted(file):
        result += [SORTED_EXTENSION]
    if file_utils.are_reads_phased(file):
        result += [PHASED_EXTENSION]
    result += [file_utils.get_file_extension(file, request_handler)]
    return get_filename_part(value=".".join(result))


def collect_errors(*filename_parts: FilenamePart) -> List[str]:
    """Collect errors from filename parts."""
    return [
        error
        for part in filename_parts
        for error in part.errors
    ]


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
            annotated_filename.project_id,
            annotated_filename.sample_source_id,
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
    return file_format_utils.get_standard_extension(extra_file_format)


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
