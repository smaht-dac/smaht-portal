from snovault import collection, abstract_collection
from snovault.types.base import Item
from copy import deepcopy
from encoded_core.types.file import File as CoreFile
from encoded_core.types.file_submitted import FileSubmitted as CoreFileSubmitted
from encoded_core.types.file_reference import FileReference as CoreFileReference
from encoded_core.types.file_processed import FileProcessed as CoreFileProcessed
from .base import SMAHTItem, mixin_smaht_permission_types


ENCODED_CORE_FILE_SUBMITTED_SCHEMA = deepcopy(CoreFileSubmitted.schema)
ENCODED_CORE_FILE_REFERENCE_SCHEMA = deepcopy(CoreFileReference.schema)
ENCODED_CORE_FILE_PROCESSED_SCHEMA = deepcopy(CoreFileProcessed.schema)


@abstract_collection(
    name='files',
    unique_key='accession',
    properties={
        'title': 'Files',
        'description': 'Listing of Files',
    })
class File(SMAHTItem, CoreFile):
    class Collection(Item.Collection):
        pass


@collection(
    name='files-submitted',
    unique_key='accession',
    properties={
        'title': 'SMaHT Submitted Files',
        'description': 'Listing of SMaHT Submitted Files',
    })
class FileSubmitted(File, CoreFileSubmitted):
    """ Overwrites the FileSubmitted type from encoded-core, customizing the schema for smaht-portal """
    item_type = 'file_submitted'
    name_key = 'accession'
    schema = mixin_smaht_permission_types(ENCODED_CORE_FILE_SUBMITTED_SCHEMA)

    def __ac_local_roles__(self):
        return SMAHTItem.__ac_local_roles__(self)


@collection(
    name='files-reference',
    unique_key='accession',
    properties={
        'title': 'SMaHT Reference Files',
        'description': 'Listing of SMaHT Reference Files',
    })
class FileReference(File, CoreFileReference):
    """ Overwrites the FileReference type from encoded-core, customizing the schema for smaht-portal """
    item_type = 'file_reference'
    name_key = 'accession'
    schema = mixin_smaht_permission_types(ENCODED_CORE_FILE_REFERENCE_SCHEMA)


@collection(
    name='files-processed',
    unique_key='accession',
    properties={
        'title': 'SMaHT Processed Files',
        'description': 'Listing of SMaHT Processed Files',
    })
class FileProcessed(File, CoreFileProcessed):
    """ Overwrites the FileProcessed type from encoded-core, customizing the schema for smaht-portal """
    item_type = 'file_processed'
    name_key = 'accession'
    schema = mixin_smaht_permission_types(ENCODED_CORE_FILE_PROCESSED_SCHEMA)
