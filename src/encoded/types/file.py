from copy import deepcopy
from snovault import abstract_collection, calculated_property, collection, load_schema
from encoded_core.types.file import File as CoreFile
from encoded_core.types.file import show_upload_credentials
from encoded_core.types.file_submitted import FileSubmitted as CoreFileSubmitted
from encoded_core.types.file_reference import FileReference as CoreFileReference
from encoded_core.types.file_processed import FileProcessed as CoreFileProcessed
from .base import Item as SMAHTItem, mixin_smaht_permission_types


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
    schema = load_schema("encoded:schemas/file.json")
    name_key = 'accession'

    @calculated_property(schema={
        "title": "Display Title",
        "description": "Name of this File",
        "type": "string"
    })
    def display_title(self, request, file_format, accession=None, external_accession=None):
        return CoreFile.display_title(self, request, file_format, accession=accession,
                                      external_accession=external_accession)

    @calculated_property(schema={
        "title": "File Type",
        "description": "Type of File",
        "type": "string"
    })
    def file_type_detailed(self, request, file_format, file_type=None):
        return CoreFile.file_type_detailed(self, request, file_format, file_type=file_type)

    @calculated_property(schema={
        "title": "Title",
        "type": "string",
        "description": "Accession of this file"
    })
    def title(self, accession=None, external_accession=None):
        return CoreFile.title(self, accession=accession, external_accession=external_accession)

    @calculated_property(schema={
        "title": "Download URL",
        "type": "string",
        "description": "Use this link to download this file."
    })
    def href(self, request, file_format, accession=None, external_accession=None):
        return CoreFile.href(self, request, file_format, accession=accession,
                             external_accession=external_accession)

    @calculated_property(schema={
        "title": "Upload Key",
        "type": "string",
    })
    def upload_key(self, request):
        return CoreFile.upload_key(self, request)

    @calculated_property(condition=show_upload_credentials, schema={
        "type": "object",
    })
    def upload_credentials(self):
        return CoreFile.upload_credentials(self)

    @calculated_property(condition=show_upload_credentials, schema={
        "type": "object",
    })
    def extra_files_creds(self):
        return CoreFile.extra_files_creds(self)

    class Collection(SMAHTItem.Collection):
        pass


@collection(
    name='files-submitted',
    unique_key='accession',
    properties={
        'title': 'SMaHT Submitted Files',
        'description': 'Listing of SMaHT Submitted Files',
    })
class FileSubmitted(File):
    """ Overwrites the FileSubmitted type from encoded-core, customizing the schema for smaht-portal """
    item_type = 'file_submitted'
    name_key = 'accession'
    schema = mixin_smaht_permission_types(ENCODED_CORE_FILE_SUBMITTED_SCHEMA)
    base_types = ['File'] + SMAHTItem.base_types
    rev = dict(File.rev, **{
        'workflow_run_inputs': ('WorkflowRun', 'input_files.value'),
        'workflow_run_outputs': ('WorkflowRun', 'output_files.value'),
    })

    def __ac_local_roles__(self):
        return SMAHTItem.__ac_local_roles__(self)

    @calculated_property(schema={
        "title": "Input of Workflow Runs",
        "description": "All workflow runs that this file serves as an input to",
        "type": "array",
        "items": {
            "title": "Input of Workflow Run",
            "type": ["string", "object"],
            "linkTo": "WorkflowRun"
        }
    })
    def workflow_run_inputs(self, request):
        return CoreFileSubmitted.workflow_run_inputs(self, request)

    @calculated_property(schema={
        "title": "Output of Workflow Runs",
        "description": "All workflow runs that this file serves as an output from",
        "type": "array",
        "items": {
            "title": "Output of Workflow Run",
            "type": "string",
            "linkTo": "WorkflowRun"
        }
    })
    def workflow_run_outputs(self, request):
        return CoreFileSubmitted.workflow_run_outputs(self, request)


@collection(
    name='files-reference',
    unique_key='accession',
    properties={
        'title': 'SMaHT Reference Files',
        'description': 'Listing of SMaHT Reference Files',
    })
class FileReference(File):
    """ Overwrites the FileReference type from encoded-core, customizing the schema for smaht-portal """
    item_type = 'file_reference'
    name_key = 'accession'
    schema = mixin_smaht_permission_types(ENCODED_CORE_FILE_REFERENCE_SCHEMA)
    base_types = ['File'] + SMAHTItem.base_types


@collection(
    name='files-processed',
    unique_key='accession',
    properties={
        'title': 'SMaHT Processed Files',
        'description': 'Listing of SMaHT Processed Files',
    })
class FileProcessed(File):
    """ Overwrites the FileProcessed type from encoded-core, customizing the schema for smaht-portal """
    item_type = 'file_processed'
    name_key = 'accession'
    schema = mixin_smaht_permission_types(ENCODED_CORE_FILE_PROCESSED_SCHEMA)
    base_types = ['File'] + SMAHTItem.base_types
    rev = dict(File.rev, **{
        'workflow_run_inputs': ('WorkflowRun', 'input_files.value'),
        'workflow_run_outputs': ('WorkflowRun', 'output_files.value'),
    })

    @calculated_property(schema={
        "title": "Input of Workflow Runs",
        "description": "All workflow runs that this file serves as an input to",
        "type": "array",
        "items": {
            "title": "Input of Workflow Run",
            "type": ["string", "object"],
            "linkTo": "WorkflowRun"
        }
    })
    def workflow_run_inputs(self, request, disable_wfr_inputs=False):
        return CoreFileProcessed.workflow_run_inputs(self, request, disable_wfr_inputs=disable_wfr_inputs)

    @calculated_property(schema={
        "title": "Output of Workflow Runs",
        "description": "All workflow runs that this file serves as an output from",
        "type": "array",
        "items": {
            "title": "Output of Workflow Run",
            "type": "string",
            "linkTo": "WorkflowRun"
        }
    })
    def workflow_run_outputs(self, request):
        return CoreFileProcessed.workflow_run_outputs(self, request)
