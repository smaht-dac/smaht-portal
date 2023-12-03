from snovault import collection, load_schema

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item as SMAHTItem


@collection(
    name='consortia',
    unique_key='consortium:identifier',  # For shorthand reference as linkTo
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        'title': 'Consortia',
        'description': 'Listing of SMaHT associated Consortia',
    }
)
class Consortium(SMAHTItem):
    """ Consortium item """
    item_type = 'consortium'
    schema = load_schema('encoded:schemas/consortium.json')
    embedded_list = []
