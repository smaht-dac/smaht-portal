from typing import Any, Dict


def get_standard_file_extension(properties: Dict[str, Any]) -> str:
    return properties.get("standard_file_extension", "")


def get_other_allowed_extensions(properties: Dict[str, Any]) -> str:
    return properties.get("other_allowed_extensions", "")


def is_chain_file(properties: Dict[str, Any]) -> bool:
    return get_standard_file_extension(properties) in ["chain.gz","chain"]


def is_fasta_file(properties: Dict[str, Any]) -> bool:
    return get_standard_file_extension(properties) in ["fa","fasta"]


def is_bed_file(properties: Dict[str, Any]) -> bool:
    return get_standard_file_extension(properties) == "bed"
                      
                                                       
def is_tsv_file(properties: Dict[str, Any]) -> bool:
    return get_standard_file_extension(properties) == "tsv"
