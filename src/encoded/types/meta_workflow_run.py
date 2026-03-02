from snovault import collection, load_schema
from encoded_core.types.meta_workflow import MetaWorkflowRun as CoreMetaWorkflowRun

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item


def _build_meta_workflow_run_embedded_list():
    """Embeds for MetaWorkflowRun."""
    return [
        "meta_workflow.category",
        "meta_workflow.name",  # Required for foursight checks
        "meta_workflow.version",

        "workflow_runs.output.file.quality_metrics.overall_quality_status",
        "workflow_runs.output.file.accession",
        "workflow_runs.output.file.output_status"
    ]


@collection(
    name='meta-workflow-runs',
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        'title': 'MetaWorkflowRuns',
        'description': 'Listing of MetaWorkflowRuns',
    })
class MetaWorkflowRun(Item, CoreMetaWorkflowRun):
    item_type = 'meta_workflow_run'
    schema = load_schema("encoded:schemas/meta_workflow_run.json")
    embedded_list = _build_meta_workflow_run_embedded_list()
