from copy import deepcopy
from snovault import collection
from snovault.types.filter_set import FilterSet as SnovaultFilterSet
from .base import SMAHTItem, mixin_smaht_permission_types


SNOVAULT_FILTER_SET_SCHEMA = deepcopy(SnovaultFilterSet.schema)


@collection(
    name='filter-sets',
    unique_key='filter_set:title',
    properties={
        'title': 'Filter Sets',
        'description': 'Filter Set for combining multiple queries'
    }
)
class FilterSet(SMAHTItem, SnovaultFilterSet):
    item_type = 'filter_set'
    schema = mixin_smaht_permission_types(SNOVAULT_FILTER_SET_SCHEMA)
