from snovault import collection, load_schema
from encoded_core.types.workflow import WorkflowRun as CoreWorkflowRun

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item


@collection(
    name='workflow-runs',
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        'title': 'Workflow Runs',
        'description': 'Listing of executions of analysis workflows',
    })
class WorkflowRun(Item, CoreWorkflowRun):
    item_type = 'workflow_run'
    schema = load_schema("encoded:schemas/workflow_run.json")
    embedded_list = []
