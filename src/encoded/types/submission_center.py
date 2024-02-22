from snovault import collection, load_schema

from .acl import ONLY_ADMIN_VIEW_ACL, SUBMISSION_CENTER_SUBMITTER, SUBMISSION_CENTER_RW
from .base import Item


@collection(
    name='submission-centers',
    unique_key='submission_center:identifier',  # For shorthand reference as linkTo
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        'title': 'Submission Centers',
        'description': 'Listing of Submission Centers',
    })
class SubmissionCenter(Item):
    """ Submission Center class """
    item_type = 'submission_center'
    schema = load_schema('encoded:schemas/submission_center.json')
    embedded_list = []

    def __ac_local_roles__(self):
        """This creates roles that the submission center item needs so it can be edited & viewed"""
        roles = {}
        sc_submitters = f'submits_for.{self.uuid}'
        roles[sc_submitters] = SUBMISSION_CENTER_SUBMITTER
        sc_member = f'submission_centers.{self.uuid}'
        roles[sc_member] = SUBMISSION_CENTER_RW
        return roles
