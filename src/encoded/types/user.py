from snovault import collection
from snovault.types.user import User
from copy import deepcopy
from .base import SMAHTItem


SNOVAULT_USER_SCHEMA = deepcopy(User.schema)


@collection(
    name='smaht-users',
    unique_key='smaht-user:email',
    properties={
        'title': 'SMaHT Users',
        'description': 'Listing of current SMaHT users',
    }
)
class SMaHTUser(SMAHTItem, User):
    """ Overridden user class, adding the Submission Center and Consortium attribution """
    item_type = 'smaht-user'
    schema = SNOVAULT_USER_SCHEMA
    schema['properties']['submission_centers'] = {
        'type': 'array',
        'items': {
            'linkTo': 'SubmissionCenter'
        }
    }
    schema['properties']['consortiums'] = {
        'type': 'array',
        'items': {
            'linkTo': 'Consortiums'
        }
    }


