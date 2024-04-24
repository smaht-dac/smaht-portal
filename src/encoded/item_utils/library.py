from typing import Any, Dict, Union


def get_assay(library: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get assay connected to library."""
    return library.get("assay", "")


def get_analyte(library: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get analyte connected to library."""
    return library.get("analyte", "")
