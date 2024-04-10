from typing import Any, Dict


def get_assay(library: Dict[str, Any]) -> str:
    """Get assay connected to library."""
    return library.get("assay", "")


def get_analyte(library: Dict[str, Any]) -> str:
    """Get analyte connected to library."""
    return library.get("analyte", "")
