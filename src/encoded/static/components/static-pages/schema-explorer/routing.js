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

// Arrows between panels. Every arrow gets its own point on each panel side, and no two arrows share a line:
// - panels facing each other across a gap get one straight line through their shared span;
// - other pairs run as a Z: out of one panel's side, along their own lane through the gap between the
//   panels, and into the other panel's side (a column gap first, as it is the wider one, then a row gap);
// - panels with another panel between them run around the map's outside on a lane of their own.
// Pairs that fit none of these are returned unrouted for routeEdges.
export function panelRoutes(boxes, groups, { spacing = 30, lane = 26, clearance = 6 } = {}) {
    // Boxes without a size (a point anchor) are not obstacles and cannot be joined.
    const rects = new Map(Object.entries(boxes).filter(([, p]) => [p.x, p.y, p.width, p.height].every(Number.isFinite)).map(([name, p]) => [name, {
        name, left: p.x - p.width / 2, right: p.x + p.width / 2, top: p.y - p.height / 2, bottom: p.y + p.height / 2,
    }]));
    const padded = (r) => {return { left: r.left - clearance, right: r.right + clearance, top: r.top - clearance, bottom: r.bottom + clearance };};
    const taken = new Map(); // `${box}:${side}` → coordinates already used on that side
    const segments = []; // accepted segments, as [a, b]
    const free = (box, side, value) => (taken.get(`${box}:${side}`) || []).every((t) => Math.abs(t - value) >= spacing);
    const take = (box, side, value) => taken.set(`${box}:${side}`, [...(taken.get(`${box}:${side}`) || []), value]);
    // Positions along [low, high], nearest to `preferred` first, kept clear of the side's corners.
    const along = (low, high, preferred, step = 6, inset = 16) => {
        const from = low + inset, to = high - inset;
        if (to < from) return [];
        const values = [];
        for (let v = from; v <= to; v += step) values.push(v);
        const target = Math.min(to, Math.max(from, preferred));
        return values.sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b).slice(0, 14);
    };
    // A new segment may cross others, but never run along one (closer than `lane` and overlapping).
    const runsAlong = ([a, b]) => segments.some(([c, d]) => {
        if (a.y === b.y && c.y === d.y) return Math.abs(a.y - c.y) < lane && Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) > Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
        if (a.x === b.x && c.x === d.x) return Math.abs(a.x - c.x) < lane && Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) > Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
        return false;
    });
    const clear = (points, ends) => {
        const others = [...rects.values()].filter((r) => !ends.includes(r.name)).map(padded);
        const pairs = points.slice(1).map((p, i) => [points[i], p]);
        return pairs.every(([a, b]) => segmentClear(a, b, others) && !runsAlong([a, b]));
    };
    const routes = {};
    const accept = (group, points, ends) => {
        points.slice(1).forEach((p, i) => segments.push([points[i], p]));
        ends.forEach(([box, side, value]) => take(box, side, value));
        const end = points[points.length - 1], before = points[points.length - 2];
        const length = Math.hypot(end.x - before.x, end.y - before.y) || 1;
        routes[group.key] = { points, d: roundedPath(points), end, ux: (end.x - before.x) / length, uy: (end.y - before.y) / length, straight: points.length === 2 };
    };
    const straight = (group, a, b) => {
        if (a.right <= b.left || b.right <= a.left) {
            const forward = a.right <= b.left, [sa, sb] = forward ? ['right', 'left'] : ['left', 'right'];
            const top = Math.max(a.top, b.top), bottom = Math.min(a.bottom, b.bottom);
            for (const y of along(top, bottom, (top + bottom) / 2)) {
                const points = [{ x: a[sa], y }, { x: b[sb], y }];
                if (free(a.name, sa, y) && free(b.name, sb, y) && clear(points, [a.name, b.name])) return accept(group, points, [[a.name, sa, y], [b.name, sb, y]]) || true;
            }
        }
        if (a.bottom <= b.top || b.bottom <= a.top) {
            const forward = a.bottom <= b.top, [sa, sb] = forward ? ['bottom', 'top'] : ['top', 'bottom'];
            const left = Math.max(a.left, b.left), right = Math.min(a.right, b.right);
            for (const x of along(left, right, (left + right) / 2)) {
                const points = [{ x, y: a[sa] }, { x, y: b[sb] }];
                if (free(a.name, sa, x) && free(b.name, sb, x) && clear(points, [a.name, b.name])) return accept(group, points, [[a.name, sa, x], [b.name, sb, x]]) || true;
            }
        }
        return false;
    };
    // The first clear Z through the gap between two panels, across columns (`horizontal`) or rows; null when none.
    const zigzag = (a, b, horizontal) => {
        const [lo, hi] = horizontal ? ['left', 'right'] : ['top', 'bottom'];
        if (!(a[hi] <= b[lo] || b[hi] <= a[lo])) return null;
        const forward = a[hi] <= b[lo], sa = forward ? hi : lo, sb = forward ? lo : hi;
        const gapLow = forward ? a[hi] : b[hi], gapHigh = forward ? b[lo] : a[lo];
        // Across the gap: the lane; along the sides: each end prefers to face the other panel.
        const [cross0, cross1] = horizontal ? ['top', 'bottom'] : ['left', 'right'];
        const mid = (r) => (r[cross0] + r[cross1]) / 2;
        const lanes = along(gapLow, gapHigh, (gapLow + gapHigh) / 2, 6, 18);
        for (const va of along(a[cross0], a[cross1], mid(b))) {
            if (!free(a.name, sa, va)) continue;
            for (const vb of along(b[cross0], b[cross1], va)) {
                if (vb === va || !free(b.name, sb, vb)) continue;
                for (const c of lanes) {
                    const points = horizontal
                        ? [{ x: a[sa], y: va }, { x: c, y: va }, { x: c, y: vb }, { x: b[sb], y: vb }]
                        : [{ x: va, y: a[sa] }, { x: va, y: c }, { x: vb, y: c }, { x: vb, y: b[sb] }];
                    if (clear(points, [a.name, b.name])) return { points, ends: [[a.name, sa, va], [b.name, sb, vb]] };
                }
            }
        }
        return null;
    };
    // How many accepted arrows a new route would cross.
    const crossings = (points) => points.slice(1).reduce((count, q, i) => {
        const p = points[i];
        return count + segments.filter(([c, d]) => {
            const [h, v] = p.y === q.y ? [[p, q], [c, d]] : [[c, d], [p, q]];
            if (h[0].y !== h[1].y || v[0].x !== v[1].x) return false;
            return v[0].x > Math.min(h[0].x, h[1].x) && v[0].x < Math.max(h[0].x, h[1].x) && h[0].y > Math.min(v[0].y, v[1].y) && h[0].y < Math.max(v[0].y, v[1].y);
        }).length;
    }, 0);
    const length = (points) => points.slice(1).reduce((sum, p, i) => sum + Math.abs(p.x - points[i].x) + Math.abs(p.y - points[i].y), 0);
    // Panels with another panel between them: out of the same side of both, along a lane just outside the map.
    const around = (group, a, b) => {
        const all = [...rects.values()];
        const options = [];
        for (const side of ['left', 'right', 'top', 'bottom']) {
            const horizontal = side === 'left' || side === 'right', outward = side === 'left' || side === 'top' ? -1 : 1;
            const edge = outward < 0 ? Math.min(...all.map((r) => r[side])) : Math.max(...all.map((r) => r[side]));
            const [cross0, cross1] = horizontal ? ['top', 'bottom'] : ['left', 'right'];
            for (let n = 0; n < 6; n++) {
                const outer = edge + outward * (24 + n * lane);
                for (const va of along(a[cross0], a[cross1], (b[cross0] + b[cross1]) / 2).slice(0, 6)) {
                    if (!free(a.name, side, va)) continue;
                    const vb = along(b[cross0], b[cross1], va).find((v) => free(b.name, side, v) && (a.name !== b.name || v !== va));
                    if (vb === undefined) continue;
                    const points = horizontal
                        ? [{ x: a[side], y: va }, { x: outer, y: va }, { x: outer, y: vb }, { x: b[side], y: vb }]
                        : [{ x: va, y: a[side] }, { x: va, y: outer }, { x: vb, y: outer }, { x: vb, y: b[side] }];
                    if (!clear(points, [a.name, b.name])) continue;
                    options.push({ points, length: length(points), ends: [[a.name, side, va], [b.name, side, vb]] });
                    break;
                }
                if (options.some((o) => o.ends[0][1] === side)) break;
            }
        }
        if (!options.length) return false;
        const best = options.sort((x, y) => x.length - y.length)[0];
        accept(group, best.points, best.ends);
        return true;
    };
    const ordered = [...groups].filter((g) => rects.has(g.from) && rects.has(g.to) && g.from !== g.to).sort((x, y) => x.key.localeCompare(y.key));
    // Straight arrows claim the middle of their sides first; the others fit around them.
    const rest = ordered.filter((g) => !straight(g, rects.get(g.from), rects.get(g.to)));
    for (const g of rest) {
        const a = rects.get(g.from), b = rects.get(g.to);
        // Of the two Z shapes, the one crossing fewer arrows (then the shorter) is drawn.
        const [best] = [zigzag(a, b, true), zigzag(a, b, false)].filter(Boolean)
            .sort((x, y) => crossings(x.points) - crossings(y.points) || length(x.points) - length(y.points));
        if (best) accept(g, best.points, best.ends); else around(g, a, b);
    }
    return routes;
}
