from snovault import collection, load_schema
from copy import deepcopy

from .submitted_item import SubmittedItem
from .acl import ONLY_DBGAP_VIEW_ACL


@collection(
    name="tissue-collections",
    unique_key="submitted_id",
    properties={
        "title": "Tissue Collections",
        "description": "Details and methods of tissue collection for a donor",
    },
)
class TissueCollection(SubmittedItem):
    item_type = "tissue_collection"
    schema = load_schema("encoded:schemas/tissue_collection.json")
    embedded_list = []

    class Collection(SubmittedItem.Collection):
        pass

    SUBMISSION_CENTER_STATUS_ACL = deepcopy(SubmittedItem.SUBMISSION_CENTER_STATUS_ACL).update({
        'restricted': ONLY_DBGAP_VIEW_ACL
    })
    CONSORTIUM_STATUS_ACL = deepcopy(SubmittedItem.CONSORTIUM_STATUS_ACL).update({
        'restricted': ONLY_DBGAP_VIEW_ACL
    })
