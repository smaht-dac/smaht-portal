import { groupRelationships, sharedRelationships } from './relationship-view';
import { relationshipPresentation } from './relationship-presentation';

// Detail cards and diagram context share the same model-backed references.
export function conceptConnections(index, concept, graph, nodes) {
    if (!concept) return [];
    const members = new Set(concept.members);
    const enabled = new Set(nodes.map((node) => node.name));
    const main = graph.edges.filter((edge) => edge.from === concept.id || edge.to === concept.id);
    const signature = (edge) => JSON.stringify([edge.from, edge.to, edge.field, edge.kind]);
    const covered = new Set(main.flatMap((edge) => edge.edges.map(signature)));
    const remaining = index.edges.filter((edge) => edge.kind === 'linkTo' && enabled.has(edge.from) && enabled.has(edge.to) &&
        (members.has(edge.from) || members.has(edge.to)) && !covered.has(signature(edge)));
    const additional = sharedRelationships(index, groupRelationships(remaining), enabled).groups.map((group) => {
        const [presentation] = relationshipPresentation(group.edges, index);
        return { ...group, fromLabel: group.from, toLabel: group.to, question: presentation.title,
            explanation: presentation.meaning, key: `additional-${group.key}` };
    });
    return [...main, ...additional];
}
