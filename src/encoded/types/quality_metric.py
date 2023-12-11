from snovault import collection, load_schema

from .acl import ONLY_ADMIN_VIEW_ACL
from .base import Item


@collection(
    name='quality-metrics',
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        'title': 'Quality Metrics',
        'description': 'Listing of quality metrics',
    })
class QualityMetric(Item):
    item_type = 'quality_metric'
    schema = load_schema("encoded:schemas/quality_metric.json")
    embedded_list = []
