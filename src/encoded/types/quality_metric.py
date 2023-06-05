from snovault import collection
from encoded_core.types.quality_metric import QualityMetricGeneric as CoreQualityMetricGeneric
from .base import SMAHTItem


@collection(
    name="quality-metrics-generic",
    properties={
        "title": "Generic Quality Metrics",
        "description": "Listing of Generic Quality Metrics",
    },
)
class QualityMetricGeneric(SMAHTItem, CoreQualityMetricGeneric):
    pass
