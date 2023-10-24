import pytest
from snovault.schema_utils import load_schema
from .testing_views import TestingLinkedSchemaField


class TestMergedSchemas:
    """ Class that contains tests that validate $merge refs are correctly resolved within repo
        and across repos
    """

    @staticmethod
    def test_merged_schemas():
        """ Checks that we can resolve multiple different schema $ref types """
        schema = load_schema(TestingLinkedSchemaField.schema)
        props = schema['properties']
        for key in ['access_key_id', 'file_format', 'title']:
            assert key in props
        # check access key id
        assert props['access_key_id']['comment'] == 'Only admins are allowed to set this value.'
        # check file_format
        assert props['file_format']['linkTo'] == 'FileFormat'
        # check title
        assert props['title']['description'] == 'Title for the item'
