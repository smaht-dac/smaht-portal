from typing import Any, Dict


def get_valid_sequencers(properties: Dict[str, Any]) -> str:
    """Get valid sequencers from properties."""
    return properties.get("valid_sequencers",[])


def get_valid_molecules(properties: Dict[str, Any]) -> str:
    """Get valid molecules from properties."""
    return properties.get("valid_molecules",[])


