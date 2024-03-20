from typing import Any, Dict, List


def get_samples(analyte: Dict[str, Any]) -> List[str]:
    """Get samples connected to analyte."""
    return analyte.get("samples", [])
