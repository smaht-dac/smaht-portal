from snovault import collection, load_schema

from .submitted_item import SubmittedItem
from .quality_metric import QualityMetric

@collection(
    name='external-quality-metrics',
    unique_key="submitted_id",
    properties={
        'title': 'External Quality Metrics',
        'description': 'Listing of externally-generated quality metrics',
    })
class ExternalQualityMetric(SubmittedItem, QualityMetric):
    item_type = 'external_quality_metric'
    schema = load_schema("encoded:schemas/external_quality_metric.json")
    embedded_list = []
