import { domains, domainFor } from './domains';
import { concepts, conceptFor } from './research-map';

// Small contexts stay explicit. Larger contexts expand one external group at a time.
// Each group also names the Donor to data boxes its members appear in, so the
// catalog grouping and the map vocabulary stay connected.
export function externalContextGroups(names) {
    if (names.size <= 3) return [];
    return domains.map((domain) => {
        const members = [...names].filter((name) => domainFor(name) === domain.id).sort();
        const owners = new Set(members.map((name) => conceptFor(name)?.id).filter(Boolean));
        return {
            id: domain.id,
            name: `external-group:${domain.id}`,
            label: domain.label,
            members,
            mapLabels: concepts.filter((concept) => owners.has(concept.id)).map((concept) => concept.label),
            unmapped: members.filter((name) => !conceptFor(name)).length,
        };
    }).filter((group) => group.members.length);
}
