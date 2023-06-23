from copy import deepcopy
from snovault import collection
from encoded_core.types.image import Image as CoreImage
from .base import SMAHTItem, mixin_smaht_permission_types


ENCODED_CORE_IMAGE_SCHEMA = deepcopy(CoreImage.schema)


@collection(
    name='images',
    unique_key='image:filename',
    properties={
        'title': 'Image',
        'description': 'Listing of portal images',
    })
class Image(SMAHTItem, CoreImage):
    item_type = 'image'
    schema = mixin_smaht_permission_types(ENCODED_CORE_IMAGE_SCHEMA)
