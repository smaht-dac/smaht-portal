from snovault import collection, load_schema

from .base import Item as SMAHTItem
from .acl import SUBMISSION_CENTER_SUBMITTER, SUBMISSION_CENTER_RW


@collection(
    name='submission-centers',
    unique_key='submission_center:identifier',  # For shorthand reference as linkTo
    properties={
        'title': 'Submission Centers',
        'description': 'Listing of Submission Centers',
    })
class SubmissionCenter(SMAHTItem):
    """ Submission Center class """
    item_type = 'submission_center'
    schema = load_schema('encoded:schemas/submission_center.json')
    embedded_list = []

    def __ac_local_roles__(self):
        """This creates roles that the submission center item needs so it can be edited & viewed"""
        roles = {}
        sc_submitters = 'submits_for.%s' % self.uuid
        roles[sc_submitters] = SUBMISSION_CENTER_SUBMITTER
        sc_member = 'submission_centers.%s' % self.uuid
        roles[sc_member] = SUBMISSION_CENTER_RW
        return roles
