from typing import Any, Dict, List


def get_uuid(properties: Dict[str, Any]) -> str:
    """Get UUID from properties."""
    return properties.get("uuid", "")


def get_accession(properties: Dict[str, Any]) -> str:
    """Get accession from properties."""
    return properties.get("accession", "")


def get_status(properties: Dict[str, Any]) -> str:
    """Get status from properties."""
    return properties.get("status", "")


def get_display_title(properties: Dict[str, Any]) -> str:
    """Get display title from properties."""
    return properties.get("display_title", "")


def get_types(properties: Dict[str, Any]) -> List[str]:
    """Get types from properties."""
    return properties.get("@type", [])


def get_type(properties: Dict[str, Any]) -> str:
    """Get "final" type from properties."""
    types = get_types(properties)
    if types:
        return types[-1]
    return ""


def get_submission_centers(properties: Dict[str, Any]) -> List[str]:
    """Get submission centers from properties."""
    return properties.get("submission_centers", [])


def get_consortia(properties: Dict[str, Any]) -> List[str]:
    """Get consortia from properties."""
    return properties.get("consortia", [])
