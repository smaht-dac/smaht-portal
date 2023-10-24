from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name='consortium',
    properties={
        'title': 'Consortium',
        'description': 'Listing of SMaHT associated Consortiums',
    }
)
class Consortium(SMAHTItem):
    """ Consortium item """
    item_type = 'consortium'
    schema = load_schema('encoded:schemas/consortium.json')
    embedded_list = []
