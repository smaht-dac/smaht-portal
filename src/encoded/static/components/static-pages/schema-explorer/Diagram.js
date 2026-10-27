import React, {
    useState,
    useMemo,
    useRef,
    useEffect,
    useCallback,
    useId,
} from 'react';
import { layout, width, height } from './layout';
import { domains, domainFor, groupedLayout } from './domains';
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
    const [arrangement, setArrangement] = useState('grouped');
    const [crossLinks, setCrossLinks] = useState(true);
    const [hidden, setHidden] = useState(compact ? [] : defaults);
    const [kinds, setKinds] = useState(['linkTo', 'calculated', 'reverse']);
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
        marker = useId().replace(/:/g, '');
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
    const visible = useMemo(() => nodes.filter(
        (n) => !hidden.includes(n.name) && (neighbors ? connected.has(n.name) : (!domain || domainFor(n.name) === domain))
    ), [nodes, hidden, neighbors, connected, domain]);
    const names = new Set(visible.map((n) => n.name));
    const groups = useMemo(() => {
        const result = new Map();
        edges.forEach((e) => {
            const key = JSON.stringify([e.from, e.to, e.kind, !!e.reverse]);
            if (!result.has(key)) result.set(key, { ...e, key, edges: [] });
            result.get(key).edges.push(e);
        });
        return [...result.values()];
    }, [edges]);
    const allPositions = useMemo(() => layout(visible, groups, size), [visible, groups, size]);
    const clustered = useMemo(() => groupedLayout(visible, width, height), [visible]);
    const showDomains = !compact && !neighbors && arrangement === 'grouped';
    const positions = useMemo(() => {
        if (!neighbors || !selected) return { ...(showDomains ? clustered.positions : allPositions), ...moves };
        const others = nodes.filter(
            (n) =>
                n.name !== selected &&
                !hidden.includes(n.name) &&
                connected.has(n.name)
        );
        const columns = Math.max(
            1,
            Math.ceil(
                Math.sqrt(
                    (others.length * size.width) / Math.max(size.height, 1)
                )
            )
        );
        const result = { [selected]: { x: 0, y: -160 } };
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
        selected,
        hidden,
        connected,
        nodes,
        size,
        showDomains,
        clustered,
    ]);
    const bounds = visible.length
        ? {
            left:
                  Math.min(...visible.map((n) => positions[n.name].x)) -
                  width / 2 -
                  65,
            right:
                  Math.max(...visible.map((n) => positions[n.name].x)) +
                  width / 2 +
                  65,
            top:
                  Math.min(...visible.map((n) => positions[n.name].y)) -
                  height / 2 -
                  90,
            bottom:
                  Math.max(...visible.map((n) => positions[n.name].y)) +
                  height / 2 +
                  65,
        }
        : { left: -300, right: 300, top: -200, bottom: 200 };
    const fit = useCallback(() => {
        const scale = Math.max(
            0.05,
            Math.min(
                1.5,
                size.width / (bounds.right - bounds.left),
                size.height / (bounds.bottom - bounds.top)
            )
        );
        setCamera({
            scale,
            x: (size.width - (bounds.left + bounds.right) * scale) / 2,
            y: (size.height - (bounds.top + bounds.bottom) * scale) / 2,
        });
    }, [bounds.left, bounds.right, bounds.top, bounds.bottom, size]);
    // Selecting a node only highlights it in the full map. Refit selection
    // changes only when they replace the displayed neighborhood.
    const layoutFocus = neighbors ? selected : focus;
    useEffect(() => {
        fit();
    }, [index, hidden, kinds, neighbors, layoutFocus, size, full, domain, arrangement]);
    useEffect(() => {
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0].contentRect;
            if (rect.width && rect.height)
                setSize((previous) => previous.width === rect.width && previous.height === rect.height
                    ? previous : { width: rect.width, height: rect.height });
        });
        observer.observe(svg.current);
        return () => observer.disconnect();
    }, []);
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
    }, []);
    const choose = (name) => {
        if (!neighbors && domain && domainFor(name) !== domain) setDomain(domainFor(name));
        if (hidden.includes(name)) setHidden(hidden.filter((n) => n !== name));
        setQuery('');
        setSelected(name);
        if (neighbors) setMoves({});
        if (compact) onExplore(name);
    };
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
            intro: '[] denotes an array. Arrows point to the referenced type.',
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
    const shownGroups = groups.filter(
        (g) => names.has(g.from) && names.has(g.to) &&
            (!showDomains || domainFor(g.from) === domainFor(g.to) || (crossLinks && (g.from === selected || g.to === selected)))
    );
    const chooseDomain = (id) => {
        setDomain(id);
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
    return (
        <section
            className={`se-diagram${full ? ' se-fullscreen' : ''}`}
            aria-label={
                compact ? 'Item relationships' : 'All schema relationships'
            }>
            <div className="se-toolbar">
                <h2>{compact ? 'Relationships' : neighbors ? `${selected} neighborhood` : domains.find((d) => d.id === domain)?.label || 'All schemas'}</h2>
                <span className="text-muted">
                    {visible.length} types ·{' '}
                    {shownGroups.reduce((n, g) => n + g.edges.length, 0)}{' '}
                    relationships
                </span>
            </div>
            {!compact && (
                <div className="se-toolbar se-domain-controls">
                    <label>Group
                        <select aria-label="Schema group" value={domain} onChange={(e) => chooseDomain(e.target.value)}>
                            <option value="">All groups</option>
                            {domains.filter((d) => nodes.some((n) => domainFor(n.name) === d.id)).map((d) => (
                                <option key={d.id} value={d.id}>{d.label}</option>
                            ))}
                        </select>
                    </label>
                    <label>Layout
                        <select aria-label="Diagram layout" value={arrangement} onChange={(e) => { setArrangement(e.target.value); setMoves({}); }}>
                            <option value="grouped">Grouped</option>
                            <option value="network">Network</option>
                        </select>
                    </label>
                    {showDomains && <label><input type="checkbox" checked={crossLinks} onChange={(e) => setCrossLinks(e.target.checked)} />Cross-group links for selection</label>}
                    <span className="text-muted">Select a group to focus. Enable cross-group links and select a schema to see its connections to other groups.</span>
                </div>
            )}
            <div className="se-toolbar">
                {!compact && (
                    <>
                        <input
                            type="search"
                            aria-label="Find a schema"
                            placeholder="Find a schema…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                        <details className="se-type-picker">
                            <summary>
                                Types{' '}
                                {
                                    nodes.filter(
                                        (n) => !hidden.includes(n.name)
                                    ).length
                                }
                                /{nodes.length}
                            </summary>
                            <div className="se-type-popover">
                                <input
                                    aria-label="Filter types"
                                    placeholder="Filter types…"
                                    value={typeQuery}
                                    onChange={(e) =>
                                        setTypeQuery(e.target.value)
                                    }
                                />
                                <div className="se-toolbar">
                                    <button type="button" onClick={() => setVisibility([])}>
                                        Show all
                                    </button>
                                    <button type="button"
                                        onClick={() =>
                                            setVisibility(
                                                nodes.map((n) => n.name)
                                            )
                                        }>
                                        Hide all
                                    </button>
                                    <button type="button"
                                        onClick={() => setVisibility(defaults)}>
                                        Defaults
                                    </button>
                                </div>
                                <div>
                                    {nodes
                                        .filter((n) =>
                                            n.name
                                                .toLowerCase()
                                                .includes(
                                                    typeQuery.toLowerCase()
                                                )
                                        )
                                        .map((n) => (
                                            <label key={n.name}>
                                                <input
                                                    type="checkbox"
                                                    checked={
                                                        !hidden.includes(n.name)
                                                    }
                                                    onChange={(e) =>
                                                        setVisibility(
                                                            e.target.checked
                                                                ? hidden.filter(
                                                                    (v) =>
                                                                        v !==
                                                                          n.name
                                                                )
                                                                : [
                                                                    ...hidden,
                                                                    n.name,
                                                                ]
                                                        )
                                                    }
                                                />
                                                {n.name}
                                            </label>
                                        ))}
                                </div>
                            </div>
                        </details>
                    </>
                )}
                <Filters kinds={kinds} onChange={setKinds} />
                {!compact && (
                    <>
                        <button type="button"
                            disabled={!selected}
                            onClick={() => onPlanner(selected)}>
                            Find embed path
                        </button>
                        <button type="button"
                            id="entity-show-neighborhood"
                            disabled={!selected}
                            aria-pressed={neighbors}
                            onClick={() => {
                                if (!neighbors)
                                    setHidden(
                                        hidden.filter((n) => !connected.has(n))
                                    );
                                setMoves({});
                                setNeighbors(!neighbors);
                            }}>
                            {neighbors
                                ? 'Show selected types'
                                : 'Show neighborhood'}
                        </button>
                        <button type="button"
                            id="entity-fullscreen"
                            aria-pressed={full}
                            onClick={() => setFull(!full)}>
                            {full ? 'Exit full screen' : 'Full screen ⛶'}
                        </button>
                    </>
                )}
                <button type="button"
                    id={compact ? 'graph-export' : 'entity-export'}
                    disabled={exporting}
                    onClick={async () => {
                        setExporting(true);
                        try {
                            await exportPNG(
                                svg.current,
                                compact
                                    ? `${focus}-relationships`
                                    : 'schema-map'
                            );
                        } catch (err) {
                            setError(err.message || 'PNG export failed.');
                        } finally {
                            setExporting(false);
                        }
                    }}>
                    {exporting ? 'Exporting…' : 'Export PNG'}
                </button>
                <button type="button" onClick={fit}>Fit all</button>
                <button type="button" aria-label="Zoom out" onClick={() => zoom(0.8)}>
                    −
                </button>
                <span>{Math.round(camera.scale * 100)}%</span>
                <button type="button" aria-label="Zoom in" onClick={() => zoom(1.25)}>
                    +
                </button>
                <button type="button"
                    onClick={() => {
                        setMoves({});
                        fit();
                    }}>
                    Reset layout
                </button>
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
            <p className="text-muted">
                Drag the background to pan, scroll to zoom, or drag a type to
                move it. Select a type to highlight its neighbors; select an
                edge to inspect its fields.
            </p>
            {error && <p role="alert">{error}</p>}
            <svg
                ref={svg}
                id={compact ? 'graph' : 'entity-svg'}
                className="se-canvas"
                tabIndex={0}
                role="group"
                aria-label="Schema relationship diagram"
                onPointerDown={(e) => {
                    if (e.button !== 0) return;
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
                <defs>
                    {Object.entries(colors).map(([kind, color]) => (
                        <marker
                            key={kind}
                            id={`${marker}-${kind}`}
                            markerWidth="10"
                            markerHeight="8"
                            refX="9"
                            refY="4"
                            orient="auto">
                            <path d="M0,0 L10,4 L0,8 Z" fill={color} />
                        </marker>
                    ))}
                </defs>
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
                                {frame.label} · {frame.count}
                            </text>
                        </g>
                    ))}
                    {shownGroups.map((g, i) => {
                        const a = positions[g.from],
                            b = positions[g.to],
                            dx = b.x - a.x,
                            dy = b.y - a.y;
                        const factor = Math.min(
                            dx ? width / 2 / Math.abs(dx) : Infinity,
                            dy ? height / 2 / Math.abs(dy) : Infinity
                        );
                        const same = g.from === g.to;
                        const ax = same ? a.x + 40 : a.x + dx * factor,
                            ay = same ? a.y - height / 2 : a.y + dy * factor;
                        const bx = same ? a.x - 40 : b.x - dx * factor,
                            by = same ? a.y - height / 2 : b.y - dy * factor;
                        const lane = ((i % 3) - 1) * 35,
                            cx = (ax + bx) / 2 - (dy ? lane : 0),
                            cy = (ay + by) / 2 + (dx ? lane : 0);
                        const d = same
                            ? `M${ax},${ay} C${ax + 140},${ay - 110} ${
                                bx - 140
                            },${by - 110} ${bx},${by}`
                            : `M${ax},${ay} Q${cx},${cy} ${bx},${by}`;
                        return (
                            <g
                                key={g.key}
                                className={
                                    selected &&
                                    g.from !== selected &&
                                    g.to !== selected
                                        ? 'se-dim'
                                        : ''
                                }>
                                <path
                                    className={`se-edge ${g.kind}`}
                                    d={d}
                                    markerEnd={`url(#${marker}-${g.kind})`}
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
                    {visible.map((n) => (
                        <g
                            key={n.name}
                            data-entity={n.name}
                            className={`entity-node ${
                                selected === n.name ? 'selected' : ''
                            } ${
                                selected && !connected.has(n.name)
                                    ? 'se-dim'
                                    : ''
                            }`}
                            transform={`translate(${
                                positions[n.name].x - width / 2
                            },${positions[n.name].y - height / 2})`}
                            tabIndex={0}
                            role="button"
                            aria-label={n.name}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    choose(n.name);
                                }
                            }}>
                            <rect width={width} height={height} rx="8" />
                            <text x="12" y="26">
                                {n.name}
                            </text>
                            <text x="12" y="49" className="se-subtitle">
                                {n.model
                                    ? `${n.model.fields.length} fields · ${
                                        n.model.fields.filter(
                                            (f) => f.calculated
                                        ).length
                                    } calculated`
                                    : 'Unresolved type'}
                            </text>
                        </g>
                    ))}
                </g>
                {!visible.length && (
                    <text x="20" y="35">
                        No types selected. Use Types to show schemas.
                    </text>
                )}
            </svg>
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
                        <button type="button"
                            onClick={() => {
                                setSelected('');
                                setNeighbors(false);
                                setMoves({});
                            }}>
                            Clear selection
                        </button>
                    </div>
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
