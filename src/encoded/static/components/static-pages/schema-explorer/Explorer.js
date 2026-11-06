import React, { useState, useEffect, useRef, useMemo } from 'react';
import Modal from 'react-bootstrap/esm/Modal';
import Diagram from './Diagram';
import { explorerIndex } from './explorer-scope';
import RelationshipDetails from './RelationshipDetails';
import Planner from './Planner';
import LiveItem, { OriginTags } from './LiveItem';
import { describe } from './provenance';
import {
    Badge,
    SourceLinks,
    linkTargets,
    portalRequest,
    shortValue,
} from './shared';

// Short class names, qualified by their module when two bases share a name (base.Item, resources.Item).
function baseLabel(id, bases) {
    const name = id.split('.').pop();
    return bases.filter((base) => base.id.split('.').pop() === name).length > 1 ? id.split('.').slice(-2).join('.') : name;
}

const fieldFilters = [
    ['all', 'All', () => true],
    ['links', 'Links', (field) => linkTargets(field.schema).length > 0],
    ['calculated', 'Calculated', (field) => field.calculated],
    ['required', 'Required', (field) => field.required],
];

function Inspector({ model, index, query, onDetail, onSource, live }) {
    const [tab, setTab] = useState('fields'),
        [filter, setFilter] = useState('all'),
        [queries, setQueries] = useState({
            fields: '',
            embeds: '',
            diagnostics: '',
        });
    const local = queries[tab].toLowerCase();
    const match = (value) => {
        const text = String(value).toLowerCase();
        return text.includes(query.toLowerCase()) && text.includes(local);
    };
    const accepts = fieldFilters.find(([key]) => key === filter)[2];
    const fields = model.fields
        .filter((f) => accepts(f) && match(`${f.name} ${JSON.stringify(f.schema)}${f.calculated ? ' calculated' : ''}`))
        .sort((a, b) => a.name.localeCompare(b.name));
    const embeds = model.embeds.filter(match);
    const warnings = index.warnings.filter(match);
    const totals = { fields: model.fields.length, embeds: model.embeds.length, diagnostics: index.warnings.length };
    const shown = { fields: fields.length, embeds: embeds.length, diagnostics: warnings.length }[tab];
    const total = tab === 'fields' ? model.fields.filter(accepts).length : totals[tab];
    const labels = { fields: 'Fields', embeds: 'Embeds', diagnostics: 'Diagnostics' };
    return (
        <section className="se-inspector" aria-label={`${model.name} contents`}>
            <div className="se-inspector-tabs" role="tablist" aria-label="Schema contents">
                {Object.keys(labels).map((name) => (
                    <button type="button" role="tab" key={name} aria-selected={tab === name} onClick={() => setTab(name)}>
                        {labels[name]} <span>{totals[name]}</span>
                    </button>
                ))}
            </div>
            <div className="se-inspector-search">
                <input
                    type="search"
                    aria-label={`Search ${tab}`}
                    placeholder={`Search ${tab}…`}
                    value={queries[tab]}
                    onChange={(e) => setQueries({ ...queries, [tab]: e.target.value })}
                />
                <span>{shown === total ? `${total} shown` : `${shown} of ${total}`}</span>
            </div>
            {tab === 'fields' && (
                <div className="se-field-filters" role="group" aria-label="Filter fields">
                    {fieldFilters.map(([key, label, test]) => (
                        <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                            {label} <span>{model.fields.filter(test).length}</span>
                        </button>
                    ))}
                </div>
            )}
            <div className="se-inspector-list">
                {tab === 'fields' && fields.map((field) => {
                    const targets = linkTargets(field.schema),
                        row = live?.model === model.name ? live.rows.find((r) => r.name === field.name) : null;
                    return (
                        <button type="button"
                            className="se-field"
                            key={field.name}
                            onClick={() =>
                                onDetail({
                                    title: `${model.name}.${field.name}`,
                                    value: field.schema,
                                    sources: field.sources,
                                    intro: field.calculated ? `Calculated property · ${field.owner || ''}` : 'Stored schema field',
                                    sections: row ? [['Live value', row.value], ['Origin evidence', row.evidence]] : [],
                                })
                            }>
                            <span className="se-field-name">
                                <code>{field.name}</code>
                                {field.required && <span className="se-field-required">required</span>}
                            </span>
                            <span className="se-field-type">
                                {Array.isArray(field.schema.type) ? field.schema.type.join(' | ') : field.schema.type || '—'}
                            </span>
                            <span className="se-field-tags">
                                {targets.length > 0 && <Badge kind="linkTo">→ {targets.join(' | ')}</Badge>}
                                {field.calculated && <Badge kind="calculated">Calculated</Badge>}
                            </span>
                            {row && (
                                <span className="se-field-live">
                                    <OriginTags row={row} />
                                    {shortValue(row.value)}
                                    {row.sourceItem && <small> · {row.sourceItem}</small>}
                                </span>
                            )}
                        </button>
                    );
                })}
                {tab === 'fields' && !fields.length && <p className="se-inspector-empty">No fields match.</p>}
                {tab === 'embeds' && (
                    <>
                        <p className="se-inspector-note">Explicit and inherited embedded_list entries. Automatic framework embeds are not included.</p>
                        <SourceLinks sources={[model.embedded_listSource]} onSource={onSource} />
                        {embeds.map((path) => (
                            <button type="button"
                                className="se-field se-embed"
                                key={path}
                                onClick={() =>
                                    onDetail({
                                        title: path,
                                        value: { path, segments: path.split('.') },
                                        sources: [model.embedded_listSource].filter(Boolean),
                                    })
                                }>
                                {path.split('.').map((segment, i) => (
                                    <React.Fragment key={`${segment}-${i}`}>
                                        {i > 0 && <span className="se-embed-sep" aria-hidden="true">›</span>}
                                        <code>{segment}</code>
                                    </React.Fragment>
                                ))}
                            </button>
                        ))}
                        {!embeds.length && <p className="se-inspector-empty">No embeds match.</p>}
                    </>
                )}
                {tab === 'diagnostics' && (
                    <>
                        <p className="se-inspector-note">Diagnostics cover the whole snapshot, not only {model.name}. Static analysis does not execute calculated properties, so dynamic definitions may be incomplete.</p>
                        {warnings.map((warning, i) => <p key={i} className="se-diagnostic">{warning}</p>)}
                        {!warnings.length && <p className="se-inspector-empty">No matching diagnostics.</p>}
                    </>
                )}
            </div>
        </section>
    );
}

export default function Explorer() {
    const [index, setIndex] = useState(null),
        [error, setError] = useState(''),
        [loading, setLoading] = useState(true);
    const [refresh, setRefresh] = useState(0),
        [mode, setMode] = useState('map'),
        [selected, setSelected] = useState(''),
        [query, setQuery] = useState('');
    const [history, setHistory] = useState({ entries: [], position: -1 });
    const [returnToMap, setReturnToMap] = useState(false);
    const explorerRoot = useRef();
    const [planner, setPlanner] = useState(null),
        [detail, setDetail] = useState(null),
        [bundle, setBundle] = useState(null);
    const sourceController = useRef();
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');
        portalRequest('/schema-explorer/model?format=json', controller.signal)
            .then((data) => {
                if (!controller.signal.aborted) {
                    setIndex(explorerIndex(data));
                    setLoading(false);
                }
            })
            .catch((err) => {
                if (!controller.signal.aborted) {
                    setError(err.message);
                    setLoading(false);
                }
            });
        return () => controller.abort();
    }, [refresh]);
    useEffect(
        () => () => {
            sourceController.current?.abort();
        },
        []
    );
    const isAdmin = index?.can_view_items === true;
    const model = index?.models.find((m) => m.name === selected);
    const live = useMemo(
        () => (index && bundle ? describe(bundle, index) : null),
        [index, bundle]
    );
    // Opening details from the map remembers it, so the item view can lead back to the same map state.
    function openFromMap(name) {
        setReturnToMap(true);
        select(name, true);
        requestAnimationFrame(() => explorerRoot.current?.scrollIntoView({ block: 'start' }));
    }
    function backToMap() {
        setReturnToMap(false);
        setMode('map');
        requestAnimationFrame(() => explorerRoot.current?.querySelector('#entity-details, .se-diagram')?.scrollIntoView({ block: 'start' }));
    }
    function select(name, showItem = false) {
        setSelected(name);
        setHistory((h) =>
            h.entries[h.position] === name
                ? h
                : {
                    entries: [
                        ...h.entries.slice(0, h.position + 1),
                        name,
                    ].slice(-100),
                    position: Math.min(h.position + 1, 99),
                }
        );
        if (showItem) setMode('item');
    }
    function travel(delta) {
        const position = history.position + delta;
        if (position < 0 || position >= history.entries.length) return;
        setHistory({ ...history, position });
        setSelected(history.entries[position]);
    }
    async function source(location) {
        if (!location) return;
        sourceController.current?.abort();
        const controller = new AbortController();
        sourceController.current = controller;
        setDetail({ title: 'Loading source…', value: null });
        try {
            const result = await portalRequest(
                `/schema-explorer/source?format=json&file=${encodeURIComponent(
                    location.file
                )}`,
                controller.signal
            );
            if (controller.signal.aborted) return;
            const lines = result.text.split('\n');
            const line = Math.max(
                1,
                Math.min(lines.length, Number(location.line) || 1)
            );
            const definition = result.definitions?.find((entry) => entry.line === line);
            const start = definition?.start ?? line;
            const end = definition?.end ?? line;
            setDetail({
                title: `${result.file}:${line}`,
                sourceLines: lines
                    .slice(Math.max(0, start - 5), Math.max(end + 4, line + 28))
                    .map((text, i) => {
                        const number = Math.max(0, start - 5) + i + 1;
                        return { text, number, selected: number >= start && number <= end };
                    }),
                sections: [['Full source', result.text]],
            });
        } catch (err) {
            if (!controller.signal.aborted)
                setDetail({ title: 'Source unavailable', value: err.message });
        }
    }
    const closeDetail = () => {
        sourceController.current?.abort();
        setDetail(null);
    };
    if (!index && loading) return <p role="status">Loading Schema Explorer…</p>;
    if (!index)
        return (
            <div className="alert alert-warning" role="alert">
                {error}
                <button type="button" onClick={() => setRefresh((n) => n + 1)}>Retry</button>
            </div>
        );
    return (
        <div className="schema-explorer" data-schema-explorer="" ref={explorerRoot}>
            <div className="se-actions">
                <div className="se-view-switch" role="group" aria-label="Explorer view">
                    <button type="button"
                        id={mode === 'item' ? 'open-entity' : undefined}
                        aria-pressed={mode === 'map'}
                        onClick={() => setMode('map')}>
                        All schemas
                    </button>
                    <button type="button"
                        id={mode === 'map' ? 'open-entity' : undefined}
                        aria-pressed={mode === 'item'}
                        onClick={() => setMode('item')}>
                        Item view
                    </button>
                </div>
                <button type="button"
                    id="open-path-finder"
                    onClick={() => setPlanner({ source: selected })}>
                    Find embed path
                </button>
                <button type="button"
                    disabled={loading}
                    onClick={() => setRefresh((n) => n + 1)}
                    title="Reload the deployed snapshot. Source changes require a server restart or a rebuilt artifact.">
                    {loading ? 'Refreshing…' : 'Refresh ↻'}
                </button>
            </div>
            {error && (
                <p role="alert" className="alert alert-warning">
                    {error}
                </p>
            )}
            <div hidden={mode !== 'map'}>
                <Diagram
                    index={index}
                    onExplore={openFromMap}
                    onPlanner={(name) => setPlanner({ source: name })}
                    onDetail={setDetail}
                />
            </div>
            <div hidden={mode !== 'item'} className="se-item-view">
                <nav className="se-item-nav" aria-label="Schema navigation">
                    {returnToMap && <button type="button" className="se-back-to-map" onClick={backToMap}>← Back to schema map</button>}
                    <span className="se-item-history">
                        <button type="button" disabled={history.position <= 0} onClick={() => travel(-1)}
                            title={history.position > 0 ? `Previously viewed: ${history.entries[history.position - 1]}` : 'No previous schema'}>
                            ‹ {history.position > 0 ? history.entries[history.position - 1] : 'Previous'}
                        </button>
                        <button type="button" disabled={history.position >= history.entries.length - 1} onClick={() => travel(1)}
                            title={history.position < history.entries.length - 1 ? `Next viewed: ${history.entries[history.position + 1]}` : 'No next schema'}>
                            {history.position < history.entries.length - 1 ? history.entries[history.position + 1] : 'Next'} ›
                        </button>
                    </span>
                </nav>
                <div className="se-diagram-controls se-item-controls">
                    <label>Schema
                        <select id="types" value={selected} onChange={(e) => select(e.target.value)}>
                            <option value="" disabled></option>
                            {index.models.map((m) => <option key={m.name}>{m.name}</option>)}
                        </select>
                    </label>
                    <input aria-label="Search fields" type="search" placeholder="Search fields, relationships or embeds…"
                        value={query} onChange={(e) => setQuery(e.target.value)} />
                    <span className="se-item-meta">{index.models.length} schemas · {index.warnings.length} diagnostics</span>
                </div>
                {model ? (
                    <>
                        <header id="heading" className="se-diagram-header">
                            <div className="se-diagram-heading">
                                <span className="se-diagram-eyebrow">Schema details</span>
                                <h2>{model.name}</h2>
                                <p className="se-diagram-question">{model.schema.description || model.itemType}</p>
                                <ul className="se-diagram-facts" aria-label="Schema summary">
                                    <li>{model.fields.length} fields</li>
                                    <li>{model.fields.filter((f) => f.calculated).length} calculated</li>
                                    <li>{model.fields.filter((f) => f.required).length} required</li>
                                    <li><button type="button" className="se-fact-link" onClick={() => source(model.source)}>Python source ↗</button></li>
                                    {model.schemaSource && <li><button type="button" className="se-fact-link" onClick={() => source(model.schemaSource)}>JSON schema ↗</button></li>}
                                </ul>
                                {model.bases.length > 0 && (
                                    <div className="se-inheritance-chain" aria-label="Inheritance (method resolution order)">
                                        <span className="se-inheritance-label">Inherits from</span>
                                        {model.bases.map((base, i) => (
                                            <React.Fragment key={base.id}>
                                                {i > 0 && <span aria-hidden="true">›</span>}
                                                <button type="button" title={`${base.id} · open source`} onClick={() => source(base.source)}>{baseLabel(base.id, model.bases)} ↗</button>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </header>
                        {isAdmin && (
                            <details className="se-live-panel">
                                <summary>Inspect a live {model.name} item <small>Admin only · loads current portal data</small></summary>
                                <LiveItem {...{ index, query }} onSelect={select} onBundle={setBundle} onDetail={setDetail} />
                            </details>
                        )}
                        <div className="se-columns">
                            <section aria-label={`${model.name} relationships`}>
                                <Diagram
                                    key={model.name}
                                    compact
                                    focus={model.name}
                                    index={index}
                                    onExplore={(name) => select(name, true)}
                                    onDetail={setDetail}
                                />
                            </section>
                            <Inspector
                                {...{ model, index, query, live }}
                                onDetail={setDetail}
                                onSource={source}
                            />
                        </div>
                    </>
                ) : (
                    <p className="se-flow-note">Choose a schema above to inspect its fields and relationships.</p>
                )}
            </div>
            {planner && (
                <Planner
                    index={index}
                    initialSource={planner.source}
                    onClose={() => setPlanner(null)}
                    onSource={source}
                />
            )}
            <Modal
                show={!!detail}
                onHide={closeDetail}
                size="lg"
                className="schema-explorer-modal"
                aria-labelledby="se-detail-title">
                <Modal.Header closeButton>
                    <Modal.Title id="se-detail-title">
                        {detail?.title}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body id="detail-content">
                    {detail?.relationship ? (
                        <RelationshipDetails references={detail.relationship} index={index}
                            intro={detail.intro} sources={detail.sources} onSource={source} />
                    ) : (
                        <>
                            {detail?.intro && <p>{detail.intro}</p>}
                            {detail?.metadata && (
                                <pre>{JSON.stringify(detail.metadata, null, 2)}</pre>
                            )}
                            <SourceLinks sources={detail?.sources} onSource={source} />
                            {detail?.sourceLines ? (
                                <pre className="se-source-code" aria-label="Source code; selected definition highlighted">
                                    {detail.sourceLines.map((entry) => (
                                        <span key={entry.number} className={entry.selected ? 'se-source-line se-source-selected' : 'se-source-line'}>
                                            <span className="se-line-number">{entry.number}</span>{entry.text}{'\n'}
                                        </span>
                                    ))}
                                </pre>
                            ) : (
                                <pre>{detail?.text ?? JSON.stringify(detail?.value, null, 2)}</pre>
                            )}
                        </>
                    )}
                    {detail?.actions?.map((action, i) => (
                        <button type="button"
                            key={i}
                            onClick={() => {
                                closeDetail();
                                action.run();
                            }}>
                            {action.label}
                        </button>
                    ))}
                    {detail?.sections?.map(([label, value], i) => (
                        <details key={i}>
                            <summary>{label}</summary>
                            <pre>
                                {typeof value === 'string'
                                    ? value
                                    : JSON.stringify(value, null, 2)}
                            </pre>
                        </details>
                    ))}
                </Modal.Body>
            </Modal>
        </div>
    );
}
