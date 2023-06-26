from copy import deepcopy
from snovault import collection
from encoded_core.types.workflow import Workflow as CoreWorkflow
from encoded_core.types.workflow import WorkflowRun as CoreWorkflowRun
from encoded_core.types.workflow import WorkflowRunAwsem as CoreWorkflowRunAwsem
from .base import SMAHTItem, mixin_smaht_permission_types


ENCODED_CORE_WORKFLOW_SCHEMA = deepcopy(CoreWorkflow.schema)
ENCODED_CORE_WORKFLOW_RUN_SCHEMA = deepcopy(CoreWorkflowRun.schema)
ENCODED_CORE_WORKFLOW_RUN_AWSEM_SCHEMA = deepcopy(CoreWorkflowRunAwsem.schema)


@collection(
    name="workflows",
    unique_key="accession",
    properties={
        "title": "Workflows",
        "description": "Listing of analysis workflows",
    },
)
class Workflow(SMAHTItem, CoreWorkflow):
    item_type = "workflow"
    schema = mixin_smaht_permission_types(ENCODED_CORE_WORKFLOW_SCHEMA)


@collection(
    name="workflow-runs",
    unique_key="accession",
    properties={
        "title": "Workflow Runs",
        "description": "Listing of executions of analysis workflows",
    },
)
class WorkflowRun(SMAHTItem, CoreWorkflowRun):
    item_type = "workflow_run"
    schema = mixin_smaht_permission_types(ENCODED_CORE_WORKFLOW_RUN_SCHEMA)


@collection(
    name="workflow-runs-awsem",
    unique_key="accession",
    properties={
        "title": "Workflow Runs AWSEM",
        "description": "Listing of executions of analysis workflows on AWSEM platform",
    },
)
class WorkflowRunAwsem(WorkflowRun, CoreWorkflowRunAwsem):
    item_type = "workflow_run_awsem"
    schema = mixin_smaht_permission_types(ENCODED_CORE_WORKFLOW_RUN_AWSEM_SCHEMA)
