from snovault import collection
from snovault.resources import Collection as SnovaultCollection
from encoded_core.types.meta_workflow import MetaWorkflow as CoreMetaWorkflow
from encoded_core.types.meta_workflow import MetaWorkflowRun as CoreMetaWorkflowRun
from .base import SMAHTItem


@collection(
    name='meta-workflows',
    unique_key='accession',
    properties={
        'title': 'MetaWorkflows',
        'description': 'Listing of MetaWorkflows',
    })
class MetaWorkflow(SMAHTItem, CoreMetaWorkflow):
    pass


@collection(
    name='meta-workflow-runs',
    properties={
        'title': 'MetaWorkflowRuns',
        'description': 'Listing of MetaWorkflowRuns',
    })
class MetaWorkflowRun(SMAHTItem, CoreMetaWorkflowRun):
    pass
