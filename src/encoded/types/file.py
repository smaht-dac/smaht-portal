from snovault import collection, abstract_collection
from copy import deepcopy
from encoded_core.types.file import File as CoreFile
from encoded_core.types.file_submitted import FileSubmitted as CoreFileSubmitted
from encoded_core.types.file_reference import FileReference as CoreFileReference
from encoded_core.types.file_processed import FileProcessed as CoreFileProcessed
from .base import Item as SMAHTItem
from .base import mixin_smaht_permission_types
from .acl import ONLY_ADMIN_VIEW_ACL


ENCODED_CORE_FILE_SCHEMA = deepcopy(CoreFile.schema)
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
    item_type = 'file'
    schema = mixin_smaht_permission_types(ENCODED_CORE_FILE_SCHEMA)


@collection(
    name='files-submitted',
    properties={
        'title': 'SMaHT Submitted Files',
        'description': 'Listing of SMaHT Submitted Files',
    })
class FileSubmitted(File):
    """ Overwrites the FileSubmitted type from encoded-core, customizing the schema for smaht-portal """
    item_type = 'file_submitted'
    schema = mixin_smaht_permission_types(ENCODED_CORE_FILE_SUBMITTED_SCHEMA)
    base_types = ['File'] + SMAHTItem.base_types

    def __ac_local_roles__(self):
        return SMAHTItem.__ac_local_roles__(self)


@collection(
    name='files-reference',
    properties={
        'title': 'SMaHT Reference Files',
        'description': 'Listing of SMaHT Reference Files',
    })
class FileReference(File):
    """ Overwrites the FileReference type from encoded-core, customizing the schema for smaht-portal """
    item_type = 'file_reference'
    schema = mixin_smaht_permission_types(ENCODED_CORE_FILE_REFERENCE_SCHEMA)
    base_types = ['File'] + SMAHTItem.base_types


@collection(
    name='files-processed',
    properties={
        'title': 'SMaHT Processed Files',
        'description': 'Listing of SMaHT Processed Files',
    })
class FileProcessed(File):
    """ Overwrites the FileProcessed type from encoded-core, customizing the schema for smaht-portal """
    item_type = 'file_processed'
    schema = mixin_smaht_permission_types(ENCODED_CORE_FILE_PROCESSED_SCHEMA)
    base_types = ['File'] + SMAHTItem.base_types
