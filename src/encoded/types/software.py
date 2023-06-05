from snovault import collection
from encoded_core.types.software import Software as CoreSoftware
from .base import SMAHTItem


@collection(
    name='softwares',
    properties={
        'title': 'Softwares',
        'description': 'Listing of software for analyses',
    })
class Software(SMAHTItem, CoreSoftware):
    pass
