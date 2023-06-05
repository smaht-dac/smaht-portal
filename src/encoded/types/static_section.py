from snovault import collection
from encoded_core.types.user_content import StaticSection as CoreStaticSection
from .base import SMAHTItem


@collection(
    name='static-sections',
    unique_key='user_content:name',
    properties={
        'title': 'Static Sections',
        'description': 'Static Sections for the Portal',
    })
class StaticSection(SMAHTItem, CoreStaticSection):
    pass
