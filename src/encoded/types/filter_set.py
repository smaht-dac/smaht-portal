from snovault import collection, load_schema
from snovault.types.filter_set import FilterSet as SnovaultFilterSet

from .base import Item as SMAHTItem
from .acl import ALLOW_CONSORTIUM_CREATE_ACL


@collection(
    name='filter-sets',
    unique_key='filter_set:title',
    acl=ALLOW_CONSORTIUM_CREATE_ACL,
    properties={
        'title': 'Filter Sets',
        'description': 'Filter Set for combining multiple queries'
    }
)
class FilterSet(SMAHTItem, SnovaultFilterSet):
    item_type = 'filter_set'
    schema = load_schema("encoded:schemas/filter_set.json")
    embedded_list = []
