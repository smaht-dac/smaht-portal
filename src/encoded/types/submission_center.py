from snovault import collection, load_schema
from .base import Item as SMAHTItem


@collection(
    name='submission-centers',
    unique_key='submission_center:name',
    properties={
        'title': 'Submission Centers',
        'description': 'Listing of Submission Centers',
    })
class SubmissionCenter(SMAHTItem):
    """ Submission Center class """
    item_type = 'submission_center'
    schema = load_schema('encoded:schemas/submission_center.json')
    embedded_list = SMAHTItem.embedded_list
    name_key = 'name'
