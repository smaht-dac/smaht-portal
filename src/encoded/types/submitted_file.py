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
    File,
)
from .submitted_item import (
    SUBMITTED_ITEM_ADD_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PUT_VALIDATORS,
    SubmittedItem,
)
from ..item_utils import file as file_utils, item as item_utils
from ..item_utils.utils import RequestHandler


SUBMITTED_FILE_ADD_VALIDATORS = list(
    set(SUBMITTED_ITEM_ADD_VALIDATORS + FILE_ADD_VALIDATORS)
)
SUBMITTED_FILE_EDIT_PATCH_VALIDATORS = list(
    set(SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS + FILE_EDIT_PATCH_VALIDATORS)
)
SUBMITTED_FILE_EDIT_PUT_VALIDATORS = list(
    set(SUBMITTED_ITEM_EDIT_PUT_VALIDATORS + FILE_EDIT_PUT_VALIDATORS)
)


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

    @calculated_property(
        schema={
            "title": "Sequencing",
            "description": "Sequencing associated with the file",
            "type": "array",
            "uniqueItems": True,
            "items": {
                "type": "string",
                "linkTo": "Sequencing",
            },
        },
    )
    def sequencing(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get Sequencing items associated with the file."""
        if file_sets:
            request_handler = RequestHandler(request=request)
            result = file_utils.get_sequencings(request_handler, self.properties)
        return result or None

    @calculated_property(
        schema={
            "title": "Assays",
            "description": "Assays associated with the file",
            "type": "array",
            "uniqueItems": True,
            "items": {
                "type": "string",
                "linkTo": "Assay",
            },
        },
    )
    def assays(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get Assays associated with the file."""
        if file_sets:
            request_handler = RequestHandler(request=request)
            result = file_utils.get_assays(request_handler, self.properties)
        return result or None

    @calculated_property(
        schema={
            "title": "Analytes",
            "description": "Analytes associated with the file",
            "type": "array",
            "uniqueItems": True,
            "items": {
                "type": "string",
                "linkTo": "Analyte",
            },
        },
    )
    def analytes(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get Analytes associated with the file."""
        if file_sets:
            request_handler = RequestHandler(request=request)
            result = file_utils.get_analytes(request_handler, self.properties)
        return result or None

    @calculated_property(
        schema={
            "title": "Samples",
            "description": "Samples associated with the file",
            "type": "array",
            "uniqueItems": True,
            "items": {
                "type": "string",
                "linkTo": "Sample",
            },
        },
    )
    def samples(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get Samples associated with the file."""
        if file_sets:
            request_handler = RequestHandler(request=request)
            result = file_utils.get_samples(request_handler, self.properties)
        return result or None

    @calculated_property(
        schema={
            "title": "Sample Sources",
            "description": "Sample sources (e.g. cell lines or tissues) associated with the file",
            "type": "array",
            "uniqueItems": True,
            "items": {
                "type": "string",
                "linkTo": "Tissue",
            },
        },
    )
    def sample_sources(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get SampleSources associated with the file."""
        if file_sets:
            request_handler = RequestHandler(request=request)
            result = file_utils.get_sample_sources(request_handler, self.properties)
        return result or None

    @calculated_property(
        schema={
            "title": "Donors",
            "description": "Donors associated with the file",
            "type": "array",
            "uniqueItems": True,
            "items": {
                "type": "string",
                "linkTo": "Donor",
            },
        },
    )
    def donors(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[List[str], None]:
        """Get Donors associated with the file."""
        if file_sets:
            request_handler = RequestHandler(request=request)
            result = file_utils.get_donors(request_handler, self.properties)
        return result or None

    @calculated_property(
        schema={
            "title": "File Summary",
            "type": "object",
            "properties": {
                "annotated_name": {
                    "title": "Annotated Name",
                    "type": "string",
                },
                "access_status": {
                    "title": "Access",
                    "type": "string",
                },
                "uuid": {
                    "title": "UUID",
                    "type": "string",
                },
                "file_format": {
                    "title": "Data Format",
                    "type": "string",
                },
                "file_size": {
                    "title": "Size",
                    "type": "string",
                },
                "md5sum": {
                    "title": "MD5 Checksum",
                    "type": "string",
                },
                "consortia": {
                    "title": "Consortium",
                    "type": "array",
                    "items": {
                        "type": "string",
                    },
                },
            },
        },
    )
    def file_summary(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[Dict[str, Any], None]:
        """Get file summary for display on file overview page."""
        if file_sets:
            request_handler = RequestHandler(request=request)
            file_summary = self._get_file_summary(
                request_handler, self.properties, self.uuid
            )
            if file_summary:
                return file_summary
        return

    def _get_file_summary(
        self,
        request_handler: RequestHandler,
        file_properties: Dict[str, Any],
        uuid: str,
    ) -> Dict[str, Any]:
        """Get file summary for display on file overview page."""
        to_include = {
            "annotated_name": file_utils.get_annotated_filename(file_properties),
            "access_status": file_utils.get_access_status(file_properties),
            "file_format": item_utils.get_display_title(
                request_handler.get_item(file_utils.get_file_format(file_properties))
            ),
            "file_size": file_utils.get_file_size(file_properties),
            "md5sum": file_utils.get_md5sum(file_properties),
            "consortia": self._get_display_titles(
                request_handler, item_utils.get_consortia(file_properties)
            ),
            "uuid": uuid,
        }
        return {
            key: value for key, value in to_include.items() if value
        }

    @staticmethod
    def _get_display_titles(
        request_handler: RequestHandler, identifiers: List[str]
    ) -> List[str]:
        """Get display titles for item identifiers."""
        items = request_handler.get_items(identifiers)
        return [
            item_utils.get_display_title(item) for item in items
            if item_utils.get_display_title(item)
        ]

    @calculated_property(
        schema={
            "title": "Data Generation Summary",
            "description": "Summary of data generation",
            "type": "object",
            "properties": {
                "data_category": {
                    "title": "Data Category",
                    "type": "array",
                    "items": {
                        "type": "string",
                    },
                },
                "data_type": {
                    "title": "Data Type",
                    "type": "array",
                    "items": {
                        "type": "string",
                    },
                },
                "sequencing_center": {
                    "title": "Sequencing Centers",
                    "type": "string",
                },
                "submission_centers": {
                    "title": "Generated By",
                    "type": "array",
                    "items": {
                        "type": "string",
                    },
                },
                "assays": {
                    "title": "Experimental Assay",
                    "type": "array",
                    "items": {
                        "type": "string",
                    },
                },
                "sequencing_platforms": {
                    "title": "Sequencing Platform",
                    "type": "array",
                    "items": {
                        "type": "string",
                    },
                },
            },
        },
    )
    def data_generation_summary(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[Dict[str, Any], None]:
        """Get data generation summary for display on file overview page."""
        request_handler = RequestHandler(request=request)
        data_generation_summary = self._get_data_generation_summary(
            request_handler, self.properties
        )
        if data_generation_summary:
            return data_generation_summary
        return

    def _get_data_generation_summary(
        self, request_handler: RequestHandler, file_properties: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Get data generation summary for display on file overview page."""
        to_include = {
            "data_category": file_utils.get_data_category(file_properties),
            "data_type": file_utils.get_data_type(file_properties),
            "sequencing_center": item_utils.get_display_title(
                request_handler.get_item(
                    file_utils.get_sequencing_center(file_properties)
                )
            ),
            "submission_centers": self._get_display_titles(
                request_handler,
                item_utils.get_submission_centers(file_properties)
            ),
            "assays": self._get_display_titles(
                request_handler,
                file_utils.get_assays(request_handler, file_properties)
            ),
            "sequencing_platforms": self._get_display_titles(
                request_handler,
                file_utils.get_sequencings(request_handler, file_properties)
            ),
        }
        return {
            key: value for key, value in to_include.items() if value
        }

    @calculated_property(
        schema={
            "title": "Sample Summary",
            "type": "object",
            "properties": {
                "donor_ids": {
                    "title": "Donor ID",
                    "type": "array",
                    "items": {
                        "type": "string",
                    },
                },
                "tissues": {
                    "title": "Tissue",
                    "type": "array",
                    "items": {
                        "type": "string",
                    },
                },
                "sample_ids": {
                    "title": "Sample ID",
                    "type": "array",
                    "items": {
                        "type": "string",
                    },
                },
                "sample_descriptions": {
                    "title": "Description",
                    "type": "array",
                    "items": {
                        "type": "string",
                    },
                },
                "analytes": {
                    "title": "Analyte",
                    "type": "array",
                    "items": {
                        "type": "string",
                    },
                },
                "studies": {
                    "title": "Study",
                    "type": "array",
                    "items": {
                        "type": "string",
                    },
                },
            },
        },
    )
    def sample_summary(
        self, request: Request, file_sets: Optional[List[str]] = None
    ) -> Union[Dict[str, Any], None]:
        """Get sample summary for display on file overview page."""
        if file_sets:
            request_handler = RequestHandler(request=request)
            sample_summary = self._get_sample_summary(request_handler, self.properties)
            if sample_summary:
                return sample_summary
        return

    def _get_sample_summary(
        self, request_handler: RequestHandler, file_properties: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Get sample summary for display on file overview page."""
        to_include = {
        }
        return {key: value for key, value in to_include.items() if value}


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
