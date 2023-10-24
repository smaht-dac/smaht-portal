from snovault import collection, load_schema
from encoded_core.types.page import Page as CorePage

from .base import Item as SMAHTItem


@collection(
    name='pages',
    properties={
        'title': 'Pages',
        'description': 'Static Pages for the Portal',
    })
class Page(SMAHTItem, CorePage):
    item_type = 'page'
    schema = load_schema("encoded:schemas/page.json")
    embedded_list = []
