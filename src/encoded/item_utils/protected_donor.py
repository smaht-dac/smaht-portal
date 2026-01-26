from typing import Any, Dict, Union, List


def get_age(properties: Dict[str, Any]) -> Union[int, None]:
    """Get age from properties."""
    return properties.get("age")


def get_sex(properties: Dict[str, Any]) -> str:
    """Get sex from properties."""
    return properties.get("sex", "")


def is_tpc_submitted(properties: Dict[str, Any]) -> bool:
    """Check if tpc_submitted is True."""
    return properties.get("tpc_submitted", "") == "True"


def get_hardy_scale(properties: Dict[str, Any]) -> Union[int, None]:
    """Get hardy scale from properties."""
    return properties.get("hardy_scale")


def get_medical_history(properties: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get medical history from properties."""
    return properties.get("medical_history", [])


def get_demographic(properties: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get demographic information from properties."""
    return properties.get("demographic", [])


def get_death_circumstances(
    properties: Dict[str, Any],
) -> List[Union[str, Dict[str, Any]]]:
    """Get death circumstances from properties."""
    return properties.get("death_circumstances", [])


def get_family_history(properties: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get family history from properties."""
    return properties.get("family_history", [])


def get_tissue_collection(
    properties: Dict[str, Any],
) -> List[Union[str, Dict[str, Any]]]:
    """Get tissue collection from properties."""
    return properties.get("tissue_collection", [])
