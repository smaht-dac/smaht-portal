import fs from 'fs';
import path from 'path';
import { concepts, connections } from '../static-pages/schema-explorer/research-map';
import { guides } from '../static-pages/schema-explorer/relationship-presentation';

// The Schema Explorer shows hand-written wording for some relationships. That wording is not read
// from the schemas, so these tests fail when a field it describes is renamed, removed or retargeted.

const schemaDir = path.resolve(__dirname, '../../../schemas');
const mixins = JSON.parse(fs.readFileSync(path.join(schemaDir, 'mixins.json'), 'utf8'));
const typeName = (file) => path.basename(file, '.json').split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
const schemas = new Map(fs.readdirSync(schemaDir)
    .filter((file) => file.endsWith('.json') && file !== 'mixins.json')
    .map((file) => [typeName(file), JSON.parse(fs.readFileSync(path.join(schemaDir, file), 'utf8'))])
    .filter(([, schema]) => schema.properties));

function properties(schema) {
    const result = { ...schema.properties };
    for (const { $ref } of schema.mixinProperties || []) Object.assign(result, mixins[$ref.split('#/')[1]] || {});
    return result;
}

// Follows a path such as "input_files[].value". Properties merged from encoded-core ($merge) are not
// available here, so their nested shape and target are reported as unknown rather than wrong.
function lookup(schema, fieldPath) {
    const [root, ...rest] = fieldPath.replaceAll('[]', '').split('.');
    let prop = properties(schema)[root];
    if (!prop) return { exists: false };
    for (const part of rest) {
        if (prop.$merge) return { exists: true, target: null };
        if (prop.type === 'array') prop = prop.items || {};
        prop = (prop.properties || {})[part];
        if (!prop) return { exists: false };
    }
    if (prop.$merge) return { exists: true, target: null };
    if (prop.type === 'array') prop = prop.items || {};
    return { exists: true, target: prop.linkTo || null };
}

const membersOf = (id) => concepts.find((concept) => concept.id === id).types.split(' ');

describe('Schema Explorer curated relationship text', () => {
    test.each(connections.flatMap((connection) => connection.fields.map((field) => [connection.from, field, connection.to])))(
        'map connection %s.%s still links to %s', (from, field, to) => {
            const targets = new Set(membersOf(to));
            const found = membersOf(from).filter((name) => schemas.has(name))
                .map((name) => lookup(schemas.get(name), field)).filter((result) => result.exists);
            expect(found.length).toBeGreaterThan(0);
            const known = found.filter((result) => result.target);
            if (known.length) expect(known.some((result) => targets.has(result.target))).toBe(true);
        });

    test.each(Object.keys(guides).map((key) => key.split('|')))(
        'relationship guide %s → %s still matches a schema field', (field, target) => {
            const found = [...schemas.values()].map((schema) => lookup(schema, field)).filter((result) => result.exists);
            expect(found.length).toBeGreaterThan(0);
            const known = found.filter((result) => result.target);
            if (known.length) expect(known.some((result) => result.target === target)).toBe(true);
        });
});
