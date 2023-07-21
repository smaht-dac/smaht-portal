from copy import deepcopy
from snovault import collection
from encoded_core.types.meta_workflow import MetaWorkflow as CoreMetaWorkflow
from encoded_core.types.meta_workflow import MetaWorkflowRun as CoreMetaWorkflowRun
from .base import Item as SMAHTItem
from .base import mixin_smaht_permission_types


ENCODED_CORE_META_WORKFLOW_SCHEMA = deepcopy(CoreMetaWorkflow.schema)
ENCODED_CORE_META_WORKFLOW_RUN_SCHEMA = deepcopy(CoreMetaWorkflowRun.schema)


@collection(
    name='meta-workflows',
    unique_key='accession',
    properties={
        'title': 'MetaWorkflows',
        'description': 'Listing of MetaWorkflows',
    })
class MetaWorkflow(SMAHTItem, CoreMetaWorkflow):
    item_type = 'meta_workflow'
    schema = mixin_smaht_permission_types(ENCODED_CORE_META_WORKFLOW_SCHEMA)


@collection(
    name='meta-workflow-runs',
    unique_key='accession',
    properties={
        'title': 'MetaWorkflowRuns',
        'description': 'Listing of MetaWorkflowRuns',
    })
class MetaWorkflowRun(SMAHTItem, CoreMetaWorkflowRun):
    item_type = 'meta_workflow_run'
    schema = mixin_smaht_permission_types(ENCODED_CORE_META_WORKFLOW_RUN_SCHEMA)
