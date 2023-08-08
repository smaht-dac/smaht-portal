from pyramid.security import Allow
from snovault import Item, collection


def includeme(config):
    config.scan(__name__)


@collection(
    'testing-post-put-patch',
    acl=[
        (Allow, 'group.submitter', ['add', 'edit', 'view']),
    ],
)
class TestingPostPutPatch(Item):
    item_type = 'testing_post_put_patch'
    schema = {
        'required': ['required'],
        'type': 'object',
        'additionalProperties': False,
        'properties': {
            "schema_version": {
                "type": "string",
                "pattern": "^\\d+(\\.\\d+)*$",
                "requestMethod": [],
                "default": "1",
            },
            "uuid": {
                "title": "UUID",
                "description": "",
                "type": "string",
                "format": "uuid",
                "permission": "restricted_fields",
                "requestMethod": "POST",
            },
            'required': {
                'type': 'string',
            },
            'simple1': {
                'type': 'string',
                'default': 'simple1 default',
            },
            'simple2': {
                'type': 'string',
                'default': 'simple2 default',
            },
            'protected': {
                # This should be allowed on PUT so long as value is the same
                'type': 'string',
                'default': 'protected default',
                'permission': 'restricted_fields',
            },
            'protected_link': {
                # This should be allowed on PUT so long as the linked uuid is
                # the same
                'type': 'string',
                'linkTo': 'TestingLinkTarget',
                'permission': 'restricted_fields',
            },
            'field_no_default': {
                'type': 'string',
            },
        }
    }


@collection(
    'testing-linked-schema-fields',
    acl=[
        (Allow, 'group.submitter', ['add', 'edit', 'view']),
    ],
)
class TestingLinkedSchemaField(Item):
    item_type = 'testing_linked_schema_field'
    schema = {
        'type': 'object',
        'additionalProperties': False,
        'properties': {
            "schema_version": {
                "type": "string",
                "pattern": "^\\d+(\\.\\d+)*$",
                "requestMethod": [],
                "default": "1",
            },
            # link from snovault field
            'access_key_id': {
                '$merge': 'snovault:schemas/access_key.json#/properties/access_key_id'
            },
            # link from encoded-core field
            'file_format': {
                '$merge': 'encoded_core:schemas/file.json#/properties/file_format'
            },
            # link from this repo
            'title': {
                '$merge': 'encoded:schemas/consortium.json#/properties/title'
            }
        }
    }
