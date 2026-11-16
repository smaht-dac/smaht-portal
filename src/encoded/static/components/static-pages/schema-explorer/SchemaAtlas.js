import React, { useEffect, useMemo, useRef, useState } from 'react';
import { domains, domainFor, abstractTypes } from './domains';
import { width as cardWidth, height as cardHeight } from './layout';
import { routeEdges } from './routing';
import { researchLabels } from './research-map';
import { groupRelationships, sharedRelationships } from './relationship-view';
import { nodePresentation } from './node-presentation';

// Every schema as one network, drawn like a schema's own map: the same cards and labelled, routed arrows, at a
// readable scale on a large canvas, with a minimap in the corner showing where the view is. Groups are columns
// along the donor-to-data path. Arrows follow the group maps' default: stored links, a reference inherited by
// subtypes drawn once from its base. Calculated links and links to admin, content and ontology schemas come on request.
const order = ['donors', 'samples', 'sequencing', 'files', 'workflows', 'administrative'];
const columnGap = 300, rowGap = 40, head = 56, margin = 48;
export const adminGroup = 'administrative';
const colors = { linkTo: '#2368aa', calculated: '#7952a3' };

// Cards in each column are ordered by where their linked cards sit in the other columns (a few barycentre sweeps),
// so most arrows run across rather than up and down; ties keep alphabetical order.
export function atlasLayout(index, groups) {
    const columns = [...order, ...domains.map((d) => d.id).filter((id) => !order.includes(id))]
        .map((id) => { return { id, label: domains.find((d) => d.id === id)?.label || id, names: index.models.filter((m) => domainFor(m.name) === id).map((m) => m.name).sort((a, b) => a.localeCompare(b)) }; })
        .filter((column) => column.names.length);
    const neighbours = new Map();
    for (const g of groups) {
        if (!neighbours.has(g.from)) neighbours.set(g.from, []);
        if (!neighbours.has(g.to)) neighbours.set(g.to, []);
        neighbours.get(g.from).push(g.to);
        neighbours.get(g.to).push(g.from);
    }
    const rank = new Map();
    const setRanks = () => columns.forEach((column) => column.names.forEach((name, i) => rank.set(name, i)));
    setRanks();
    for (let sweep = 0; sweep < 4; sweep++) {
        for (const column of columns) {
            const own = new Set(column.names);
            const centre = (name) => {
                const others = (neighbours.get(name) || []).filter((other) => !own.has(other));
                return others.length ? others.reduce((sum, other) => sum + rank.get(other), 0) / others.length : rank.get(name);
            };
            const keys = new Map(column.names.map((name) => [name, centre(name)]));
            column.names.sort((a, b) => keys.get(a) - keys.get(b) || a.localeCompare(b));
        }
        setRanks();
    }
    const tallest = Math.max(...columns.map((column) => column.names.length));
    const positions = {}, titles = [];
    columns.forEach((column, i) => {
        const x = margin + i * (cardWidth + columnGap) + cardWidth / 2;
        // Every column starts at the top, so the group names read as one row across the map.
        const offset = 0;
        titles.push({ id: column.id, label: column.label, count: column.names.length, left: x - cardWidth / 2, top: margin + offset, width: cardWidth });
        column.names.forEach((name, n) => {
            positions[name] = { x, y: margin + offset + head + n * (cardHeight + rowGap) + cardHeight / 2 };
        });
    });
    return {
        positions, titles,
        width: margin * 2 + columns.length * cardWidth + (columns.length - 1) * columnGap,
        height: margin * 2 + head + tallest * (cardHeight + rowGap) - rowGap,
    };
}

// The arrows shown: stored links (and calculated ones on request), admin links on request, inherited ones lifted.
export function atlasGroups(index, { calculated, admin }) {
    const names = new Set(index.models.map((m) => m.name));
    const edges = index.edges.filter((e) => (e.kind === 'linkTo' || (calculated && e.kind === 'calculated'))
        && e.from !== e.to && names.has(e.from) && names.has(e.to)
        && (admin || (domainFor(e.from) !== adminGroup && domainFor(e.to) !== adminGroup)));
    return sharedRelationships(index, groupRelationships(edges), names).groups;
}

const caption = (g) => {
    const fields = [...new Set(g.edges.map((e) => e.field.replaceAll('[]', '')))];
    return fields.length > 1 ? `${fields.length} fields` : fields[0];
};
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export default function SchemaAtlas({ index, query, onOpen }) {
    const [show, setShow] = useState({ calculated: false, admin: false });
    // The order of cards depends on the default arrows only, so turning more on does not move the cards.
    const baseGroups = useMemo(() => atlasGroups(index, { calculated: false, admin: false }), [index]);
    const atlas = useMemo(() => atlasLayout(index, baseGroups), [index, baseGroups]);
    const groups = useMemo(() => (show.calculated || show.admin ? atlasGroups(index, show) : baseGroups), [index, show, baseGroups]);
    const routes = useMemo(() => routeEdges(atlas.positions, groups, cardWidth, cardHeight, [], { spreadPorts: true }), [atlas, groups]);
    const labels = useMemo(() => researchLabels({
        nodes: Object.keys(atlas.positions).map((id) => { return { id }; }), positions: atlas.positions, nodeWidth: cardWidth, nodeHeight: cardHeight,
        edges: groups.map((g) => { return { key: g.key, label: caption(g) }; }),
    }, routes, { avoidRoutes: true, extra: atlas.titles.map((t) => { return { left: t.left, top: t.top, width: t.width, height: 30 }; }) }), [atlas, groups, routes]);
    const presentation = useMemo(() => Object.fromEntries(index.models.map((m) => [m.name, nodePresentation(m.name, m, { isAbstract: abstractTypes.has(m.name) })])), [index]);
    const [hover, setHover] = useState(null), [selected, setSelected] = useState('');
    const [size, setSize] = useState({ width: 1000, height: 600 });
    const [camera, setCamera] = useState(null);
    const svg = useRef(), drag = useRef(), minimapDrag = useRef(false);
    useEffect(() => {
        const element = svg.current;
        if (!element) return undefined;
        const measure = () => setSize({ width: element.clientWidth || 1000, height: element.clientHeight || 600 });
        measure();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        observer?.observe(element);
        return () => observer?.disconnect();
    }, []);
    const fitScale = Math.min(size.width / atlas.width, size.height / atlas.height, 1);
    // Opens near the scale of a schema's own map, at the start of the path: the first group's title at the top left.
    const start = () => {
        const first = atlas.titles[0], scale = 0.9;
        return { scale, x: -(first.left - 24) * scale, y: -(first.top - 16) * scale };
    };
    useEffect(() => { setCamera((c) => c || start()); }, [atlas]);
    const view = camera || start();
    const zoom = (factor, cx = size.width / 2, cy = size.height / 2) => setCamera((c) => {
        const current = c || view, scale = clamp(current.scale * factor, Math.min(0.2, fitScale), 2);
        const k = scale / current.scale;
        return { scale, x: cx - (cx - current.x) * k, y: cy - (cy - current.y) * k };
    });
    useEffect(() => {
        const element = svg.current;
        if (!element) return undefined;
        const wheel = (e) => {
            e.preventDefault();
            const rect = element.getBoundingClientRect();
            zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - rect.left, e.clientY - rect.top);
        };
        element.addEventListener('wheel', wheel, { passive: false });
        return () => element.removeEventListener('wheel', wheel);
    }, [size, fitScale]);
    // The view moves to a point, but stays on the map: a larger frame is centred, a smaller one stops at its edges.
    const lookAt = (x, y, scale = view.scale) => {
        const place = (centre, span, extent) => (extent * scale <= span ? (span - extent * scale) / 2
            : clamp(span / 2 - centre * scale, span - extent * scale, 0));
        setCamera({ scale, x: place(x, size.width, atlas.width), y: place(y, size.height, atlas.height) });
    };
    const needle = query.trim().toLowerCase();
    const matches = needle ? Object.keys(atlas.positions).filter((name) => name.toLowerCase().includes(needle)) : [];
    // A search that finds one schema brings it into view.
    useEffect(() => {
        if (matches.length === 1) { const p = atlas.positions[matches[0]]; lookAt(p.x, p.y); }
    }, [matches.length === 1 && matches[0]]);
    // Tracing: a pointed-at arrow, or every arrow of the pointed-at or chosen schema.
    const focusName = hover?.node || (!hover && selected);
    const traced = useMemo(() => {
        if (hover?.edge) return new Set([hover.edge]);
        if (!focusName) return null;
        return new Set(groups.filter((g) => g.from === focusName || g.to === focusName || g.edges.some((e) => e.from === focusName)).map((g) => g.key));
    }, [hover, focusName, groups]);
    const ends = useMemo(() => {
        if (!traced) return null;
        const set = new Set(focusName ? [focusName] : []);
        groups.filter((g) => traced.has(g.key)).forEach((g) => { set.add(g.from); set.add(g.to); });
        return set;
    }, [traced, groups, focusName]);
    const selectedLinks = selected ? groups.filter((g) => g.from === selected || g.to === selected || g.edges.some((e) => e.from === selected)) : [];
    const frame = { x: -view.x / view.scale, y: -view.y / view.scale, width: size.width / view.scale, height: size.height / view.scale };
    const mini = { width: 240 }, miniScale = mini.width / atlas.width;
    mini.height = atlas.height * miniScale;
    const fromMinimap = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        lookAt((event.clientX - rect.left) / miniScale, (event.clientY - rect.top) / miniScale);
    };
    const choose = (name) => setSelected(selected === name ? '' : name);
    const dash = (g) => (g.kind === 'calculated' ? 'calculated' : 'linkTo');
    return (
        <div className="se-atlas">
            <div className="se-atlas-bar">
                <p className="se-atlas-status" role="status">
                    {selected ? (
                        <>
                            <strong>{selected}</strong> · {selectedLinks.length} {selectedLinks.length === 1 ? 'arrow' : 'arrows'}
                            <button type="button" className="se-text-link" onClick={() => onOpen(selected)}>Open its connections ›</button>
                            <button type="button" className="se-text-link" onClick={() => setSelected('')}>Clear</button>
                        </>
                    ) : 'Drag to move around, or use the minimap. Point at a schema to trace its arrows; click to keep them.'}
                </p>
                <div className="se-atlas-options" role="group" aria-label="Arrows shown">
                    <label><input type="checkbox" checked={show.calculated} onChange={(e) => setShow({ ...show, calculated: e.target.checked })} /> Calculated links</label>
                    <label><input type="checkbox" checked={show.admin} onChange={(e) => setShow({ ...show, admin: e.target.checked })} /> Admin &amp; ontology links</label>
                </div>
                <div className="se-zoom-controls" role="group" aria-label="Zoom controls">
                    <button type="button" onClick={() => setCamera({ scale: fitScale, x: (size.width - atlas.width * fitScale) / 2, y: (size.height - atlas.height * fitScale) / 2 })}>Fit all</button>
                    <button type="button" aria-label="Zoom out" onClick={() => zoom(0.8)}>−</button>
                    <span>{Math.round(view.scale * 100)}%</span>
                    <button type="button" aria-label="Zoom in" onClick={() => zoom(1.25)}>+</button>
                </div>
            </div>
            <div className="se-atlas-stage">
                <svg ref={svg} id="atlas-svg" className={`se-canvas se-atlas-canvas${traced ? ' se-atlas-tracing' : ''}`} role="group" aria-label="Map of all schemas"
                    onPointerDown={(e) => {
                        if (e.target.closest?.('.entity-node, .se-edge, .se-edge-label')) return;
                        drag.current = { x: e.clientX, y: e.clientY, camera: view, moved: false };
                        e.currentTarget.setPointerCapture?.(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                        const d = drag.current;
                        if (!d) return;
                        if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
                        setCamera({ ...d.camera, x: d.camera.x + e.clientX - d.x, y: d.camera.y + e.clientY - d.y });
                    }}
                    onPointerUp={() => {
                        if (drag.current && !drag.current.moved) setSelected('');
                        drag.current = null;
                    }}
                    onKeyDown={(e) => { if (e.key === 'Escape') setSelected(''); }}>
                    <defs>
                        {Object.entries(colors).map(([kind, color]) => (
                            <marker key={kind} id={`atlas-arrow-${kind}`} viewBox="0 0 10 8" refX="10" refY="4"
                                markerWidth="10" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
                                <path d="M0,0 L10,4 L0,8 Z" fill={color} />
                            </marker>
                        ))}
                    </defs>
                    <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
                        {atlas.titles.map((title) => (
                            <text key={title.id} className="se-atlas-column-title" x={title.left} y={title.top + 20}>
                                {title.label}<tspan className="se-atlas-count">{`  ${title.count}`}</tspan>
                            </text>
                        ))}
                        {groups.map((g) => {
                            const route = routes[g.key], label = labels[g.key];
                            if (!route) return null;
                            const on = traced?.has(g.key);
                            const name = `${g.from} to ${g.to}: ${caption(g)}`;
                            return (
                                <g key={g.key} className={traced ? (on ? 'se-atlas-on' : 'se-atlas-off') : ''}>
                                    <path className={`se-edge ${dash(g)}${on ? ' se-traced-edge' : ''}`} d={route.d} markerEnd={`url(#atlas-arrow-${dash(g)})`}
                                        tabIndex={0} role="button" aria-label={name}
                                        onMouseEnter={() => setHover({ edge: g.key })} onMouseLeave={() => setHover(null)}
                                        onFocus={() => setHover({ edge: g.key })} onBlur={() => setHover(null)}>
                                        <title>{`${name}${g.shared ? ` (defined on ${g.from}, used by ${new Set(g.edges.map((e) => e.from)).size} subtypes)` : ''}`}</title>
                                    </path>
                                    {label && <text className="se-edge-label" x={label.left + label.width / 2} y={label.top + 15}>{caption(g)}</text>}
                                </g>
                            );
                        })}
                        {Object.entries(atlas.positions).map(([name, p]) => {
                            const look = presentation[name] || nodePresentation(name, null);
                            const dim = (ends && !ends.has(name)) || (needle && !name.toLowerCase().includes(needle));
                            return (
                                <g key={name} data-schema={name} transform={`translate(${p.x - cardWidth / 2},${p.y - cardHeight / 2})`}
                                    className={`entity-node${look.isAbstract ? ' se-node-abstract' : ''}${selected === name ? ' selected' : ''}${dim ? ' se-dim' : ''}`}
                                    tabIndex={0} role="button" aria-label={name} aria-pressed={selected === name}
                                    onPointerEnter={() => setHover({ node: name })} onPointerLeave={() => setHover(null)}
                                    onFocus={() => setHover({ node: name })} onBlur={() => setHover(null)}
                                    onClick={() => choose(name)} onDoubleClick={() => onOpen(name)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') onOpen(name); else if (e.key === ' ') { e.preventDefault(); choose(name); } }}>
                                    <title>{`${name}: ${look.description}`}</title>
                                    <rect className="se-node-body" width={cardWidth} height={cardHeight} rx={4} />
                                    <text className="se-node-title" x="12" y="26">{name}</text>
                                    <text className="se-subtitle" x="12" y="49">{look.caption}</text>
                                    {look.isAbstract && (
                                        <g aria-hidden="true">
                                            <rect className="se-node-abstract-badge" x={cardWidth - 65} y="9" width="54" height="16" rx="4" />
                                            <text className="se-node-abstract-label" x={cardWidth - 38} y="20">Abstract</text>
                                        </g>
                                    )}
                                </g>
                            );
                        })}
                    </g>
                </svg>
                {/* aria-hidden: the minimap repeats the canvas for orientation; dragging, zoom and search do the same. */}
                <svg className="se-atlas-minimap" width={mini.width} height={mini.height} viewBox={`0 0 ${atlas.width} ${atlas.height}`} aria-hidden="true"
                    onPointerDown={(e) => { minimapDrag.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); fromMinimap(e); }}
                    onPointerMove={(e) => { if (minimapDrag.current) fromMinimap(e); }}
                    onPointerUp={() => { minimapDrag.current = false; }}>
                    <rect width={atlas.width} height={atlas.height} className="se-atlas-mini-bg" />
                    {groups.map((g) => routes[g.key] && <path key={g.key} d={routes[g.key].d} className={`se-atlas-mini-edge${traced?.has(g.key) ? ' se-atlas-mini-on' : ''}`} />)}
                    {Object.entries(atlas.positions).map(([name, p]) => (
                        <rect key={name} x={p.x - cardWidth / 2} y={p.y - cardHeight / 2} width={cardWidth} height={cardHeight}
                            className={`se-atlas-mini-card${name === focusName ? ' se-atlas-mini-current' : ends?.has(name) ? ' se-atlas-mini-linked' : ''}${matches.includes(name) ? ' se-atlas-mini-match' : ''}`} />
                    ))}
                    <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} className="se-atlas-mini-frame" />
                </svg>
            </div>
        </div>
    );
}
