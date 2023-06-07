from snovault import collection
from snovault import load_schema
from .base import SMAHTItem
from .acl import ONLY_ADMIN_VIEW_ACL


@collection(
    name='consortium',
    unique_key='consortium:name',
    properties={
        'title': 'Consortium',
        'description': 'Listing of SMaHT associated Consortiums',
    }
)
class Consortium(SMAHTItem):
    """ Consortium item """
    item_type = 'consortium'
    schema = load_schema('encoded:schemas/consortium.json')
    embedded_list = SMAHTItem.embedded_list
    name_key = 'name'
