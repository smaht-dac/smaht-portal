"""Standalone endpoint tests; no database, credentials or server fixtures.

Run: PYTHONPATH=src python -m unittest discover -s tests/schema_explorer -v
"""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from pyramid.config import Configurator
from pyramid.renderers import JSON
from pyramid.authorization import ACLAuthorizationPolicy
from webtest import TestApp

from encoded.schema_explorer import STORE, ModelStore, build_snapshot
from encoded.types.page import Page


class PageACL:
    __parent__ = None
    __acl__ = Page.__acl__
    SUBMISSION_CENTER_STATUS_ACL = Page.SUBMISSION_CENTER_STATUS_ACL
    CONSORTIUM_STATUS_ACL = Page.CONSORTIUM_STATUS_ACL
    MINIMAL_STATUS_VIEW = Page.MINIMAL_STATUS_VIEW
    status = 'protected-network'

    def upgrade_properties(self):
        return {'status': self.status, 'consortia': ['test-consortium']}


class ExplorerTests(unittest.TestCase):
    def setUp(self):
        self.config = Configurator()
        self.config.add_renderer(None, JSON())
        self.config.add_request_method(
            lambda request: ['system.Everyone'] + (['group.admin'] if request.headers.get('X-Test-Admin') else
            (['system.Authenticated', 'role.consortium_member_rw'] if request.headers.get('X-Test-User') else [])),
            'effective_principals', reify=True)
        self.page_context = PageACL()
        lookup = patch('encoded.schema_explorer.explorer_page', return_value=self.page_context)
        self.lookup = lookup.start()
        self.addCleanup(lookup.stop)
        self.config.add_request_method(
            lambda request, permission, context: ACLAuthorizationPolicy().permits(
                context, request.effective_principals, permission), 'has_permission')
        self.config.include('encoded.schema_explorer')
        self.config.registry[STORE].snapshot = {
            'model': {'models': [], 'edges': [], 'warnings': []},
            'sources': {'encoded/types/example.py': 'class Example: pass'},
        }
        self.app = TestApp(self.config.make_wsgi_app())
        self.headers = {'X-Test-Admin': 'yes'}
        self.addCleanup(self.config.end)

    def test_every_endpoint_requires_sign_in(self):
        for url in ['/schema-explorer/ui', '/schema-explorer/model',
                    '/schema-explorer/source?file=encoded/types/example.py']:
            self.app.get(url, status=403)

    def test_non_admin_can_explore_schemas_but_not_live_items(self):
        headers = {'X-Test-User': 'yes'}
        page = self.app.get('/schema-explorer/model', headers=headers).json
        self.assertFalse(page['can_view_items'])
        self.assertTrue(self.app.get('/schema-explorer/model', headers=self.headers).json['can_view_items'])
        self.app.get('/schema-explorer/model', headers=headers, status=200)
        self.app.get('/schema-explorer/source?file=encoded/types/example.py', headers=headers, status=200)
        self.app.get('/schema-explorer/ui', headers=headers, status=302)

    def test_page_status_controls_api_access_without_rebuilding_snapshot(self):
        for status, allowed in [('open', True), ('draft', False), ('protected-network', False)]:
            self.page_context.status = status
            for url in ['/schema-explorer/model', '/schema-explorer/source?file=encoded/types/example.py']:
                self.app.get(url, status=200 if allowed else 403)
        self.page_context.status = 'draft'
        self.app.get('/schema-explorer/model', headers={'X-Test-User': 'yes'}, status=403)
        self.app.get('/schema-explorer/model', headers=self.headers, status=200)
        self.lookup.return_value = None
        self.app.get('/schema-explorer/model', headers=self.headers, status=403)

    def test_page_has_no_custom_route(self):
        self.app.get('/schema-explorer', headers=self.headers, status=404)
        self.assertIsNone(self.config.get_routes_mapper().get_route('schema_explorer_page'))

    def test_model_is_private_and_read_only(self):
        result = self.app.get('/schema-explorer/model', headers=self.headers)
        self.assertEqual(result.json['models'], [])
        self.assertIn('no-store', result.headers['Cache-Control'])
        self.app.post('/schema-explorer/model', headers=self.headers, status=404)

    def test_old_ui_assets_are_not_served(self):
        for name in ['native.js', 'portal.js', 'index.html', 'style.css']:
            self.app.get('/schema-explorer/assets/' + name, headers=self.headers, status=404)

    def test_direct_ui_navigation_returns_to_portal_shell(self):
        response = self.app.get('/schema-explorer/ui',
                                headers={**self.headers, 'Sec-Fetch-Dest': 'document'}, status=302)
        self.assertTrue(response.location.endswith('/schema-explorer'))
        self.assertIn('no-store', response.headers['Cache-Control'])
        self.app.get('/schema-explorer/ui', headers=self.headers, status=302)

    def test_source_is_an_index_lookup_not_a_filesystem_path(self):
        response = self.app.get('/schema-explorer/source',
                                params={'file': 'encoded/types/example.py'}, headers=self.headers)
        self.assertEqual(response.json['text'], 'class Example: pass')
        for filename in ['/etc/passwd', '../../.smaht-keys.json', 'encoded/not-indexed.py']:
            self.app.get('/schema-explorer/source', params={'file': filename},
                         headers=self.headers, status=404)

    def test_snapshot_cache_and_build_artifact(self):
        with patch('encoded.schema_explorer.build_snapshot', return_value={'model': {}}) as build:
            store = ModelStore()
            self.assertIs(store.get(), store.get())
            build.assert_called_once()
        with tempfile.TemporaryDirectory() as directory:
            artifact = Path(directory) / 'model.json'
            artifact.write_text(json.dumps({'model': {'models': []}, 'sources': {}}))
            self.assertEqual(ModelStore(str(artifact)).get()['model']['models'], [])

    def test_real_snapshot_contains_model_and_portable_source_references(self):
        snapshot = build_snapshot()
        self.assertIn('TissueSample', {m['name'] for m in snapshot['model']['models']})
        self.assertNotIn('root', snapshot['model'])
        self.assertNotIn('packages', snapshot['model'])
        serialized = json.dumps(snapshot['model'])
        self.assertNotIn(str(Path(__file__).resolve().parents[2]), serialized)
        self.assertIn('encoded/types/tissue_sample.py', snapshot['sources'])
        self.assertIn('snovault/resources.py', list(snapshot['sources']))
        self.assertFalse(any('Module not found: snovault' in warning
                             for warning in snapshot['model']['warnings']))
        edges = [e for e in snapshot['model']['edges']
                 if e['from'] == 'ProtectedDonor' and e['field'].rstrip('[]') == 'medical_history']
        self.assertEqual(len(edges), 1)
        self.assertTrue(edges[0]['reverse'])


if __name__ == '__main__':
    unittest.main()
