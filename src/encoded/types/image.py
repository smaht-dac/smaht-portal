from snovault import collection
from encoded_core.types.image import Image as CoreImage
from .base import SMAHTItem


@collection(
    name='images',
    unique_key='image:filename',
    properties={
        'title': 'Image',
        'description': 'Listing of portal images',
    })
class Image(SMAHTItem, CoreImage):
    pass
