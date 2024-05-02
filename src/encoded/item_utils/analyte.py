from typing import Any, Dict, List, Union


def get_samples(analyte: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get samples connected to analyte."""
    return analyte.get("samples", [])


def get_molecule(analyte: Dict[str, Any]) -> List[str]:
    """Get molecule connected to analyte."""
    return analyte.get("molecule", [])
