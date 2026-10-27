import copy
import unittest

from encoded.schema_explorer.display import display_model, hidden_path


class DisplayPolicyTests(unittest.TestCase):
    def test_nested_definitions_routes_and_metadata_are_filtered(self):
        model = {'models': [{
            'fields': [{'name': 'principals_allowed', 'schema': {}},
                       {'name': 'donor_groups', 'schema': {'permission': 'restricted_fields', 'type': 'array'}}],
            'schema': {'properties': {'profile': {'properties': {'groups': {'enum': ['admin']}, 'name': {}}}},
                       'required': ['groups', 'name'], 'columns': {'profile.groups': {}, 'name': {}}},
            'embeds': ['profile.groups', 'donor.accession'],
            'reverse': {'members': ['User', 'submits_for'], 'samples': ['Sample', 'donor']},
        }], 'edges': [{'field': 'profile.groups[]'}, {'field': 'donor'}]}
        original = copy.deepcopy(model)
        result = display_model(model)
        self.assertEqual(model, original)
        item = result['models'][0]
        self.assertEqual([f['name'] for f in item['fields']], ['donor_groups'])
        self.assertNotIn('permission', item['fields'][0]['schema'])
        self.assertEqual(item['schema']['properties']['profile']['properties'], {'name': {}})
        self.assertEqual(item['schema']['required'], ['name'])
        self.assertEqual(item['embeds'], ['donor.accession'])
        self.assertEqual(list(item['reverse']), ['samples'])
        self.assertEqual(result['edges'], [{'field': 'donor'}])

    def test_domain_fields_are_not_hidden_by_substring(self):
        for name in ['donor_groups', 'access_status', 'file_access_status', 'group_tag', 'accession']:
            self.assertFalse(hidden_path(name))
        for name in ['principals_allowed.view', 'user.groups[]', 'secret_access_key_hash']:
            self.assertTrue(hidden_path(name))
