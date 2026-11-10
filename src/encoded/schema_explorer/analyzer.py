"""Offline SMaHT model index. Parses sources; never imports portal code."""
import argparse
import bisect
import ast
import copy
import json
from pathlib import Path
import sys


def json_locations(text):
    """Map JSON pointers to key lines, including repeated keys in different objects."""
    decoder = json.JSONDecoder()
    lines = [i for i, char in enumerate(text) if char == '\n']
    locations = {}

    def whitespace(pos):
        while pos < len(text) and text[pos].isspace():
            pos += 1
        return pos

    def parse(pos, pointer, key_pos=None):
        pos = whitespace(pos)
        locations[pointer] = bisect.bisect_left(lines, pos if key_pos is None else key_pos) + 1
        if text[pos] == '{':
            pos = whitespace(pos + 1)
            while text[pos] != '}':
                start = pos
                key, pos = decoder.raw_decode(text, pos)
                pos = whitespace(pos)
                pos = parse(pos + 1, pointer + '/' + key.replace('~', '~0').replace('/', '~1'), start)
                pos = whitespace(pos)
                if text[pos] != ',':
                    break
                pos = whitespace(pos + 1)
            return pos + 1
        if text[pos] == '[':
            pos, index = whitespace(pos + 1), 0
            while text[pos] != ']':
                pos = whitespace(parse(pos, pointer + '/' + str(index)))
                index += 1
                if text[pos] != ',':
                    break
                pos = whitespace(pos + 1)
            return pos + 1
        return decoder.raw_decode(text, pos)[1]

    parse(0, '')
    return locations


class Unresolved(Exception):
    pass


class Index:
    def __init__(self, root, packages=()):
        self.root = Path(root).resolve()
        self.packages = {'encoded': self.root if (self.root / 'schemas').is_dir() else self.root / 'src/encoded'}
        # Explicit package directories take priority over discovered environments.
        candidates = [Path(p).resolve() for p in packages]
        candidates += [Path(p) / name for p in sys.path if p for name in ('encoded_core', 'snovault')]
        for candidate in candidates:
            if (candidate / '__init__.py').is_file() and candidate.name in ('snovault', 'encoded_core'):
                self.packages.setdefault(candidate.name, candidate)
        self.modules, self.classes, self.warnings = {}, {}, []
        self.json_cache, self.mro_cache, self.line_cache = {}, {}, {}
        for package, directory in self.packages.items():
            for file in sorted((directory / 'types').glob('*.py')):
                self.module(package + '.types.' + file.stem)
        if 'encoded_core' not in self.packages:
            self.warn('encoded_core not found; package inheritance may be incomplete. Configure packagePaths.')

    def warn(self, message):
        if message not in self.warnings:
            self.warnings.append(message)

    def source(self, file, node=None, pointer=None):
        line = getattr(node, 'lineno', 1)
        if pointer is not None:
            file = Path(file).resolve()
            if file not in self.line_cache:
                self.line_cache[file] = json_locations(file.read_text())
            line = self.line_cache[file].get(pointer, 1)
        return {'file': str(file), 'line': line, 'pointer': pointer}

    def module(self, name):
        if name in self.modules:
            return self.modules[name]
        package, *parts = name.split('.')
        if package not in self.packages:
            raise Unresolved('Package not found: ' + package)
        file = self.packages[package].joinpath(*parts).with_suffix('.py') if parts else self.packages[package] / '__init__.py'
        if not file.exists():
            file = self.packages[package].joinpath(*parts) / '__init__.py'
        if not file.exists():
            raise Unresolved('Module not found: ' + name)
        tree = ast.parse(file.read_text(), filename=str(file))
        mod = {'file': file, 'symbols': {}, 'name': name}
        self.modules[name] = mod
        for node in tree.body:
            if isinstance(node, ast.ImportFrom):
                base = name.split('.') if file.name == '__init__.py' else name.split('.')[:-1]
                if node.level:
                    base = base[:len(base) - node.level + 1]
                    target = '.'.join(base + ([node.module] if node.module else []))
                else:
                    target = node.module or ''
                for alias in node.names:
                    mod['symbols'][alias.asname or alias.name] = ('import', target, alias.name)
            elif isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
                mod['symbols'][node.name] = node
                if isinstance(node, ast.ClassDef):
                    self.classes[name + '.' + node.name] = (mod, node)
            elif isinstance(node, (ast.Assign, ast.AnnAssign)):
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                for target in targets:
                    if isinstance(target, ast.Name):
                        mod['symbols'][target.id] = node.value
        return mod

    def symbol(self, name, mod, seen=()):
        key = mod['name'] + '.' + name
        if key in seen:
            raise Unresolved('Cyclic symbol: ' + key)
        value = mod['symbols'].get(name)
        if isinstance(value, tuple):
            return self.symbol(value[2], self.module(value[1]), (*seen, key))
        if value is None:
            raise Unresolved('Unresolved symbol: ' + key)
        return value, mod

    def class_key(self, node, mod):
        if isinstance(node, ast.Name):
            value, owner = self.symbol(node.id, mod)
            if isinstance(value, ast.ClassDef):
                return owner['name'] + '.' + value.name
        raise Unresolved('Unresolved class: ' + ast.unparse(node))

    def mro(self, key, visiting=()):
        if key in self.mro_cache:
            return self.mro_cache[key]
        if key in visiting:
            raise Unresolved('Cyclic inheritance: ' + key)
        mod, cls = self.classes[key]
        bases = []
        for base in cls.bases:
            if isinstance(base, ast.Name) and base.id == 'object':
                continue
            try:
                bases.append(self.class_key(base, mod))
            except Unresolved as error:
                self.warn(f'{key}: {error}')
        seqs = [list(self.mro(b, (*visiting, key))) for b in bases] + [bases[:]]
        result = [key]
        while any(seqs):
            seqs = [s for s in seqs if s]
            head = next((s[0] for s in seqs if all(s[0] not in t[1:] for t in seqs)), None)
            if head is None:
                raise Unresolved('Inconsistent MRO: ' + key)
            result.append(head)
            for seq in seqs:
                if seq[0] == head:
                    seq.pop(0)
        self.mro_cache[key] = result
        return result

    def attrs(self, cls):
        result = {}
        for node in cls.body:
            if isinstance(node, (ast.Assign, ast.AnnAssign)):
                for target in node.targets if isinstance(node, ast.Assign) else [node.target]:
                    if isinstance(target, ast.Name):
                        result[target.id] = node.value
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                result[node.name] = node
        return result

    def attribute(self, key, name):
        for owner in self.mro(key):
            mod, cls = self.classes[owner]
            if name in self.attrs(cls):
                return self.attrs(cls)[name], mod, owner
        raise Unresolved(f'{key}.{name} not found')

    def evaluate(self, node, mod, env=None, trail=()):
        if node is None:
            raise Unresolved('Annotation without a value')
        env = env or {}
        marker = (mod['name'], id(node))
        if marker in trail or len(trail) > 80:
            raise Unresolved('Cyclic expression')
        trail = (*trail, marker)
        ev = lambda n: self.evaluate(n, mod, env, trail)
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
            values = []
            for child in node.elts:
                values.extend(ev(child.value) if isinstance(child, ast.Starred) else [ev(child)])
            return values
        if isinstance(node, ast.Dict):
            result = {}
            for key, value in zip(node.keys, node.values):
                if key is None:
                    result.update(ev(value))
                else:
                    result[ev(key)] = ev(value)
            return result
        if isinstance(node, ast.Name):
            if node.id in env:
                return env[node.id]
            value, owner = self.symbol(node.id, mod)
            return self.evaluate(value, owner, trail=trail)
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
            return ev(node.left) + ev(node.right)
        if isinstance(node, ast.Attribute):
            try:
                key = self.class_key(node.value, mod)
            except Unresolved:
                if isinstance(node.value, ast.Name):
                    imported = mod['symbols'].get(node.value.id)
                    if isinstance(imported, tuple):
                        owner = self.module(imported[1] + '.' + imported[2])
                        value, owner = self.symbol(node.attr, owner)
                        return self.evaluate(value, owner, trail=trail)
                raise
            value, owner, class_owner = self.attribute(key, node.attr)
            scoped = dict(owner, symbols={**owner['symbols'], **self.attrs(self.classes[class_owner][1])})
            return self.evaluate(value, scoped, trail=trail)
        if isinstance(node, ast.Call) and ast.unparse(node.func) == 'copy.deepcopy' and len(node.args) == 1:
            return copy.deepcopy(ev(node.args[0]))
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            func, owner = self.symbol(node.func.id, mod)
            if isinstance(func, ast.FunctionDef) and not node.args and not node.keywords and not func.args.args:
                local = {}
                for statement in func.body:
                    if isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Constant):
                        continue
                    if isinstance(statement, (ast.Assign, ast.AnnAssign)):
                        targets = statement.targets if isinstance(statement, ast.Assign) else [statement.target]
                        value = self.evaluate(statement.value, owner, local, trail)
                        for target in targets:
                            if not isinstance(target, ast.Name):
                                raise Unresolved('Dynamic helper assignment')
                            local[target.id] = value
                    elif isinstance(statement, ast.Return):
                        return self.evaluate(statement.value, owner, local, trail)
                    else:
                        raise Unresolved('Dynamic helper: ' + func.name)
        raise Unresolved('Dynamic expression: ' + ast.unparse(node)[:160])

    def raw_json(self, file):
        file = Path(file).resolve()
        if file not in self.json_cache:
            self.json_cache[file] = json.loads(file.read_text())
        return copy.deepcopy(self.json_cache[file])

    def ref(self, ref, file, prefer_app=False):
        location, _, pointer = ref.partition('#')
        if '://' in location:
            raise Unresolved('Remote reference not loaded: ' + ref)
        if ':' in location:
            package, relative = location.split(':', 1)
            if package not in self.packages:
                raise Unresolved('Reference package not found: ' + package)
            target = self.packages[package] / relative
        else:
            target = Path(file).parent / location if location else Path(file)
        if prefer_app and location and ':' not in location:
            app = self.packages['encoded'] / 'schemas' / target.name
            if app.exists():
                try:
                    self.pointer(self.raw_json(app), pointer)
                    target = app
                except (KeyError, IndexError):
                    pass
        target = target.resolve()
        return self.pointer(self.raw_json(target), pointer), target, pointer

    @staticmethod
    def pointer(data, pointer):
        for part in pointer.lstrip('/').split('/') if pointer else []:
            part = part.replace('~1', '/').replace('~0', '~')
            data = data[int(part)] if isinstance(data, list) else data[part]
        return data

    def resolve(self, data, file, pointer='', trail=()):
        if isinstance(data, list):
            return [self.resolve(v, file, pointer + '/' + str(i), trail) for i, v in enumerate(data)]
        if not isinstance(data, dict):
            return data
        result = {}
        sources = []
        for key, value in data.items():
            if key in ('$merge', '$ref'):
                for reference in value if isinstance(value, list) else [value]:
                    try:
                        raw, target, fragment = self.ref(reference, file)
                        marker = (str(target), fragment)
                        if marker in trail:
                            raise Unresolved('Cyclic reference: ' + reference)
                        resolved = self.resolve(raw, target, fragment, (*trail, marker))
                        if not isinstance(resolved, dict):
                            raise Unresolved('Non-object reference: ' + reference)
                        result.update(resolved)
                        sources.extend(resolved.get('_sources', []))
                    except (Unresolved, OSError, KeyError, ValueError) as error:
                        self.warn(f'{file.name}{pointer}: {error}')
                        result[key] = value
            elif not key.startswith('mixin'):
                result[key] = self.resolve(value, file, pointer + '/' + key, trail)
        for category in ('properties', 'facets', 'columns', 'aggregations'):
            mixins = data.get('mixin' + category.capitalize(), [])
            if not mixins:
                continue
            merged = {}
            for mixin in reversed(mixins):
                try:
                    if '$ref' in mixin:
                        raw, target, fragment = self.ref(mixin['$ref'], file, prefer_app=True)
                        marker = (str(target), fragment)
                        if marker in trail:
                            raise Unresolved('Cyclic mixin: ' + mixin['$ref'])
                        base = self.resolve(raw, target, fragment, (*trail, marker))
                    else:
                        base = self.resolve(mixin, file, pointer, trail)
                    for name, prop in base.items():
                        if name.startswith('_'):
                            continue
                        dest = merged.setdefault(name, {})
                        for attr, val in prop.items():
                            if attr == '_sources':
                                dest.setdefault(attr, []).extend(val)
                            elif attr in dest and dest[attr] != val and category != 'facets':
                                self.warn(f'{file.name}: mixin conflict {name}/{attr}')
                            else:
                                dest.setdefault(attr, val)
                except (Unresolved, OSError, KeyError, ValueError) as error:
                    self.warn(f'{file.name}: {error}')
            for name, prop in result.get(category, {}).items():
                if name.startswith('_'):
                    continue
                origins = merged.get(name, {}).get('_sources', []) + prop.get('_sources', [])
                merged.setdefault(name, {}).update(prop)
                merged[name]['_sources'] = origins
            result[category] = merged
        sources.append(self.source(file, pointer=pointer))
        result['_sources'] = sources
        return result

    def model(self, key):
        mod, cls = self.classes[key]
        attrs = self.attrs(cls)
        item_type = self.evaluate(attrs['item_type'], mod)
        result = {'name': cls.name, 'itemType': item_type, 'id': key, 'source': self.source(mod['file'], cls),
                  'fields': [], 'embeds': [], 'reverse': {}, 'bases': [], 'schema': {}}
        lineage = self.mro(key)
        result['bases'] = [{'id': k, 'name': self.classes[k][1].name,
                            'source': self.source(self.classes[k][0]['file'], self.classes[k][1])} for k in lineage[1:]]
        schema = {}
        try:
            schema_node, schema_mod, _ = self.attribute(key, 'schema')
            if not isinstance(schema_node, ast.Call) or not schema_node.args:
                raise Unresolved('Dynamic schema definition')
            if ast.unparse(schema_node.func).split('.')[-1] != 'load_schema':
                calls = [n for n in ast.walk(schema_node) if isinstance(n, ast.Call) and ast.unparse(n.func).split('.')[-1] == 'load_schema']
                if len(calls) != 1:
                    raise Unresolved('Dynamic schema construction')
                self.warn(f'{key}: schema wrapper not applied: {ast.unparse(schema_node.func)}')
                schema_node = calls[0]
            reference = self.evaluate(schema_node.args[0], schema_mod)
            raw, file, pointer = self.ref(reference, schema_mod['file'])
            schema = self.resolve(raw, file, pointer)
            result['schemaSource'] = self.source(file)
        except (Unresolved, OSError, KeyError, ValueError) as error:
            self.warn(f'{key}: {error}')
        props = dict(schema.get('properties', {}))
        # Python method shadowing follows C3, including overrides without a decorator.
        seen = set()
        calculated = {}
        for owner in lineage:
            owner_mod, owner_cls = self.classes[owner]
            for name, method in self.attrs(owner_cls).items():
                if name in seen:
                    continue
                seen.add(name)
                if not isinstance(method, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    continue
                for decorator in method.decorator_list:
                    if not isinstance(decorator, ast.Call) or ast.unparse(decorator.func).split('.')[-1] != 'calculated_property':
                        continue
                    kwargs = {kw.arg: kw.value for kw in decorator.keywords}
                    try:
                        field_name = self.evaluate(kwargs['name'], owner_mod) if 'name' in kwargs else name
                        definition = self.evaluate(kwargs['schema'], owner_mod) if 'schema' in kwargs else {}
                        definition['_sources'] = [self.source(owner_mod['file'], method)]
                        definition['calculatedProperty'] = True
                        props[field_name] = definition
                        calculated[field_name] = owner
                    except (Unresolved, KeyError, TypeError) as error:
                        self.warn(f'{owner}.{name}: {error}')
                        props[name] = {'calculatedProperty': True, 'unresolved': str(error), '_sources': [self.source(owner_mod['file'], method)]}
                        calculated[name] = owner
        for name, definition in props.items():
            if name.startswith('_'):
                continue
            result['fields'].append({'name': name, 'schema': clean(definition),
                                     'required': name in schema.get('required', []),
                                     'calculated': name in calculated,
                                     'owner': calculated.get(name), 'sources': definition.get('_sources', [])})
        for attribute, default in [('embedded_list', []), ('rev', {})]:
            try:
                node, owner_mod, owner = self.attribute(key, attribute)
                value = self.evaluate(node, owner_mod)
                result['embeds' if attribute == 'embedded_list' else 'reverse'] = value
                result[attribute + 'Source'] = self.source(owner_mod['file'], node)
            except Unresolved as error:
                if 'not found' not in str(error):
                    self.warn(f'{key}.{attribute}: {error}')
        result['schema'] = clean(schema)
        return result

    def build(self):
        models = []
        for key, (mod, cls) in list(self.classes.items()):
            if not key.startswith('encoded.types.') or self.attrs(cls).get('item_type') is None:
                continue
            try:
                models.append(self.model(key))
            except (Unresolved, OSError, ValueError, KeyError, TypeError) as error:
                self.warn(f'{key}: {error}')
        edges = []
        def links(definition, path):
            if not isinstance(definition, dict):
                return
            target = definition.get('linkTo', [])
            for name in [target] if isinstance(target, str) else target:
                yield path, name
            for name, prop in definition.get('properties', {}).items():
                yield from links(prop, path + '.' + name)
            if 'items' in definition:
                yield from links(definition['items'], path + '[]')
            for keyword in ('anyOf', 'oneOf', 'allOf'):
                for variant in definition.get(keyword, []):
                    yield from links(variant, path)
        for model in models:
            for field in model['fields']:
                for path, target in links(field['schema'], field['name']):
                    edges.append({'from': model['name'], 'to': target, 'field': path,
                                  'kind': 'calculated' if field['calculated'] else 'linkTo'})
            for field, pair in model['reverse'].items():
                if isinstance(pair, list) and len(pair) == 2:
                    exposed = [edge for edge in edges
                               if edge['from'] == model['name'] and edge['to'] == pair[0]
                               and edge['kind'] == 'calculated'
                               and edge['field'] in (field, field + '[]')]
                    if exposed:
                        for edge in exposed:
                            edge['via'] = pair[1]
                            edge['reverse'] = True
                    else:
                        edges.append({'from': model['name'], 'to': pair[0], 'field': field,
                                      'via': pair[1], 'kind': 'reverse'})
        return {'models': sorted(models, key=lambda m: m['name']), 'edges': edges,
                'warnings': self.warnings, 'packages': {k: str(v) for k, v in self.packages.items()},
                'mode': 'static', 'root': str(self.root)}


def clean(value):
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items() if k != '_sources'}
    if isinstance(value, list):
        return [clean(v) for v in value]
    return value


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--package', action='append', default=[])
    args = parser.parse_args()
    try:
        if not (Path(args.root) / 'src/encoded/schemas').is_dir():
            raise ValueError('Select the portal folder containing src/encoded/schemas.')
        print(json.dumps(Index(args.root, args.package).build(), ensure_ascii=False))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
