from copy import deepcopy
from snovault import collection
from encoded_core.types.quality_metric import QualityMetricGeneric as CoreQualityMetricGeneric
from .base import SMAHTItem, mixin_smaht_permission_types


ENCODED_CORE_QC_GENERAL_SCHEMA = deepcopy(CoreQualityMetricGeneric.schema)


@collection(
    name="quality-metrics-generic",
    properties={
        "title": "Generic Quality Metrics",
        "description": "Listing of Generic Quality Metrics",
    },
)
class QualityMetricGeneric(SMAHTItem, CoreQualityMetricGeneric):
    schema = mixin_smaht_permission_types(ENCODED_CORE_QC_GENERAL_SCHEMA)
