from typing import Any, Dict, Union


def get_sequencer(properties: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get sequencer from properties."""
    return properties.get("sequencer", "")


def get_read_type(properties: Dict[str, Any]) -> str:
    """Get read type from properties."""
    return properties.get("read_type", "")


def get_target_read_length(properties: Dict[str, Any]) -> Union[int, None]:
    """Get target read length from properties."""
    return properties.get("target_read_length")


def get_flow_cell(properties: Dict[str, Any]) -> str:
    """Get flow cell from properties."""
    return properties.get("flow_cell", "")
