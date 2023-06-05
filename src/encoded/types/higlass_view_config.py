from snovault import collection
from encoded_core.types.higlass_view_config import HiglassViewConfig as CoreHiglassViewConfig
from .base import SMAHTItem


@collection(
    name='higlass-view-configs',
    unique_key='higlass_view_config:name',
    properties={
        'title': 'HiGlass Displays',
        'description': 'Displays and view configurations for HiGlass',
    })
class HiglassViewConfig(SMAHTItem, CoreHiglassViewConfig):
    """
    Item type which contains a `view_config` property and other metadata.
    """
    pass
