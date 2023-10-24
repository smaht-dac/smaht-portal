from snovault import collection, load_schema
from encoded_core.types.user_content import StaticSection as CoreStaticSection

from .base import Item as SMAHTItem


@collection(
    name='static-sections',
    properties={
        'title': 'Static Sections',
        'description': 'Static Sections for the Portal',
    })
class StaticSection(SMAHTItem, CoreStaticSection):
    item_type = 'static_section'
    schema = load_schema("encoded:schemas/static_section.json")
    embedded_list = []
