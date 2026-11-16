// Where the explorer is, kept in the page URL's hash (as the benchmarking pages keep their tabs) so the browser's
// back button and shared links work: the schema catalog, which opens first (#schemas, or no hash), the metadata map
// overview (#overview), a concept (#concepts/analyte; older
// #concepts/analyte/map links open the same page), a group map (#groups/samples),
// one schema on its group map (#schemas/TissueSample) or one schema's own connections (#schemas/TissueSample/connections).

export const overviewRoute = { view: 'overview' };
// The explorer opens on the catalog of every schema.
export const startRoute = { view: 'schemas' };

export function parseRoute(hash = '') {
    const [section, id, part] = hash.replace(/^#\/?/, '').split('/').map((piece) => decodeURIComponent(piece || ''));
    if (section === 'concepts' && id) return { view: 'concept', concept: id };
    if (section === 'groups' && id) return { view: 'group', group: id };
    if (section === 'schemas') return id ? { view: 'schema', schema: id, ...(part === 'connections' ? { connections: true } : {}) } : startRoute;
    if (section === 'overview') return overviewRoute;
    return startRoute;
}

export function routeHash(route) {
    switch (route.view) {
        case 'schema': return `#schemas/${encodeURIComponent(route.schema)}${route.connections ? '/connections' : ''}`;
        case 'schemas': return '#schemas';
        case 'group': return `#groups/${encodeURIComponent(route.group)}`;
        case 'concept': return `#concepts/${encodeURIComponent(route.concept)}`;
        default: return '#overview';
    }
}

export const sameRoute = (a, b) => routeHash(a) === routeHash(b);

// Everything but the catalog is drawn on the metadata map; a schema is its group map with that schema selected.
export const isMapRoute = (route) => route.view !== 'schemas';
