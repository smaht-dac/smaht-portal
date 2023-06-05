from snovault import collection
from encoded_core.types.page import Page as CorePage
from .base import SMAHTItem


@collection(
    name='pages',
    unique_key='page:name',
    properties={
        'title': 'Pages',
        'description': 'Static Pages for the Portal',
    })
class Page(SMAHTItem, CorePage):
    pass
