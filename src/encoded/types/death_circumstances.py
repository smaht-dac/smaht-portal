from snovault import collection, load_schema
from copy import deepcopy

from .submitted_item import SubmittedItem
from .acl import ONLY_DBGAP_VIEW_ACL, ONLY_PUBLIC_DBGAP_VIEW_ACL


@collection(
    name="death-circumstances",
    unique_key="submitted_id",
    properties={
        "title": "Death Circumstances",
        "description": "Details of a donor's death",
    },
)
class DeathCircumstances(SubmittedItem):
    item_type = "death_circumstances"
    schema = load_schema("encoded:schemas/death_circumstances.json")
    embedded_list = []

    class Collection(SubmittedItem.Collection):
        pass

    SUBMISSION_CENTER_STATUS_ACL = deepcopy(SubmittedItem.SUBMISSION_CENTER_STATUS_ACL)
    SUBMISSION_CENTER_STATUS_ACL.update({
        'restricted': ONLY_DBGAP_VIEW_ACL,
        'public-restricted': ONLY_PUBLIC_DBGAP_VIEW_ACL
    })
    CONSORTIUM_STATUS_ACL = deepcopy(SubmittedItem.CONSORTIUM_STATUS_ACL)
    CONSORTIUM_STATUS_ACL.update({
        'restricted': ONLY_DBGAP_VIEW_ACL,
        'public-restricted': ONLY_PUBLIC_DBGAP_VIEW_ACL
    })
