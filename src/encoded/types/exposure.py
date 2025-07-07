from snovault import collection, load_schema
from copy import deepcopy

from .submitted_item import SubmittedItem
from .acl import ONLY_DBGAP_VIEW_ACL


@collection(
    name="exposures",
    unique_key="submitted_id",
    properties={
        "title": "Exposures",
        "description": "Occupational and/or environmental exposures of donors",
    },
)
class Exposure(SubmittedItem):
    item_type = "exposure"
    schema = load_schema("encoded:schemas/exposure.json")
    embedded_list = []

    class Collection(SubmittedItem.Collection):
        pass

    SUBMISSION_CENTER_STATUS_ACL = deepcopy(SubmittedItem.SUBMISSION_CENTER_STATUS_ACL).update({
        'restricted': ONLY_DBGAP_VIEW_ACL
    })
    CONSORTIUM_STATUS_ACL = deepcopy(SubmittedItem.CONSORTIUM_STATUS_ACL).update({
        'restricted': ONLY_DBGAP_VIEW_ACL
    })
