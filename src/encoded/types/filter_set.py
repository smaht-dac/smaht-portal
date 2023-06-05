from snovault import collection
from snovault.types.filter_set import FilterSet as SnovaultFilterSet
from .base import SMAHTItem


@collection(
    name='filter-sets',
    unique_key='filter_set:title',
    properties={
        'title': 'Filter Sets',
        'description': 'Filter Set for combining multiple queries'
    }
)
class FilterSet(SMAHTItem, SnovaultFilterSet):
    pass
