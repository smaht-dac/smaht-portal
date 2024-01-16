from snovault import collection, load_schema

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item


@collection(
    name="assays",
    unique_key="assay:identifier",  # For shorthand reference as linkTo
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        "title": "SMaHT Assay",
        "description": "Listing of SMaHT Assays",
    },
)
class Assay(Item):
    item_type = "assay"
    schema = load_schema("encoded:schemas/assay.json")
    embedded_list = []
