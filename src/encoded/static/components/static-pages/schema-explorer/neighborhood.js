import { domains, domainFor } from './domains';
import { roundedPath } from './routing';

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

// The schemas of one side, grouped by catalog group and in catalog order.
function blocksOf(names) {
    const order = new Map(domains.map((domain, i) => [domain.id, i]));
    const byDomain = new Map();
    for (const name of [...names].sort()) {
        const id = domainFor(name);
        if (!byDomain.has(id)) byDomain.set(id, []);
        byDomain.get(id).push(name);
    }
    return [...byDomain.entries()].sort(([a], [b]) => order.get(a) - order.get(b));
}

function column(blocks, x, nodeWidth, nodeHeight, side) {
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

// Each side is one column, so arrows never cross another column. When one side is far busier than the other (a
// schema many others reference but that references few, or the reverse), whole groups move to the quieter side
// until the two columns are about even: the map is half as tall, and the arrowheads still give each link's direction.
export function balanceSides(incoming, outgoing) {
    const left = blocksOf(incoming), right = blocksOf(outgoing);
    const count = (blocks) => blocks.reduce((sum, [, members]) => sum + members.length, 0);
    const busy = count(right) >= count(left) ? right : left, quiet = busy === right ? left : right;
    if (count(busy) <= 8 || count(busy) <= count(quiet) * 2) return { left, right };
    // Move the busy side's groups from the end of its column (the catalog's later groups stay on the busy side, the
    // earlier ones cross over) while that brings the two sides closer.
    const moved = [];
    while (busy.length > 1) {
        const candidate = busy[0];
        const gap = Math.abs(count(busy) - count(quiet) - count(moved));
        const after = Math.abs(count(busy) - candidate[1].length - (count(quiet) + count(moved) + candidate[1].length));
        if (after >= gap) break;
        moved.push(busy.shift());
    }
    const merged = [...quiet, ...moved];
    const sorted = blocksOf(merged.flatMap(([, members]) => members));
    return busy === right ? { left: sorted, right: busy } : { left: busy, right: sorted };
}

export function neighborhoodLayout(selected, groups, nodeWidth, nodeHeight) {
    const { incoming, outgoing } = neighborhoodSides(selected, groups);
    const { left: leftBlocks, right: rightBlocks } = balanceSides(incoming, outgoing);
    const step = nodeWidth + inset * 2 + columnGap;
    const center = column(blocksOf([selected]), 0, nodeWidth, nodeHeight, 'selected');
    const left = column(leftBlocks, -step, nodeWidth, nodeHeight, 'incoming');
    const right = column(rightBlocks, step, nodeWidth, nodeHeight, 'outgoing');
    return {
        positions: { ...left.positions, ...right.positions, ...center.positions },
        panels: [...left.panels, ...center.panels, ...right.panels],
    };
}

// Arrows of a neighborhood run along one bus on each side of the selected card, in the gap between the columns.
// Every arrow into the selection from one side joins that bus and enters the card at one point, so their heads make
// one clear head instead of a cluster; arrows out of it leave at their own point and branch off to their cards. When a
// side has arrows both ways, they use two buses (incoming nearer the card, outgoing further out) and enter just above
// and leave just below the card's middle, so neither direction's arrows run along the other's. Several arrows meeting
// one far card each take their own height on it.
export function neighborhoodRoutes(selected, groups, positions, nodeWidth, nodeHeight, { busGap = 40, laneGap = 16, pairGap = 26 } = {}) {
    const c = positions[selected];
    if (!c) return {};
    const routes = {}, bySide = { left: [], right: [] }, atCard = new Map();
    // How many arrows meet each far card, to spread their branches over its side.
    const meeting = new Map();
    for (const g of groups) {
        if (g.from === g.to || (g.from !== selected && g.to !== selected)) continue;
        const other = g.from === selected ? g.to : g.from;
        meeting.set(other, (meeting.get(other) || 0) + 1);
    }
    for (const g of groups) {
        if (g.from === g.to || (g.from !== selected && g.to !== selected)) continue;
        const other = g.from === selected ? g.to : g.from;
        if (!positions[other]) continue;
        bySide[positions[other].x < c.x ? 'left' : 'right'].push(g);
    }
    for (const [side, list] of Object.entries(bySide)) {
        const sign = side === 'left' ? -1 : 1;
        const edgeX = c.x + sign * nodeWidth / 2;
        const both = list.some((g) => g.to === selected) && list.some((g) => g.from === selected);
        const busFor = (incoming) => edgeX + sign * (busGap - (both ? (incoming ? laneGap / 2 : -laneGap / 2) : 0));
        for (const g of [...list].sort((a, b) => a.key.localeCompare(b.key))) {
            const incoming = g.to === selected, other = positions[incoming ? g.from : g.to];
            const otherName = incoming ? g.from : g.to, busX = busFor(incoming);
            // Arrows meeting one far card each take their own height on its side, centred on its middle.
            const n = atCard.get(otherName) || 0, total = meeting.get(otherName) || 1;
            atCard.set(otherName, n + 1);
            // Far enough apart for a label above each branch, and never past the card's own side.
            const gap = total > 1 ? Math.min(pairGap, (nodeHeight - 16) / (total - 1)) : 0;
            const farY = other.y + (n - (total - 1) / 2) * gap;
            const nearY = c.y + (both ? (incoming ? -12 : 12) : 0);
            const farX = other.x - sign * nodeWidth / 2;
            const near = [{ x: edgeX, y: nearY }, { x: busX, y: nearY }], far = [{ x: busX, y: farY }, { x: farX, y: farY }];
            let points = incoming ? [...far.reverse(), ...near.reverse()] : [...near, ...far];
            // Drop repeated corners, so a card level with the selection gets one straight line.
            points = points.filter((p, i) => !i || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
            points = points.filter((p, i) => i === 0 || i === points.length - 1
                || !((points[i - 1].x === p.x && p.x === points[i + 1].x) || (points[i - 1].y === p.y && p.y === points[i + 1].y)));
            const end = points[points.length - 1], before = points[points.length - 2];
            const length = Math.hypot(end.x - before.x, end.y - before.y) || 1;
            // The label belongs on the arrow's own branch (the run at the far card), never on the shared bus.
            const farRun = incoming ? 0 : points.length - 2;
            routes[g.key] = { points, d: roundedPath(points), end, ux: (end.x - before.x) / length, uy: (end.y - before.y) / length, labelRun: farRun };
        }
    }
    return routes;
}
