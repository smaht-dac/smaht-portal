from typing import Any, Dict, Union


def get_sequencer(properties: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """Get sequencer from properties."""
    return properties.get("sequencer", "")
