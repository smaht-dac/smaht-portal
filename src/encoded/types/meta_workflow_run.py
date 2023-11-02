from snovault import collection, load_schema
from encoded_core.types.meta_workflow import MetaWorkflowRun as CoreMetaWorkflowRun

from .base import Item as SMAHTItem


@collection(
    name='meta-workflow-runs',
    properties={
        'title': 'MetaWorkflowRuns',
        'description': 'Listing of MetaWorkflowRuns',
    })
class MetaWorkflowRun(SMAHTItem, CoreMetaWorkflowRun):
    item_type = 'meta_workflow_run'
    schema = load_schema("encoded:schemas/meta_workflow_run.json")
    embedded_list = []
