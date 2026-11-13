// Rectilinear visibility grid shared by every edge. Nodes and text headings are
// obstacles; a route may touch an expanded obstacle boundary, never its interior.
export function segmentClear(a, b, obstacles) {
    return obstacles.every((r) => a.x === b.x
        ? !(a.x > r.left && a.x < r.right && Math.max(a.y, b.y) > r.top && Math.min(a.y, b.y) < r.bottom)
        : a.y === b.y && !(a.y > r.top && a.y < r.bottom && Math.max(a.x, b.x) > r.left && Math.min(a.x, b.x) < r.right));
}

function roundedPath(points) {
    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
        const a = points[i - 1], b = points[i], c = points[i + 1];
        const before = Math.hypot(b.x - a.x, b.y - a.y), after = Math.hypot(c.x - b.x, c.y - b.y);
        const radius = Math.min(6, before / 2, after / 2);
        const p = { x: b.x + (a.x - b.x) * radius / before, y: b.y + (a.y - b.y) * radius / before };
        const q = { x: b.x + (c.x - b.x) * radius / after, y: b.y + (c.y - b.y) * radius / after };
        d += ` L${p.x},${p.y} Q${b.x},${b.y} ${q.x},${q.y}`;
    }
    const end = points[points.length - 1];
    return `${d} L${end.x},${end.y}`;
}

class Queue {
    constructor() { this.items = []; }
    push(item) {
        const a = this.items;
        a.push(item);
        let i = a.length - 1;
        while (i > 0) {
            const parent = Math.floor((i - 1) / 2);
            if (a[parent].cost <= item.cost) break;
            a[i] = a[parent]; i = parent;
        }
        a[i] = item;
    }
    pop() {
        const a = this.items, [first] = a, last = a.pop();
        if (a.length) {
            let i = 0;
            while (i * 2 + 1 < a.length) {
                let child = i * 2 + 1;
                if (child + 1 < a.length && a[child + 1].cost < a[child].cost) child++;
                if (last.cost <= a[child].cost) break;
                a[i] = a[child]; i = child;
            }
            a[i] = last;
        }
        return first;
    }
}

// A position may carry its own `width` and `height` (a panel or a group card); others use the node size.
export function routeEdges(positions, groups, nodeWidth, nodeHeight, headings = [], options = {}) {
    const { padding = 10, portGap = 18 } = options;
    const boxes = Object.entries(positions).map(([name, p]) => {
        const w = p.width || nodeWidth, h = p.height || nodeHeight;
        return { name, left: p.x - w / 2, right: p.x + w / 2, top: p.y - h / 2, bottom: p.y + h / 2 };
    });
    const obstacles = [...boxes, ...headings.map((h) => {return { left: h.left, right: h.left + h.width, top: h.top, bottom: h.top + h.height };})];
    const expanded = obstacles.map((r) => {return { left: r.left - padding, right: r.right + padding, top: r.top - padding, bottom: r.bottom + padding };});
    const connections = new Map(boxes.map((box) => [box.name, [...new Set(groups.filter((group) => group.from === box.name || group.to === box.name).map((group) => group.key))].sort()]));
    const rawPorts = (box, key, gap = portGap) => {
        const keys = connections.get(box.name);
        const slots = options.spreadPorts || options.spreadNodes?.includes(box.name) ? Math.min(5, keys.length) : 1;
        const fraction = slots ? ((Math.max(0, keys.indexOf(key)) % slots) + 1) / (slots + 1) : 0.5;
        const px = box.left + 16 + (box.right - box.left - 32) * fraction;
        const py = box.top + 12 + (box.bottom - box.top - 24) * fraction;
        // Ports sit far enough out that the final straight run fits an arrowhead plus a rounded bend.
        return [
            { x: px, y: box.top - gap, anchor: { x: px, y: box.top }, axis: 1 },
            { x: px, y: box.bottom + gap, anchor: { x: px, y: box.bottom }, axis: 1 },
            { x: box.left - gap, y: py, anchor: { x: box.left, y: py }, axis: 0 },
            { x: box.right + gap, y: py, anchor: { x: box.right, y: py }, axis: 0 },
        ];
    };
    const xs = new Set(), ys = new Set();
    expanded.forEach((r) => { xs.add(r.left); xs.add(r.right); ys.add(r.top); ys.add(r.bottom); });
    boxes.forEach((r) => {
        xs.add((r.left + r.right) / 2); ys.add((r.top + r.bottom) / 2);
        for (const key of connections.get(r.name)) {
            const loop = groups.some((group) => group.key === key && group.from === group.to);
            for (const port of [...rawPorts(r, key), ...(loop ? rawPorts(r, key, padding) : [])]) { xs.add(port.x); ys.add(port.y); }
        }
    });
    if (!boxes.length) return {};
    xs.add(Math.min(...expanded.map((r) => r.left)) - 48); xs.add(Math.max(...expanded.map((r) => r.right)) + 48);
    ys.add(Math.min(...expanded.map((r) => r.top)) - 48); ys.add(Math.max(...expanded.map((r) => r.bottom)) + 48);
    const x = [...xs].sort((a, b) => a - b), y = [...ys].sort((a, b) => a - b), columns = x.length;
    const xIndex = new Map(x.map((value, i) => [value, i])), yIndex = new Map(y.map((value, i) => [value, i]));
    const point = (id) => {return { x: x[id % columns], y: y[Math.floor(id / columns)] };};
    const idFor = (p) => yIndex.get(p.y) * columns + xIndex.get(p.x);
    const neighbors = new Map();
    const adjacent = (id) => {
        if (neighbors.has(id)) return neighbors.get(id);
        const col = id % columns, row = Math.floor(id / columns), a = point(id), result = [];
        const candidates = [];
        if (col > 0) candidates.push(id - 1);
        if (col + 1 < columns) candidates.push(id + 1);
        if (row > 0) candidates.push(id - columns);
        if (row + 1 < y.length) candidates.push(id + columns);
        for (const next of candidates) {
            const b = point(next);
            if (segmentClear(a, b, expanded)) result.push({ id: next, length: Math.abs(a.x - b.x) + Math.abs(a.y - b.y), axis: a.x === b.x ? 1 : 0 });
        }
        neighbors.set(id, result);
        return result;
    };
    const boxByName = new Map(boxes.map((r) => [r.name, r]));
    // A long port can land inside a neighbour's clearance (stacked nodes, a stage heading just above).
    // A self-reference has too few usable sides to lose one, so it falls back to the short port on the
    // clearance boundary; other arrows enter from an open side instead of squeezing into a narrow gap.
    const ports = (name, key, fallback = false) => {
        const others = obstacles.filter((box) => box.name !== name);
        const usable = (port) => segmentClear(port.anchor, port, others) &&
            !expanded.some((r) => port.x > r.left && port.x < r.right && port.y > r.top && port.y < r.bottom);
        const short = rawPorts(boxByName.get(name), key, padding);
        return rawPorts(boxByName.get(name), key).map((port, side) => usable(port) || !fallback ? port : short[side]).filter(usable);
    };
    // Segments are remembered per target: arrows into the same schema may share a trunk (a fan-in reads
    // as one bundle), while arrows into different schemas are pushed apart so they stay distinguishable.
    // Parallel relations between the same two schemas never share, or they would read as one arrow.
    const usage = new Map(), targetsBySegment = new Map(), pairsBySegment = new Map(), routes = {};
    for (const group of [...groups].sort((a, b) => a.key.localeCompare(b.key))) {
        if (!positions[group.from] || !positions[group.to]) continue;
        const same = group.from === group.to, pair = `${group.from}\0${group.to}`;
        const starts = same ? ports(group.from, group.key, true).filter((p) => p.axis === 0 && p.x > positions[group.from].x) : ports(group.from, group.key);
        const ends = same ? ports(group.to, group.key, true).filter((p) => p.axis === 1) : ports(group.to, group.key);
        if (!starts.length || !ends.length) continue;
        const targets = new Map(ends.map((p) => [idFor(p), p]));
        const heuristic = (id) => {
            const p = point(id);
            return Math.min(...ends.map((end) => Math.abs(end.x - p.x) + Math.abs(end.y - p.y)));
        };
        const queue = new Queue(), costs = new Map(), previous = new Map(), origins = new Map();
        starts.forEach((port) => {
            const id = idFor(port), state = id * 2 + port.axis;
            costs.set(state, 0); origins.set(state, port);
            queue.push({ state, distance: 0, cost: heuristic(id) });
        });
        let finish;
        while (queue.items.length) {
            const current = queue.pop(), { state, distance } = current;
            if (distance !== costs.get(state)) continue;
            const id = Math.floor(state / 2), axis = state % 2;
            if (targets.has(id)) { finish = state; break; }
            for (const next of adjacent(id)) {
                const nextState = next.id * 2 + next.axis;
                const key = [Math.min(id, next.id), Math.max(id, next.id)].join(':');
                const sharesTrunk = targetsBySegment.get(key)?.has(group.to) && !pairsBySegment.get(key).has(pair);
                const cost = distance + next.length * (sharesTrunk ? 0.6 : 1) + (axis === next.axis ? 0 : 28) + (sharesTrunk ? 0 : (usage.get(key) || 0) * 24);
                if (cost >= (costs.get(nextState) ?? Infinity)) continue;
                costs.set(nextState, cost); previous.set(nextState, state); origins.set(nextState, origins.get(state));
                queue.push({ state: nextState, distance: cost, cost: cost + heuristic(next.id) });
            }
        }
        // A manually dragged node can cover another node or a heading. Do not
        // draw a misleading line through that obstacle when no valid port exists.
        if (finish === undefined) continue;
        const start = origins.get(finish), end = targets.get(Math.floor(finish / 2)), steps = [];
        let state = finish;
        while (state !== undefined) { steps.push(Math.floor(state / 2)); state = previous.get(state); }
        steps.reverse();
        for (let i = 1; i < steps.length; i++) {
            const key = [Math.min(steps[i - 1], steps[i]), Math.max(steps[i - 1], steps[i])].join(':');
            usage.set(key, (usage.get(key) || 0) + 1);
            if (!targetsBySegment.has(key)) { targetsBySegment.set(key, new Set()); pairsBySegment.set(key, new Set()); }
            targetsBySegment.get(key).add(group.to);
            pairsBySegment.get(key).add(pair);
        }
        const raw = [start.anchor, ...steps.map(point), end.anchor];
        const points = [];
        for (const p of raw) {
            if (points.length && p.x === points[points.length - 1].x && p.y === points[points.length - 1].y) continue;
            while (points.length > 1) {
                const a = points[points.length - 2], b = points[points.length - 1];
                if (!((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))) break;
                points.pop();
            }
            points.push(p);
        }
        const last = points[points.length - 1], before = points[points.length - 2];
        const length = Math.hypot(last.x - before.x, last.y - before.y);
        routes[group.key] = { points, d: roundedPath(points), end: last, ux: (last.x - before.x) / length, uy: (last.y - before.y) / length };
    }
    return routes;
}
