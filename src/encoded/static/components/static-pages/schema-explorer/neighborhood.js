import { domains, domainFor } from './domains';

// A schema neighborhood reads left to right like its references: schemas that link to the selected
// schema on the left, the selected schema in the middle and the schemas it links to on the right.
// Each side is grouped under the same schema-group names as the catalog and the external group cards.
// Panels use the stage-panel measurements of the group map, so both views share one visual language.
const inset = 18, headerHeight = 40, bottomInset = 16, nodeGap = 24, panelGap = 20;
// Wide enough for a field, its map verb and an inherited-subtype count (about 36 characters of
// 10px text) on the straight run between a card and the trunk beside the selected schema.
const columnGap = 220;

export function neighborhoodSides(selected, groups) {
    const outgoing = new Set(), incoming = new Set();
    for (const group of groups) {
        if (group.from === group.to) continue;
        if (group.from === selected) outgoing.add(group.to);
        else if (group.to === selected) incoming.add(group.from);
    }
    // A schema referenced in both directions sits with the schemas it is referenced by.
    for (const name of outgoing) incoming.delete(name);
    return { incoming: [...incoming], outgoing: [...outgoing] };
}

function column(names, x, nodeWidth, nodeHeight, side) {
    const order = new Map(domains.map((domain, i) => [domain.id, i]));
    const byDomain = new Map();
    for (const name of [...names].sort()) {
        const id = domainFor(name);
        if (!byDomain.has(id)) byDomain.set(id, []);
        byDomain.get(id).push(name);
    }
    const blocks = [...byDomain.entries()].sort(([a], [b]) => order.get(a) - order.get(b));
    const width = nodeWidth + inset * 2;
    const heights = blocks.map(([, members]) => headerHeight + members.length * nodeHeight + (members.length - 1) * nodeGap + bottomInset);
    let top = -(heights.reduce((sum, h) => sum + h, 0) + Math.max(0, blocks.length - 1) * panelGap) / 2;
    const positions = {}, panels = [];
    blocks.forEach(([id, members], i) => {
        const label = domains.find((domain) => domain.id === id)?.label || 'Other types';
        const left = x - width / 2;
        panels.push({
            id: `${side}-${id}`, label, domain: id, names: members,
            left: left + inset, top: top + 10, width: Math.min(width - inset * 2, label.length * 10 + 12), height: 24,
            panel: { left, top, width, height: heights[i] },
        });
        members.forEach((name, j) => {
            positions[name] = { x, y: top + headerHeight + nodeHeight / 2 + j * (nodeHeight + nodeGap) };
        });
        top += heights[i] + panelGap;
    });
    return { positions, panels };
}

export function neighborhoodLayout(selected, groups, nodeWidth, nodeHeight) {
    const { incoming, outgoing } = neighborhoodSides(selected, groups);
    const step = nodeWidth + inset * 2 + columnGap;
    const center = column([selected], 0, nodeWidth, nodeHeight, 'selected');
    const left = column(incoming, -step, nodeWidth, nodeHeight, 'incoming');
    const right = column(outgoing, step, nodeWidth, nodeHeight, 'outgoing');
    return {
        positions: { ...left.positions, ...right.positions, ...center.positions },
        panels: [...left.panels, ...center.panels, ...right.panels],
    };
}
