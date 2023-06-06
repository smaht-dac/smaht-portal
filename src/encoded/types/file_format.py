from snovault import collection
from copy import deepcopy
from encoded_core.types.file_format import FileFormat as CoreFileFormat
from .base import SMAHTItem, mixin_smaht_permission_types


ENCODED_CORE_FILE_FORMAT_SCHEMA = deepcopy(CoreFileFormat.schema)


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
    schema = mixin_smaht_permission_types(ENCODED_CORE_FILE_FORMAT_SCHEMA)
    schema['properties']['valid_item_types']['items']['enum'] = [
        'FileSubmitted', 'FileProcessed', 'FileReference'
    ]
