from snovault import collection, load_schema
from encoded_core.types.page import Page as CorePage

from .base import Item as SmahtItem


@collection(
    name='pages',
    unique_key='identifier',
    properties={
        'title': 'Pages',
        'description': 'Static Pages for the Portal',
    })
class Page(SmahtItem, CorePage):
    item_type = 'page'
    schema = load_schema("encoded:schemas/page.json")
    embedded_list = []
    ALLOWED_PATH_CHARACTERS = ["/"] + CorePage.ALLOWED_PATH_CHARACTERS
