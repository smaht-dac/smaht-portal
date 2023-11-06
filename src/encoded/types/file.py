from typing import Any, Dict, List, Optional, Union

from encoded_core.types.file import (
    HREF_SCHEMA,
    UNMAPPED_OBJECT_SCHEMA,
    UPLOAD_KEY_SCHEMA,
    File as CoreFile,
)
from pyramid.request import Request
from snovault import abstract_collection, calculated_property, load_schema

from .base import Item as SMAHTItem


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
