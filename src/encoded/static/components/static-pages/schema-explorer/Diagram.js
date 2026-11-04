import React, {
    useState,
    useMemo,
    useRef,
    useEffect,
    useCallback,
} from 'react';
import { layout, width, height } from './layout';
import { domains, domainFor, hierarchicalLayout, overviewLayout, abstractTypes } from './domains';
import { routeEdges } from './routing';
import { groupRelationships, sharedRelationships } from './relationship-view';
import { nodePresentation, stageAccent } from './node-presentation';
import ResearchOverview from './ResearchOverview';
import { Badge, Filters, visibleEdge, edgeLabel, exportPNG } from './shared';

const defaults = ['User', 'Consortium', 'Consortia', 'SubmissionCenter'];
const colors = { linkTo: '#2368aa', calculated: '#7952a3', reverse: '#986019' };
export default function Diagram({
    index,
    focus = '',
    compact = false,
    onExplore,
    onDetail,
    onPlanner,
}) {
    const [selected, setSelected] = useState(focus);
    const [domain, setDomain] = useState('');
    const [arrangement, setArrangement] = useState('hierarchical');
    const [overviewMode, setOverviewMode] = useState('relationships');
    const [crossLinks, setCrossLinks] = useState(true);
    const [connectionMode, setConnectionMode] = useState('shared');
    const [hidden, setHidden] = useState(compact ? [] : defaults);
    const [kinds, setKinds] = useState(compact ? ['linkTo', 'calculated', 'reverse'] : ['linkTo']);
    const [neighbors, setNeighbors] = useState(false),
        [full, setFull] = useState(false);
    const [query, setQuery] = useState(''),
        [typeQuery, setTypeQuery] = useState('');
    const [moves, setMoves] = useState({}),
        [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
    const [size, setSize] = useState({ width: 1000, height: 600 });
    const [exporting, setExporting] = useState(false),
        [error, setError] = useState('');
    const svg = useRef(),
        drag = useRef(),
        relationshipMenu = useRef(),
        typePicker = useRef(),
        mapSettings = useRef();
    useEffect(() => {
        const closeMenus = (event) => {
            [typePicker.current, mapSettings.current, relationshipMenu.current].forEach((menu) => {
                if (menu?.open && !menu.contains(event.target)) menu.open = false;
            });
        };
        document.addEventListener('pointerdown', closeMenus);
        return () => document.removeEventListener('pointerdown', closeMenus);
    }, []);
    const nodes = useMemo(() => {
        const models = new Map(index.models.map((m) => [m.name, m]));
        for (const edge of index.edges)
            for (const name of [edge.from, edge.to])
                if (!models.has(name)) models.set(name, null);
        let names = [...models.keys()].sort();
        if (compact) {
            const related = new Set([
                focus,
                ...index.edges.filter((e) => e.from === focus).map((e) => e.to),
            ]);
            names = names.filter((n) => related.has(n));
        }
        return names.map((name) => {return { name, model: models.get(name) };});
    }, [index, compact, focus]);
    const edges = useMemo(
        () =>
            index.edges.filter(
                (e) => visibleEdge(e, kinds) && (!compact || e.from === focus)
            ),
        [index, kinds, compact, focus]
    );
    const connected = useMemo(
        () =>
            new Set([
                selected,
                ...edges
                    .filter((e) => e.from === selected || e.to === selected)
                    .flatMap((e) => [e.from, e.to]),
            ]),
        [edges, selected]
    );
    const visibleConnected = neighbors ? connected : null;
    const neighborhoodSelection = neighbors ? selected : '';
    const visible = useMemo(() => nodes.filter(
        (n) => !hidden.includes(n.name) && (visibleConnected ? visibleConnected.has(n.name) : (!domain || domainFor(n.name) === domain))
    ), [nodes, hidden, visibleConnected, domain]);
    const names = useMemo(() => new Set(visible.map((n) => n.name)), [visible]);
    const groups = useMemo(() => groupRelationships(edges), [edges]);
    const edgeLanes = useMemo(() => {
        const pairs = new Map();
        groups.forEach((group) => {
            const pair = [group.from, group.to].sort().join('\0');
            if (!pairs.has(pair)) pairs.set(pair, []);
            pairs.get(pair).push(group);
        });
        const lanes = new Map();
        pairs.forEach((pairGroups) => {
            pairGroups.sort((a, b) => a.key.localeCompare(b.key));
            pairGroups.forEach((group, i) => {
                const direction = group.from.localeCompare(group.to) <= 0 ? 1 : -1;
                lanes.set(group.key, direction * (i - (pairGroups.length - 1) / 2) * 28);
            });
        });
        return lanes;
    }, [groups]);
    const showDomains = !compact && !neighbors && arrangement === 'hierarchical';
    const overview = showDomains && !domain;
    const researchOverview = overview && overviewMode === 'relationships';
    const cardWidth = overview ? 196 : width, cardHeight = overview ? 28 : height;
    const allPositions = useMemo(() => showDomains ? {} : layout(visible, groups, size), [showDomains, visible, groups, size]);
    const clustered = useMemo(() => showDomains
        ? overview ? overviewLayout(visible, size) : hierarchicalLayout(visible, width, height, index.edges, size)
        : { positions: {}, frames: [], layers: [] }, [showDomains, overview, visible, index, size]);
    const positions = useMemo(() => {
        if (!neighbors || !neighborhoodSelection) return { ...(showDomains ? clustered.positions : allPositions), ...moves };
        const others = nodes.filter(
            (n) =>
                n.name !== neighborhoodSelection &&
                !hidden.includes(n.name) &&
                visibleConnected.has(n.name)
        );
        const columns = Math.max(
            1,
            Math.ceil(
                Math.sqrt(
                    (others.length * size.width) / Math.max(size.height, 1)
                )
            )
        );
        const result = { [neighborhoodSelection]: { x: 0, y: -160 } };
        others.forEach((n, i) => {
            result[n.name] = {
                x: ((i % columns) - (columns - 1) / 2) * (width + 120),
                y: Math.floor(i / columns) * (height + 110),
            };
        });
        return { ...result, ...moves };
    }, [
        allPositions,
        moves,
        neighbors,
        neighborhoodSelection,
        hidden,
        visibleConnected,
        nodes,
        size,
        showDomains,
        clustered,
    ]);
    const visibleGroups = useMemo(() => groups.filter(
        (g) => names.has(g.from) && names.has(g.to) &&
            (!showDomains || domainFor(g.from) === domainFor(g.to) || (crossLinks && (g.from === selected || g.to === selected)))
    ), [groups, names, showDomains, selected, crossLinks]);
    const scopedGroups = useMemo(() => visibleGroups.filter(
        (g) => !showDomains || !selected || g.from === selected || g.to === selected
    ), [visibleGroups, showDomains, selected]);
    const shared = useMemo(() => showDomains && !overview ? sharedRelationships(index, visibleGroups, names)
        : { groups: visibleGroups, inherited: {} }, [showDomains, overview, index, visibleGroups, names]);
    const summarize = showDomains && !overview && !selected && connectionMode === 'shared';
    const shownGroups = useMemo(() => summarize ? shared.groups.filter((group) => group.from !== group.to) : scopedGroups,
        [summarize, shared, scopedGroups]);
    const headings = useMemo(() => showDomains ? [
        ...clustered.frames.map((frame) => {return { left: frame.left + 18, top: frame.top + 12, width: Math.min(frame.width - 36, frame.label.length * 15 + 12), height: 38 };}),
        ...clustered.layers,
    ] : [], [showDomains, clustered]);
    const routes = useMemo(() => showDomains && !overview
        ? routeEdges(positions, shownGroups, width, height, headings, { spreadPorts: true }) : {},
    [showDomains, overview, positions, shownGroups, headings]);
    const bounds = useMemo(() => {
        const points = visible.flatMap((n) => [
            { x: positions[n.name].x - cardWidth / 2, y: positions[n.name].y - cardHeight / 2 },
            { x: positions[n.name].x + cardWidth / 2, y: positions[n.name].y + cardHeight / 2 },
        ]);
        if (showDomains) {
            clustered.frames.forEach((f) => points.push({ x: f.left, y: f.top }, { x: f.left + f.width, y: f.top + f.height }));
            Object.values(routes).forEach((route) => points.push(...route.points));
        }
        return points.length ? {
            left: Math.min(...points.map((p) => p.x)) - (showDomains ? 20 : 65),
            right: Math.max(...points.map((p) => p.x)) + (showDomains ? 20 : 65),
            top: Math.min(...points.map((p) => p.y)) - (showDomains ? 20 : 90),
            bottom: Math.max(...points.map((p) => p.y)) + (showDomains ? 20 : 65),
        } : { left: -300, right: 300, top: -200, bottom: 200 };
    }, [visible, positions, showDomains, clustered, routes, cardWidth, cardHeight]);
    const fit = useCallback((readable = true) => {
        const fitted = Math.min(
            showDomains ? 1.25 : 1.5,
            size.width / (bounds.right - bounds.left),
            size.height / (bounds.bottom - bounds.top)
        );
        const scale = Math.max(showDomains && readable ? 0.85 : 0.05, fitted);
        const fitsX = (bounds.right - bounds.left) * scale <= size.width;
        const fitsY = (bounds.bottom - bounds.top) * scale <= size.height;
        setCamera({
            scale,
            x: fitsX ? (size.width - (bounds.left + bounds.right) * scale) / 2 : 16 - bounds.left * scale,
            y: fitsY ? (size.height - (bounds.top + bounds.bottom) * scale) / 2 : 16 - bounds.top * scale,
        });
    }, [bounds.left, bounds.right, bounds.top, bounds.bottom, size, showDomains]);
    // Selecting a node only highlights it in the full map. Refit selection
    // changes only when they replace the displayed neighborhood.
    const layoutFocus = neighbors ? selected : focus;
    useEffect(() => {
        fit();
    }, [index, hidden, kinds, neighbors, layoutFocus, size, full, domain, arrangement, connectionMode]);
    useEffect(() => {
        if (!svg.current) return undefined;
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0].contentRect;
            if (rect.width && rect.height)
                setSize((previous) => previous.width === rect.width && previous.height === rect.height
                    ? previous : { width: rect.width, height: rect.height });
        });
        observer.observe(svg.current);
        return () => observer.disconnect();
    }, [researchOverview]);
    useEffect(() => {
        if (!full) return undefined;
        const escape = (e) => {
            if (e.key === 'Escape') setFull(false);
        };
        document.addEventListener('keydown', escape);
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', escape);
            document.body.style.overflow = previous;
        };
    }, [full]);
    const zoom = (factor, x = size.width / 2, y = size.height / 2) =>
        setCamera((c) => {
            const scale = Math.max(0.05, Math.min(3, c.scale * factor));
            return {
                scale,
                x: x - ((x - c.x) * scale) / c.scale,
                y: y - ((y - c.y) * scale) / c.scale,
            };
        });
    useEffect(() => {
        const element = svg.current;
        if (!element) return undefined;
        const wheel = (e) => {
            e.preventDefault();
            const rect = element.getBoundingClientRect();
            zoom(
                e.deltaY < 0 ? 1.1 : 1 / 1.1,
                e.clientX - rect.left,
                e.clientY - rect.top
            );
        };
        element.addEventListener('wheel', wheel, { passive: false });
        return () => element.removeEventListener('wheel', wheel);
    }, [researchOverview]);
    const choose = useCallback((name) => {
        if (!neighbors && (domain || showDomains) && domainFor(name) !== domain) {
            setDomain(domainFor(name));
            setMoves({});
        }
        if (hidden.includes(name)) setHidden(hidden.filter((n) => n !== name));
        setQuery('');
        setSelected(name);
        if (neighbors) setMoves({});
        if (compact) onExplore(name);
    }, [neighbors, domain, showDomains, hidden, compact, onExplore]);
    const setVisibility = (next) => {
        setHidden(next);
        setMoves({});
        if (next.includes(selected)) {
            setSelected('');
            setNeighbors(false);
        }
    };
    const inspect = (group) =>
        onDetail({
            title: `${group.from} → ${group.to}`,
            value: group.edges,
            relationship: group.edges,
            intro: group.shared
                ? `Shared definition drawn once at ${group.from}. The exact references from all represented schemas are listed below. [] denotes an array.`
                : '[] denotes an array. Arrows point to the referenced type.',
            sources: group.edges.flatMap(
                (e) =>
                    index.models
                        .find((m) => m.name === e.from)
                        ?.fields.find(
                            (f) =>
                                f.name ===
                                e.field.split('.')[0].replaceAll('[]', '')
                        )?.sources || []
            ),
        });
    const chooseDomain = useCallback((id) => {
        setDomain(id);
        setConnectionMode('shared');
        if (!id) setOverviewMode('relationships');
        setSelected('');
        setNeighbors(false);
        setMoves({});
    }, []);
    const clearSelection = () => {
        setSelected('');
        setNeighbors(false);
        setMoves({});
    };
    const incident = edges.filter(
        (e) =>
            (e.from === selected || e.to === selected) &&
            names.has(e.from) &&
            names.has(e.to)
    );
    const drawnGroups = overview ? [] : shownGroups;
    const showAllTypes = useCallback(() => setOverviewMode('types'), []);
    if (researchOverview) {
        return (
            <ResearchOverview index={index} nodes={visible} onType={choose} onGroup={chooseDomain}
                onAllTypes={showAllTypes} onDetail={onDetail} />
        );
    }
    return (
        <section
            className={`se-diagram${full ? ' se-fullscreen' : ''}${showDomains ? ' se-hierarchical' : ''}${overview ? ' se-overview' : ''}`}
            aria-label={
                compact ? 'Item relationships' : 'All schema relationships'
            }>
            <div className="se-toolbar">
                {overview && <button type="button" onClick={() => setOverviewMode('relationships')}>← Metadata map</button>}
                {domain && !compact && <button type="button" className="se-back-to-groups" onClick={() => chooseDomain('')}>← Metadata map</button>}
                {(!showDomains || overview) && (
                    <h2>{compact ? 'Relationships' : neighbors ? `${selected} neighborhood` : domains.find((d) => d.id === domain)?.label || 'All schemas'}</h2>
                )}
                <span className="text-muted">
                    {visible.length} types ·{' '}
                    {summarize ? `${shownGroups.length} shared-definition connections` : `${shownGroups.reduce((n, g) => n + g.edges.length, 0)} relationships`}
                </span>
            </div>
            <div className="se-map-toolbar">
                {!compact && (
                    <div className="se-map-discovery" aria-label="Find and select schemas">
                        <input
                            type="search"
                            aria-label="Search schemas"
                            placeholder="Search schemas…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                        <details className="se-type-picker" ref={typePicker}>
                            <summary>Types {nodes.filter((n) => !hidden.includes(n.name)).length}/{nodes.length}</summary>
                            <div className="se-type-popover">
                                <input aria-label="Filter types" placeholder="Filter types…" value={typeQuery} onChange={(e) => setTypeQuery(e.target.value)} />
                                <div className="se-toolbar">
                                    <button type="button" onClick={() => setVisibility([])}>Show all</button>
                                    <button type="button" onClick={() => setVisibility(nodes.map((n) => n.name))}>Hide all</button>
                                    <button type="button" onClick={() => setVisibility(defaults)}>Defaults</button>
                                </div>
                                <div>
                                    {nodes.filter((n) => n.name.toLowerCase().includes(typeQuery.toLowerCase())).map((n) => (
                                        <label key={n.name}>
                                            <input type="checkbox" checked={!hidden.includes(n.name)} onChange={(e) => setVisibility(e.target.checked ? hidden.filter((v) => v !== n.name) : [...hidden, n.name])} />
                                            {n.name}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </details>
                        <details className="se-map-settings" ref={mapSettings}>
                            <summary>Map settings</summary>
                            <div className="se-map-settings-popover">
                                <label>Group
                                    <select aria-label="Schema group" value={domain} onChange={(e) => chooseDomain(e.target.value)}>
                                        <option value="">All groups</option>
                                        {domains.filter((d) => nodes.some((n) => domainFor(n.name) === d.id)).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                                    </select>
                                </label>
                                <label>Layout
                                    <select aria-label="Diagram layout" value={arrangement} onChange={(e) => { setArrangement(e.target.value); setMoves({}); }}>
                                        <option value="hierarchical">Hierarchical</option>
                                        <option value="network">Network</option>
                                    </select>
                                </label>
                                {showDomains && <label className="se-map-cross-links"><input type="checkbox" checked={crossLinks} onChange={(e) => setCrossLinks(e.target.checked)} />Include cross-group links for the selected schema</label>}
                            </div>
                        </details>
                    </div>
                )}
                <div className="se-map-tools">
                    <div className="se-map-tool-section se-link-filters" aria-label="Relationship filters">
                        <details ref={relationshipMenu}>
                            <summary>Relationships {kinds.length}/3</summary>
                            <div className="se-link-filter-popover"><Filters kinds={kinds} onChange={setKinds} /></div>
                        </details>
                    </div>
                    {showDomains && !overview && (
                        <div className="se-map-tool-section se-connection-mode">
                            <label>Connections
                                <select aria-label="Connection detail" value={selected ? 'selected' : connectionMode} onChange={(event) => setConnectionMode(event.target.value)} disabled={!!selected}>
                                    {selected && <option value="selected">Selected type: exact links</option>}
                                    <option value="shared">Shared definitions</option>
                                    <option value="all">All references</option>
                                </select>
                            </label>
                        </div>
                    )}
                    {!compact && (
                        <div className="se-map-tool-section" aria-label="Schema exploration">
                            <button type="button" id="entity-show-neighborhood" disabled={!selected} aria-pressed={neighbors} onClick={() => {
                                if (!neighbors) setHidden(hidden.filter((n) => !connected.has(n)));
                                setMoves({});
                                setNeighbors(!neighbors);
                            }}>{neighbors ? 'Show selected types' : 'Show neighborhood'}
                            </button>
                            {selected && <button type="button" onClick={clearSelection}>Clear selection</button>}
                        </div>
                    )}
                    <div className="se-map-tool-section se-canvas-actions" aria-label="Canvas controls">
                        <button type="button" id={compact ? 'graph-export' : 'entity-export'} disabled={exporting} onClick={async () => {
                            setExporting(true);
                            try { await exportPNG(svg.current, compact ? `${focus}-relationships` : 'schema-map'); }
                            catch (err) { setError(err.message || 'PNG export failed.'); }
                            finally { setExporting(false); }
                        }}>{exporting ? 'Exporting…' : 'Export PNG'}
                        </button>
                        <div className="se-zoom-controls" role="group" aria-label="Zoom controls">
                            <button type="button" onClick={() => fit(false)}>Fit all</button>
                            <button type="button" aria-label="Zoom out" onClick={() => zoom(0.8)}>−</button>
                            <span>{Math.round(camera.scale * 100)}%</span>
                            <button type="button" aria-label="Zoom in" onClick={() => zoom(1.25)}>+</button>
                        </div>
                        <button type="button" onClick={() => { setMoves({}); fit(); }}>Reset layout</button>
                    </div>
                </div>
            </div>
            {query && (
                <div className="se-toolbar">
                    {nodes
                        .filter(
                            (n) =>
                                n.name
                                    .toLowerCase()
                                    .includes(query.toLowerCase())
                        )
                        .slice(0, 12)
                        .map((n) => (
                            <button type="button" key={n.name} onClick={() => choose(n.name)}>
                                {n.name}
                            </button>
                        ))}
                </div>
            )}
            {!overview && (
                <p className="text-muted">
                    Drag the background to pan, scroll to zoom, or drag a type to
                    move it. Select a type to highlight its neighbors; select an
                    edge to inspect its fields.
                </p>
            )}
            {error && <p role="alert">{error}</p>}
            {showDomains && (
                <p className="se-flow-note">{overview ? 'Select a group or type to explore its relationships. Groups follow the biological workflow.' : selected
                    ? `Showing ${selected} references between visible schemas, including inherited and self-references. Clear selection to return to the group overview.`
                    : summarize ? 'Inherited references are drawn once at their visible base type. Select a type for its exact links, including self-references, or choose All references.'
                        : 'All references are expanded. Select a type to focus its connections, or choose Shared definitions to combine inherited links.'}
                </p>
            )}
            <div className="se-canvas-wrap">
                {!compact && (
                    <button type="button" className="se-canvas-fullscreen" id="entity-fullscreen" aria-label={full ? 'Exit full screen' : 'Enter full screen'} title={full ? 'Exit full screen' : 'Enter full screen'} aria-pressed={full} onPointerDown={(e) => e.stopPropagation()} onClick={() => setFull(!full)}>
                        <svg aria-hidden="true" viewBox="0 0 16 16"><path d={full ? 'M6 1v5H1M10 1v5h5M15 10h-5v5M6 15v-5H1' : 'M1 6V1h5M10 1h5v5M15 10v5h-5M6 15H1v-5'} /></svg>
                    </button>
                )}
                <svg
                    ref={svg}
                    id={compact ? 'graph' : 'entity-svg'}
                    className="se-canvas"
                    tabIndex={0}
                    role="group"
                    aria-label="Schema relationship diagram"
                    onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        // Capturing on the SVG retargets clicks away from edges.
                        // Leave relationship controls to their own click handlers.
                        if (e.target.closest('.se-edge, .se-edge-label')) return;
                        const name =
                        e.target.closest('[data-entity]')?.dataset.entity;
                        drag.current = {
                            id: e.pointerId,
                            name,
                            x: e.clientX,
                            y: e.clientY,
                            moved: false,
                        };
                        e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                        const d = drag.current;
                        if (!d || d.id !== e.pointerId) return;
                        const dx = e.clientX - d.x,
                            dy = e.clientY - d.y;
                        if (!dx && !dy) return;
                        d.moved = true;
                        d.x = e.clientX;
                        d.y = e.clientY;
                        if (overview && d.name) return;
                        if (d.name)
                            setMoves((m) => {return {
                                ...m,
                                [d.name]: {
                                    x:
                                    (m[d.name] || positions[d.name]).x +
                                    dx / camera.scale,
                                    y:
                                    (m[d.name] || positions[d.name]).y +
                                    dy / camera.scale,
                                },
                            };});
                        else setCamera((c) => {return { ...c, x: c.x + dx, y: c.y + dy };});
                    }}
                    onPointerUp={(e) => {
                        const d = drag.current;
                        drag.current = null;
                        if (d && !d.moved && d.name) choose(d.name);
                        if (e.currentTarget.hasPointerCapture(e.pointerId))
                            e.currentTarget.releasePointerCapture(e.pointerId);
                    }}
                    onPointerCancel={() => {
                        drag.current = null;
                    }}
                    onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        const delta = {
                            ArrowLeft: [50, 0],
                            ArrowRight: [-50, 0],
                            ArrowUp: [0, 50],
                            ArrowDown: [0, -50],
                        }[e.key];
                        if (delta) {
                            e.preventDefault();
                            setCamera((c) => {return {
                                ...c,
                                x: c.x + delta[0],
                                y: c.y + delta[1],
                            };});
                        }
                    }}>
                    <g
                        data-world=""
                        transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
                        {showDomains && clustered.frames.map((frame) => (
                            <g key={frame.id} className="se-domain-frame">
                                <rect x={frame.left} y={frame.top} width={frame.width} height={frame.height} rx="12" />
                                <text x={frame.left + 24} y={frame.top + 38} role="button" tabIndex={0}
                                    aria-label={`Focus group: ${frame.label}`}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={() => chooseDomain(frame.id)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); chooseDomain(frame.id); } }}>
                                    {frame.label}
                                    <tspan className="se-domain-count" dx="10">{frame.count} {frame.count === 1 ? 'schema' : 'schemas'}</tspan>
                                </text>
                            </g>
                        ))}
                        {showDomains && !overview && clustered.layers.map((layer) => (
                            <rect key={`panel-${layer.id}`} className="se-stage-panel" x={layer.panel.left} y={layer.panel.top} width={layer.panel.width} height={layer.panel.height} rx="8" />
                        ))}
                        {showDomains && clustered.layers.map((layer) => (
                            <g key={layer.id}>
                                <circle cx={layer.left + 3} cy={layer.top + 12} r="3" fill={stageAccent(layer.id.slice(layer.domain.length + 1))} aria-hidden="true" />
                                <text className="se-stage-label" x={layer.left + 12} y={layer.top + 18}>{layer.label}</text>
                            </g>
                        ))}
                        {drawnGroups.map((g) => {
                            if (showDomains && !routes[g.key]) return null;
                            const displayKind = g.reverse && kinds.includes('reverse') &&
                                !kinds.includes(g.kind) ? 'reverse' : g.kind;
                            const a = positions[g.from],
                                b = positions[g.to],
                                dx = b.x - a.x,
                                dy = b.y - a.y;
                            const factor = Math.min(
                                dx ? width / 2 / Math.abs(dx) : Infinity,
                                dy ? height / 2 / Math.abs(dy) : Infinity
                            );
                            const same = g.from === g.to;
                            const lane = edgeLanes.get(g.key) || 0,
                                distance = Math.hypot(dx, dy) || 1,
                                nx = -dy / distance,
                                ny = dx / distance,
                                ax = same ? a.x + 40 : a.x + dx * factor,
                                ay = same ? a.y - height / 2 : a.y + dy * factor,
                                bx = same ? a.x - 40 : b.x - dx * factor,
                                by = same ? a.y - height / 2 : b.y - dy * factor,
                                c1x = ax + dx / 3 + nx * lane,
                                c1y = ay + dy / 3 + ny * lane,
                                c2x = bx - dx / 3 + nx * lane,
                                c2y = by - dy / 3 + ny * lane,
                                cx = (ax + 3 * c1x + 3 * c2x + bx) / 8,
                                cy = (ay + 3 * c1y + 3 * c2y + by) / 8;
                            const d = same
                                ? `M${ax},${ay} C${ax + 140},${ay - 110} ${
                                    bx - 140
                                },${by - 110} ${bx},${by}`
                                : `M${ax},${ay} C${c1x},${c1y} ${c2x},${c2y} ${bx},${by}`;
                            return (
                                <g
                                    key={g.key}
                                    className={selected
                                        ? g.from === selected || g.to === selected
                                            ? 'se-active'
                                            : 'se-dim'
                                        : ''}>
                                    <path
                                        className={`se-edge ${displayKind}`}
                                        d={showDomains ? routes[g.key].d : d}
                                        tabIndex={0}
                                        role="button"
                                        aria-label={`${g.from} to ${g.to}`}
                                        onClick={() => inspect(g)}
                                        onKeyDown={(e) => {
                                            if (
                                                e.key === 'Enter' ||
                                            e.key === ' '
                                            ) {
                                                e.preventDefault();
                                                inspect(g);
                                            }
                                        }}>
                                        <title>
                                            {g.edges
                                                .map(
                                                    (e) =>
                                                        `${e.from}.${e.field} → ${e.to}`
                                                )
                                                .join('\n')}
                                        </title>
                                    </path>
                                    {(neighbors ||
                                    compact ||
                                    (!showDomains && visible.length <= 12)) && (
                                        <text
                                            className="se-edge-label"
                                            x={same ? a.x : cx}
                                            y={same ? ay - 80 : cy - 8}
                                            onClick={() => inspect(g)}>
                                            {g.edges.map((e) => e.field).join(', ')}
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                        {visible.map((n) => {
                            const presentation = nodePresentation(n.name, n.model, { isAbstract: abstractTypes.has(n.name) });
                            const inherited = shared.inherited[n.name];
                            const tooltip = [n.name, presentation.description,
                                n.model ? `${n.model.fields.length} fields · ${n.model.fields.filter((field) => field.calculated).length} calculated` : '',
                                inherited ? `${inherited.fields.size} inherited references from ${[...inherited.owners].join(', ')}` : '',
                            ].filter(Boolean).join('\n');
                            return (
                                <g
                                    key={n.name}
                                    data-entity={n.name}
                                    className={`entity-node${!overview && presentation.isAbstract ? ' se-node-abstract' : ''} ${
                                        selected === n.name ? 'selected' : ''
                                    } ${
                                        selected && !connected.has(n.name)
                                            ? 'se-dim'
                                            : ''
                                    }`}
                                    transform={`translate(${
                                        positions[n.name].x - cardWidth / 2
                                    },${positions[n.name].y - cardHeight / 2})`}
                                    tabIndex={0}
                                    role="button"
                                    aria-label={n.name}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            choose(n.name);
                                        }
                                    }}>
                                    <title>{tooltip}</title>
                                    <rect className="se-node-body" width={cardWidth} height={cardHeight} rx={overview ? 4 : 8} />
                                    <text className="se-node-title" x="12" y={overview ? 19 : 26}>
                                        {n.name}
                                    </text>
                                    {!overview && (
                                        <text x="12" y="49" className="se-subtitle">
                                            {presentation.caption}
                                        </text>
                                    )}
                                    {!overview && presentation.isAbstract && (
                                        <g aria-hidden="true">
                                            <rect className="se-node-abstract-badge" x={cardWidth - 65} y="9" width="54" height="16" rx="4" />
                                            <text className="se-node-abstract-label" x={cardWidth - 38} y="20">Abstract</text>
                                        </g>
                                    )}
                                </g>
                            );
                        })}
                        {drawnGroups.map((g) => {
                            if (showDomains && !routes[g.key]) return null;
                            const a = positions[g.from],
                                b = positions[g.to],
                                dx = b.x - a.x,
                                dy = b.y - a.y,
                                factor = Math.min(
                                    dx ? width / 2 / Math.abs(dx) : Infinity,
                                    dy ? height / 2 / Math.abs(dy) : Infinity
                                ),
                                same = g.from === g.to,
                                bx = same ? a.x - 40 : b.x - dx * factor,
                                by = same ? a.y - height / 2 : b.y - dy * factor,
                                lane = edgeLanes.get(g.key) || 0,
                                distance = Math.hypot(dx, dy) || 1,
                                nx = -dy / distance,
                                ny = dx / distance,
                                tx = same ? 140 : dx / 3 - nx * lane,
                                ty = same ? 110 : dy / 3 - ny * lane,
                                tangentLength = Math.hypot(tx, ty) || 1,
                                ux = tx / tangentLength,
                                uy = ty / tangentLength,
                                headLength = 12,
                                headWidth = 8,
                                baseX = bx - ux * headLength,
                                baseY = by - uy * headLength,
                                markerKind = g.reverse && kinds.includes('reverse')
                                    ? 'reverse'
                                    : g.kind;
                            const route = showDomains ? routes[g.key] : null;
                            const tipX = route ? route.end.x : bx, tipY = route ? route.end.y : by;
                            const directionX = route ? route.ux : ux, directionY = route ? route.uy : uy;
                            const arrowBaseX = route ? tipX - directionX * headLength : baseX;
                            const arrowBaseY = route ? tipY - directionY * headLength : baseY;
                            return (
                                <polygon
                                    key={`arrow-${g.key}`}
                                    points={`${tipX},${tipY} ${arrowBaseX - directionY * headWidth / 2},${arrowBaseY + directionX * headWidth / 2} ${arrowBaseX + directionY * headWidth / 2},${arrowBaseY - directionX * headWidth / 2}`}
                                    fill={colors[markerKind]}
                                    opacity={selected && g.from !== selected && g.to !== selected ? 0.15 : 0.9}
                                    pointerEvents="none" />
                            );
                        })}
                    </g>
                    {!visible.length && (
                        <text x="20" y="35">
                            No types selected. Use Types to show schemas.
                        </text>
                    )}
                </svg>
            </div>
            {selected && (
                <div
                    id={compact ? 'relations' : 'entity-details'}
                    className="se-relations">
                    <div className="se-toolbar">
                        <h3>{selected}</h3>
                        {!compact && (
                            <button type="button" onClick={() => onExplore(selected)}>
                                Explore item type →
                            </button>
                        )}
                        {compact && <button type="button" onClick={clearSelection}>Clear selection</button>}
                    </div>
                    {shared.inherited[selected] && <p className="se-inheritance-detail">{shared.inherited[selected].fields.size} reference fields inherited from { [...shared.inherited[selected].owners].join(', ') }. Their shared definitions are drawn at the base types in the group overview.</p>}
                    {incident.map((e, i) => (
                        <div className="se-relation" key={i}>
                            <Badge kind={e.kind}>{edgeLabel(e)}</Badge>
                            <span>
                                {e.from}.{e.field} → {e.to}
                            </span>
                            <button type="button"
                                onClick={() => inspect({ ...e, edges: [e] })}>
                                Inspect
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
