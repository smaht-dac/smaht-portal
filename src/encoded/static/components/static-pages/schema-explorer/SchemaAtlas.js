import React, { useEffect, useMemo, useRef, useState } from 'react';
import { domains, domainFor, hierarchicalLayout, abstractTypes } from './domains';
import { width as cardWidth, height as cardHeight } from './layout';
import { routeEdges } from './routing';
import { researchLabels, concepts } from './research-map';
import { groupRelationships, sharedRelationships } from './relationship-view';
import { nodePresentation, stageAccent } from './node-presentation';
import { exportPNG } from './shared';

// Every schema as one network, drawn like the group maps: each group laid out exactly as its own group map (its
// stage panels, the same cards and labelled, routed arrows), the groups placed along the donor-to-data path, at a
// readable scale on a large canvas with a minimap in the corner. Most links stay inside a group, so a group's own
// layout keeps them short. Arrows follow the group maps' default: stored links, a reference inherited by subtypes
// drawn once from its base. Calculated links and links to admin, content and ontology schemas come on request.
// The path runs along the top row and turns down into files, under sequencing; workflows run on files, and admin
// and ontology schemas, used by every group, sit apart in the corner.
const slots = { donors: [0, 0], samples: [1, 0], sequencing: [2, 0], files: [2, 1], workflows: [1, 1], administrative: [0, 1] };
const blockGap = { x: 200, y: 160 }, margin = 40;
export const adminGroup = 'administrative';
const colors = { linkTo: '#2368aa', calculated: '#7952a3' };

export function atlasLayout(index) {
    const blocks = domains.map((domain) => {
        const nodes = index.models.filter((m) => domainFor(m.name) === domain.id).map((m) => { return { name: m.name }; });
        if (!nodes.length) return null;
        // The group map's own layout, sized for a wide screen like the one it is read on.
        const layout = hierarchicalLayout(nodes, cardWidth, cardHeight, index.edges, { width: 1300, height: 900 }, concepts, { gap: 96, columnGap: 140 });
        const frame = layout.frames[0];
        return { id: domain.id, label: domain.label, layout, width: frame.width, height: frame.height, count: frame.count };
    }).filter(Boolean);
    let spare = 0;
    blocks.forEach((block) => { [block.column, block.row] = slots[block.id] || [spare++, 2]; });
    const columnWidths = [], rowHeights = [];
    blocks.forEach((b) => {
        columnWidths[b.column] = Math.max(columnWidths[b.column] || 0, b.width);
        rowHeights[b.row] = Math.max(rowHeights[b.row] || 0, b.height);
    });
    const sum = (list, n, gap) => list.slice(0, n).reduce((total, size) => total + (size || 0) + gap, 0);
    const positions = {}, frames = [], layers = [];
    for (const block of blocks) {
        const dx = margin + sum(columnWidths, block.column, blockGap.x), dy = margin + sum(rowHeights, block.row, blockGap.y);
        for (const [name, p] of Object.entries(block.layout.positions)) positions[name] = { x: p.x + dx, y: p.y + dy };
        for (const layer of block.layout.layers) {
            layers.push({ ...layer, left: layer.left + dx, top: layer.top + dy, panel: { ...layer.panel, left: layer.panel.left + dx, top: layer.panel.top + dy } });
        }
        frames.push({ id: block.id, label: block.label, count: block.count, left: dx, top: dy, width: block.width, height: block.height });
    }
    // Arrows between two groups go around the other groups (`regions`), along lanes through the gaps between them.
    const regionPad = 12, laneStep = 16;
    const lanesIn = (from, to) => {
        const list = [];
        for (let v = from + regionPad + laneStep; v <= to - regionPad - laneStep; v += laneStep) list.push(v);
        return list;
    };
    const gapLanes = (sizes, gap) => sizes.slice(0, -1).flatMap((size, i) => {
        const end = margin + sum(sizes, i, gap) + (size || 0);
        return lanesIn(end, end + gap);
    });
    return {
        positions, frames, layers,
        regions: frames.map((f) => { return { id: f.id, left: f.left - regionPad, right: f.left + f.width + regionPad, top: f.top - regionPad, bottom: f.top + f.height + regionPad }; }),
        lanes: { x: gapLanes(columnWidths, blockGap.x), y: gapLanes(rowHeights, blockGap.y) },
        // Arrows keep clear of group and panel titles, as on a group map.
        headings: [...frames.map((f) => { return { left: f.left + 18, top: f.top + 12, width: Math.min(f.width - 36, f.label.length * 15 + 12), height: 38 }; }), ...layers],
        width: margin * 2 + sum(columnWidths, columnWidths.length, blockGap.x) - blockGap.x,
        height: margin * 2 + sum(rowHeights, rowHeights.length, blockGap.y) - blockGap.y,
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

// An arrow is named by its field; one carrying several names the first and counts the rest.
const fieldsOf = (g) => [...new Set(g.edges.map((e) => e.field.replaceAll('[]', '')))].sort();
const caption = (g) => {
    const fields = fieldsOf(g);
    return fields.length > 1 ? `${fields[0]} +${fields.length - 1}` : fields[0];
};
// Arrows of one field into one card (reference_genome from five file types) form a fan-in: they share the card's
// port, so their last run is one trunk, and that trunk carries the field's name once.
export function fanIns(groups) {
    const byTarget = new Map();
    for (const g of groups) {
        const key = `${g.to}|${fieldsOf(g).join(',')}|${g.kind}`;
        if (!byTarget.has(key)) byTarget.set(key, []);
        byTarget.get(key).push(g);
    }
    const bundles = new Map();
    for (const [key, members] of byTarget) if (members.length > 1) members.forEach((g) => bundles.set(g.key, { key, lead: members[0].key, size: members.length }));
    return bundles;
}
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export default function SchemaAtlas({ index, query, onOpen }) {
    const [show, setShow] = useState({ calculated: false, admin: false });
    // Cards stay where they are when more arrows are turned on.
    const atlas = useMemo(() => atlasLayout(index), [index]);
    const groups = useMemo(() => atlasGroups(index, show), [index, show]);
    const bundles = useMemo(() => fanIns(groups), [groups]);
    // Widely used schemas (referenced by five or more): arrows into them carry little beyond "used everywhere" and
    // cross the whole map, so they are drawn only while traced; the referring card names them in a short tag.
    const hubs = useMemo(() => {
        const sources = new Map();
        groups.forEach((g) => { if (!sources.has(g.to)) sources.set(g.to, new Set()); sources.get(g.to).add(g.from); });
        return new Map([...sources].filter(([, from]) => from.size >= 5).map(([name, from]) => [name, from.size]));
    }, [groups]);
    const hubbed = (g) => hubs.has(g.to);
    const crosses = (g) => domainFor(g.from) !== domainFor(g.to);
    // Each card's arrows into widely used schemas, named under the card.
    const hubTags = useMemo(() => {
        const tags = new Map();
        groups.filter(hubbed).forEach((g) => {
            const from = new Set([g.from, ...g.edges.map((e) => e.from)]);
            from.forEach((name) => { if (!tags.has(name)) tags.set(name, new Set()); tags.get(name).add(g.to); });
        });
        return tags;
    }, [groups, hubs]);
    // The tags are text under cards, so arrows and labels keep off them like they keep off titles.
    const tagText = (name) => `→ ${clip([...hubTags.get(name)].sort().join(', '), 34)}`;
    const obstacles = useMemo(() => [...atlas.headings, ...[...hubTags.keys()].filter((name) => atlas.positions[name]).map((name) => {
        const p = atlas.positions[name];
        return { left: p.x - cardWidth / 2, top: p.y + cardHeight / 2 + 2, width: tagText(name).length * 6 + 8, height: 16 };
    })], [atlas, hubTags]);
    const routes = useMemo(() => {
        const route = (list, extra = {}) => routeEdges(atlas.positions, list, cardWidth, cardHeight, obstacles, { spreadPorts: true, regions: atlas.regions, regionOf: domainFor, lanes: atlas.lanes,
            portKey: (g, name) => (name === g.to && bundles.has(g.key) ? `fan:${bundles.get(g.key).key}` : g.key), ...extra });
        // Arrows inside a group are laid out first, as on its own map; arrows between groups keep off their lines,
        // and arrows into widely used schemas keep off both.
        const segments = (routed) => Object.values(routed).flatMap((r) => r.points.slice(1).map((b, i) => [r.points[i], b]));
        const inner = route(groups.filter((g) => !hubbed(g) && !crosses(g)));
        const main = { ...inner, ...route(groups.filter((g) => !hubbed(g) && crosses(g)), { avoid: segments(inner) }) };
        const result = { ...main, ...route(groups.filter(hubbed), { avoid: segments(main) }) };
        // A fan-in's name goes on its shared trunk: the run nearest the card that is long enough to hold it.
        for (const [key, bundle] of bundles) {
            const r = result[key], g = groups.find((group) => group.key === key);
            if (bundle.lead !== key || !r || !g) continue;
            const room = caption(g).length * 5.8 + 24;
            for (let i = r.points.length - 2; i >= 0; i--) {
                const a = r.points[i], b = r.points[i + 1];
                if (Math.hypot(b.x - a.x, b.y - a.y) >= room) { result[key] = { ...r, labelRun: i }; break; }
            }
        }
        return result;
    }, [atlas, groups, bundles, hubs, obstacles]);
    const labels = useMemo(() => {
        const graph = (list) => { return {
            nodes: Object.keys(atlas.positions).map((id) => { return { id }; }), positions: atlas.positions, nodeWidth: cardWidth, nodeHeight: cardHeight,
            edges: list.filter((g) => !bundles.has(g.key) || bundles.get(g.key).lead === g.key).map((g) => { return { key: g.key, label: caption(g) }; }),
        }; };
        const main = researchLabels(graph(groups.filter((g) => !hubbed(g))), routes, { avoidRoutes: true, extra: obstacles });
        // Labels of the hidden arrows are placed clear of the shown ones, for when they are traced.
        return { ...main, ...researchLabels(graph(groups.filter(hubbed)), routes, { extra: [...obstacles, ...Object.values(main)] }) };
    }, [atlas, groups, routes, bundles, hubs, obstacles]);
    const presentation = useMemo(() => Object.fromEntries(index.models.map((m) => [m.name, nodePresentation(m.name, m, { isAbstract: abstractTypes.has(m.name) })])), [index]);
    const [hover, setHover] = useState(null), [selected, setSelected] = useState('');
    const [size, setSize] = useState({ width: 1000, height: 600 });
    const [camera, setCamera] = useState(null);
    // Full screen, as on a schema's map: the canvas takes the window; Escape or the button leaves it.
    const [full, setFull] = useState(false);
    const [exporting, setExporting] = useState(false), [error, setError] = useState('');
    useEffect(() => {
        if (!full) return undefined;
        const escape = (e) => { if (e.key === 'Escape') setFull(false); };
        document.addEventListener('keydown', escape);
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', escape);
            document.body.style.overflow = previous;
        };
    }, [full]);
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
    // Opens near the scale of a group map, at the start of the path: the first group at the top left.
    const start = () => {
        const first = atlas.frames[0], scale = 0.85;
        return { scale, x: -(first.left - 8) * scale, y: -(first.top - 8) * scale };
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
    const mini = { width: 200 }, miniScale = mini.width / atlas.width;
    mini.height = atlas.height * miniScale;
    const fromMinimap = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        lookAt((event.clientX - rect.left) / miniScale, (event.clientY - rect.top) / miniScale);
    };
    // An arrow the router finds no clear lane for is still drawn, as a plain curve between the facing card sides.
    const fallback = (g) => {
        const a = atlas.positions[g.from], b = atlas.positions[g.to], right = b.x >= a.x ? 1 : -1;
        const ax = a.x + (right * cardWidth) / 2, bx = b.x - (right * cardWidth) / 2, dx = Math.max(60, Math.abs(bx - ax) / 2) * right;
        return { d: `M${ax},${a.y} C${ax + dx},${a.y} ${bx - dx},${b.y} ${bx},${b.y}` };
    };
    const choose = (name) => setSelected(selected === name ? '' : name);
    const dash = (g) => (g.kind === 'calculated' ? 'calculated' : 'linkTo');
    return (
        <div className={`se-atlas${full ? ' se-fullscreen' : ''}`}>
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
                <div className="se-map-tool-section" role="group" aria-label="Canvas controls">
                    <div className="se-zoom-controls" role="group" aria-label="Zoom controls">
                        <button type="button" onClick={() => setCamera({ scale: fitScale, x: (size.width - atlas.width * fitScale) / 2, y: (size.height - atlas.height * fitScale) / 2 })}>Fit all</button>
                        <button type="button" aria-label="Zoom out" onClick={() => zoom(0.8)}>−</button>
                        <span>{Math.round(view.scale * 100)}%</span>
                        <button type="button" aria-label="Zoom in" onClick={() => zoom(1.25)}>+</button>
                    </div>
                    {/* Exports the whole map, whatever part of it is in view. */}
                    <button type="button" id="atlas-export" disabled={exporting} onClick={async () => {
                        setExporting(true);
                        setError('');
                        try { await exportPNG(svg.current, 'all-schemas-map'); }
                        catch (err) { setError(err.message || 'PNG export failed.'); }
                        finally { setExporting(false); }
                    }}>{exporting ? 'Exporting…' : 'Export PNG'}
                    </button>
                </div>
            </div>
            {error && <p role="alert">{error}</p>}
            <div className="se-atlas-stage">
                <button type="button" className="se-canvas-fullscreen" id="atlas-fullscreen" aria-label={full ? 'Exit full screen' : 'Enter full screen'}
                    title={full ? 'Exit full screen' : 'Enter full screen'} aria-pressed={full} onClick={() => setFull(!full)}>
                    <i className={`icon icon-fw fas ${full ? 'icon-compress-alt' : 'icon-expand-alt'}`} aria-hidden="true" />
                </button>
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
                    <g data-world="" transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
                        {atlas.frames.map((frame) => (
                            <g key={frame.id} className="se-domain-frame se-atlas-frame">
                                <rect x={frame.left} y={frame.top} width={frame.width} height={frame.height} rx="4" />
                                <text x={frame.left + 24} y={frame.top + 38}>
                                    {frame.label}<tspan className="se-domain-count" dx="10">{frame.count} schemas</tspan>
                                </text>
                            </g>
                        ))}
                        {atlas.layers.map((layer) => (
                            <rect key={`panel-${layer.id}`} className="se-stage-panel" x={layer.panel.left} y={layer.panel.top} width={layer.panel.width} height={layer.panel.height} rx="4" />
                        ))}
                        {atlas.layers.map((layer) => (
                            <g key={layer.id}>
                                <circle cx={layer.left + 3} cy={layer.top + 12} r="3" fill={stageAccent(layer.id.slice(layer.domain.length + 1))} aria-hidden="true" />
                                <text className="se-stage-label" x={layer.left + 12} y={layer.top + 18}>{layer.label}</text>
                            </g>
                        ))}
                        {groups.map((g) => {
                            const route = routes[g.key] || fallback(g), label = labels[g.key];
                            const on = traced?.has(g.key), cross = crosses(g);
                            if (hubbed(g) && !on) return null;
                            const name = `${g.from} to ${g.to}: ${fieldsOf(g).join(', ')}`;
                            return (
                                <g key={g.key} className={`${traced ? (on ? 'se-atlas-on' : 'se-atlas-off') : ''}${cross ? ' se-atlas-cross' : ''}`}>
                                    <path className={`se-edge ${dash(g)}${on ? ' se-traced-edge' : ''}`} d={route.d} markerEnd={`url(#atlas-arrow-${dash(g)})`}
                                        tabIndex={0} role="button" aria-label={name}
                                        onMouseEnter={() => setHover({ edge: g.key })} onMouseLeave={() => setHover(null)}
                                        onFocus={() => setHover({ edge: g.key })} onBlur={() => setHover(null)}>
                                        <title>{`${name}${g.shared ? ` (defined on ${g.from}, used by ${new Set(g.edges.map((e) => e.from)).size} subtypes)` : ''}`}</title>
                                    </path>
                                </g>
                            );
                        })}
                        {/* Labels over every line, so no later arrow is drawn across one. */}
                        <g className="se-atlas-labels">
                            {groups.map((g) => {
                                const label = labels[g.key], on = traced?.has(g.key);
                                // A faint arrow between groups is named only while traced.
                                if (!label || ((hubbed(g) || crosses(g)) && !on)) return null;
                                return <text key={g.key} className={`se-edge-label${traced && !on ? ' se-atlas-label-off' : ''}`} x={label.left + label.width / 2} y={label.top + 15}>{caption(g)}</text>;
                            })}
                        </g>
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
                                    {/* A widely used schema says how many schemas refer to it; its caption makes room for that. */}
                                    <text className="se-subtitle" x="12" y="49">{hubs.has(name) ? clip(look.caption, 22) : look.caption}</text>
                                    {hubs.has(name) && <text className="se-node-heirs" x={cardWidth - 12} y="49">← {hubs.get(name)} schemas</text>}
                                    {hubTags.has(name) && (
                                        <text className="se-atlas-hub-tag" x="2" y={cardHeight + 14}>
                                            {tagText(name)}
                                        </text>
                                    )}
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
                {/* The minimap, titled so it reads as a control. aria-hidden: it repeats the canvas for orientation;
                    dragging, zoom and search do the same. */}
                <div className="se-atlas-minimap-box">
                    <div className="se-atlas-minimap-title" aria-hidden="true">Overview <span>· click to move</span></div>
                    <svg className="se-atlas-minimap" width={mini.width} height={mini.height} viewBox={`0 0 ${atlas.width} ${atlas.height}`} aria-hidden="true"
                        onPointerDown={(e) => { minimapDrag.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); fromMinimap(e); }}
                        onPointerMove={(e) => { if (minimapDrag.current) fromMinimap(e); }}
                        onPointerUp={() => { minimapDrag.current = false; }}>
                        <rect width={atlas.width} height={atlas.height} className="se-atlas-mini-bg" />
                        {atlas.frames.map((frame) => <rect key={frame.id} x={frame.left} y={frame.top} width={frame.width} height={frame.height} rx="20" className="se-atlas-mini-frame-group" />)}
                        {groups.filter((g) => !hubbed(g) || traced?.has(g.key)).map((g) => <path key={g.key} d={(routes[g.key] || fallback(g)).d} className={`se-atlas-mini-edge${traced?.has(g.key) ? ' se-atlas-mini-on' : ''}`} />)}
                        {Object.entries(atlas.positions).map(([name, p]) => (
                            <rect key={name} x={p.x - cardWidth / 2} y={p.y - cardHeight / 2} width={cardWidth} height={cardHeight}
                                className={`se-atlas-mini-card${name === focusName ? ' se-atlas-mini-current' : ends?.has(name) ? ' se-atlas-mini-linked' : ''}${matches.includes(name) ? ' se-atlas-mini-match' : ''}`} />
                        ))}
                        <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} className="se-atlas-mini-frame" />
                    </svg>
                </div>
            </div>
        </div>
    );
}
