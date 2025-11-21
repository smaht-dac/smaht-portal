from typing import Any, Dict

from .item import get_type


def is_output_file(properties: Dict[str, Any]) -> bool:
    return get_type(properties) == "OutputFile"


def get_output_status(properties: Dict[str, Any]) -> str:
    """Get output status from properties."""
    return properties.get("output_status", "")


def is_final_output(properties: Dict[str, Any]) -> bool:
    """Check if file is final output."""
    return get_output_status(properties) == "Final Output"


def is_final_output_bam(properties: Dict[str, Any]) -> bool:
    file_format = properties.get("file_format", {})
    return is_final_output(properties) and file_format.get("display_title", "") == "bam"

def is_final_output_cram(properties: Dict[str, Any]) -> bool:
    file_format = properties.get("file_format", {})
    return is_final_output(properties) and file_format.get("display_title", "") == "cram"
