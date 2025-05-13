from snovault import collection, load_schema

from .acl import ONLY_ADMIN_VIEW_ACL
from .generic_config import GenericConfig


@collection(
    name='generic-qc-configs',
    unique_key='generic_qc_config:identifier',
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        'title': 'Generic QC Config',
        'description': 'Configurations for use with QC',
    })
class GenericQcConfig(GenericConfig):
    """
    Item type which contains a JSON `body` property and other metadata used in QC.
    """
    item_type = 'generic_qc_config'
    schema = load_schema("encoded:schemas/generic_qc_config.json")
    embedded_list = []
    name_key = None
