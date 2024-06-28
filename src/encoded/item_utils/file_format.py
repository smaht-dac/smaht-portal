from typing import Any, Dict


def get_standard_file_extension(properties: Dict[str, Any]) -> str:
    return properties.get("standard_file_extension", "")
