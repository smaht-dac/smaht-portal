from functools import partial
from typing import Any, Dict, List, Optional, Union

from . import (
    cell_culture,
    cell_culture_mixture,
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


def get_file_sets(properties: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get file sets from properties."""
    return properties.get("file_sets", [])


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
        sample
        for sample in samples
        if sample.is_tissue_sample(request_handler.get_item(sample))
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
    properties: Dict[str, Any], request_handler: Optional[RequestHandler] = None
) -> List[Union[str, Dict[str, Any]]]:
    """Get cell cultures associated with file."""
    sample_sources = get_sample_sources(properties, request_handler=request_handler)
    if request_handler:
        return [
            sample_source
            for sample_source in sample_sources
            if cell_culture.is_cell_culture(request_handler.get_item(sample_source))
        ]
    return [
        sample_source
        for sample_source in sample_sources
        if isinstance(sample_source, dict)
        and cell_culture.is_cell_culture(sample_source)
    ]


def get_cell_lines(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> List[Union[str, Dict[str, Any]]]:
    """Get cell lines associated with file."""
    cell_cultures = get_cell_cultures(properties, request_handler=request_handler)
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
        return get_property_values_from_identifiers(
            request_handler, tissues + cell_lines, tissue.get_donor
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


def is_cell_culture_mixture_derived(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> bool:
    """Check if file is derived from cell culture mixture."""
    return any(get_cell_culture_mixtures(properties, request_handler))


def is_only_cell_culture_mixture_derived(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> bool:
    """Check if file is only derived from cell culture mixture."""
    sample_sources = get_sample_sources(properties, request_handler)
    return all(
        [
            cell_culture_mixture.is_cell_culture_mixture(
                request_handler.get_item(sample_source)
            )
            for sample_source in sample_sources
        ]
    )


def is_cell_line_derived(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> bool:
    """Check if file is derived from cell line."""
    return any(get_cell_lines(properties, request_handler))


def is_tissue_derived(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> bool:
    """Check if file is derived from tissue."""
    return any(get_tissues(properties, request_handler))


def is_fastq(
    properties: Dict[str, Any], request_handler: RequestHandler = None
) -> bool:
    """Check if file is a FASTQ file."""
    file_format_ = get_file_format(properties)
    return get_property_value_from_identifier(
        request_handler, file_format_, file_format.is_fastq
    )


def is_bam(properties: Dict[str, Any], request_handler: RequestHandler = None) -> bool:
    """Check if file is a BAM file."""
    return get_property_value_from_identifier(
        request_handler,
        get_file_format(properties),
        file_format.is_bam,
    )


def is_vcf(properties: Dict[str, Any], request_handler: RequestHandler = None) -> bool:
    """Check if file is a VCF file."""
    return get_property_value_from_identifier(
        request_handler,
        get_file_format(properties),
        file_format.is_vcf,
    )


def get_file_extension(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> str:
    """Get file extension from properties."""
    return get_property_value_from_identifier(
        request_handler,
        get_file_format(properties),
        file_format.get_standard_file_extension,
    )


def is_unaligned_reads(file: Dict[str, Any]) -> bool:
    """Check if file is unaligned reads."""
    return "Unaligned Reads" in get_data_type(file)


def is_aligned_reads(file: Dict[str, Any]) -> bool:
    """Check if file is aligned."""
    return "Aligned Reads" in get_data_type(file)


def get_alignment_details(file: Dict[str, Any]) -> List[str]:
    """Get alignment details from file."""
    return file.get("alignment_details", [])


def are_reads_sorted(file: Dict[str, Any]) -> bool:
    """Check if file is sorted."""
    return "Sorted" in get_alignment_details(file)


def are_reads_phased(file: Dict[str, Any]) -> bool:
    """Check if file is phased."""
    return "Phased" in get_alignment_details(file)


def get_reference_genome_code(
    properties: Dict[str, Any], request_handler: RequestHandler
) -> str:
    """Get reference genome code from properties."""
    return get_property_value_from_identifier(
        request_handler,
        get_reference_genome(properties),
        item.get_code,
    )


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
