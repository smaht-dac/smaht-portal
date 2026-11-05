import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildResearchMap, researchLabels, traceProvenance, overviewFlow } from './research-map';
import { routeEdges } from './routing';
import { abstractTypes } from './domains';
import { conceptConnections } from './concept-connections';
import { exportPNG } from './shared';

function lines(text) {
    const result = [''];
    for (const word of text.split(' ')) {
        if (`${result[result.length - 1]} ${word}`.trim().length > 29) result.push(word);
        else result[result.length - 1] = `${result[result.length - 1]} ${word}`.trim();
    }
    return result;
}

const nodeLabel = (graph, id) => graph.nodes.find((node) => node.id === id)?.label || id;

function listLabel(names, limit = 2) {
    return names.length > limit ? `${names.slice(0, limit).join(', ')} +${names.length - limit}` : names.join(', ');
}

// One table row per relationship: the schema on the other side, what the link means and the field that stores it.
function RelationshipRow({ edge, section, graph, onInspect }) {
    const from = edge.fromLabel || nodeLabel(graph, edge.from), to = edge.toLabel || nodeLabel(graph, edge.to);
    const sources = (edge.sources || [edge.from]).map((id) => nodeLabel(graph, id));
    const other = section === 'incoming' ? listLabel(sources) : section === 'outgoing' ? to : `${listLabel(sources)} → ${to}`;
    const fields = [...new Set(edge.edges.map((reference) => reference.field))];
    const owners = [...new Set(edge.edges.map((reference) => reference.from))];
    return (
        <tr>
            <th scope="row" className="se-relationship-other">{other}</th>
            <td className="se-relationship-meaning"><span>{edge.question}</span>{edge.explanation && <small>{edge.explanation}</small>}</td>
            <td className="se-relationship-field">
                {fields.slice(0, 2).map((field) => <code key={field}>{field}</code>)}
                {fields.length > 2 && <small>+{fields.length - 2} more</small>}
                <small>{owners.length === 1 ? `on ${owners[0]}` : `on ${owners.length} schemas`}</small>
            </td>
            <td className="se-relationship-action">
                <button type="button" onClick={() => onInspect(edge)} aria-label={`Details for ${from} to ${to}`}>Details →</button>
            </td>
        </tr>
    );
}

// Rows that share a target and wording describe the same link from different schemas, so they are shown once.
function mergeRelationships(edges) {
    const merged = new Map();
    for (const edge of edges) {
        const key = JSON.stringify([edge.to, edge.question, edge.explanation]);
        const existing = merged.get(key);
        if (!existing) merged.set(key, { ...edge, sources: [edge.from] });
        else merged.set(key, { ...existing, key: `${existing.key}+${edge.key}`, edges: [...existing.edges, ...edge.edges], sources: [...existing.sources, edge.from] });
    }
    return [...merged.values()].map((edge) => (edge.sources.length > 1 ? { ...edge, fromLabel: `${edge.sources.length} schemas` } : edge));
}

// Splits concept relationships by reference direction so incoming and outgoing links read separately.
function relationshipSections(edges, concept) {
    const members = new Set([concept.id, ...concept.members]);
    const name = concept.label.toLowerCase();
    const sections = [
        { key: 'outgoing', label: `What ${name} links to`, column: 'Links to', edges: [] },
        { key: 'incoming', label: `What links to ${name}`, column: 'Linked from', edges: [] },
        { key: 'internal', label: `Links within ${name}`, column: 'Link', edges: [] },
    ];
    for (const edge of edges) {
        const fromInside = members.has(edge.from), toInside = members.has(edge.to);
        sections[fromInside && toInside ? 2 : fromInside ? 0 : 1].edges.push(edge);
    }
    return sections.filter((section) => section.edges.length).map((section) => {
        return { ...section, edges: mergeRelationships(section.edges) };
    });
}

const visibleRelationships = 6;

function RelationshipSection({ section, graph, onInspect }) {
    const [expanded, setExpanded] = useState(false);
    const hidden = section.edges.length - visibleRelationships;
    const edges = expanded || hidden <= 0 ? section.edges : section.edges.slice(0, visibleRelationships);
    return (
        <div className="se-relationship-section">
            <h5 className="se-relationship-section-title">{section.label} <span>{section.edges.length}</span></h5>
            <table className="se-relationship-table">
                <thead><tr><th scope="col">{section.column}</th><th scope="col">Meaning</th><th scope="col">Stored in field</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
                <tbody>{edges.map((edge) => <RelationshipRow key={edge.key} edge={edge} section={section.key} graph={graph} onInspect={onInspect} />)}</tbody>
            </table>
            {hidden > 0 && <button type="button" className="se-relationship-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show fewer' : `Show ${hidden} more`}</button>}
        </div>
    );
}

export default function ResearchOverview({ index, nodes, onType, onGroup, onAllTypes, onDetail, onConnections, initialConcept = '', focusMap = false }) {
    const [size, setSize] = useState({ width: 1200, height: 650 });
    const [camera, setCamera] = useState({ x: 20, y: 20, scale: 1 });
    const [selected, setSelected] = useState(initialConcept);
    const [mapExpanded, setMapExpanded] = useState(!initialConcept);
    const [query, setQuery] = useState('');
    const [full, setFull] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState('');
    const svg = useRef(), drag = useRef(), detail = useRef(), detailHeading = useRef();
    const graph = useMemo(() => buildResearchMap(index, nodes, size), [index, nodes, size]);
    const flow = useMemo(() => overviewFlow(graph), [graph]);
    const flowByKey = useMemo(() => new Map(flow.edges.map((edge) => [edge.key, edge])), [flow]);
    const routes = useMemo(() => routeEdges(flow.positions, flow.edges, flow.nodeWidth, flow.nodeHeight, [], { spreadNodes: ['files'] }), [flow]);
    const labels = useMemo(() => researchLabels(flow, routes), [flow, routes]);
    const trace = useMemo(() => traceProvenance(graph, selected), [graph, selected]);
    const concept = graph.nodes.find((node) => node.id === selected);
    const detailConnections = useMemo(() => conceptConnections(index, concept, graph, nodes), [index, concept, graph, nodes]);
    const schemaGroups = concept ? [
        { label: 'Abstract types', abstract: true, members: concept.members.filter((name) => abstractTypes.has(name)) },
        { label: 'Concrete types', abstract: false, members: concept.members.filter((name) => !abstractTypes.has(name)) },
    ].filter((group) => group.members.length) : [];
    const hasAbstract = schemaGroups.some((group) => group.abstract);
    const bounds = useMemo(() => {
        const points = graph.nodes.flatMap((node) => {
            const p = graph.positions[node.id];
            return [{ x: p.x - graph.nodeWidth / 2, y: p.y - graph.nodeHeight / 2 },
                { x: p.x + graph.nodeWidth / 2, y: p.y + graph.nodeHeight / 2 + 26 }];
        });
        Object.values(routes).forEach((route) => points.push(...route.points));
        Object.values(labels).forEach((label) => points.push({ x: label.left, y: label.top }, { x: label.left + label.width, y: label.top + label.height }));
        return points.length ? {
            left: Math.min(...points.map((p) => p.x)) - 20, right: Math.max(...points.map((p) => p.x)) + 20,
            top: Math.min(...points.map((p) => p.y)) - 20, bottom: Math.max(...points.map((p) => p.y)) + 20,
        } : { left: 0, right: 600, top: 0, bottom: 400 };
    }, [graph, routes, labels]);
    const fit = useCallback((readable = true) => {
        const scale = Math.max(readable ? 0.85 : 0.05, Math.min(1.25, size.width / (bounds.right - bounds.left), size.height / (bounds.bottom - bounds.top)));
        setCamera({ scale,
            x: (bounds.right - bounds.left) * scale <= size.width ? (size.width - (bounds.left + bounds.right) * scale) / 2 : 16 - bounds.left * scale,
            y: (bounds.bottom - bounds.top) * scale <= size.height ? (size.height - (bounds.top + bounds.bottom) * scale) / 2 : 16 - bounds.top * scale,
        });
    }, [bounds, size]);
    const zoom = useCallback((factor, x = size.width / 2, y = size.height / 2) => {
        setCamera((c) => {
            const scale = Math.max(0.1, Math.min(3, c.scale * factor));
            return { scale, x: x - (x - c.x) * scale / c.scale, y: y - (y - c.y) * scale / c.scale };
        });
    }, [size]);
    useEffect(() => { fit(); }, [fit, full]);
    useEffect(() => {
        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            if (width && height) setSize((s) => s.width === width && s.height === height ? s : { width, height });
        });
        observer.observe(svg.current);
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        const element = svg.current;
        const wheel = (event) => {
            event.preventDefault();
            const box = element.getBoundingClientRect();
            zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX - box.left, event.clientY - box.top);
        };
        element.addEventListener('wheel', wheel, { passive: false });
        return () => element.removeEventListener('wheel', wheel);
    }, [zoom]);
    useEffect(() => {
        if (!full) return undefined;
        const { overflow } = document.body.style;
        const escape = (event) => { if (event.key === 'Escape') setFull(false); };
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', escape);
        return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', escape); };
    }, [full]);
    const inspect = useCallback((edge) => onDetail({
        title: `${graph.nodes.find((node) => node.id === edge.from)?.label || edge.fromLabel || edge.from} → ${graph.nodes.find((node) => node.id === edge.to)?.label || edge.toLabel || edge.to}`,
        intro: 'The entry map follows biological progression. These exact schema references retain reference direction; [] denotes an array.',
        value: edge.edges,
        relationship: edge.edges,
        sources: edge.edges.flatMap((e) => index.models.find((model) => model.name === e.from)?.fields.find((field) => field.name === e.field.split('.')[0].replaceAll('[]', ''))?.sources || []),
    }), [graph, index, onDetail]);
    const choose = (id) => {
        setSelected(id);
        setMapExpanded(false);
        requestAnimationFrame(() => {
            detailHeading.current?.focus({ preventScroll: true });
            detail.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        });
    };
    useEffect(() => {
        if (initialConcept) requestAnimationFrame(() => {
            detailHeading.current?.focus({ preventScroll: true });
            detail.current?.scrollIntoView({ block: 'start' });
        });
    }, [initialConcept]);
    useEffect(() => {
        if (focusMap) requestAnimationFrame(() => {
            svg.current?.focus({ preventScroll: true });
            svg.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
        });
    }, [focusMap]);
    const returnToMap = () => {
        setSelected('');
        setMapExpanded(true);
        requestAnimationFrame(() => { svg.current?.focus({ preventScroll: true }); svg.current?.scrollIntoView({ block: 'center' }); });
    };
    const dimNode = (id) => selected && !trace.nodes.has(id) &&
        (!graph.edges.some((edge) => (edge.from === selected && edge.to === id) || (edge.to === selected && edge.from === id)));
    const dimEdge = (edge) => selected && !trace.edges.has(edge.key) && (edge.from !== selected && edge.to !== selected);
    return (
        <section className={`se-research-overview${full ? ' se-fullscreen' : ''}`} aria-label="Metadata relationship overview">
            <div className="se-research-heading">
                <div><h2>From donor to data</h2><p>How specimens, experiments and files connect in the SMaHT metadata model.</p></div>
                <button type="button" onClick={onAllTypes}>All {nodes.length} schemas</button>
            </div>
            <div className="se-research-toolbar">
                <input aria-label="Search schemas" type="search" placeholder="Find a specific schema…" value={query} onChange={(event) => setQuery(event.target.value)} />
                <button type="button" hidden={!mapExpanded} disabled={exporting} onClick={async () => {
                    setExporting(true);
                    try { await exportPNG(svg.current, 'metadata-relationships'); }
                    catch (err) { setError(err.message || 'PNG export failed.'); }
                    finally { setExporting(false); }
                }}>{exporting ? 'Exporting…' : 'Export PNG'}
                </button>
                <div className="se-zoom-controls" hidden={!mapExpanded} role="group" aria-label="Zoom controls">
                    <button type="button" onClick={() => fit(false)}>Fit all</button>
                    <button type="button" aria-label="Zoom out" onClick={() => zoom(0.8)}>−</button>
                    <span>{Math.round(camera.scale * 100)}%</span>
                    <button type="button" aria-label="Zoom in" onClick={() => zoom(1.25)}>+</button>
                </div>
            </div>
            {query && <div className="se-toolbar">{nodes.filter((node) => node.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8).map((node) => <button type="button" key={node.name} onClick={() => onType(node.name)}>{node.name}</button>)}</div>}
            {concept && (
                <button type="button" className="se-research-map-toggle" aria-expanded={mapExpanded} aria-controls="research-map-context" onClick={() => setMapExpanded(!mapExpanded)}>
                    <span>Metadata map <span aria-hidden="true">/</span> {concept.label}</span><span>{mapExpanded ? 'Hide overview ↑' : 'Show overview ↓'}</span>
                </button>
            )}
            <div id="research-map-context" hidden={!mapExpanded}>
                <div className="se-research-legend" aria-label="Reading the map">
                    <div className="se-map-guide">
                        <span className="se-map-guide-symbol" aria-hidden="true">1–7</span>
                        <div><strong>Donor to data</strong><p>Follow the numbered workflow forward, or trace a file’s origin backward.</p><p>Branches add experimental and analysis context. Read each arrow as a sentence: Donor provides Source material.</p><p>Schema diagrams use the reference direction instead: arrows point to the referenced schema.</p></div>
                    </div>
                    <div className="se-map-guide">
                        <span className="se-map-guide-symbol" aria-hidden="true">↗</span>
                        <div><strong>Explore the relationships</strong><p><b>Box</b> opens its schema diagram · <b>Arrow</b> opens relationship details.</p><p><b>Overview</b> explains the concept.</p></div>
                    </div>
                    <div className="se-map-guide se-map-guide-navigation">
                        <span className="se-map-guide-symbol" aria-hidden="true">↔</span>
                        <div><strong>Move around</strong><p>Drag to pan · Scroll to zoom</p></div>
                    </div>
                </div>
                {error && <p role="alert">{error}</p>}
                <div className="se-canvas-wrap">
                    <button type="button" className="se-canvas-fullscreen" aria-label={full ? 'Exit full screen' : 'Enter full screen'} aria-pressed={full} onClick={() => setFull(!full)}>{full ? '↙' : '⛶'}</button>
                    <svg ref={svg} id="research-svg" className="se-canvas" role="group" aria-label="Donor to data relationship map" tabIndex={0}
                        onPointerDown={(event) => {
                            if (event.button !== 0 || event.target.closest('[data-concept], [data-reference], [data-overview]')) return;
                            drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
                            event.currentTarget.setPointerCapture(event.pointerId);
                        }}
                        onPointerMove={(event) => {
                            const d = drag.current;
                            if (!d || d.id !== event.pointerId) return;
                            const dx = event.clientX - d.x, dy = event.clientY - d.y;
                            d.x = event.clientX; d.y = event.clientY;
                            setCamera((c) => {return { ...c, x: c.x + dx, y: c.y + dy };});
                        }}
                        onPointerUp={(event) => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
                        onPointerCancel={() => { drag.current = null; }}
                        onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return;
                            const delta = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[event.key];
                            if (delta) { event.preventDefault(); setCamera((c) => {return { ...c, x: c.x + delta[0], y: c.y + delta[1] };}); }
                        }}>
                        <g data-world="" transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
                            {graph.edges.map((edge) => {
                                const route = routes[edge.key];
                                if (!route) return null;
                                const { end, ux, uy } = route, baseX = end.x - ux * 10, baseY = end.y - uy * 10;
                                return (
                                    <g key={edge.key} data-reference={edge.key} className={dimEdge(edge) ? 'se-research-dim' : ''}>
                                        <path className={`se-research-edge${trace.edges.has(edge.key) ? ' se-research-traced' : ''}`} d={route.d} role="button" tabIndex={0}
                                            aria-label={`${flowByKey.get(edge.key).label}: ${graph.nodes.find((node) => node.id === flowByKey.get(edge.key).from)?.label} → ${graph.nodes.find((node) => node.id === flowByKey.get(edge.key).to)?.label}. Open schema references`}
                                            onClick={() => inspect(edge)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspect(edge); } }}>
                                            <title>{`Schema references (reference direction):\n${edge.edges.map((e) => `${e.from}.${e.field} → ${e.to}`).join('\n')}`}</title>
                                        </path>
                                        <polygon points={`${end.x},${end.y} ${baseX - uy * 4},${baseY + ux * 4} ${baseX + uy * 4},${baseY - ux * 4}`} fill="#477293" pointerEvents="none" />
                                    </g>
                                );
                            })}
                            {graph.nodes.map((node) => {
                                const p = graph.positions[node.id];
                                return (
                                    <g key={node.id} data-concept={node.id} className={`se-research-node${dimNode(node.id) ? ' se-research-dim' : ''}${selected === node.id ? ' se-research-selected' : ''}`}
                                        transform={`translate(${p.x - graph.nodeWidth / 2},${p.y - graph.nodeHeight / 2})`}>
                                        <g className="se-research-diagram-action" role="button" tabIndex={0}
                                            aria-label={`Explore ${node.label} connections: ${node.hint}`} aria-pressed={selected === node.id} onClick={() => onConnections({ ...node, origin: 'map', connections: conceptConnections(index, node, graph, nodes) })}
                                            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onConnections({ ...node, origin: 'map', connections: conceptConnections(index, node, graph, nodes) }); } }}>
                                            <rect className="se-research-card" width={graph.nodeWidth} height={graph.nodeHeight} rx="8" />
                                            <text className="se-research-title" x="14" y="26">{node.label}</text>
                                            {lines(node.hint).map((line, i) => <text className="se-research-hint" key={line} x="14" y={47 + i * 15}>{line}</text>)}
                                            <text className="se-research-example" x="14" y="89">{node.example}</text>
                                            {node.step && <g><circle cx={graph.nodeWidth - 16} cy="16" r="10" fill={node.color} /><text className="se-research-step" x={graph.nodeWidth - 16} y="20">{node.step}</text></g>}
                                        </g>
                                        <g data-overview={node.id} className="se-research-overview-action" role="button" tabIndex={0}
                                            aria-label={`${node.label} overview`}
                                            onClick={() => choose(node.id)}
                                            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(node.id); } }}>
                                            <rect x={graph.nodeWidth - 94} y="108" width="84" height="22" rx="4" />
                                            <text x={graph.nodeWidth - 14} y="123" textAnchor="end">Overview →</text>
                                        </g>
                                    </g>
                                );
                            })}
                            {graph.edges.map((edge) => {
                                const label = labels[edge.key];
                                if (!label) return null;
                                return (
                                    <g key={`label-${edge.key}`} data-reference={edge.key} className={`se-research-label${dimEdge(edge) ? ' se-research-dim' : ''}`} onClick={() => inspect(edge)}>
                                        <rect x={label.left} y={label.top} width={label.width} height={label.height} rx="4" />
                                        <text x={label.left + label.width / 2} y={label.top + 15}>{flowByKey.get(edge.key).label}</text>
                                    </g>
                                );
                            })}
                            {!graph.nodes.length && <text x="20" y="35">No enabled schemas in the core model. Open All schemas to change type visibility.</text>}
                        </g>
                    </svg>
                </div>
            </div>

            {concept && (
                <section ref={detail} className="se-research-detail" aria-label={`${concept.label} details`} style={{ '--se-concept-color': concept.color }}>
                    <header className="se-concept-heading">
                        <div><span className="se-concept-eyebrow">Explore the metadata</span><h3 ref={detailHeading} tabIndex={-1}>{concept.label}</h3><p className="se-concept-question">{concept.hint}</p></div>
                        <div className="se-concept-actions"><button type="button" className="se-concept-group-link" onClick={() => onConnections({ ...concept, origin: 'concept', connections: detailConnections })}>Explore {concept.label} connections →</button><button type="button" onClick={returnToMap}>← Back to overview</button></div>
                    </header>
                    <p className="se-concept-description">{concept.description}</p>
                    <div className="se-concept-navigation"><label>Explore another concept<select aria-label="Explore another concept" value={selected} onChange={(event) => choose(event.target.value)}>{graph.nodes.map((node) => <option value={node.id} key={node.id}>{node.label}</option>)}</select></label></div>
                    <div className="se-concept-workspace">
                        <section className="se-concept-relationships" aria-labelledby="concept-relationships-heading">
                            <h4 id="concept-relationships-heading">Key relationships for {concept.label.toLowerCase()}</h4>
                            <p className="se-concept-help">How {concept.label.toLowerCase()} connects to other metadata. Use Details to see every schema and field definition behind a link.</p>
                            {relationshipSections(detailConnections, concept).map((section) => <RelationshipSection key={`${concept.id}-${section.key}`} section={section} graph={graph} onInspect={inspect} />)}
                        </section>
                        <aside className="se-concept-schemas" aria-labelledby="concept-schemas-heading">
                            <h4 id="concept-schemas-heading">Schemas in this concept <span>{concept.members.length}</span></h4>
                            <p>Choose a schema to explore its fields and model details.</p>
                            {hasAbstract && <p className="se-concept-inheritance-help">Abstract types define shared fields for the concrete schemas below.</p>}
                            {schemaGroups.map((group) => (
                                <div className="se-concept-schema-group" key={group.label}>
                                    {hasAbstract && <h5>{group.label}</h5>}
                                    {group.members.map((name) => (
                                        <button className={`se-concept-schema${group.abstract ? ' se-concept-schema-abstract' : ''}`} data-schema={name} data-abstract={group.abstract} type="button" key={name} onClick={() => onType(name)}>
                                            <span className="se-concept-schema-name"><span>{name}</span>{group.abstract && <span className="se-concept-abstract-badge">Abstract</span>}<span aria-hidden="true">→</span></span>
                                            <span className="se-concept-schema-description">{index.models.find((model) => model.name === name)?.schema.description || `Explore the ${name} schema and its fields.`}</span>
                                            {group.abstract && <span className="se-concept-abstract-note">Shared base definition</span>}
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </aside>
                    </div>
                </section>
            )}
            <div className="se-research-support"><span>More context</span>
                <button type="button" onClick={() => onGroup('donors')}>Clinical history &amp; donor details</button>
                <button type="button" onClick={() => onGroup('sequencing')}>Preparation &amp; instruments</button>
                <button type="button" onClick={() => onGroup('files')}>References &amp; file metadata</button>
                <button type="button" onClick={() => onGroup('administrative')}>Administrative metadata</button>
            </div>
        </section>
    );
}
