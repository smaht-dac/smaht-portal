from snovault import collection
from copy import deepcopy
from encoded_core.types.file_format import FileFormat as CoreFileFormat
from .base import SMAHTItem


ENCODED_CORE_FILE_FORMAT_SCHEMA = deepcopy(CoreFileFormat.schema)


@collection(
    name="smaht-file-format",
    unique_key='smaht_file_format:file_format',
    properties={
        "title": "SMaHT File Format",
        "description": "Listing of SMaHT File Formats",
    })
class SMAHTFileFormat(SMAHTItem, CoreFileFormat):
    """ Overwrites the FileFormat type from encoded-core, customizing the schema for smaht-portal """
    item_type = 'smaht_file_format'
    base_types = [
        'FileFormat', 'SMAHTItem'
    ]
    schema = ENCODED_CORE_FILE_FORMAT_SCHEMA
    schema['properties']['valid_item_types']['items']['enum'] = [
        'SMAHTFileSubmitted'
    ]
