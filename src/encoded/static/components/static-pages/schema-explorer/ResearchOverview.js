import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildResearchMap, researchLabels, traceProvenance, overviewFlow, conceptIcons, branchOf } from './research-map';
import { routeEdges } from './routing';
import { domains } from './domains';
import { exportPNG, InfoPopover } from './shared';

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

// A title such as "Donors" for donors[] adds nothing next to the field itself.
const restatesField = (title = '', fields) => {
    const plain = (text) => text.toLowerCase().replace(/[^a-z]/g, '');
    return fields.some((field) => plain(field.split('.').pop()) === plain(title));
};

// One table row per relationship, scanned rather than read: the schema on the other side, its one-line meaning and
// the field that stores it. The longer explanation opens with Details.
function RelationshipRow({ edge, section, graph, onInspect, onTrace }) {
    const from = edge.fromLabel || nodeLabel(graph, edge.from), to = edge.toLabel || nodeLabel(graph, edge.to);
    const sources = (edge.sources || [edge.from]).map((id) => nodeLabel(graph, id));
    const other = section === 'incoming' ? listLabel(sources) : section === 'outgoing' ? to : `${listLabel(sources)} → ${to}`;
    const fields = [...new Set(edge.edges.map((reference) => reference.field))];
    const owners = [...new Set(edge.edges.map((reference) => reference.from))];
    // Pointing at a row traces its references on the map above.
    const trace = onTrace ? { onMouseEnter: () => onTrace(edge.edges), onMouseLeave: () => onTrace(null), onFocus: () => onTrace(edge.edges), onBlur: () => onTrace(null) } : {};
    return (
        <tr {...trace}>
            <th scope="row" className="se-relationship-other">{other}</th>
            <td className="se-relationship-meaning">{restatesField(edge.question, fields) ? <span className="se-relationship-none" aria-label="No separate meaning">—</span> : <span>{edge.question}</span>}</td>
            <td className="se-relationship-field">
                {fields.slice(0, 2).map((field) => <code key={field}>{field}</code>)}
                {fields.length > 2 && <small>+{fields.length - 2} more</small>}
                <small>{owners.length === 1 ? `on ${owners[0]}` : `on ${owners.length} schemas`}</small>
            </td>
            <td className="se-relationship-action">
                <button type="button" onClick={() => onInspect(edge)} aria-label={`Details for ${from} to ${to}`}>Details <i className="icon icon-fw icon-angle-right fas" aria-hidden="true" /></button>
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

function RelationshipSection({ section, graph, onInspect, onTrace }) {
    const [expanded, setExpanded] = useState(false);
    const hidden = section.edges.length - visibleRelationships;
    const edges = expanded || hidden <= 0 ? section.edges : section.edges.slice(0, visibleRelationships);
    return (
        <div className="se-relationship-section">
            <h5 className="se-relationship-section-title">{section.label} <span>{section.edges.length}</span></h5>
            <table className="se-relationship-table">
                <thead><tr><th scope="col">{section.column}</th><th scope="col">Meaning</th><th scope="col">Stored in field</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
                <tbody>{edges.map((edge) => <RelationshipRow key={edge.key} edge={edge} section={section.key} graph={graph} onInspect={onInspect} onTrace={onTrace} />)}</tbody>
            </table>
            {hidden > 0 && <button type="button" className="se-relationship-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show fewer' : `Show ${hidden} more`}</button>}
        </div>
    );
}

// The relationship dialog for a concept link, shared by the map's arrows and the concept's tables.
export function researchDetail(edge, graph, index) {
    return {
        title: `${graph.nodes.find((node) => node.id === edge.from)?.label || edge.fromLabel || edge.from} → ${graph.nodes.find((node) => node.id === edge.to)?.label || edge.toLabel || edge.to}`,
        intro: 'The entry map follows biological progression. These exact schema references retain reference direction; [] denotes an array.',
        // The concept tables keep one line per link; the longer, link-specific explanation is shown here.
        meaning: edge.explanation,
        value: edge.edges,
        relationship: edge.edges,
        sources: edge.edges.flatMap((e) => index.models.find((model) => model.name === e.from)?.fields.find((field) => field.name === e.field.split('.')[0].replaceAll('[]', ''))?.sources || []),
    };
}

// Under a concept's map while no schema is selected: the concept's links, gathered across its schemas, by direction.
// Selecting a schema on the map replaces it with that schema's own links.
export function ConceptSummary({ concept, connections, graph, index, onDetail, onTrace }) {
    const sections = relationshipSections(connections, concept);
    const inspect = (edge) => onDetail(researchDetail(edge, graph, index));
    return (
        <section id="concept-summary" className="se-selected-panel se-concept-summary" aria-label={`${concept.label} relationships`}>
            <header>
                <div>
                    <span className="se-diagram-eyebrow">Relationships</span>
                    <h3>How {concept.label.toLowerCase()} connects</h3>
                    <p>Across its schemas. Point at a link to trace it on the map; select a schema on the map for its own links.</p>
                </div>
            </header>
            {sections.map((section) => <RelationshipSection key={`${concept.id}-${section.key}`} section={section} graph={graph} onInspect={inspect} onTrace={onTrace} />)}
            {!sections.length && <p className="se-flow-note">No links to other metadata.</p>}
        </section>
    );
}

// How to read the map, behind the info icon beside the title as on the portal's chart titles.
function MapGuide() {
    return (
        <InfoPopover id="se-map-guide-popover" className="se-map-guide-popover" label="How to read the map" title="Reading the map">
            <h4>Donor to data</h4>
            <p>Follow the numbered workflow forward, or trace a file’s origin backward.</p>
            <p>Branches add experimental and analysis context. Read each arrow as a sentence: Donor provides Source material.</p>
            <p>Schema diagrams use the reference direction instead: arrows point to the referenced schema.</p>
            <h4>Explore the relationships</h4>
            <p><b>Box</b> opens its schema diagram · <b>Arrow</b> opens relationship details.</p>
            <p><b>Summary</b> explains the concept.</p>
            <h4>Move around</h4>
            <p>Drag to pan · Scroll to zoom</p>
        </InfoPopover>
    );
}


// The whole donor-to-data path with the current concept marked, so its place reads at a glance.
// It sits under every concept's heading, on both tabs, so the reader always sees where the concept sits and can go back to the
// whole map (Overview) or on to the next step in one move.
function WorkflowStepper({ concept, graph, onConcept, onOverview }) {
    const steps = graph.nodes.filter((node) => node.step).sort((a, b) => a.step - b.step);
    const anchor = concept.step ? concept.id : branchOf[concept.id];
    const parent = graph.nodes.find((node) => node.id === anchor);
    // Branch concepts are listed under the current step, so its side topics are one click away.
    const branches = (id) => graph.nodes.filter((node) => branchOf[node.id] === id);
    return (
        <nav className="se-stepper" aria-label="Place in the donor-to-data workflow">
            <ol>
                <li className="se-step-overview">
                    <button type="button" onClick={onOverview}>
                        <span className="se-step-number"><i className="icon icon-diagram-project fas" aria-hidden="true" /></span>
                        <span className="se-step-label">Overview</span>
                    </button>
                </li>
                {steps.map((node) => {
                    const current = node.id === anchor;
                    return (
                        <li key={node.id} className={current ? 'se-step-current' : undefined}>
                            <button type="button" aria-current={current ? 'step' : undefined} onClick={() => onConcept(node.id)}>
                                <span className="se-step-number">{node.step}</span>
                                <span className="se-step-label">{node.label}</span>
                            </button>
                            {/* Only the current step lists its branches; the others are in the side menu and on the map. */}
                            {current && branches(node.id).length > 0 && (
                                <ul className="se-step-branches" aria-label={`Branches off ${node.label}`}>
                                    {branches(node.id).map((branch) => (
                                        <li key={branch.id}>
                                            <button type="button" aria-current={branch.id === concept.id ? 'page' : undefined} onClick={() => onConcept(branch.id)}>{branch.label}</button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    );
                })}
            </ol>
            {!concept.step && parent && (
                <p className="se-stepper-branch">
                    <strong>{concept.label}</strong> is not a step of its own: it branches off <button type="button" onClick={() => onConcept(parent.id)}>{parent.label}</button> and answers “{concept.hint}”
                </p>
            )}
        </nav>
    );
}

// Without `conceptId` this is the metadata map; with it, that concept's page: its heading, its place on the path and
// `mapTab`, the concept's map with its relationships underneath. The explorer's side menu and the page URL hold where
// the reader is, so every move goes through `onNavigate`.
export default function ResearchOverview({ index, nodes, onAllTypes, onDetail, onNavigate, conceptId = '', mapTab = null }) {
    const [size, setSize] = useState({ width: 1200, height: 650 });
    const [camera, setCamera] = useState({ x: 20, y: 20, scale: 1 });
    const selected = conceptId;
    const showMap = !conceptId;
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
    // The canvas is as tall as the map at the width-fitted scale, so a narrower page (beside the side menu)
    // shows every row instead of cutting the last one off.
    const fitHeight = Math.round((bounds.bottom - bounds.top) * Math.max(0.85, Math.min(1.25, size.width / (bounds.right - bounds.left))));
    useEffect(() => { fit(); }, [fit, full]);
    useEffect(() => {
        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            if (width && height) setSize((s) => s.width === width && s.height === height ? s : { width, height });
        });
        if (svg.current) observer.observe(svg.current);
        return () => observer.disconnect();
    }, [showMap]);
    useEffect(() => {
        const element = svg.current;
        if (!element) return undefined;
        const wheel = (event) => {
            event.preventDefault();
            const box = element.getBoundingClientRect();
            zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX - box.left, event.clientY - box.top);
        };
        element.addEventListener('wheel', wheel, { passive: false });
        return () => element.removeEventListener('wheel', wheel);
    }, [zoom, showMap]);
    useEffect(() => {
        if (!full) return undefined;
        const { overflow } = document.body.style;
        const escape = (event) => { if (event.key === 'Escape') setFull(false); };
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', escape);
        return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', escape); };
    }, [full]);
    const inspect = useCallback((edge) => onDetail(researchDetail(edge, graph, index)), [graph, index, onDetail]);
    // Opening a concept puts keyboard and screen-reader focus on its heading; switching its tabs does not.
    useEffect(() => { if (conceptId) detailHeading.current?.focus({ preventScroll: true }); }, [conceptId]);
    const openConcept = (id) => onNavigate({ view: 'concept', concept: id });
    const dimNode = (id) => selected && !trace.nodes.has(id) &&
        (!graph.edges.some((edge) => (edge.from === selected && edge.to === id) || (edge.to === selected && edge.from === id)));
    const dimEdge = (edge) => selected && !trace.edges.has(edge.key) && (edge.from !== selected && edge.to !== selected);
    return (
        <section className={`se-research-overview${full ? ' se-fullscreen' : ''}`} aria-label="Metadata relationship overview">
            {showMap && (
                <>
                    <div className="se-research-heading">
                        <div><div className="se-research-title"><h2>From donor to data</h2><MapGuide /></div><p>How specimens, experiments and files connect in the SMaHT metadata model.</p></div>
                        <button type="button" onClick={onAllTypes}>All {nodes.length} schemas</button>
                    </div>
                    <div className="se-research-toolbar">
                        <button type="button" disabled={exporting} onClick={async () => {
                            setExporting(true);
                            try { await exportPNG(svg.current, 'metadata-relationships'); }
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
                    </div>
                    <div id="research-map-context">
                        {error && <p role="alert">{error}</p>}
                        <div className="se-canvas-wrap">
                            <button type="button" className="se-canvas-fullscreen" aria-label={full ? 'Exit full screen' : 'Enter full screen'} aria-pressed={full} onClick={() => setFull(!full)}><i className={`icon icon-fw fas ${full ? 'icon-compress-alt' : 'icon-expand-alt'}`} aria-hidden="true" /></button>
                            <svg ref={svg} id="research-svg" className="se-canvas" style={full ? undefined : { height: fitHeight }} role="group" aria-label="Donor to data relationship map" tabIndex={0}
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
                                <defs>
                                    {[['research-arrow', '#888'], ['research-arrow-traced', '#079483' /* $seafoam-60 */]].map(([id, color]) => (
                                        <marker key={id} id={id} viewBox="0 0 10 8" refX="10" refY="4" markerWidth="10" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
                                            <path d="M0,0 L10,4 L0,8 Z" fill={color} />
                                        </marker>
                                    ))}
                                </defs>
                                <g data-world="" transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
                                    {graph.edges.map((edge) => {
                                        const route = routes[edge.key];
                                        if (!route) return null;
                                        return (
                                            <g key={edge.key} data-reference={edge.key} className={dimEdge(edge) ? 'se-research-dim' : ''}>
                                                <path className={`se-research-edge${trace.edges.has(edge.key) ? ' se-research-traced' : ''}`} d={route.d} role="button" tabIndex={0}
                                                    markerEnd={`url(#${trace.edges.has(edge.key) ? 'research-arrow-traced' : 'research-arrow'})`}
                                                    aria-label={`${flowByKey.get(edge.key).label}: ${graph.nodes.find((node) => node.id === flowByKey.get(edge.key).from)?.label} → ${graph.nodes.find((node) => node.id === flowByKey.get(edge.key).to)?.label}. Open schema references`}
                                                    onClick={() => inspect(edge)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspect(edge); } }}>
                                                    <title>{`Schema references (reference direction):\n${edge.edges.map((e) => `${e.from}.${e.field} → ${e.to}`).join('\n')}`}</title>
                                                </path>
                                            </g>
                                        );
                                    })}
                                    {graph.nodes.map((node) => {
                                        const p = graph.positions[node.id];
                                        return (
                                            <g key={node.id} data-concept={node.id} className={`se-research-node${dimNode(node.id) ? ' se-research-dim' : ''}${selected === node.id ? ' se-research-selected' : ''}`}
                                                transform={`translate(${p.x - graph.nodeWidth / 2},${p.y - graph.nodeHeight / 2})`}>
                                                <g className="se-research-diagram-action" role="button" tabIndex={0}
                                                    aria-label={`Explore ${node.label} connections: ${node.hint}`} aria-pressed={selected === node.id} onClick={() => openConcept(node.id)}
                                                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openConcept(node.id); } }}>
                                                    <rect className="se-research-card" width={graph.nodeWidth} height={graph.nodeHeight} rx="4" />
                                                    <text className="se-research-title" x="14" y="26">{node.label}</text>
                                                    {lines(node.hint).map((line, i) => <text className="se-research-hint" key={line} x="14" y={47 + i * 15}>{line}</text>)}
                                                    <text className="se-research-example" x="14" y="89">{node.example}</text>
                                                    {node.step && <g><circle className="se-research-step-badge" cx={graph.nodeWidth - 16} cy="16" r="10" /><text className="se-research-step" x={graph.nodeWidth - 16} y="20">{node.step}</text></g>}
                                                </g>
                                                <g data-overview={node.id} className="se-research-overview-action" role="button" tabIndex={0}
                                                    aria-label={`${node.label} summary`}
                                                    onClick={() => openConcept(node.id)}
                                                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openConcept(node.id); } }}>
                                                    <rect x={graph.nodeWidth - 94} y="108" width="84" height="22" rx="4" />
                                                    <text x={graph.nodeWidth - 14} y="123" textAnchor="end">Summary →</text>
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

                    <p className="se-research-support">
                        Not every schema is on this map.
                        <button type="button" onClick={onAllTypes}>Browse all {nodes.length} schemas by group <i className="icon icon-fw icon-angle-right fas" aria-hidden="true" /></button>
                    </p>
                </>
            )}
            {concept && (
                <section ref={detail} className="se-research-detail" aria-label={`${concept.label} details`}>
                    {/* Laid out like a portal item page header: entity icon, title, then a ruled label | value row. */}
                    <header className="se-concept-heading">
                        <span className="se-concept-icon" aria-hidden="true"><i className={`icon fas icon-${conceptIcons[concept.id] || 'circle'}`} /></span>
                        <div>
                            <h3 ref={detailHeading} tabIndex={-1}>{concept.label}</h3>
                            <div className="se-concept-subtitle">
                                <p className="se-concept-question">{concept.hint}</p>
                                <span className="se-concept-meta"><span>Schema group</span><span className="se-concept-eyebrow">{domains.find((d) => d.id === concept.domain)?.label || 'Explore the metadata'}</span></span>
                            </div>
                            {/* What the concept covers, under its name like an item page's description. */}
                            <p className="se-concept-description">{concept.description}</p>
                        </div>
                    </header>
                    <WorkflowStepper concept={concept} graph={graph} onOverview={() => onNavigate({ view: 'overview' })}
                        onConcept={(id) => onNavigate({ view: 'concept', concept: id })} />
                    <div className="se-concept-map-tab">{mapTab}</div>
                </section>
            )}
        </section>
    );
}
