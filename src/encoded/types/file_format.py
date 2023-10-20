from typing import Optional, Union
from snovault import collection, calculated_property
from encoded_core.types.file_format import FileFormat as CoreFileFormat
from snovault import calculated_property, collection, display_title_schema, load_schema
from .base import Item as SMAHTItem


@collection(
    name='file-formats',
    unique_key='file_format:identifier',
    properties={
        'title': 'SMaHT File Format',
        'description': 'Listing of SMaHT File Formats',
    })
class FileFormat(SMAHTItem, CoreFileFormat):
    """ Overwrites the FileFormat type from encoded-core, customizing the schema for smaht-portal """
    item_type = 'file_format'
    base_types = [
        'SMAHTItem'
    ]
    schema = load_schema("encoded:schemas/file_format.json")

    @calculated_property(schema={
        "title": "Display Title",
        "description": "File Format name or extension.",
        "type": "string"
    })
    def display_title(self, file_format):
        return CoreFileFormat.display_title(self, file_format)
