from typing import Any, Dict, List, Union
import functools

from pyramid.view import view_config
from pyramid.request import Request
from snovault import calculated_property, collection, load_schema
import structlog

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item

log = structlog.getLogger(__name__)


def _build_analysis_run_embedded_list():
    """Embeds for search on file sets."""
    return [
        "meta_workflow_runs.meta_workflow.display_title",
        "meta_workflow_runs.meta_workflow.category",
        "meta_workflow_runs.meta_workflow.name",
        "meta_workflow_runs.accession",
        "meta_workflow_runs.final_status",
        "meta_workflow_runs.date_created",
        "tissues.tissue_type",
    ]


@collection(
    name="analysis-runs",
    acl=ONLY_ADMIN_VIEW_ACL,
    unique_key="analysis_run:identifier",
    properties={
        "title": "Analysis Runs",
        "description": "Collection of analysis runs",
    },
)
class AnalysisRun(Item):
    item_type = "analysis_run"
    schema = load_schema("encoded:schemas/analysis_run.json")
    embedded_list = _build_analysis_run_embedded_list()
    rev = {
        "meta_workflow_runs": ("MetaWorkflowRun", "analysis_runs"),
    }

    class Collection(Item.Collection):
        pass

    @calculated_property(
        schema={
            "title": "MetaWorkflowRuns",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "MetaWorkflowRun",
            },
        },
    )
    def meta_workflow_runs(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "meta_workflow_runs")
        if result:
            return result
        return
