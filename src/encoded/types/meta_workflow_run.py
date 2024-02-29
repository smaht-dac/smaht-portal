from snovault import collection, load_schema
from encoded_core.types.meta_workflow import MetaWorkflowRun as CoreMetaWorkflowRun

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item


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
    embedded_list = ['meta_workflow.name']
