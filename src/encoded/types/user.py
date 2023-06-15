from snovault import collection
from snovault.types.user import User as SnovaultUser
from copy import deepcopy
from .base import SMAHTItem, mixin_smaht_permission_types


SNOVAULT_USER_SCHEMA = deepcopy(SnovaultUser.schema)


# def mixin_smaht_permission_types(schema: dict) -> dict:
#     """ Override of function from base.py that specifies some special fields
#         that will differentiate from User and other types
#     """
#     # this determines who can edit
#     schema['properties']['submission_center'] = {
#         'type': 'array',
#         'items': {
#             'linkTo': 'SubmissionCenter'
#         }
#     }
#     # these determine other permissions
#     schema['properties']['user_submission_centers'] = {
#         'type': 'array',
#         'items': {
#             'linkTo': 'SubmissionCenter'
#         },
#         'permission': 'restricted_fields'
#     }
#     schema['properties']['user_consortiums'] = {
#         'type': 'array',
#         'items': {
#             'linkTo': 'Consortium'
#         },
#         'permission': 'restricted_fields'
#     }
#     return schema


@collection(
    name='users',
    unique_key='user:email',
    properties={
        'title': 'SMaHT Users',
        'description': 'Listing of current SMaHT users',
    }
)
class User(SMAHTItem, SnovaultUser):
    """ Overridden user class, adding the Submission Center and Consortium attribution """
    item_type = 'user'
    schema = mixin_smaht_permission_types(SNOVAULT_USER_SCHEMA)
    STATUS_ACL = SMAHTItem.STATUS_ACL

    def __ac_local_roles__(self):
        return SMAHTItem.__ac_local_roles__(self)
