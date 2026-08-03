from typing import Any, Dict, Optional

from pyramid.request import Request
from pyramid.settings import asbool
from snovault import Item
from snovault.util import get_item_or_none

from .utils import get_properties, get_property_for_validation
from ..item_utils import item as item_utils


PROTECTED_METADATA_DONOR_ERROR = (
    "Protected metadata items must link their donor field to a ProtectedDonor, "
    "not an unprotected Donor."
)


def _should_skip_protected_donor_validation(request: Request) -> bool:
    """Allow submitr/loadxl validation-only paths to defer this link check.

    Server-side workbook validation uses skip_links=true so older submitr clients can
    validate workbooks before transforming Donor sheets to ProtectedDonor sheets. Actual
    ingestion does not use skip_links=true and should enforce this privacy invariant.
    """
    return asbool(request.params.get("skip_links", False))


def _get_donor_identifier_for_validation(context: Item, request: Request) -> Optional[str]:
    """Get the effective donor identifier for POST/PUT/PATCH validation."""
    properties_to_update = get_properties(request)
    if request.method == "POST":
        return properties_to_update.get("donor")
    existing_properties = get_properties(context)
    return get_property_for_validation("donor", existing_properties, properties_to_update)


def _get_abstract_donor_item(request: Request, donor_identifier: str) -> Dict[str, Any]:
    """Resolve a donor identifier to either Donor or ProtectedDonor properties.

    Specific collections are checked before the abstract collection so the resolved
    item has the concrete @type needed for this validation.
    """
    for item_type in ("protected-donors", "donors", "abstract-donors"):
        donor_item = get_item_or_none(request, donor_identifier, item_type)
        if donor_item:
            return donor_item
    return {}


def validate_donor_is_protected_donor(item_type_name: str):
    """Return a validator requiring protected metadata donor links to ProtectedDonor."""

    def validator(context, request):
        if _should_skip_protected_donor_validation(request):
            return
        donor_identifier = _get_donor_identifier_for_validation(context, request)
        if not donor_identifier:
            return
        donor_item = _get_abstract_donor_item(request, donor_identifier)
        if not donor_item:
            return  # Let standard link validation handle missing or invalid references.
        if item_utils.get_type(donor_item) != "ProtectedDonor":
            return request.errors.add(
                "body",
                f"{item_type_name}: invalid link",
                PROTECTED_METADATA_DONOR_ERROR,
            )
        return request.validated.update({})

    return validator
