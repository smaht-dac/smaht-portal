from typing import Any, Dict, Optional, Union
from pyramid.view import view_config
from pyramid.request import Request
from encoded_core.types.file import (
    HREF_SCHEMA,
    UNMAPPED_OBJECT_SCHEMA,
    UPLOAD_KEY_SCHEMA,
    File as CoreFile,
)
from encoded_core.file_views import (
    validate_processed_file_unique_md5_with_bypass,
    validate_file_filename,
    validate_extra_file_format,
    validate_processed_file_produced_from_field,
    drs as CoreDRS,
    download as CoreDownload,
    post_upload as CorePostUpload,
    get_upload as CoreGetUpload
)
from snovault import (
    calculated_property,
    load_schema,
    abstract_collection,
)
from snovault.schema_utils import schema_validator
from snovault.util import debug_log
from snovault.validators import (
    validate_item_content_post,
    validate_item_content_put,
    validate_item_content_patch,
    validate_item_content_in_place,
    no_validate_item_content_post,
    no_validate_item_content_put,
    no_validate_item_content_patch
)

from .base import (
    Item as SMAHTItem,
    collection_add,
    item_edit,
)


def show_upload_credentials(
    request: Optional[Request] = None,
    context: Optional[str] = None,
    status: Optional[str] = None,
) -> bool:
    if request is None or status not in File.SHOW_UPLOAD_CREDENTIALS_STATUSES:
        return False
    return request.has_permission("edit", context)


@abstract_collection(
    name="files",
    unique_key='accession',
    properties={
        "title": "Files",
        "description": "Listing of Files",
    },
)
class File(SMAHTItem, CoreFile):
    item_type = "file"
    schema = load_schema("encoded:schemas/file.json")
    embedded_list = []

    SHOW_UPLOAD_CREDENTIALS_STATUSES = ("in review",)

    class Collection(SMAHTItem.Collection):
        pass

    def _update(
        self, properties: Dict[str, Any], sheets: Optional[Dict] = None
    ) -> None:
        return CoreFile._update(self, properties, sheets=sheets)

    @calculated_property(schema=HREF_SCHEMA)
    def href(
        self,
        request: Request,
        file_format: Optional[str] = None,
        accession: Optional[str] = None,
    ) -> str:
        return CoreFile.href(self, request, file_format, accession=accession)

    @calculated_property(
        condition=show_upload_credentials, schema=UNMAPPED_OBJECT_SCHEMA
    )
    def upload_credentials(self) -> Union[str, None]:
        return CoreFile.upload_credentials(self)

    @calculated_property(schema=UPLOAD_KEY_SCHEMA)
    def upload_key(self, request: Request) -> str:
        return CoreFile.upload_key(self, request)


@view_config(name='drs', context=File, request_method='GET',
             permission='view', subpath_segments=[0, 1])
def drs(context, request):
    return CoreDRS(context, request)


@view_config(name='upload', context=File, request_method='GET',
             permission='edit')
@debug_log
def get_upload(context, request):
    return CoreGetUpload(context, request)


@view_config(name='upload', context=File, request_method='POST',
             permission='edit', validators=[schema_validator({"type": "object"})])
@debug_log
def post_upload(context, request):
    return CorePostUpload(context, request)


@view_config(name='download', context=File, request_method='GET',
             permission='view', subpath_segments=[0, 1])
def download(context, request):
    return CoreDownload(context, request)


@view_config(context=File.Collection, permission='add', request_method='POST',
             validators=[validate_item_content_post,
                         validate_file_filename,
                         validate_extra_file_format,
                         validate_processed_file_unique_md5_with_bypass,
                         validate_processed_file_produced_from_field])
@view_config(context=File.Collection, permission='add_unvalidated', request_method='POST',
             validators=[no_validate_item_content_post],
             request_param=['validate=false'])
@debug_log
def file_add(context, request, render=None):
    return collection_add(context, request, render)


@view_config(context=File, permission='edit', request_method='PUT',
             validators=[validate_item_content_put,
                         validate_file_filename,
                         validate_extra_file_format,
                         validate_processed_file_unique_md5_with_bypass,
                         validate_processed_file_produced_from_field])
@view_config(context=File, permission='edit', request_method='PATCH',
             validators=[validate_item_content_patch,
                         validate_file_filename,
                         validate_extra_file_format,
                         validate_processed_file_unique_md5_with_bypass,
                         validate_processed_file_produced_from_field])
@view_config(context=File, permission='edit_unvalidated', request_method='PUT',
             validators=[no_validate_item_content_put],
             request_param=['validate=false'])
@view_config(context=File, permission='edit_unvalidated', request_method='PATCH',
             validators=[no_validate_item_content_patch],
             request_param=['validate=false'])
@view_config(context=File, permission='index', request_method='GET',
             validators=[validate_item_content_in_place,
                         validate_file_filename,
                         validate_extra_file_format,
                         validate_processed_file_unique_md5_with_bypass,
                         validate_processed_file_produced_from_field],
             request_param=['check_only=true'])
@debug_log
def file_edit(context, request, render=None):
    return item_edit(context, request, render)
