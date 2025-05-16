from typing import Any, Dict, Union



def get_category(properties: Dict[str, Any]) -> Union[int, None]:
    """Get category from properties."""
    return properties.get("category")