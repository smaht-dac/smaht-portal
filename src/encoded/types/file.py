from snovault import collection
from copy import deepcopy
from encoded_core.types.file_submitted import FileSubmitted as CoreFileSubmitted
from encoded_core.types.file_reference import FileReference as CoreFileReference
from encoded_core.types.file_processed import FileProcessed as CoreFileProcessed
from .base import SMAHTItem, mixin_smaht_permission_types
from .acl import ONLY_ADMIN_VIEW_ACL


ENCODED_CORE_FILE_SUBMITTED_SCHEMA = deepcopy(CoreFileSubmitted.schema)
ENCODED_CORE_FILE_REFERENCE_SCHEMA = deepcopy(CoreFileReference.schema)
ENCODED_CORE_FILE_PROCESSED_SCHEMA = deepcopy(CoreFileProcessed.schema)


@collection(
    name='files-submitted',
    properties={
        'title': 'SMaHT Submitted Files',
        'description': 'Listing of SMaHT Submitted Files',
    })
class FileSubmitted(SMAHTItem, CoreFileSubmitted):
    """ Overwrites the FileSubmitted type from encoded-core, customizing the schema for smaht-portal """
    schema = mixin_smaht_permission_types(ENCODED_CORE_FILE_SUBMITTED_SCHEMA)

    def __ac_local_roles__(self):
        return SMAHTItem.__ac_local_roles__(self)


@collection(
    name='files-reference',
    acl=ONLY_ADMIN_VIEW_ACL,  # only admins can create reference files
    properties={
        'title': 'SMaHT Reference Files',
        'description': 'Listing of SMaHT Reference Files',
    })
class FileReference(SMAHTItem, CoreFileReference):
    """ Overwrites the FileReference type from encoded-core, customizing the schema for smaht-portal """
    schema = mixin_smaht_permission_types(ENCODED_CORE_FILE_REFERENCE_SCHEMA)


@collection(
    name='files-processed',
    acl=ONLY_ADMIN_VIEW_ACL,  # only admins can create processed files
    properties={
        'title': 'SMaHT Processed Files',
        'description': 'Listing of SMaHT Processed Files',
    })
class FileProcessed(SMAHTItem, CoreFileProcessed):
    """ Overwrites the FileProcessed type from encoded-core, customizing the schema for smaht-portal """
    schema = mixin_smaht_permission_types(ENCODED_CORE_FILE_PROCESSED_SCHEMA)
