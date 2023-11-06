from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name='consortia',
    unique_key='consortium:identifier',  # For shorthand reference as linkTo
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
