from snovault import collection, load_schema
from encoded_core.types.image import Image as CoreImage

from .base import Item as SMAHTItem


@collection(
    name='images',
    properties={
        'title': 'Image',
        'description': 'Listing of portal images',
    })
class Image(SMAHTItem, CoreImage):
    item_type = 'image'
    schema = load_schema("encoded:schemas/image.json")
    embedded_list = []
