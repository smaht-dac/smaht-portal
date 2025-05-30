from typing import Any, Dict, List


def get_valid_sequencers(properties: Dict[str, Any]) -> List[str]:
    """Get valid sequencers from properties."""
    return properties.get("valid_sequencers",[])


def get_valid_molecules(properties: Dict[str, Any]) -> List[str]:
    """Get valid molecules from properties."""
    return properties.get("valid_molecules",[])


def get_cell_isolation_method(properties: Dict[str, Any]) -> str:
    """Get cell isolation method from properties."""
    return properties.get("cell_isolation_method","")


