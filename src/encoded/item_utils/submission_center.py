from typing import Any, Dict


def is_gcc(properties: Dict[str, Any]):
    """Check if a submission center is a GCC."""
    return "gcc" in properties.get("identifier","") 


def is_tpc(properties: Dict[str, Any]):
    """Check if a submission center is a TPC."""
    return "tpc" in properties.get("identifier","") 


def is_ttd(properties: Dict[str, Any]):
    """Check if a submission center is a TTD."""
    return "ttd" in properties.get("identifier","")