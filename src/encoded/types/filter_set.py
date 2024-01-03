from snovault import collection, load_schema
from snovault.types.filter_set import FilterSet as SnovaultFilterSet

from .acl import ALLOW_CONSORTIUM_CREATE_ACL
from .base import Item


@collection(
    name='filter-sets',
    acl=ALLOW_CONSORTIUM_CREATE_ACL,
    properties={
        'title': 'Filter Sets',
        'description': 'Filter Set for combining multiple queries'
    }
)
class FilterSet(Item, SnovaultFilterSet):
    item_type = 'filter_set'
    schema = load_schema("encoded:schemas/filter_set.json")
    embedded_list = []
