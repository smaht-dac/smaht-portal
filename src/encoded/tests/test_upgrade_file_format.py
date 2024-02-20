from copy import deepcopy
from snovault import UPGRADER

import pytest


@pytest.fixture()
def file_format_1_2():
    """ Standard file format that does not have a valid_item_types """
    return {
        'identifier': 'BAM',
        'standard_file_extension': '.bam'
    }


def test_upgrade_file_format_1_2(app, file_format_1_2):
    """ Tests that the file format upgrader adds reference file and output file
        as valid_item_types
    """
    existing_file_format = deepcopy(file_format_1_2)
    upgrader = app.registry[UPGRADER]
    upgrader.upgrade(
        'file_format', file_format_1_2, current_version="1", target_version="2"
    )
    assert file_format_1_2['schema_version'] == "2"
    assert 'valid_item_types' not in existing_file_format
    assert 'valid_item_types' in file_format_1_2
    assert len(file_format_1_2['valid_item_types']) == 2
    assert 'ReferenceFile' in file_format_1_2['valid_item_types']
    assert 'OutputFile' in file_format_1_2['valid_item_types']
