"""Admin-only schema explorer backed by the deployed package sources.

The UI mounts directly in the portal DOM and is loaded on demand.
No credentials file, proxy request, application-code execution or write API is used.
"""
import copy
from importlib.util import find_spec
import json
from pathlib import Path
from threading import Lock

from pyramid.httpexceptions import HTTPForbidden, HTTPNotFound, HTTPFound
from pyramid.response import Response
from pyramid.view import view_config

from .analyzer import Index


ASSETS = Path(__file__).parent / 'assets'
ASSET_NAMES = frozenset({
    'app.js', 'entity-diagram.js', 'item.js', 'path-analysis.js',
    'path-finder.js', 'provenance.js', 'portal.js', 'style.css', 'native.js',
})
STORE = 'encoded.schema_explorer.store'


def build_snapshot():
    """Create a portable artifact; never expose server filesystem paths."""
    packages = []
    for name in ('encoded_core', 'snovault'):
        spec = find_spec(name)
        if spec and spec.submodule_search_locations:
            packages.append(next(iter(spec.submodule_search_locations)))
    index = Index(Path(__file__).resolve().parent.parent, packages=packages)
    model = index.build()
    sources = {}
    locations = {}

    def collect(value):
        if isinstance(value, dict):
            filename = value.get('file')
            if isinstance(filename, str):
                file = Path(filename).resolve()
                for package, directory in index.packages.items():
                    try:
                        relative = file.relative_to(directory.resolve())
                    except ValueError:
                        continue
                    if file.suffix in {'.py', '.json'} and file.is_file():
                        key = package + '/' + relative.as_posix()
                        locations[filename] = key
                        sources[key] = file.read_text(encoding='utf-8')
                    break
            for child in value.values():
                collect(child)
        elif isinstance(value, list):
            for child in value:
                collect(child)

    collect(model['models'])
    prefixes = {str(v): k for k, v in index.packages.items()}
    prefixes[str(index.root)] = 'encoded'

    def clean(value):
        if isinstance(value, dict):
            return {k: clean(v) for k, v in value.items()}
        if isinstance(value, list):
            return [clean(v) for v in value]
        if isinstance(value, str):
            if value in locations:
                return locations[value]
            for prefix, label in sorted(prefixes.items(), key=lambda pair: -len(pair[0])):
                value = value.replace(prefix, label)
        return value

    model.pop('root', None)
    model.pop('packages', None)
    result = clean(model)
    result['sourceMode'] = 'deployed'
    return {'model': result, 'sources': sources}


class ModelStore:
    """One immutable snapshot per worker, optionally supplied at build time."""
    def __init__(self, artifact=None):
        self.artifact = artifact
        self.snapshot = None
        self.lock = Lock()

    def get(self):
        with self.lock:
            if self.snapshot is None:
                self.snapshot = (json.loads(Path(self.artifact).read_text())
                                 if self.artifact else build_snapshot())
            return self.snapshot


def includeme(config):
    config.registry[STORE] = ModelStore(config.registry.settings.get('schema_explorer.artifact'))
    config.add_route('schema_explorer_page', '/schema-explorer{slash:/?}')
    config.add_route('schema_explorer_ui', '/schema-explorer/ui')
    config.add_route('schema_explorer_model', '/schema-explorer/model')
    config.add_route('schema_explorer_source', '/schema-explorer/source')
    config.add_route('schema_explorer_asset', '/schema-explorer/assets/{name}')
    config.scan(__name__)


def authorize(request):
    # Explicit admin gate covers the page, model, source text and every UI asset.
    if 'group.admin' not in request.effective_principals:
        raise HTTPForbidden('Schema Explorer is available to portal administrators.')
    request.response.headers['Cache-Control'] = 'private, no-store'


def private_response(body, content_type):
    # Pyramid/WebOb replaces the header list when ``headers`` is supplied to
    # the constructor, dropping Content-Type/charset set by its other kwargs.
    response = Response(body=body.encode('utf-8'))
    response.headers['Content-Type'] = content_type + '; charset=UTF-8'
    response.headers['Cache-Control'] = 'private, no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


@view_config(route_name='schema_explorer_page', request_method='GET')
def page(request):
    authorize(request)
    return {'@id': '/schema-explorer', '@type': ['SchemaExplorerPage'],
            'title': 'Schema Explorer', 'description': 'Explore the deployed data model.'}


@view_config(route_name='schema_explorer_model', request_method='GET', renderer='json')
def model(request):
    authorize(request)
    return copy.deepcopy(request.registry[STORE].get()['model'])


@view_config(route_name='schema_explorer_source', request_method='GET', renderer='json')
def source(request):
    authorize(request)
    key = request.params.get('file', '')
    text = request.registry[STORE].get()['sources'].get(key)
    if text is None:
        raise HTTPNotFound('Source definition not indexed.')
    return {'file': key, 'text': text}


@view_config(route_name='schema_explorer_asset', request_method='GET')
def asset(request):
    authorize(request)
    name = request.matchdict['name']
    if name not in ASSET_NAMES:
        raise HTTPNotFound()
    body = native_module() if name == 'native.js' else (ASSETS / name).read_text()
    return private_response(body,
                            'text/css' if name.endswith('.css') else 'application/javascript')


def native_module():
    """Compose trusted, packaged UI code as a lazy ES module (no eval)."""
    html = (ASSETS / 'index.html').read_text().split('<body>', 1)[1].split('<script', 1)[0]
    css = (ASSETS / 'style.css').read_text().replace(':root', ':host')
    css = css.replace('body', '.explorer-root')
    scripts = ['portal.js', 'provenance.js', 'app.js', 'entity-diagram.js',
               'path-analysis.js', 'path-finder.js', 'item.js']
    return ((ASSETS / 'native.js').read_text()
            .replace('/* EXPLORER_HTML */', json.dumps(html))
            .replace('/* EXPLORER_CSS */', json.dumps(css))
            .replace('/* EXPLORER_SCRIPTS */', '\n'.join((ASSETS / name).read_text() for name in scripts)))


@view_config(route_name='schema_explorer_ui', request_method='GET')
def ui(request):
    authorize(request)
    return HTTPFound(location='/schema-explorer', headers={'Cache-Control': 'private, no-store'})
