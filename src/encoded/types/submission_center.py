from snovault import collection, load_schema

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item as SMAHTItem


@collection(
    name='submission-centers',
    unique_key='submission_center:identifier',  # For shorthand reference as linkTo
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        'title': 'Submission Centers',
        'description': 'Listing of Submission Centers',
    })
class SubmissionCenter(SMAHTItem):
    """ Submission Center class """
    item_type = 'submission_center'
    schema = load_schema('encoded:schemas/submission_center.json')
    embedded_list = []
