from snovault import collection, load_schema
from copy import deepcopy

from .submitted_item import SubmittedItem
from .acl import ONLY_DBGAP_VIEW_ACL


@collection(
    name="diagnoses",
    unique_key="submitted_id",
    properties={
        "title": "Diagnoses",
        "description": "Diseases diagnosed for donors",
    },
)
class Diagnosis(SubmittedItem):
    item_type = "diagnosis"
    schema = load_schema("encoded:schemas/diagnosis.json")
    embedded_list = []

    class Collection(SubmittedItem.Collection):
        pass

    SUBMISSION_CENTER_STATUS_ACL = deepcopy(SubmittedItem.SUBMISSION_CENTER_STATUS_ACL).update({
        'restricted': ONLY_DBGAP_VIEW_ACL
    })
    CONSORTIUM_STATUS_ACL = deepcopy(SubmittedItem.CONSORTIUM_STATUS_ACL).update({
        'restricted': ONLY_DBGAP_VIEW_ACL
    })
