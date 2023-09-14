from snovault import collection, load_schema
from encoded_core.types.workflow import Workflow as CoreWorkflow

from .base import Item as SMAHTItem


@collection(
    name='workflows',
    unique_key='accession',
    properties={
        'title': 'Workflows',
        'description': 'Listing of analysis workflows',
    })
class Workflow(SMAHTItem, CoreWorkflow):
    item_type = 'workflow'
    schema = load_schema("encoded:schemas/workflow.json")
