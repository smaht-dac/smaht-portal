from encoded_core.types.quality_metric_generic import (
    QualityMetricGeneric as CoreQualityMetricGeneric
)
from snovault import collection, load_schema

from .base import Item as SMAHTItem


@collection(
    name='quality-metrics',
    properties={
        'title': 'Quality Metrics',
        'description': 'Listing of quality metrics',
    })
class QualityMetric(SMAHTItem):
    item_type = 'quality_metric'
    schema = load_schema("encoded:schemas/quality_metric.json")
    embedded_list = []
