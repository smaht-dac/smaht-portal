from typing import Any, Dict, Union, List


def get_height(properties: Dict[str, Any]) -> Union[float, None]:
    """Get height from properties."""
    return properties.get("height")

def get_weight(properties: Dict[str, Any]) -> Union[float, None]:
    """Get weight from properties."""
    return properties.get("weight")

def get_hiv_nat(properties: Dict[str, Any]) -> str:
    """Get HIV NAT from properties."""
    return properties.get("hiv_nat")

def get_allergens(properties: Dict[str, Any]) -> Union[List[str], None]:
    """Get allergens from properties."""
    return properties.get("allergens")

def get_diagnoses(properties: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get diagnoses from properties."""
    return properties.get("diagnoses", [])

def get_exposures(properties: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get exposures from properties."""
    return properties.get("exposures", [])

def get_medical_treatments(properties: Dict[str, Any]) -> List[Union[str, Dict[str, Any]]]:
    """Get medical treatments from properties."""
    return properties.get("medical_treatments", [])

def get_donor(properties: Dict[str, Any]):
    """Get donor from properties."""
    return properties.get("donor","")
