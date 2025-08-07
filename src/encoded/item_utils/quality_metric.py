from typing import Any, Dict


def get_url(properties: Dict[str, Any]) -> str:
    return properties.get("url", "")


def get_zip_file_accession(properties: Dict[str, Any]) -> str:
    """Parse zip file accession from URL.

    Note: Consider making a calcprop on QualityMetric if useful for
    searching.
    """
    url = get_url(properties)
    return url.split("/")[-1].split(".")[0]


def get_coverage(properties: Dict[str, Any]) -> str:
    """Get coverage calc prop from properties."""
    return properties.get("coverage", "")
