import { domains, domainFor } from './domains';

// Small contexts stay explicit. Larger contexts expand one external group at a time.
export function externalContextGroups(names) {
    if (names.size <= 3) return [];
    return domains.map((domain) => {return {
        id: domain.id,
        name: `external-group:${domain.id}`,
        label: domain.id === 'administrative' ? 'Administrative metadata' : domain.label,
        members: [...names].filter((name) => domainFor(name) === domain.id).sort(),
    };}).filter((group) => group.members.length);
}
