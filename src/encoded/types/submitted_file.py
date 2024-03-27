from typing import Any, Dict, List, Optional, Union

from pyramid.request import Request
from pyramid.view import view_config
from snovault import abstract_collection, calculated_property, load_schema
from snovault.util import debug_log

from .acl import SUBMISSION_CENTER_MEMBER_CREATE_ACL
from .base import collection_add, Item, item_edit
from .file import (
    FILE_ADD_UNVALIDATED_VALIDATORS,
    FILE_ADD_VALIDATORS,
    FILE_INDEX_GET_VALIDATORS,
    FILE_EDIT_PATCH_VALIDATORS,
    FILE_EDIT_PUT_VALIDATORS,
    FILE_EDIT_UNVALIDATED_PATCH_VALIDATORS,
    FILE_EDIT_UNVALIDATED_PUT_VALIDATORS,
    CalcPropConstants,
    File,
)
from .submitted_item import (
    SUBMITTED_ITEM_ADD_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PUT_VALIDATORS,
    SubmittedItem,
)


SUBMITTED_FILE_ADD_VALIDATORS = list(
    set(SUBMITTED_ITEM_ADD_VALIDATORS + FILE_ADD_VALIDATORS)
)
SUBMITTED_FILE_EDIT_PATCH_VALIDATORS = list(
    set(SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS + FILE_EDIT_PATCH_VALIDATORS)
)
SUBMITTED_FILE_EDIT_PUT_VALIDATORS = list(
    set(SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + FILE_EDIT_PUT_VALIDATORS)
)


def show_upload_credentials(request=None, context=None, status=None):
    if request is None or status not in ('uploading', 'to be uploaded by workflow', 'upload failed'):
        return False
    return request.has_permission('edit', context)


class SubmittedFileCollection(Item.Collection):
    pass


@abstract_collection(
    name="submitted-files",
    unique_key="submitted_id",
    acl=SUBMISSION_CENTER_MEMBER_CREATE_ACL,
    properties={
        "title": "SMaHT Submitted Files",
        "description": "Listing of SMaHT Submitted Files",
    })
class SubmittedFile(File, SubmittedItem):
    item_type = "submitted_file"
    base_types = ["SubmittedFile"] + File.base_types
    schema = load_schema("encoded:schemas/submitted_file.json")
    embedded_list = File.embedded_list

    Collection = SubmittedFileCollection

    @calculated_property(schema=CalcPropConstants.LIBRARIES_SCHEMA)
    def libraries(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get Libraries associated with the file."""
        return self._get_libraries(request, file_sets=file_sets)

    @calculated_property(schema=CalcPropConstants.SEQUENCINGS_SCHEMA)
    def sequencing(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get Sequencing items associated with the file."""
        return self._get_sequencing(request, file_sets=file_sets)

    @calculated_property(schema=CalcPropConstants.ASSAYS_SCHEMA)
    def assays(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get Assays associated with the file."""
        return self._get_assays(request, file_sets=file_sets)

    @calculated_property(schema=CalcPropConstants.ANALYTES_SCHEMA)
    def analytes(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get Analytes associated with the file."""
        return self._get_analytes(request, file_sets=file_sets)

    @calculated_property(schema=CalcPropConstants.SAMPLES_SCHEMA)
    def samples(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get Samples associated with the file."""
        return self._get_samples(request, file_sets=file_sets)

    @calculated_property(schema=CalcPropConstants.SAMPLE_SOURCES_SCHEMA)
    def sample_sources(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get SampleSources associated with the file."""
        return self._get_sample_sources(request, file_sets=file_sets)

    @calculated_property(schema=CalcPropConstants.DONORS_SCHEMA)
    def donors(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get Donors associated with the file."""
        return self._get_donors(request, file_sets=file_sets)

    @calculated_property(schema=CalcPropConstants.FILE_SUMMARY_SCHEMA)
    def file_summary(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[Dict[str, Any], None]:
        """Get file summary for display on file overview page."""
        return self._get_file_summary(request, file_sets=file_sets)

    @calculated_property(schema=CalcPropConstants.DATA_GENERATION_SCHEMA)
    def data_generation_summary(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[Dict[str, Any], None]:
        """Get data generation summary for display on file overview page."""
        return self._get_data_generation_summary(request, self.properties)

    @calculated_property(schema=CalcPropConstants.SAMPLE_SUMMARY_SCHEMA)
    def sample_summary(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[Dict[str, Any], None]:
        """Get sample summary for display on file overview page."""
        return self._get_sample_summary(request, self.properties)

    @calculated_property(condition=show_upload_credentials, schema={
        "type": "object",
    })
    def upload_credentials(self):
        external = self.propsheets.get('external', None)
        if external is not None:
            return external['upload_credentials']

    @calculated_property(condition=show_upload_credentials, schema={
        "type": "object",
    })
    def extra_files_creds(self):
        external = self.propsheets.get('external', None)
        if external is not None:
            extras = []
            for extra in self.properties.get('extra_files', []):
                eformat = extra.get('file_format')
                xfile_format = self.registry['collections']['FileFormat'].get(eformat)
                try:
                    xff_uuid = str(xfile_format.uuid)
                except AttributeError:
                    print("Can't find required format uuid for %s" % eformat)
                    continue
                extra_creds = self.propsheets.get('external' + xff_uuid)
                extra['upload_credentials'] = extra_creds['upload_credentials']
                extras.append(extra)
            return extras


@view_config(
    context=SubmittedFile.Collection,
    permission="add",
    request_method="POST",
    validators=SUBMITTED_FILE_ADD_VALIDATORS,
)
@view_config(
    context=SubmittedFile.Collection,
    permission="add_unvalidated",
    request_method="POST",
    validators=FILE_ADD_UNVALIDATED_VALIDATORS,
    request_param=["validate=false"],
)
@debug_log
def submitted_file_add(context: Item, request: Request, render=None):
    return collection_add(context, request, render)


@view_config(
    context=SubmittedFile,
    permission="edit",
    request_method="PUT",
    validators=SUBMITTED_FILE_EDIT_PUT_VALIDATORS,
)
@view_config(
    context=SubmittedFile,
    permission="edit",
    request_method="PATCH",
    validators=SUBMITTED_FILE_EDIT_PATCH_VALIDATORS,
)
@view_config(
    context=SubmittedFile,
    permission="edit_unvalidated",
    request_method="PUT",
    validators=FILE_EDIT_UNVALIDATED_PUT_VALIDATORS,
    request_param=["validate=false"],
)
@view_config(
    context=SubmittedFile,
    permission="edit_unvalidated",
    request_method="PATCH",
    validators=FILE_EDIT_UNVALIDATED_PATCH_VALIDATORS,
    request_param=["validate=false"],
)
@view_config(
    context=SubmittedFile,
    permission="index",
    request_method="GET",
    validators=FILE_INDEX_GET_VALIDATORS,
    request_param=["check_only=true"],
)
@debug_log
def submitted_file_edit(context: Item, request: Request, render=None):
    return item_edit(context, request, render)
