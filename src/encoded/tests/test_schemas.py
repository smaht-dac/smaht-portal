import pytest
import re

from pkg_resources import resource_listdir
from snovault import COLLECTIONS, TYPES
from snovault.schema_utils import load_schema


pytestmark = [pytest.mark.setone, pytest.mark.working, pytest.mark.schema, pytest.mark.indexing]


SCHEMA_FILES = [
    f for f in resource_listdir('encoded', 'schemas')
    if f.endswith('.json') and 'embeds' not in f
]


def pluralize(name):
    """ This is a special function used to pluralize in a somewhat random way, but kept for legacy reasons... """
    name = name.replace("_", "-")
    # deal with a few special cases explicitly
    specials = ["file", "quality-metric", "summary-statistic", "workflow-run", "consortium"]
    for sp in specials:
        if name.startswith(sp) and re.search("-(set|flag|format|type)", name) is None:
            return name.replace(sp, sp + "s")
        elif name.startswith(sp) and re.search("setting", name):
            return name.replace(sp, sp + "s")
        elif name == "consortium":  # special case for consortium
            return name
    # otherwise just add 's/es/ies'
    if name.endswith("ly"):
        return name[:-1] + "ies"
    if name.endswith("sis"):
        return name[:-2] + "es"
    if name.endswith("s"):
        return name + "es"
    return name + "s"


@pytest.fixture(scope='module')
def master_mixins():
    return compute_master_mixins()


def compute_master_mixins():
    mixins = load_schema('encoded:schemas/mixins.json')
    mixin_keys = [
        'schema_version',
        'uuid',
        'accession',
        'aliases',
        'status',
        'submitted',
        'modified',
        'attribution',
        'notes',
        'documents',
        'attachment',
        'dbxrefs',
        'alternative_ids',
        'static_embeds',
        'tags',
        'facets_common',
        'supplementary_files'
    ]
    for key in mixin_keys:
        assert mixins[key]


def camel_case(name):
    return ''.join(x for x in name.title() if not x == '_')


@pytest.mark.parametrize('schema', [k for k in SCHEMA_FILES])
def test_load_schema(schema, master_mixins, registry, testapp):

    abstract = [
        'analysis.json',
        'file.json',
        'individual.json',
        'quality_metric.json',
        'note.json',
        'workflow_run.json',
        'user_content.json',
        'higlass_view_config.json'
    ]

    loaded_schema = load_schema('encoded:schemas/%s' % schema)
    assert loaded_schema

    typename = schema.replace('.json', '')
    collection_names = [camel_case(typename), pluralize(typename)]

    # TODO: add pattern field checks when applicable

    # check the mixin properties for each schema
    if schema != 'mixins.json':
        verify_mixins(loaded_schema, master_mixins)

    if schema not in ['namespaces.json', 'mixins.json']:
        # check that schema.id is same as /profiles/schema
        idtag = loaded_schema['id']
        idtag = idtag.replace('/profiles/', '')
        # special case for access_key.json
        if schema == 'access_key.json':
            idtag = idtag.replace('_admin', '')
        assert schema == idtag

        # check for pluralized and camel cased in collection_names
        val = None
        for name in collection_names:
            assert name in registry[COLLECTIONS]
            if val is not None:
                assert registry[COLLECTIONS][name] == val
            else:
                val = registry[COLLECTIONS][name]

        if schema not in abstract:
            # check schema w/o json extension is in registry[TYPES]
            assert typename in registry[TYPES].by_item_type
            assert typename in registry[COLLECTIONS]
            assert registry[COLLECTIONS][typename] == val

            shared_properties = [
                'uuid',
                'schema_version',
                'aliases',
                'date_created',
                'submitted_by',
                'last_modified',
                'status'
            ]
            no_alias_or_attribution = []
            for prop in shared_properties:
                if schema == 'access_key.json' and prop not in ['uuid', 'schema_version']:
                    continue
                if schema in no_alias_or_attribution and prop in ['aliases']:
                    continue
                verify_property(loaded_schema, prop)


def verify_property(loaded_schema, property):
    assert loaded_schema['properties'][property]


def verify_mixins(loaded_schema, master_mixins):
    """
    test to ensure that we didn't accidently overwrite mixins somehow
    """
    for mixin in loaded_schema.get('mixinProperties', []):
        # get the mixin name from {'$ref':'mixins.json#/schema_version'}
        mixin_file_name, mixin_name = mixin['$ref'].split('/')
        if mixin_file_name != "mixins.json":
            # skip any mixins not in main mixins.json
            continue
        mixin_schema = master_mixins[mixin_name]

        # each field in the mixin should be present in the parent schema with same properties
        for mixin_field_name, mixin_field in mixin_schema.items():
            schema_field = loaded_schema['properties'][mixin_field_name]
            for key in mixin_field.keys():
                assert mixin_field[key] == schema_field[key]


def test_mixinProperties():
    """ Tests that a uuid mixin property shows up correctly """
    schema = load_schema('encoded:schemas/consortium.json')
    assert schema['properties']['uuid']['type'] == 'string'


def test_changelogs(testapp, registry):
    for typeinfo in registry[TYPES].by_item_type.values():
        changelog = typeinfo.schema.get('changelog')
        if changelog is not None:
            res = testapp.get(changelog)
            assert res.status_int == 200, changelog
            assert res.content_type == 'text/markdown'


def test_schema_version_present_on_items(app):
    """Test a valid schema version is present on all non-test item
    types.

    Expecting positive integer values for non-abstract items, and empty
    string for all abstract items.
    """
    all_types = app.registry.get(TYPES).by_item_type
    for type_name, item_type in all_types.items():
        if type_name.startswith("testing"):
            continue
        schema_version = item_type.schema_version
        if item_type.is_abstract is False:
            assert schema_version
            assert int(schema_version) >= 1
        else:
            assert schema_version == ""
