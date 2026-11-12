// Where the explorer is, kept in the page URL's hash (as the benchmarking pages keep their tabs) so the browser's
// back button and shared links work: the metadata map overview (no hash), a concept (#concepts/analyte; older
// #concepts/analyte/map links open the same page), a group map (#groups/samples), the schema catalog (#schemas)
// or one schema (#schemas/TissueSample).

export const overviewRoute = { view: 'overview' };

export function parseRoute(hash = '') {
    const [section, id] = hash.replace(/^#\/?/, '').split('/').map((part) => decodeURIComponent(part || ''));
    if (section === 'concepts' && id) return { view: 'concept', concept: id };
    if (section === 'groups' && id) return { view: 'group', group: id };
    if (section === 'schemas') return id ? { view: 'schema', schema: id } : { view: 'schemas' };
    return overviewRoute;
}

export function routeHash(route) {
    switch (route.view) {
        case 'schema': return `#schemas/${encodeURIComponent(route.schema)}`;
        case 'schemas': return '#schemas';
        case 'group': return `#groups/${encodeURIComponent(route.group)}`;
        case 'concept': return `#concepts/${encodeURIComponent(route.concept)}`;
        default: return '';
    }
}

export const sameRoute = (a, b) => routeHash(a) === routeHash(b);

// Everything but the catalog is drawn on the metadata map; a schema is its group map with that schema selected.
export const isMapRoute = (route) => route.view !== 'schemas';
