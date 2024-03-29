import os

from snovault import collection, calculated_property, load_schema
from encoded_core.types.user_content import (
    get_local_file_contents,
    get_remote_file_contents,
    StaticSection as CoreStaticSection,
)

from .acl import ONLY_ADMIN_VIEW_ACL
from .user_content import UserContent


@collection(
    name="static-sections",
    unique_key="static_section:identifier",
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        "title": "Static Sections",
        "description": "Static Sections for the Portal",
    })
class StaticSection(UserContent, CoreStaticSection):
    item_type = "static_section"
    schema = load_schema("encoded:schemas/static_section.json")
    embedded_list = []

    @calculated_property(schema={
        "title": "Content",
        "description": "Content for the page",
        "type": "string"
    })
    def content(self, request, body=None, file=None):
        # TODO: refactor pathing code in encoded-core so this can work in another repo
        if isinstance(body, str) or isinstance(body, dict) or isinstance(body, list):
            # Don't need to load in anything. We don't currently support dict/json body (via schema) but could in future.
            return body

        if isinstance(file, str):
            if file[0:4] == 'http' and '://' in file[4:8]:  # Remote File
                return get_remote_file_contents(file)
            else:  # Local File
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
        return CoreStaticSection.filetype(self, request, body=body, file=file, options=options)
