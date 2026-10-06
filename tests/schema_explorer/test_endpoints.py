"""Standalone endpoint tests; no database, credentials or server fixtures.

Run: PYTHONPATH=src python -m unittest discover -s tests/schema_explorer -v
"""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from pyramid.config import Configurator
from webtest import TestApp

from encoded.schema_explorer import STORE, ModelStore, build_snapshot


class ExplorerTests(unittest.TestCase):
    def setUp(self):
        self.config = Configurator()
        self.config.add_request_method(
            lambda request: ['group.admin'] if request.headers.get('X-Test-Admin') else [],
            'effective_principals', reify=True)
        self.config.include('encoded.schema_explorer')
        self.config.registry[STORE].snapshot = {
            'model': {'models': [], 'edges': [], 'warnings': []},
            'sources': {'encoded/types/example.py': 'class Example: pass'},
        }
        self.app = TestApp(self.config.make_wsgi_app())
        self.headers = {'X-Test-Admin': 'yes'}
        self.addCleanup(self.config.end)

    def test_every_endpoint_requires_admin(self):
        for url in ['/schema-explorer', '/schema-explorer/ui', '/schema-explorer/model',
                    '/schema-explorer/source?file=encoded/types/example.py',
                    '/schema-explorer/assets/app.js', '/schema-explorer/assets/native.js']:
            self.app.get(url, status=403)

    def test_model_is_private_and_read_only(self):
        result = self.app.get('/schema-explorer/model', headers=self.headers)
        self.assertEqual(result.json['models'], [])
        self.assertIn('no-store', result.headers['Cache-Control'])
        self.app.post('/schema-explorer/model', headers=self.headers, status=404)

    def test_ui_and_asset_allowlist(self):
        for name in ['portal.js', 'app.js', 'entity-diagram.js', 'item.js',
                     'path-analysis.js', 'path-finder.js', 'provenance.js', 'style.css', 'native.js']:
            asset = self.app.get('/schema-explorer/assets/' + name,
                                 headers=self.headers, status=200)
            self.assertEqual(asset.content_type,
                             'text/css' if name.endswith('.css') else 'application/javascript')
            self.assertEqual(asset.charset.lower(), 'utf-8')
            self.assertEqual(asset.headers['X-Content-Type-Options'], 'nosniff')
        self.app.get('/schema-explorer/assets/analyzer.py', headers=self.headers, status=404)

    def test_direct_ui_navigation_returns_to_portal_shell(self):
        response = self.app.get('/schema-explorer/ui',
                                headers={**self.headers, 'Sec-Fetch-Dest': 'document'}, status=302)
        self.assertTrue(response.location.endswith('/schema-explorer'))
        self.assertIn('no-store', response.headers['Cache-Control'])
        self.app.get('/schema-explorer/ui', headers=self.headers, status=302)

    def test_native_module_is_scoped_and_complete(self):
        result = self.app.get('/schema-explorer/assets/native.js', headers=self.headers)
        self.assertIn('export function mount(host)', result.text)
        self.assertNotIn('/* EXPLORER_', result.text)
        self.assertNotIn('<iframe', result.text)
        self.assertIn('lifetime.abort()', result.text)
        self.assertIn('no-store', result.headers['Cache-Control'])

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
