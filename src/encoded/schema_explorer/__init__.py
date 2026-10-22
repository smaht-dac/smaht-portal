"""Schema explorer for signed-in users backed by the deployed package sources.

The React UI is built and served by the standard portal frontend.
No credentials file, proxy request, application-code execution or write API is used.
"""
import ast
import copy
from importlib.util import find_spec
import json
from pathlib import Path
from threading import Lock

from pyramid.httpexceptions import HTTPForbidden, HTTPNotFound, HTTPFound
from pyramid.view import view_config
from snovault import CONNECTION

from .analyzer import Index


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
    config.add_route('schema_explorer_ui', '/schema-explorer/ui')
    config.add_route('schema_explorer_model', '/schema-explorer/model')
    config.add_route('schema_explorer_source', '/schema-explorer/source')
    config.scan(__name__)


def explorer_page(request):
    from encoded.types.page import Page
    stored = request.registry[CONNECTION].storage.get_by_json(
        'identifier', 'schema-explorer', item_type='page')
    return Page(request.registry, stored) if stored is not None else None


def can_view_explorer(request):
    context = explorer_page(request)
    return context is not None and bool(request.has_permission('view', context))


def authorize(request):
    request.response.headers['Cache-Control'] = 'private, no-store'
    if not can_view_explorer(request):
        raise HTTPForbidden('You do not have permission to view the Schema Explorer page.')


@view_config(route_name='schema_explorer_model', request_method='GET', renderer='json')
def model(request):
    authorize(request)
    result = copy.deepcopy(request.registry[STORE].get()['model'])
    result['can_view_items'] = 'group.admin' in request.effective_principals
    return result


@view_config(route_name='schema_explorer_source', request_method='GET', renderer='json')
def source(request):
    authorize(request)
    key = request.params.get('file', '')
    text = request.registry[STORE].get()['sources'].get(key)
    if text is None:
        raise HTTPNotFound('Source definition not indexed.')
    definitions = []
    if key.endswith('.py'):
        try:
            for node in ast.walk(ast.parse(text)):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    definitions.append({
                        'line': node.lineno,
                        'start': min([node.lineno] + [d.lineno for d in node.decorator_list]),
                        'end': node.end_lineno,
                    })
        except SyntaxError:
            pass
    return {'file': key, 'text': text, 'definitions': definitions}


@view_config(route_name='schema_explorer_ui', request_method='GET')
def ui(request):
    authorize(request)
    return HTTPFound(location='/schema-explorer', headers={'Cache-Control': 'private, no-store'})
