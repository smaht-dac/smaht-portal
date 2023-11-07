from snovault import collection, load_schema
from encoded_core.types.workflow import WorkflowRun as CoreWorkflowRun

from .base import Item as SmahtItem


@collection(
    name='workflow-runs',
    properties={
        'title': 'Workflow Runs',
        'description': 'Listing of executions of analysis workflows',
    })
class WorkflowRun(SmahtItem, CoreWorkflowRun):
    item_type = 'workflow_run'
    schema = load_schema("encoded:schemas/workflow_run.json")
    embedded_list = []
