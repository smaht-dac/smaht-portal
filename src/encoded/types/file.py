from typing import Any, Dict, List, Optional, Union

from pyramid.view import view_config
from encoded_core.types.file import (
    HREF_SCHEMA,
    UNMAPPED_OBJECT_SCHEMA,
    UPLOAD_KEY_SCHEMA,
    File as CoreFile,
)
from pyramid.request import Request
from encoded_core.file_views import (
    validate_file_filename,
    validate_extra_file_format,
    drs as CoreDRS,
    download as CoreDownload,
    post_upload as CorePostUpload,
    get_upload as CoreGetUpload
)
from snovault import (
    calculated_property,
    display_title_schema,
    load_schema,
    abstract_collection,
)
from snovault.elasticsearch import ELASTIC_SEARCH
from snovault.schema_utils import schema_validator
from snovault.search.search_utils import make_search_subreq
from snovault.util import debug_log, get_item_or_none
from snovault.validators import (
    validate_item_content_post,
    validate_item_content_put,
    validate_item_content_patch,
    validate_item_content_in_place,
    no_validate_item_content_post,
    no_validate_item_content_put,
    no_validate_item_content_patch
)
from snovault.server_defaults import add_last_modified

from . import acl
from .base import (
    Item,
    collection_add,
    item_edit,
    validate_user_submission_consistency
)


def show_upload_credentials(
    request: Optional[Request] = None,
    context: Optional[str] = None,
    status: Optional[str] = None,
) -> bool:
    if request is None or status not in File.SHOW_UPLOAD_CREDENTIALS_STATUSES:
        return False
    return request.has_permission("edit", context)


def _build_file_embedded_list() -> List[str]:
    """Embeds for search on files."""
    return [
        "file_sets.assay",
        "file_sets.library",
        "file_sets.sequencing.sequencer",
        "software.name",
    ]


@abstract_collection(
    name="files",
    unique_key='accession',
    properties={
        "title": "Files",
        "description": "Listing of Files",
    },
)
class File(Item, CoreFile):
    item_type = "file"
    schema = load_schema("encoded:schemas/file.json")
    embedded_list = _build_file_embedded_list()

    Item.SUBMISSION_CENTER_STATUS_ACL.update({
        'uploaded': acl.ALLOW_SUBMISSION_CENTER_MEMBER_EDIT_ACL,
        'uploading': acl.ALLOW_SUBMISSION_CENTER_MEMBER_EDIT_ACL,
        'upload failed': acl.ALLOW_SUBMISSION_CENTER_MEMBER_EDIT_ACL,
        'to be uploaded by workflow': acl.ALLOW_SUBMISSION_CENTER_MEMBER_EDIT_ACL,
        'archived': acl.ALLOW_SUBMISSION_CENTER_MEMBER_VIEW_ACL
    })
    # These are all view only in case we find ourselves in this situation
    Item.CONSORTIUM_STATUS_ACL.update({
        'uploaded': acl.ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        'uploading': acl.ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        'upload failed': acl.ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        'to be uploaded by workflow': acl.ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        'archived': acl.ALLOW_CONSORTIUM_MEMBER_VIEW_ACL
    })

    SHOW_UPLOAD_CREDENTIALS_STATUSES = ("in review", "uploading")

    class Collection(Item.Collection):
        pass

    def _update(
        self, properties: Dict[str, Any], sheets: Optional[Dict] = None
    ) -> None:
        add_last_modified(properties)
        return CoreFile._update(self, properties, sheets=sheets)

    @classmethod
    def get_bucket(cls, registry):
        """ Files by default live in the upload bucket, unless they are output files """
        return registry.settings['file_upload_bucket']

    @calculated_property(schema=display_title_schema)
    def display_title(
        self,
        request: Request,
        annotated_filename: Optional[str] = None,
        accession: Optional[str] = None,
        file_format: Optional[str] = None,
    ) -> str:
        if annotated_filename:
            return annotated_filename
        return CoreFile.display_title(self, request, file_format, accession=accession)

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


def validate_processed_file_unique_md5_with_bypass(context, request):
    """ validator to check md5 on output files, unless you tell it not to
        This validator is duplicated from encoded-core because of processed file rename
    """
    # skip validator if not file output
    if context.type_info.item_type != 'output_file':
        return
    data = request.json
    if 'md5sum' not in data or not data['md5sum']:
        return
    if 'force_md5' in request.query_string:
        return
    # we can of course patch / put to ourselves the same md5 we previously had
    if context.properties.get('md5sum') == data['md5sum']:
        return

    if ELASTIC_SEARCH in request.registry:
        search = make_search_subreq(request, '/search/?type=File&md5sum=%s' % data['md5sum'])
        search_resp = request.invoke_subrequest(search, True)
        if search_resp.status_int < 400:
            # already got this md5
            found = search_resp.json['@graph'][0]['accession']
            request.errors.add('body', 'File: non-unique md5sum', 'md5sum %s already exists for accession %s' %
                               (data['md5sum'], found))
    else:  # find it in the database
        conn = request.registry['connection']
        res = conn.get_by_json('md5sum', data['md5sum'], 'output_file')
        if res is not None:
            # md5 already exists
            found = res.properties['accession']
            request.errors.add('body', 'File: non-unique md5sum', 'md5sum %s already exists for accession %s' %
                               (data['md5sum'], found))


def validate_processed_file_produced_from_field(context, request):
    """validator to make sure that the values in the
    produced_from field are valid file identifiers"""
    # skip validator if not file processed
    if context.type_info.item_type != 'output_file':
        return
    data = request.json
    if 'produced_from' not in data:
        return
    files_ok = True
    files2chk = data['produced_from']
    for i, f in enumerate(files2chk):
        try:
            fid = get_item_or_none(request, f, 'files').get('uuid')
        except AttributeError:
            files_ok = False
            request.errors.add('body', 'File: invalid produced_from id', "'%s' not found" % f)
            # bad_files.append(f)
        else:
            if not fid:
                files_ok = False
                request.errors.add('body', 'File: invalid produced_from id', "'%s' not found" % f)

    if files_ok:
        request.validated.update({})


def validate_file_format_validity_for_file_type(context, request):
    """Check if the specified file format (e.g. fastq) is allowed for the file type (e.g. FileFastq).
    """
    data = request.json
    if 'file_format' in data:
        file_format_item = get_item_or_none(request, data['file_format'], 'file-formats')
        if not file_format_item:
            # item level validation will take care of generating the error
            return
        file_format_name = file_format_item['identifier']
        allowed_types = file_format_item.get('valid_item_types', [])
        file_type = context.type_info.name
        if file_type not in allowed_types:
            msg = 'File format {} is not allowed for {}'.format(file_format_name, file_type)
            request.errors.add('body', 'File: invalid format', msg)
        else:
            request.validated.update({})


FILE_ADD_VALIDATORS = [
    validate_item_content_post,
    validate_file_filename,
    validate_extra_file_format,
    validate_file_format_validity_for_file_type,
    validate_processed_file_unique_md5_with_bypass,
    validate_processed_file_produced_from_field,
    validate_user_submission_consistency
]
FILE_ADD_UNVALIDATED_VALIDATORS = [no_validate_item_content_post]


@view_config(
    context=File.Collection,
    permission='add',
    request_method='POST',
    validators=FILE_ADD_VALIDATORS,
)
@view_config(context=File.Collection, permission='add_unvalidated', request_method='POST',
             validators=FILE_ADD_UNVALIDATED_VALIDATORS,
             request_param=['validate=false'])
@debug_log
def file_add(context, request, render=None):
    return collection_add(context, request, render)


COMMON_FILE_EDIT_VALIDATORS = [
     validate_file_filename,
     validate_extra_file_format,
     validate_file_format_validity_for_file_type,
     validate_processed_file_unique_md5_with_bypass,
     validate_processed_file_produced_from_field,
     validate_user_submission_consistency,
]
FILE_EDIT_PUT_VALIDATORS = [validate_item_content_put] + COMMON_FILE_EDIT_VALIDATORS
FILE_EDIT_PATCH_VALIDATORS = [validate_item_content_patch] + COMMON_FILE_EDIT_VALIDATORS
FILE_EDIT_UNVALIDATED_PUT_VALIDATORS = [
    no_validate_item_content_put, validate_user_submission_consistency
]
FILE_EDIT_UNVALIDATED_PATCH_VALIDATORS = [no_validate_item_content_patch]
FILE_INDEX_GET_VALIDATORS = [
    validate_item_content_in_place
] + COMMON_FILE_EDIT_VALIDATORS


@view_config(
    context=File,
    permission='edit',
    request_method='PUT',
    validators=FILE_EDIT_PUT_VALIDATORS,
)
@view_config(
    context=File,
    permission='edit',
    request_method='PATCH',
    validators=FILE_EDIT_PATCH_VALIDATORS,
)
@view_config(
    context=File,
    permission='edit_unvalidated',
    request_method='PUT',
    validators=FILE_EDIT_UNVALIDATED_PUT_VALIDATORS,
    request_param=['validate=false'],
)
@view_config(
    context=File,
    permission='edit_unvalidated',
    request_method='PATCH',
    validators=FILE_EDIT_UNVALIDATED_PATCH_VALIDATORS,
    request_param=['validate=false'],
)
@view_config(
    context=File,
    permission='index',
    request_method='GET',
    validators=FILE_INDEX_GET_VALIDATORS,
    request_param=['check_only=true'],
)
@debug_log
def file_edit(context, request, render=None):
    return item_edit(context, request, render)
