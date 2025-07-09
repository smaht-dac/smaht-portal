from typing import Any, Dict, List, Union

from .constants import item as item_constants


def get_uuid(properties: Dict[str, Any]) -> str:
    """Get UUID from properties."""
    return properties.get(item_constants.UUID, "")


def get_accession(properties: Dict[str, Any]) -> str:
    """Get accession from properties."""
    return properties.get("accession", "")


def get_at_id(properties: Dict[str, Any]) -> str:
    """Get @id from properties."""
    return properties.get("@id", "")


def get_status(properties: Dict[str, Any]) -> str:
    """Get status from properties."""
    return properties.get(item_constants.STATUS, "")


def get_display_title(properties: Dict[str, Any]) -> str:
    """Get display title from properties."""
    return properties.get("display_title", "")


def get_title(properties: Dict[str, Any]) -> str:
    """Get title from properties."""
    return properties.get("title", "")


def get_description(properties: Dict[str, Any]) -> str:
    """Get description from properties."""
    return properties.get("description", "")


def get_types(properties: Dict[str, Any]) -> List[str]:
    """Get types from properties."""
    return properties.get("@type", [])


def get_type(properties: Dict[str, Any]) -> str:
    """Get "final" type from properties."""
    types = get_types(properties)
    if types:
        return types[0]
    return ""


def get_submission_centers(
    properties: Dict[str, Any]
) -> List[Union[Dict[str, Any], str]]:
    """Get submission centers from properties."""
    return properties.get("submission_centers", [])


def get_consortia(properties: Dict[str, Any]) -> List[Union[Dict[str, Any], str]]:
    """Get consortia from properties."""
    return properties.get("consortia", [])


def get_code(properties: Dict[str, Any]) -> str:
    """Get code from properties."""
    return properties.get("code", "")


def get_external_id(properties: Dict[str, Any]) -> str:
    """Get external ID from properties."""
    return properties.get("external_id", "")


def get_tags(properties: Dict[str, Any]) -> List[str]:
    """Get tags from properties."""
    return properties.get("tags", [])


def get_submitted_id(properties: Dict[str, Any]) -> str:
    """Get submitted ID from properties."""
    return properties.get("submitted_id", "")


def get_aliases(properties: Dict[str, Any]) -> List[str]:
    """Get aliases from properties."""
    return properties.get("aliases", [])


def get_identifier(properties: Dict[str, Any]) -> str:
    """Get identifier from properties."""
    return properties.get("identifier", "")


def get_version(properties: Dict[str, Any]) -> str:
    """Get version from properties."""
    return properties.get("version", "")


def is_released(properties: Dict[str, Any]) -> bool:
    """Check if item is released."""
    return get_status(properties) == item_constants.STATUS_RELEASED


def get_preferred_name(properties: Dict[str, Any]) -> str:
    """Get preferred name from properties."""
    return properties.get("preferred_name", "")


def get_preparation_kits(properties: Dict[str, Any]) -> List[Union[Dict[str, Any], str]]:
    """Get preparation kits from properties."""
    return properties.get("preparation_kits", [])


def get_treatments(properties: Dict[str, Any]) -> List[Union[Dict[str, Any], str]]:
    """Get treatments from properties."""
    return properties.get("treatments", [])