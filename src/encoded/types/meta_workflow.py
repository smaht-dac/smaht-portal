from snovault import collection, load_schema
from encoded_core.types.meta_workflow import MetaWorkflow as CoreMetaWorkflow

from .base import Item as SMAHTItem


@collection(
    name='meta-workflows',
    properties={
        'title': 'MetaWorkflows',
        'description': 'Listing of MetaWorkflows',
    })
class MetaWorkflow(SMAHTItem, CoreMetaWorkflow):
    item_type = 'meta_workflow'
    schema = load_schema("encoded:schemas/meta_workflow.json")
    embedded_list = []
