from snovault import collection, load_schema
from encoded_core.types.workflow import Workflow as CoreWorkflow

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item


@collection(
    name='workflows',
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        'title': 'Workflows',
        'description': 'Listing of analysis workflows',
    })
class Workflow(Item, CoreWorkflow):
    item_type = 'workflow'
    schema = load_schema("encoded:schemas/workflow.json")
    # Workflow definitions carry explicit version metadata; retaining every
    # Postgres revision adds storage growth without useful audit value.
    track_revisions = False
    embedded_list = []
