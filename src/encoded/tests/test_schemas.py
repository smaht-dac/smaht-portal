from typing import Any, Dict

import pytest
from unittest import mock
import contextlib
from dcicutils import schema_utils
from dcicutils.misc_utils import to_camel_case
from pkg_resources import resource_listdir
from snovault import COLLECTIONS, TYPES
from snovault.schema_utils import load_schema
from webtest import TestApp
from ..project.schema_views import SMaHTProjectSchemaViews

from .utils import (
    get_all_item_types,
    get_functional_item_type_names,
    get_item,
    get_unique_key,
    has_property,
    pluralize_collection,
    get_items_with_submitted_id,
)


pytestmark = [pytest.mark.setone, pytest.mark.working, pytest.mark.schema, pytest.mark.indexing]


SCHEMA_FILES = [
    f for f in resource_listdir('encoded', 'schemas')
    if f.endswith('.json') and 'embeds' not in f
]


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
        'supplementary_files',
        'modified'
    ]
    for key in mixin_keys:
        assert mixins[key]


# TODO: Modify how this mock is implemented so it can be re-used via import as it is copied from snovault
@contextlib.contextmanager
def mock_get_submittable_item_names(sub_item_names):
    with mock.patch.object(SMaHTProjectSchemaViews, 'get_submittable_item_names', lambda x: sub_item_names):
        yield


@contextlib.contextmanager
def mock_get_prop_for_submittable_items(sub_prop):
    with mock.patch.object(SMaHTProjectSchemaViews, 'get_prop_for_submittable_items', lambda x: sub_prop):
        yield


@contextlib.contextmanager
def mock_get_properties_for_exclusion(excl_props):
    with mock.patch.object(SMaHTProjectSchemaViews, 'get_properties_for_exclusion', lambda x: excl_props):
        yield


@contextlib.contextmanager
def mock_get_attributes_for_exclusion(excl_attrs):
    with mock.patch.object(SMaHTProjectSchemaViews, 'get_attributes_for_exclusion', lambda x: excl_attrs):
        yield


@contextlib.contextmanager
def composite_mocker_for_schema_utils(sub_item_names=[], sub_prop=None, excl_props=[], excl_attrs={}):
    """ This function is generally repurposable but has been customized for a conditional contextmanager
        that will handle any combination """
    conditions_managers = [
        (sub_item_names, mock_get_submittable_item_names),
        (sub_prop, mock_get_prop_for_submittable_items),
        (excl_props, mock_get_properties_for_exclusion),
        (excl_attrs, mock_get_attributes_for_exclusion)
    ]

    with contextlib.ExitStack() as stack:
        for condition, context_manager in conditions_managers:
            if condition:
                stack.enter_context(context_manager(condition))
        yield


def camel_case(name):
    return ''.join(x for x in name.title() if not x == '_')


@pytest.mark.parametrize('schema', [k for k in SCHEMA_FILES])
def test_load_schema(schema, master_mixins, registry, testapp):

    abstract = [
        'file.json',
        'generic_config.json',
        'user_content.json',
        'preparation.json',
        'pathology_report.json',
        'sample.json',
        'sample_source.json',
        'submitted_file.json',
    ]
    loaded_schema = load_schema('encoded:schemas/%s' % schema)
    assert loaded_schema

    typename = schema.replace('.json', '')
    collection_names = [camel_case(typename), pluralize_collection(typename)]

    # TODO: add pattern field checks when applicable

    # check the mixin properties for each schema
    if schema != 'mixins.json':
        verify_mixins(loaded_schema, master_mixins)

    if schema not in ['namespaces.json', 'mixins.json']:
        # check that schema.id is same as /profiles/schema
        idtag = loaded_schema['$id']
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


@pytest.mark.workbook
def test_schemas_represented_in_workbook_inserts(
    es_testapp: TestApp, workbook: None
) -> None:
    """Ensure all relevant item types have examples in workbook inserts.

    Provide baseline check that all schemas are 'functional' and allow
    items to be POSTed.
    """
    item_types = get_functional_item_type_names(es_testapp)
    for item_type in item_types:
        collection_items = get_item(es_testapp, item_type)
        assert collection_items


def test_unique_keys_in_schemas(testapp: TestApp) -> None:
    """Ensure unique keys actually present in schemas."""
    for item_type, type_info in get_all_item_types(testapp).items():
        unique_key = get_unique_key(type_info)
        if unique_key:
            assert has_property(type_info.schema, unique_key), (
                f"Unique key {unique_key} not in schema for collection {item_type}"
            )


def test_unique_keys_are_identifying_properties(testapp: TestApp) -> None:
    """Ensure unique keys are identifying properties."""
    for item_type, type_info in get_all_item_types(testapp).items():
        unique_key = get_unique_key(type_info)
        if unique_key:
            assert has_identifying_property(type_info.schema, unique_key), (
                f"Expected {unique_key} as identifying property for {item_type}"
            )


def has_identifying_property(schema: Dict[str, Any], property_name: str) -> bool:
    """Return True if schema has property_name property."""
    return property_name in schema_utils.get_identifying_properties(schema)


def test_submittable(testapp):
    expected_props = [
        'a260_a280_ratio', 'analyte_preparation', 'components', 'concentration',
        'molecule', 'ribosomal_rna_ratio', 'rna_integrity_number',
        'rna_integrity_number_instrument', 'sample_quantity', 'samples',
        'submitted_id', 'volume', 'weight',
     ]
    expected_req = ["components", "molecule", "samples", "submitted_id"]
    expected_dep_req = ['rna_integrity_number', 'rna_integrity_number_instrument']
    schema_name = 'test_analyte'
    loaded_schema = load_schema(f'encoded:tests/data/test-files/{schema_name}.json')
    all_propnames = schema_utils.get_properties(loaded_schema).keys()
    test_uri = f'/submission-schemas/{schema_name}.json'
    with composite_mocker_for_schema_utils(sub_prop='submitted_id',
                                           excl_props=['accession', 'consortia', 'date_created',
                                                       'principals_allowed', 'schema_version',
                                                       'status', 'submission_centers', 'submitted_by',
                                                       'uuid'],
                                           excl_attrs={'permission': ['restricted_fields'],
                                                       'calculatedProperty': [True]}):
        with mock.patch('snovault.schema_views.schema',
                        return_value=loaded_schema):
            res = testapp.get(test_uri, status=200).json
            sub_props = schema_utils.get_properties(res)
            assert len(sub_props) == len(expected_props)
            non_sub_prop_cnt = 0
            for prop in all_propnames:
                if prop in expected_props:
                    assert prop in sub_props
                    if prop in expected_req:
                        assert 'is_required' in sub_props[prop]
                    if prop in expected_dep_req:
                        assert 'also_requires' in sub_props[prop]
                else:
                    non_sub_prop_cnt += 1
            assert len(sub_props) + non_sub_prop_cnt == len(all_propnames)


@pytest.fixture
def submittable_items(testapp):
    return get_items_with_submitted_id(testapp)


def test_submittables(testapp, submittable_items):
    test_uri = '/submission-schemas/'
    expected_items = [to_camel_case(i) for i in submittable_items]
    res = testapp.get(test_uri, status=200).json
    assert len(expected_items) == len(res)
    for item in res.keys():
        assert item in expected_items


@pytest.mark.parametrize('schema', [k for k in SCHEMA_FILES])
def test_not_submittable(testapp, schema, submittable_items):
    schema_file = f"{schema}.json"
    if schema_file not in submittable_items:
        test_uri = f'/submission-schemas/{schema_file}'
        testapp.get(test_uri, status=404)
