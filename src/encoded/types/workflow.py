from snovault import collection
from encoded_core.types.workflow import Workflow as CoreWorkflow
from encoded_core.types.workflow import WorkflowRun as CoreWorkflowRun
from encoded_core.types.workflow import WorkflowRunAwsem as CoreWorkflowRunAwsem
from .base import SMAHTItem


@collection(
    name='workflows',
    properties={
        'title': 'Workflows',
        'description': 'Listing of analysis workflows',
    })
class Workflow(SMAHTItem, CoreWorkflow):
    pass


@collection(
    name='workflow-runs',
    properties={
        'title': 'Workflow Runs',
        'description': 'Listing of executions of analysis workflows',
    })
class WorkflowRun(SMAHTItem, CoreWorkflowRun):
    pass


@collection(
    name='workflow-runs-awsem',
    properties={
        'title': 'Workflow Runs AWSEM',
        'description': 'Listing of executions of analysis workflows on AWSEM platform',
    })
class WorkflowRunAwsem(WorkflowRun, CoreWorkflowRunAwsem):
    pass
