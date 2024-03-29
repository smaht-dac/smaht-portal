import pytest

from dcicutils.misc_utils import camel_case_to_snake_case
from snovault import COLLECTIONS, TYPES
from snovault.commands.create_mapping_on_deploy import loadxl_order
from snovault.elasticsearch.create_mapping import type_mapping
from snovault.util import add_default_embeds


pytestmark = [pytest.mark.setone, pytest.mark.working]


@pytest.mark.parametrize('item_type', loadxl_order())
def test_create_mapping_correctly_maps_embeds(registry, item_type):
    """
    This test does not actually use elasticsearch
    Only tests the mappings generated from schemas
    """
    mapping = type_mapping(registry[TYPES], item_type)
    assert mapping
    type_info = registry[TYPES].by_item_type[camel_case_to_snake_case(item_type)]
    schema = type_info.schema
    embeds = add_default_embeds(item_type, registry[TYPES], type_info.embedded_list, schema)
    # assert that all embeds exist in mapping for the given type
    for embed in embeds:
        mapping_pointer = mapping
        split_embed = embed.split('.')
        for idx, split_ in enumerate(split_embed):
            # see if this is last level of embedding- may be a field or object
            if idx == len(split_embed) - 1:
                if 'properties' in mapping_pointer and split_ in mapping_pointer['properties']:
                    final_mapping = mapping_pointer['properties']
                else:
                    final_mapping = mapping_pointer
                if split_ != '*':
                    assert split_ in final_mapping
                else:
                    assert 'properties' in final_mapping or final_mapping.get('type') == 'object'
            else:
                assert split_ in mapping_pointer['properties']
                mapping_pointer = mapping_pointer['properties'][split_]


def test_create_mapping_item_order(registry):
    # make sure every item type name is represented in the item ordering
    for i_type in registry[COLLECTIONS].by_item_type:
        # ignore "testing" types
        if i_type.startswith('testing_'):
            continue
        assert i_type in loadxl_order() 
