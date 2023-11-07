from snovault import collection, load_schema

from .base import Item as SmahtItem


@collection(
    name='quality-metrics',
    properties={
        'title': 'Quality Metrics',
        'description': 'Listing of quality metrics',
    })
class QualityMetric(SmahtItem):
    item_type = 'quality_metric'
    schema = load_schema("encoded:schemas/quality_metric.json")
    embedded_list = []
