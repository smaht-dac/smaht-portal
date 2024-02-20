from snovault import upgrade_step


@upgrade_step('file_format', '1', '2')
def file_format_1_2(value, system):
    """ Upgrade file formats from version 1 to 2
        In version 1, valid_item_types did not exist
        This upgrader adds a reasonable value for this to all
        file formats
    """
    value['valid_item_types'] = [
        'ReferenceFile',
        'OutputFile'
    ]
