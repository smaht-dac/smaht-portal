import os
from copy import deepcopy
from snovault import collection, calculated_property
from encoded_core.types.user_content import StaticSection as CoreStaticSection
from encoded_core.types.user_content import get_local_file_contents, get_remote_file_contents
from .base import Item as SMAHTItem
from .base import mixin_smaht_permission_types
from .user_content import UserContent as SMAHTUserContent


ENCODED_CORE_STATIC_SECTION_SCHEMA = deepcopy(CoreStaticSection.schema)


@collection(
    name='static-sections',
    unique_key='user_content:name',
    properties={
        'title': 'Static Sections',
        'description': 'Static Sections for the Portal',
    })
class StaticSection(SMAHTUserContent, CoreStaticSection):
    item_type = 'static_section'
    schema = mixin_smaht_permission_types(ENCODED_CORE_STATIC_SECTION_SCHEMA)

    @calculated_property(schema={
        "title": "Content",
        "description": "Content for the page",
        "type": "string"
    })
    def content(self, request, body=None, file=None):
        return super().content(request, body=body, file=file)

    @calculated_property(schema={
        "title": "File Type",
        "description": "Type of file used for content",
        "type": "string"
    })
    def filetype(self, request, body=None, file=None, options=None):
        return super().filetype(request, body=body, file=file, options=options)
