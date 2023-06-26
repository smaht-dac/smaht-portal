from copy import deepcopy
from snovault import collection
from encoded_core.types.higlass_view_config import (
    HiglassViewConfig as CoreHiglassViewConfig,
)
from .base import SMAHTItem, mixin_smaht_permission_types


ENCODED_CORE_HIGLASS_VIEW_CONFIG_SCHEMA = deepcopy(CoreHiglassViewConfig.schema)


@collection(
    name="higlass-view-configs",
    unique_key="higlass_view_config:name",
    properties={
        "title": "HiGlass Displays",
        "description": "Displays and view configurations for HiGlass",
    },
)
class HiglassViewConfig(SMAHTItem, CoreHiglassViewConfig):
    """
    Item type which contains a `view_config` property and other metadata.
    """

    item_type = "higlass_view_config"
    schema = mixin_smaht_permission_types(ENCODED_CORE_HIGLASS_VIEW_CONFIG_SCHEMA)
