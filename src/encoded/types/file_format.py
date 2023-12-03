from typing import Optional, Union

from encoded_core.types.file_format import FileFormat as CoreFileFormat
from snovault import calculated_property, collection, display_title_schema, load_schema

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item as SMAHTItem


@collection(
    name='file-formats',
    unique_key="file_format:identifier",  # For shorthand reference as linkTo
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        'title': 'SMaHT File Format',
        'description': 'Listing of SMaHT File Formats',
    })
class FileFormat(SMAHTItem, CoreFileFormat):
    """ Overwrites the FileFormat type from encoded-core, customizing the schema for smaht-portal """
    item_type = 'file_format'
    schema = load_schema("encoded:schemas/file_format.json")
    embedded_list = []

    @calculated_property(schema=display_title_schema)
    def display_title(self, identifier: Optional[str] = None) -> Union[str, None]:
        if identifier:
            return identifier
