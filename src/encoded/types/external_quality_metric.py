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
    base_types = ["QualityMetric"] + SubmittedItem.base_types

    schema = load_schema("encoded:schemas/external_quality_metric.json")
    embedded_list = []
    
    def get(self, name, default=None):
        """Override method to allow submitted_id keys for quality metric.

        Allows ExternalQualityMetric types to show up in search of QualityMetric collection.
        """
        resource = super(QualityMetric, self).get(name, None)
        if resource is not None:
            return resource

    
