from encoded_core.types.quality_metric import QualityMetric as CoreQualityMetric
from snovault import abstract_collection, load_schema

from .base import Item as SMAHTItem


@abstract_collection(
    name='quality-metrics',
    properties={
        'title': 'Quality Metrics',
        'description': 'Listing of quality metrics',
    })
class QualityMetric(SMAHTItem, CoreQualityMetric):
    item_type = 'quality_metric'
    schema = load_schema("encoded:schemas/quality_metric.json")
