from copy import deepcopy
from snovault import collection
from encoded_core.types.software import Software as CoreSoftware
from .base import SMAHTItem, mixin_smaht_permission_types


ENCODED_CORE_SOFTWARE_SCHEMA = deepcopy(CoreSoftware.schema)


@collection(
    name='softwares',
    properties={
        'title': 'Softwares',
        'description': 'Listing of software for analyses',
    })
class Software(SMAHTItem, CoreSoftware):
    item_type = 'software'
    schema = mixin_smaht_permission_types(ENCODED_CORE_SOFTWARE_SCHEMA)
