"""Explorer presentation policy, independent of the portal's actual item ACLs."""
import copy
import json
from pathlib import Path
import re

POLICY = Path(__file__).resolve().parent.parent / 'static/components/static-pages/schema-explorer/display-policy.json'
HIDDEN_FIELDS = frozenset(json.loads(POLICY.read_text())['hiddenFields'])


def hidden_path(path):
    return isinstance(path, str) and bool(HIDDEN_FIELDS.intersection(re.split(r'[.\[\]/]+', path)))


def clean_schema(value):
    if isinstance(value, list):
        return [clean_schema(entry) for entry in value]
    if not isinstance(value, dict):
        return value
    result = {}
    for key, entry in value.items():
        if hidden_path(key):
            continue
        if key in ('required', 'identifyingProperties') and isinstance(entry, list):
            result[key] = [name for name in entry if not hidden_path(name)]
        else:
            result[key] = clean_schema(entry)
    return result


def display_model(model):
    result = copy.deepcopy(model)
    result['edges'] = [e for e in result.get('edges', []) if not hidden_path(e.get('field'))]
    for item in result.get('models', []):
        item['fields'] = [dict(f, schema=clean_schema(f.get('schema', {})))
                          for f in item.get('fields', []) if not hidden_path(f.get('name'))]
        item['schema'] = clean_schema(item.get('schema', {}))
        item['embeds'] = [p for p in item.get('embeds', []) if not hidden_path(p)]
        item['reverse'] = {k: v for k, v in item.get('reverse', {}).items()
                           if not hidden_path(k) and not any(hidden_path(p) for p in v)}
    return result
