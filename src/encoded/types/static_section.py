from copy import deepcopy
from snovault import collection
from encoded_core.types.user_content import StaticSection as CoreStaticSection
from .base import SMAHTItem, mixin_smaht_permission_types


ENCODED_CORE_STATIC_SECTION_SCHEMA = deepcopy(CoreStaticSection.schema)


@collection(
    name="static-sections",
    unique_key="user_content:name",
    properties={
        "title": "Static Sections",
        "description": "Static Sections for the Portal",
    },
)
class StaticSection(SMAHTItem, CoreStaticSection):
    item_type = "static_section"
    schema = mixin_smaht_permission_types(ENCODED_CORE_STATIC_SECTION_SCHEMA)
