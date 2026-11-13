function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    return value;
}

export function groupRelationships(edges) {
    const result = new Map();
    for (const edge of edges) {
        const key = JSON.stringify([edge.from, edge.to, edge.kind, !!edge.reverse]);
        if (!result.has(key)) result.set(key, { ...edge, key, edges: [] });
        result.get(key).edges.push(edge);
    }
    return [...result.values()];
}

// Only lift a reference when its visible ancestor really defines that same
// field, with identical provenance and schema. Matching targets or type names
// alone would incorrectly erase overrides and independently declared fields.
export function sharedRelationships(index, groups, visibleNames) {
    const byName = new Map(index.models.map((model) => [model.name, model]));
    const byId = new Map(index.models.map((model) => [model.id, model]));
    const input = groups.flatMap((group) => group.edges);
    const available = new Set(input.map((edge) => JSON.stringify([edge.from, edge.to, edge.field, edge.kind, !!edge.reverse])));
    const fingerprints = new Map();
    const fingerprint = (model, edge) => {
        const root = edge.field.split('.')[0].replaceAll('[]', '');
        const key = `${model.id || model.name}:${root}`;
        if (!fingerprints.has(key)) {
            const field = model.fields?.find((candidate) => candidate.name === root);
            fingerprints.set(key, field?.sources?.length ? JSON.stringify(canonical({ schema: field.schema, sources: field.sources, owner: field.owner })) : null);
        }
        return fingerprints.get(key);
    };
    const result = new Map(), inherited = {};
    for (const edge of input) {
        const model = byName.get(edge.from);
        let owner = edge.from;
        if (model) {
            const signature = fingerprint(model, edge);
            if (signature) {
                for (const base of [...(model.bases || [])].reverse()) {
                    const ancestor = base.id ? byId.get(base.id) : byName.get(base.name);
                    if (!ancestor || !visibleNames.has(ancestor.name)) continue;
                    const definition = JSON.stringify([ancestor.name, edge.to, edge.field, edge.kind, !!edge.reverse]);
                    if (available.has(definition) && fingerprint(ancestor, edge) === signature) { owner = ancestor.name; break; }
                }
            }
        }
        const key = JSON.stringify([owner, edge.to, edge.kind, !!edge.reverse]);
        if (!result.has(key)) result.set(key, { ...edge, from: owner, key, edges: [], shared: false });
        const group = result.get(key);
        group.edges.push(edge);
        if (owner !== edge.from) {
            group.shared = true;
            if (!inherited[edge.from]) inherited[edge.from] = { owners: new Set(), fields: new Set() };
            inherited[edge.from].owners.add(owner);
            inherited[edge.from].fields.add(JSON.stringify([edge.field, edge.to, edge.kind, !!edge.reverse]));
        }
    }
    return { groups: [...result.values()], inherited };
}

// A group map's default arrows join panels, not schemas: every reference between two panels (or between a panel
// and a collapsed card of another group) becomes one arrow per direction and relationship kind that carries all of
// its references, so Link, Calculated and Reverse keep their own colour and dash as in the schema-level arrows.
// References that stay inside one panel draw no arrow; `inside` counts them per panel so none is lost.
// `owners` maps each schema to the panel or card that draws it; edges with an end outside it are skipped.
export function panelRelationships(edges, owners) {
    const arrows = new Map(), inside = new Map();
    for (const edge of edges) {
        const from = owners.get(edge.from), to = owners.get(edge.to);
        if (!from || !to) continue;
        if (from === to) { inside.set(from, (inside.get(from) || 0) + 1); continue; }
        const key = `panel:${from}>${to}:${edge.kind}${edge.reverse ? ':reverse' : ''}`;
        if (!arrows.has(key)) arrows.set(key, { ...edge, key, from, to, kind: edge.kind, reverse: !!edge.reverse, panel: true, edges: [] });
        arrows.get(key).edges.push(edge);
    }
    return { groups: [...arrows.values()], inside };
}
