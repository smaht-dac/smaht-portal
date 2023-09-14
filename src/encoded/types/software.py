from snovault import collection, load_schema
from encoded_core.types.software import Software as CoreSoftware

from .base import Item as SMAHTItem


@collection(
    name='software',
    properties={
        'title': 'Software',
        'description': 'Listing of software for analyses',
    })
class Software(SMAHTItem, CoreSoftware):
    item_type = 'software'
    schema = load_schema("encoded:schemas/software.json")
