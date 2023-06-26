from copy import deepcopy
from snovault import collection, abstract_collection
from encoded_core.types.quality_metric import QualityMetric as CoreQualityMetric
from encoded_core.types.quality_metric import (
    QualityMetricGeneric as CoreQualityMetricGeneric,
)
from .base import SMAHTItem, mixin_smaht_permission_types


ENCODED_CORE_QC_GENERAL_SCHEMA = deepcopy(CoreQualityMetricGeneric.schema)
ENCODED_CORE_QC_SCHEMA = deepcopy(CoreQualityMetric.schema)


@abstract_collection(
    name="quality-metrics",
    properties={
        "title": "Quality Metrics",
        "description": "Listing of quality metrics",
    },
)
class QualityMetric(SMAHTItem):
    schema = mixin_smaht_permission_types(ENCODED_CORE_QC_SCHEMA)


@collection(
    name="quality-metrics-generic",
    properties={
        "title": "Generic Quality Metrics",
        "description": "Listing of Generic Quality Metrics",
    },
)
class QualityMetricGeneric(QualityMetric):
    item_type = "quality_metric_generic"
    schema = mixin_smaht_permission_types(ENCODED_CORE_QC_GENERAL_SCHEMA)
    base_types = ["QualityMetric"] + SMAHTItem.base_types
