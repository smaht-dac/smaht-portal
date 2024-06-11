from typing import Any, Dict


def get_standard_file_extension(properties: Dict[str, Any]) -> str:
    return properties.get("standard_file_extension", "")


def is_fastq(properties: Dict[str, Any]) -> bool:
    """Check if the file is a FASTQ file.

    Note: Dependent on metadata on portal, not strictly dictated.
    """
    return get_standard_file_extension(properties) in {"fastq", "fastq_gz"}


def is_bam(properties: Dict[str, Any]) -> bool:
    """Check if the file is a BAM file.

    Note: Dependent on metadata on portal, not strictly dictated.
    """
    return get_standard_file_extension(properties) == "bam"


def is_vcf(properties: Dict[str, Any]) -> bool:
    """Check if the file is a VCF file.

    Note: Dependent on metadata on portal, not strictly dictated.
    """
    return get_standard_file_extension(properties) in {"vcf", "vcf_gz"}
