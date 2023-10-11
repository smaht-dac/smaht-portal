import os
from copy import deepcopy
from snovault import collection, calculated_property
from encoded_core.types.user_content import StaticSection as CoreStaticSection
from encoded_core.types.user_content import get_local_file_contents, get_remote_file_contents
from .base import Item as SMAHTItem
from .base import mixin_smaht_permission_types


ENCODED_CORE_STATIC_SECTION_SCHEMA = deepcopy(CoreStaticSection.schema)


@collection(
    name='static-sections',
    unique_key='user_content:name',
    properties={
        'title': 'Static Sections',
        'description': 'Static Sections for the Portal',
    })
class StaticSection(SMAHTItem, CoreStaticSection):
    item_type = 'static_section'
    schema = mixin_smaht_permission_types(ENCODED_CORE_STATIC_SECTION_SCHEMA)

    # XXX: This is very important due to how files are resolved
    @calculated_property(schema={
        "title": "Content",
        "description": "Content for the page",
        "type": "string"
    })
    def content(self, request, body=None, file=None):

        if isinstance(body, str) or isinstance(body, dict) or isinstance(body, list):
            # Don't need to load in anything. We don't currently support dict/json body (via schema) but could in future.
            return body

        if isinstance(file, str):
            if file[0:4] == 'http' and '://' in file[4:8]:  # Remote File
                return get_remote_file_contents(file)
            else:  # Local File
                # TODO: this needs refactor desparetly in encoded-core - Will Sept 27 2023
                file_path = os.path.abspath(
                    os.path.dirname(os.path.realpath(__file__)) + "/../../.." + file)  # Go to top of repo, append file
                return get_local_file_contents(file_path)

        return None

    @calculated_property(schema={
        "title": "File Type",
        "description": "Type of file used for content",
        "type": "string"
    })
    def filetype(self, request, body=None, file=None, options=None):
        if options and options.get('filetype') is not None:
            return options['filetype']
        if isinstance(body, str):
            return 'txt'
        if isinstance(body, dict) or isinstance(body, list):
            return 'json'
        if isinstance(file, str):
            filename_parts = file.split('.')
            if len(filename_parts) > 1:
                return filename_parts[len(filename_parts) - 1]
            else:
                return 'txt' # Default if no file extension.
        return None