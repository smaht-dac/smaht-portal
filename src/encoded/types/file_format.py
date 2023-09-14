from encoded_core.types.file_format import FileFormat as CoreFileFormat
from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name='file-formats',
    unique_key='file_format:file_format',
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
