from functools import partial
from typing import Any, Dict, List, Optional, Union

from . import (
    cell_culture,
    cell_culture_mixture,
    cell_line,
    file_format,
    file_set,
    item,
    library,
    sample,
    sequencing,
    tissue,
)
from .constants import file as file_constants
from .utils import (
    RequestHandler,
    get_property_value_from_identifier,
    get_property_values_from_identifiers,
)

# temporary mapping for tissue short names
# to be used in tests until proper metadata implementation is done
# the format will be: [TPC code] - [Portal facet]
TPC_CODE_TO_FULL_NAME = {
    "3A": "3A - Whole Blood",
    "3B": "3B - Buccal Swab",
    "3C": "3C - Esophagus",
    "3E": "3E - Colon, Asc",
    "3G": "3G - Colon, Desc",
    "3I": "3I - Liver",
    "3K": "3K - Adrenal Gland, L",
    "3M": "3M - Adrenal Gland, R",
    "3O": "3O - Aorta",
    "3Q": "3Q - Lung",
    "3S": "3S - Heart",
    "3U": "3U - Testis, L",
    "3W": "3W - Testis, R",
    "3Y": "3Y - Ovary, L",
    "3AA": "3AA - Ovary, R",
    "3AC": "3AC - Fibroblast",
    "3AD": "3AD - Skin, Calf",
    "3AF": "3AF - Skin, Abdomen",
    "3AH": "3AH - Muscle",
    "3AK": "3AK - Brain, Frontal Lobe",
    "3AL": "3AL - Brain, Temporal Lobe",
    "3AM": "3AM - Brain, Cerebellum",
    "3AN": "3AN - Brain, Hippocampus, L",
    "3AO": "3AO - Brain, Hippocampus, R",
}


def get_file_format(properties: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get file format from properties."""
    return properties.get("file_format", "")


def get_file_size(properties: Dict[str, Any]) -> Union[int, None]:
    """Get file size from properties."""
    return properties.get("file_size")


def get_md5sum(properties: Dict[str, Any]) -> str:
    """Get md5sum from properties."""
    return properties.get("md5sum", "")


def get_access_status(properties: Dict[str, Any]) -> str:
    """Get access status from properties."""
    return properties.get("access_status", "")


def get_data_category(properties: Dict[str, Any]) -> List[str]:
    """Get data category from properties."""
    return properties.get("data_category", [])


def get_data_type(properties: Dict[str, Any]) -> List[str]:
    """Get data type from properties."""
    return properties.get("data_type", [])


def get_dataset(properties: Dict[str, Any]) -> str:
    """Get dataset from properties."""
    return properties.get("dataset", "")


def get_annotated_filename(properties: Dict[str, Any]) -> str:
    """Get annotated filename from properties."""
    return properties.get(file_constants.ANNOTATED_FILENAME, "")


def get_sequencing_center(properties: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get sequencing center from properties."""
    return properties.get("sequencing_center", "")


def get_software(properties: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get software from properties."""
    return properties.get("software", [])


def get_reference_genome(properties: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get reference genome from properties."""
    return properties.get("reference_genome", "")


def get_annotation(properties: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get annotation from properties."""
    return properties.get("annotation", [])


def get_file_sets(properties: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get file sets from properties."""
    return properties.get("file_sets", [])


def get_quality_metrics(properties: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get quality metrics from properties."""
    return properties.get("quality_metrics", [])


def is_uploaded(properties: Dict[str, Any]) -> bool:
    """Check if file is uploaded."""
    return item.get_status(properties) == "uploaded"


def get_sequencings(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get sequencings associated with file."""
    if request_handler:
        return get_property_values_from_identifiers(
            request_handler, get_file_sets(properties), file_set.get_sequencing
        )
    return properties.get("sequencing", [])


def get_sequencers(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> List[str]:
    """Get sequencers associated with file."""
    sequencings = get_sequencings(properties, request_handler)
    return get_property_values_from_identifiers(
        request_handler, sequencings, sequencing.get_sequencer
    )


def get_libraries(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get libraries associated with file."""
    if request_handler:
        return get_property_values_from_identifiers(
            request_handler, get_file_sets(properties), file_set.get_libraries
        )
    return properties.get("libraries", [])


def get_assays(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get assays associated with file."""
    if request_handler:
        return get_property_values_from_identifiers(
            request_handler,
            get_libraries(properties, request_handler),
            library.get_assay,
        )
    return properties.get("assays", [])


def get_analytes(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get analytes associated with file."""
    if request_handler:
        return get_property_values_from_identifiers(
            request_handler,
            get_libraries(properties, request_handler),
            library.get_analytes,
        )
    return properties.get("analytes", [])


def get_samples(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get samples associated with file."""
    if request_handler:
        return get_property_values_from_identifiers(
            request_handler,
            get_file_sets(properties),
            partial(file_set.get_samples, request_handler=request_handler),
        )
    return properties.get("samples", [])


def get_tissue_samples(
    properties: Dict[str, Any], request_handler: RequestHandler = None
) -> List[str]:
    """Get tissue samples associated with file."""
    samples = get_samples(properties, request_handler=request_handler)
    return [
        item
        for item in samples
        if sample.is_tissue_sample(request_handler.get_item(item))
    ]


def get_sample_sources(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get sample sources associated with file."""
    if request_handler:
        return get_property_values_from_identifiers(
            request_handler,
            get_samples(properties, request_handler),
            sample.get_sample_sources,
        )
    return properties.get("sample_sources", [])


def get_tissues(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get tissues associated with file."""
    sample_sources = get_sample_sources(properties, request_handler=request_handler)
    if request_handler:
        return [
            sample_source
            for sample_source in sample_sources
            if tissue.is_tissue(request_handler.get_item(sample_source))
        ]
    return [
        sample_source
        for sample_source in sample_sources
        if isinstance(sample_source, dict) and tissue.is_tissue(sample_source)
    ]


def get_uberon_ids(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> List[Union[str, Dict[str, Any]]]:
    """Get uberon_ids from tissues associated with file."""
    return get_property_values_from_identifiers(
        request_handler,
        get_tissues(properties, request_handler),
        tissue.get_uberon_id  
    )


def get_cell_culture_mixtures(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get cell culture mixtures associated with file."""
    sample_sources = get_sample_sources(properties, request_handler=request_handler)
    if request_handler:
        return [
            sample_source
            for sample_source in sample_sources
            if cell_culture_mixture.is_cell_culture_mixture(
                request_handler.get_item(sample_source)
            )
        ]
    return [
        sample_source
        for sample_source in sample_sources
        if isinstance(sample_source, dict)
        and cell_culture_mixture.is_cell_culture_mixture(sample_source)
    ]


def get_cell_cultures(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> List[str]:
    """Get cell cultures associated with file."""
    sample_sources = get_sample_sources(properties, request_handler=request_handler)
    cell_culture_mixtures = get_cell_culture_mixtures(
        properties, request_handler=request_handler
    )
    cell_cultures_from_mixtures = get_property_values_from_identifiers(
        request_handler, cell_culture_mixtures, cell_culture_mixture.get_cell_cultures
    )
    direct_cell_cultures = [
        sample_source
        for sample_source in sample_sources
        if cell_culture.is_cell_culture(request_handler.get_item(sample_source))
    ]
    return list(set(cell_cultures_from_mixtures + direct_cell_cultures))


def get_cell_lines(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> List[Union[str, Dict[str, Any]]]:
    """Get cell lines associated with file."""
    cell_cultures = get_cell_cultures(properties, request_handler)
    cell_culture_mixtures = get_cell_culture_mixtures(
        properties, request_handler=request_handler
    )
    return list(
        set(
            get_property_values_from_identifiers(
                request_handler, cell_cultures, cell_culture.get_cell_line
            )
            + get_property_values_from_identifiers(
                request_handler,
                cell_culture_mixtures,
                partial(cell_culture_mixture.get_cell_lines, request_handler),
            )
        )
    )


def get_donors(
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get donors associated with file."""
    if request_handler:
        tissues = get_tissues(properties, request_handler)
        cell_lines = get_cell_lines(properties, request_handler)
        return list(
            set(
                get_property_values_from_identifiers(
                    request_handler, tissues, tissue.get_donor
                )
                + get_property_values_from_identifiers(
                    request_handler, cell_lines, partial(cell_line.get_source_donor, request_handler)
                )
            )
        )
    return properties.get("donors", [])


def get_file_summary(properties: Dict[str, Any]) -> Dict[str, Any]:
    """Get file summary from properties."""
    return properties.get("file_summary", {})


def get_data_generation_summary(properties: Dict[str, Any]) -> Dict[str, Any]:
    """Get data generation summary from properties."""
    return properties.get("data_generation_summary", {})


def get_sample_summary(properties: Dict[str, Any]) -> Dict[str, Any]:
    """Get sample summary from properties."""
    return properties.get("sample_summary", {})


def get_analysis_summary(properties: Dict[str, Any]) -> Dict[str, Any]:
    """Get analysis summary from properties."""
    return properties.get("analysis_summary", {})


def is_file(properties: Dict[str, Any]) -> bool:
    """Check if item is a file."""
    return "File" in item.get_types(properties)


def get_file_extension(
    request_handler: RequestHandler, properties: Dict[str, Any] 
) -> str:
    """Get file extension from properties."""
    return get_property_value_from_identifier(
        request_handler,
        get_file_format(properties),
        file_format.get_standard_file_extension,
    )


def get_accepted_file_extensions(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> str:
    """Get all accepted file extensions from properties."""
    return list(
        set(
            get_property_value_from_identifier(
                request_handler,
                get_file_format(properties),
                file_format.get_standard_file_extension,
            )
                + get_property_value_from_identifier(
                    request_handler,
                    get_file_format(properties),
                    file_format.get_other_allowed_extensions,
            )
        )
    )


def is_bam_file(request_handler: RequestHandler, properties: Dict[str, Any]) -> bool:
    """Check if file file_format has the bam file extension."""
    return get_file_extension(request_handler, properties) == "bam"


def is_fasta_file(properties: Dict[str, Any],request_handler: RequestHandler) -> bool:
    """Check if file file_format has the fa or fasta file extension."""
    return get_file_extension(request_handler, properties) in ["fa","fasta"]


def is_chain_file(properties: Dict[str, Any],request_handler: RequestHandler) -> bool:
    """Check if file_format has the chain.gz file extension."""
    return get_file_extension(request_handler,properties) == "chain.gz"


def is_unaligned_reads(file: Dict[str, Any]) -> bool:
    """Check if file is unaligned reads."""
    return "Unaligned Reads" in get_data_type(file)


def is_aligned_reads(file: Dict[str, Any]) -> bool:
    """Check if file is aligned."""
    return "Aligned Reads" in get_data_type(file)


def is_variant_calls(file: Dict[str, Any]) -> bool:
    """Check if file is variant calls."""
    data_category = get_data_category(file)
    return (
        "Germline Variant Calls" in data_category
        or "Somatic Variant Calls" in data_category
    )


def get_alignment_details(file: Dict[str, Any]) -> List[str]:
    """Get alignment details from file."""
    return file.get("alignment_details", [])


def are_reads_sorted(file: Dict[str, Any]) -> bool:
    """Check if file is sorted."""
    return "Sorted" in get_alignment_details(file)


def are_reads_phased(file: Dict[str, Any]) -> bool:
    """Check if file is phased."""
    return "Phased" in get_alignment_details(file)


def has_single_nucleotide_variants(file: Dict[str, Any]) -> bool:
    """Check if file has SNVs."""
    return "SNV" in get_data_type(file)


def has_copy_number_variants(file: Dict[str, Any]) -> bool:
    """Check if file has CNVs."""
    return "CNV" in get_data_type(file)


def has_structural_variants(file: Dict[str, Any]) -> bool:
    """Check if file has SVs."""
    return "SV" in get_data_type(file)


def has_mobile_element_insertions(file: Dict[str, Any]) -> bool:
    """Check if file has MEIs."""
    return "MEI" in get_data_type(file)


def get_override_group_coverage(file: Dict[str, Any]) -> str:
    """Get override group coverage from properties."""
    return file.get("override_group_coverage","")


def get_override_average_coverage(file: Dict[str, Any]) -> str:
    """Get override average coverage from properties."""
    return file.get("override_average_coverage","")


def get_override_release_tracker_description(file: Dict[str, Any]) -> str:
    """Get override release tracker description from properties."""
    return file.get("override_release_tracker_description","")


def get_override_release_tracker_title(file: Dict[str, Any]) -> str:
    """Get override release tracker title from properties."""
    return file.get("override_release_tracker_title","")


def get_release_tracker_description(file: Dict[str, Any]) -> str:
    """Get release tracker description from properties."""
    return file.get("release_tracker_description","")


def get_release_tracker_title(file: Dict[str, Any]) -> str:
    """Get release tracker title from properties."""
    return file.get("release_tracker_title","")


def get_tissue_type(file: Dict[str, Any], request_handler: RequestHandler) -> List[str]:
    """
    Get tissue type from ontology term.
    
    Special handling of fibroblast (3AC).
    """
    return get_property_values_from_identifiers(
        request_handler,
        get_tissues(file, request_handler),
        partial(
            tissue.get_tissue_type, request_handler=request_handler
        )
    )


def get_tissue_category(file: Dict[str, Any], request_handler: RequestHandler) -> List[str]:
    """
    Get tissue category from ontology term.
    
    Special handling of fibroblast, ovary, testis, blood, and buccal swab.
    """
    return get_property_values_from_identifiers(
        request_handler,
        get_tissues(file, request_handler),
        partial(
            tissue.get_category, request_handler=request_handler
        )
    )

def get_tissue_protocol_id(file: Dict[str, Any], request_handler: RequestHandler) -> List[str]:
    """
    Get tissue protocol ID from external ID.
    """
    return get_property_values_from_identifiers(
        request_handler,
        get_tissues(file, request_handler),
        partial(
            tissue.get_protocol_id
        )
    )

def get_tissue_short_name(file: Dict[str, Any], request_handler: RequestHandler) -> List[str]:
    """
    Get tissue short name from protocol ID using temporary mapping.
    """
    protocol_ids = get_tissue_protocol_id(file, request_handler)
    short_names = []
    for pid in protocol_ids:
        short_name = TPC_CODE_TO_FULL_NAME.get(pid)
        if short_name:
            short_names.append(short_name)
        else:
            short_names.append(pid)  # Fallback to protocol ID if not found
    return short_names