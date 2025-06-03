from typing import List, Dict, Any
from pyramid.view import view_config
from snovault import collection, load_schema, calculated_property
from encoded_core.qc_views import download as qc_download

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item

COVERAGE_DERIVED_FROM = "mosdepth:total"

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

    @calculated_property(
        schema={
            "title": "Coverage",
            "type": "number",
            "description": "Estimated average coverage from QC values",
        }
    )
    def coverage(self, request, qc_values: List[Dict[str, Any]]) -> str:
        for qc in qc_values:
            if qc.get("derived_from","") == COVERAGE_DERIVED_FROM:
                return qc["value"]


@view_config(name='download', context=QualityMetric, request_method='GET',
             permission='view', subpath_segments=[0, 1])
def download(context, request):
    return qc_download(context, request)
