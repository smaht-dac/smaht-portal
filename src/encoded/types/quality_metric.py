from typing import List, Dict, Any
from pyramid.view import view_config
from snovault import collection, load_schema, calculated_property
from encoded_core.qc_views import download as qc_download
from copy import deepcopy

from .submitted_item import SubmittedItem
from .acl import ONLY_ADMIN_VIEW_ACL, ONLY_DBGAP_VIEW_ACL, ONLY_PUBLIC_DBGAP_VIEW_ACL
from .base import Item
from .utils import map_warn_to_flagged

COVERAGE_DERIVED_FROM = "mosdepth:total"
FLAG_STATES = ["Warn", "Fail"]


@collection(
    name="quality-metrics",
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        "title": "Quality Metrics",
        "description": "Listing of quality metrics",
    },
)
class QualityMetric(Item):
    item_type = "quality_metric"
    schema = load_schema("encoded:schemas/quality_metric.json")
    embedded_list = []

    SUBMISSION_CENTER_STATUS_ACL = deepcopy(SubmittedItem.SUBMISSION_CENTER_STATUS_ACL)
    SUBMISSION_CENTER_STATUS_ACL.update(
        {
            "protected-early": ONLY_DBGAP_VIEW_ACL,
            "protected-network": ONLY_DBGAP_VIEW_ACL,
            "protected": ONLY_PUBLIC_DBGAP_VIEW_ACL,
        }
    )
    CONSORTIUM_STATUS_ACL = deepcopy(SubmittedItem.CONSORTIUM_STATUS_ACL)
    CONSORTIUM_STATUS_ACL.update(
        {
            "protected-early": ONLY_DBGAP_VIEW_ACL,
            "protected-network": ONLY_DBGAP_VIEW_ACL,
            "protected": ONLY_PUBLIC_DBGAP_VIEW_ACL,
        }
    )

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
            if qc.get("derived_from", "") == COVERAGE_DERIVED_FROM:
                return qc["value"]

    @calculated_property(
        schema={
            "title": "Overall Quality for public display",
            "type": "string",
            "description": "Overall QC decision",
        }
    )
    def overall_quality_status_display(
        self, request, overall_quality_status: str = None
    ) -> str:
        return map_warn_to_flagged(overall_quality_status)

    @calculated_property(
        schema={
            "title": "QC Notes",
            "type": "string",
            "description": "Notes on key metrics that did not pass QC",
        }
    )
    def qc_notes(self, request, qc_values: List[Dict[str, Any]]) -> str:
        notes = []
        for qc in qc_values:
            if qc.get("flag", "") in FLAG_STATES:
                flag = map_warn_to_flagged(qc.get("flag", ""))
                notes.append(f"{flag}: {qc['key']} has value {qc['value']}")
        if notes:
            return (";").join(notes)


@view_config(
    name="download",
    context=QualityMetric,
    request_method="GET",
    permission="view",
    subpath_segments=[0, 1],
)
def download(context, request):
    return qc_download(context, request)
