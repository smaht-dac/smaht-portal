from copy import deepcopy
from snovault import collection
from snovault.types.filter_set import FilterSet as SnovaultFilterSet
from .base import Item as SMAHTItem
from .base import mixin_smaht_permission_types
from .acl import ALLOW_CONSORTIUM_CREATE_ACL


SNOVAULT_FILTER_SET_SCHEMA = deepcopy(SnovaultFilterSet.schema)


@collection(
    name='filter-sets',
    acl=ALLOW_CONSORTIUM_CREATE_ACL,
    unique_key='filter_set:title',
    properties={
        'title': 'Filter Sets',
        'description': 'Filter Set for combining multiple queries'
    }
)
class FilterSet(SMAHTItem, SnovaultFilterSet):
    item_type = 'filter_set'
    schema = mixin_smaht_permission_types(SNOVAULT_FILTER_SET_SCHEMA)
