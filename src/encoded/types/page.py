from copy import deepcopy
from snovault import collection
from encoded_core.types.page import Page as CorePage
from .base import Item as SMAHTItem
from .base import mixin_smaht_permission_types


ENCODED_CORE_PAGE_SCHEMA = deepcopy(CorePage.schema)


@collection(
    name='pages',
    lookup_key='name',
    properties={
        'title': 'Pages',
        'description': 'Static Pages for the Portal',
    })
class Page(SMAHTItem, CorePage):
    item_type = 'page'
    name_key = 'name'
    schema = mixin_smaht_permission_types(ENCODED_CORE_PAGE_SCHEMA)
