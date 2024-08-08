from pyramid.view import view_config
from snovault import collection, load_schema, calculated_property
from encoded_core.qc_views import download as qc_download

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item


@collection(
    name='quality-metrics',
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        'title': 'Quality Metrics',
        'description': 'Listing of quality metrics',
    })
class QualityMetric(Item):
    item_type = 'quality_metric'
    schema = load_schema("encoded:schemas/quality_metric.json")
    embedded_list = []

    @calculated_property(
        schema={
            "title": "Download URL",
            "type": "string",
            "description": "Use this link to download the QualityMetric zip archive.",
        }
    )
    def href(self, request) -> str:
        return f"{request.resource_path(self)}@@download/{self.uuid}"


@view_config(name='download', context=QualityMetric, request_method='GET',
             permission='view', subpath_segments=[0, 1])
def download(context, request):
    return qc_download(context, request)
