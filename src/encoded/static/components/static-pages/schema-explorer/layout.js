export const width = 236,
    height = 66;
export function layout(nodes, groups, viewport) {
    const points = nodes.map((n, i) => {return {
        name: n.name,
        x: Math.cos(i * 2.39996) * Math.sqrt(i + 1) * 190,
        y: Math.sin(i * 2.39996) * Math.sqrt(i + 1) * 150,
        vx: 0,
        vy: 0,
    };});
    const map = new Map(points.map((p) => [p.name, p]));
    const unique = new Map();
    for (const e of groups)
        if (e.from !== e.to && map.has(e.from) && map.has(e.to)) unique.set([e.from, e.to].sort().join('\0'), e);
    // Deterministic spring layout, followed by rectangle collision resolution.
    for (let iteration = 0; iteration < 260; iteration++) {
        const cooling = 1 - iteration / 300;
        for (let i = 0; i < points.length; i++)
            for (let j = i + 1; j < points.length; j++) {
                const a = points[i],
                    b = points[j];
                const dx = a.x - b.x || 0.01,
                    dy = a.y - b.y || 0.01;
                const distance = Math.max(50, Math.hypot(dx, dy));
                const force = Math.min(18, 90000 / (distance * distance));
                a.vx += (dx / distance) * force;
                a.vy += (dy / distance) * force;
                b.vx -= (dx / distance) * force;
                b.vy -= (dy / distance) * force;
            }
        for (const e of unique.values()) {
            const a = map.get(e.from),
                b = map.get(e.to);
            const dx = b.x - a.x,
                dy = b.y - a.y,
                distance = Math.max(1, Math.hypot(dx, dy));
            const force = (distance - 360) * 0.012;
            a.vx += (dx / distance) * force;
            a.vy += (dy / distance) * force;
            b.vx -= (dx / distance) * force;
            b.vy -= (dy / distance) * force;
        }
        for (const p of points) {
            p.vx = (p.vx - p.x * 0.0008) * 0.65;
            p.vy = (p.vy - p.y * 0.0008) * 0.65;
            p.x += Math.max(-25, Math.min(25, p.vx)) * cooling;
            p.y += Math.max(-25, Math.min(25, p.vy)) * cooling;
        }
    }
    for (let pass = 0; pass < 120; pass++) {
        let overlaps = false;
        for (let i = 0; i < points.length; i++)
            for (let j = i + 1; j < points.length; j++) {
                const a = points[i],
                    b = points[j],
                    dx = b.x - a.x,
                    dy = b.y - a.y;
                const overlapX = width + 28 - Math.abs(dx),
                    overlapY = height + 32 - Math.abs(dy);
                if (overlapX <= 0 || overlapY <= 0) continue;
                overlaps = true;
                if (overlapX < overlapY) {
                    const shift = (overlapX / 2 + 1) * (dx >= 0 ? 1 : -1);
                    a.x -= shift;
                    b.x += shift;
                } else {
                    const shift = (overlapY / 2 + 1) * (dy >= 0 ? 1 : -1);
                    a.y -= shift;
                    b.y += shift;
                }
            }
        if (!overlaps) break;
    }
    // Focused networks use compact rows matched to the viewport. Preserve the
    // spring layout's ordering so related nodes remain near one another.
    if (viewport && points.length > 1 && points.length <= 24) {
        let columns = 1, bestScale = 0;
        const cellWidth = width + 90, cellHeight = height + 110;
        for (let count = 1; count <= points.length; count++) {
            const rows = Math.ceil(points.length / count);
            const scale = Math.min(
                viewport.width / ((count - 1) * cellWidth + width + 130),
                viewport.height / ((rows - 1) * cellHeight + height + 155)
            );
            if (scale > bestScale) { columns = count; bestScale = scale; }
        }
        const ordered = [...points].sort((a, b) => a.y - b.y);
        for (let start = 0; start < ordered.length; start += columns) {
            const row = ordered.slice(start, start + columns).sort((a, b) => a.x - b.x);
            row.forEach((point, column) => {
                point.x = (column - (row.length - 1) / 2) * cellWidth;
                point.y = Math.floor(start / columns) * cellHeight;
            });
        }
    }
    return Object.fromEntries(map);
}
