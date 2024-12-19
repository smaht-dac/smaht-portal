from typing import Any, Dict, Union


def get_sequencer(properties: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get sequencer from properties."""
    return properties.get("sequencer", "")


def get_read_type(properties: Dict[str, Any]) -> str:
    """Get read type from properties."""
    return properties.get("read_type", "")


def get_target_read_length(properties: Dict[str, Any]) -> Union[int, None]:
    """Get target read length from properties."""
    return properties.get("target_read_length","")


def get_target_read_count(properties: Dict[str, Any]) -> Union[int, None]:
    """Get target read count from properties."""
    return properties.get("target_read_count","")


def get_on_target_rate(properties: Dict[str, Any]) -> Union[int, None]:
    """Get on-target rate from properties."""
    return properties.get("on_target_rate","")


def get_target_coverage(properties: Dict[str, Any]) -> Union[int, None]:
    """Get target coverage from properties."""
    return properties.get("target_coverage","")


def get_flow_cell(properties: Dict[str, Any]) -> str:
    """Get flow cell from properties."""
    return properties.get("flow_cell", "")
