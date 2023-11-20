from snovault import collection, load_schema
from encoded_core.types.image import Image as CoreImage
from .acl import ALLOW_SUBMISSION_CENTER_CREATE_ACL
from .base import Item as SMAHTItem


@collection(
    name='images',
    unique_key='image:filename',
    acl=ALLOW_SUBMISSION_CENTER_CREATE_ACL,
    properties={
        'title': 'Image',
        'description': 'Listing of portal images',
    })
class Image(SMAHTItem, CoreImage):
    item_type = 'image'
    schema = load_schema("encoded:schemas/image.json")
    embedded_list = []
