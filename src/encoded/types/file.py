from snovault import collection
from copy import deepcopy
from encoded_core.types.file_submitted import FileSubmitted as CoreFileSubmitted
from encoded_core.types.file_reference import FileReference as CoreFileReference
from encoded_core.types.file_processed import FileProcessed as CoreFileProcessed
from .base import SMAHTItem, mixin_smaht_permission_types


ENCODED_CORE_FILE_SUBMITTED_SCHEMA = deepcopy(CoreFileSubmitted.schema)
ENCODED_CORE_FILE_REFERENCE_SCHEMA = deepcopy(CoreFileReference.schema)
ENCODED_CORE_FILE_PROCESSED_SCHEMA = deepcopy(CoreFileProcessed.schema)


@collection(
    name="smaht-files-submitted",
    unique_key="accession",
    properties={
        "title": "SMaHT Submitted Files",
        "description": "Listing of SMaHT Submitted Files",
    })
class SMAHTFileSubmitted(SMAHTItem, CoreFileSubmitted):
    """ Overwrites the FileSubmitted type from encoded-core, customizing the schema for smaht-portal """
    item_type = 'smaht_file_submitted'
    base_types = ['SMAHTItem', 'FileSubmitted', 'File']
    STATUS_ACL = SMAHTItem.STATUS_ACL
    schema = mixin_smaht_permission_types(ENCODED_CORE_FILE_SUBMITTED_SCHEMA)

    def __ac_local_roles__(self):
        return SMAHTItem.__ac_local_roles__(self)


@collection(
    name="smaht-files-reference",
    unique_key="accession",
    properties={
        "title": "SMaHT Reference Files",
        "description": "Listing of SMaHT Reference Files",
    })
class SMAHTFileReference(SMAHTItem, CoreFileReference):
    """ Overwrites the FileReference type from encoded-core, customizing the schema for smaht-portal """
    item_type = 'smaht_file_reference'
    base_types = ['SMAHTItem', 'FileReference', 'File']
    schema = mixin_smaht_permission_types(ENCODED_CORE_FILE_REFERENCE_SCHEMA)


@collection(
    name="smaht-files-processed",
    unique_key="accession",
    properties={
        "title": "SMaHT Processed Files",
        "description": "Listing of SMaHT Processed Files",
    })
class SMAHTFileReference(SMAHTItem, CoreFileProcessed):
    """ Overwrites the FileProcessed type from encoded-core, customizing the schema for smaht-portal """
    item_type = 'smaht_file_processed'
    base_types = ['SMAHTItem', 'FileProcessed', 'File']
    schema = mixin_smaht_permission_types(ENCODED_CORE_FILE_PROCESSED_SCHEMA)
