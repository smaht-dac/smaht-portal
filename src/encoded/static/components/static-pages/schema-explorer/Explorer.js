import React, { useState, useEffect, useRef, useMemo } from 'react';
import Modal from 'react-bootstrap/esm/Modal';
import Diagram from './Diagram';
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

function Inspector({ model, index, query, onDetail, onSource, live }) {
    const [tab, setTab] = useState('fields'),
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
    const fields = model.fields
        .filter((f) =>
            match(
                f.name +
                    ' ' +
                    JSON.stringify(f.schema) +
                    (f.calculated ? ' calculated' : '')
            )
        )
        .sort((a, b) => a.name.localeCompare(b.name));
    const embeds = model.embeds.filter(match);
    const warnings = index.warnings.filter(match);
    const count =
        tab === 'fields'
            ? `${fields.length}/${model.fields.length}`
            : tab === 'embeds'
                ? `${embeds.length}/${model.embeds.length}`
                : `${warnings.length}/${index.warnings.length}`;
    return (
        <section className="se-inspector">
            <nav className="se-toolbar" aria-label="Schema details">
                {['fields', 'embeds', 'diagnostics'].map((name) => (
                    <button type="button"
                        key={name}
                        aria-pressed={tab === name}
                        onClick={() => setTab(name)}>
                        {name[0].toUpperCase() + name.slice(1)}
                    </button>
                ))}
            </nav>
            <div className="se-toolbar">
                <input
                    type="search"
                    aria-label="Search current list"
                    placeholder={`Search ${tab}…`}
                    value={queries[tab]}
                    onChange={(e) =>
                        setQueries({ ...queries, [tab]: e.target.value })
                    }
                />
                <button type="button" onClick={() => setQueries({ ...queries, [tab]: '' })}>
                    Clear
                </button>
                <span>{count}</span>
            </div>
            {tab === 'fields' &&
                fields.map((field) => {
                    const targets = linkTargets(field.schema),
                        row =
                            live?.model === model.name
                                ? live.rows.find((r) => r.name === field.name)
                                : null;
                    return (
                        <button type="button"
                            className="se-field"
                            key={field.name}
                            onClick={() =>
                                onDetail({
                                    title: `${model.name}.${field.name}`,
                                    value: field.schema,
                                    sources: field.sources,
                                    intro: field.calculated
                                        ? `Calculated property · ${
                                            field.owner || ''
                                        }`
                                        : 'Stored schema field',
                                    sections: row
                                        ? [
                                            ['Live value', row.value],
                                            ['Origin evidence', row.evidence],
                                        ]
                                        : [],
                                })
                            }>
                            <strong>
                                {field.name}
                                {field.required ? ' *' : ''}
                            </strong>
                            <span>
                                {Array.isArray(field.schema.type)
                                    ? field.schema.type.join(' | ')
                                    : field.schema.type || '—'}
                            </span>
                            {targets.length > 0 && (
                                <Badge kind="linkTo">
                                    linkTo → {targets.join(' | ')}
                                </Badge>
                            )}
                            {field.calculated && (
                                <Badge kind="calculated">Calculated</Badge>
                            )}
                            {row && (
                                <span className="se-field-live">
                                    <OriginTags row={row} />
                                    {shortValue(row.value)}
                                    {row.sourceItem && (
                                        <small> · {row.sourceItem}</small>
                                    )}
                                </span>
                            )}
                        </button>
                    );
                })}
            {tab === 'embeds' && (
                <>
                    <p>
                        Explicit and inherited embedded_list entries. Automatic
                        framework embeds are not included.
                    </p>
                    <SourceLinks
                        sources={[model.embedded_listSource]}
                        onSource={onSource}
                    />
                    {embeds.map((path) => (
                        <button type="button"
                            className="se-field"
                            key={path}
                            onClick={() =>
                                onDetail({
                                    title: path,
                                    value: { path, segments: path.split('.') },
                                    sources: [model.embedded_listSource].filter(
                                        Boolean
                                    ),
                                })
                            }>
                            {path.split('.').join(' → ')}
                        </button>
                    ))}
                </>
            )}
            {tab === 'diagnostics' && (
                <>
                    <p>
                        Static analysis does not execute calculated properties.
                        Dynamic definitions may be incomplete.
                    </p>
                    {warnings.map((warning, i) => (
                        <p key={i} className="alert alert-warning">
                            {warning}
                        </p>
                    ))}
                    {!warnings.length && <p>No matching diagnostics.</p>}
                </>
            )}
        </section>
    );
}
export default function Explorer({ isAdmin }) {
    const [index, setIndex] = useState(null),
        [error, setError] = useState(''),
        [loading, setLoading] = useState(true);
    const [refresh, setRefresh] = useState(0),
        [mode, setMode] = useState('map'),
        [selected, setSelected] = useState(''),
        [query, setQuery] = useState('');
    const [history, setHistory] = useState({ entries: [], position: -1 });
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
                    setIndex(data);
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
    const model = index?.models.find((m) => m.name === selected);
    const live = useMemo(
        () => (index && bundle ? describe(bundle, index) : null),
        [index, bundle]
    );
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
        <div className="schema-explorer" data-schema-explorer="">
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
            <div className="se-toolbar" hidden={mode !== 'item'}>
                <label>
                    Item type{' '}
                    <select
                        id="types"
                        value={selected}
                        onChange={(e) => select(e.target.value)}>
                        <option value="" disabled></option>
                        {index.models.map((m) => (
                            <option key={m.name}>{m.name}</option>
                        ))}
                    </select>
                </label>
                <input
                    aria-label="Search fields"
                    type="search"
                    placeholder="Search fields, relationships or embeds…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
                <span className="text-muted">
                    {index.models.length} types · {index.warnings.length}{' '}
                    diagnostics
                </span>
            </div>
            {error && (
                <p role="alert" className="alert alert-warning">
                    {error}
                </p>
            )}
            <div hidden={mode !== 'map'}>
                <Diagram
                    index={index}
                    onExplore={(name) => select(name, true)}
                    onPlanner={(name) => setPlanner({ source: name })}
                    onDetail={setDetail}
                />
            </div>
            <div hidden={mode !== 'item'}>
                {isAdmin && <LiveItem
                    {...{ index, query }}
                    onSelect={select}
                    onBundle={setBundle}
                    onDetail={setDetail}
                />}
                {model ? (
                    <div className="se-columns">
                        <section>
                            <div id="heading">
                                <h2>{model.name}</h2>
                                <p>
                                    {model.schema.description ||
                                            model.itemType}
                                </p>
                                <div className="se-toolbar">
                                    <Badge>
                                        {model.fields.length} fields
                                    </Badge>
                                    <Badge kind="calculated">
                                        {
                                            model.fields.filter(
                                                (f) => f.calculated
                                            ).length
                                        }{' '}
                                        calculated
                                    </Badge>
                                    <button type="button"
                                        onClick={() =>
                                            source(model.source)
                                        }>
                                        Python ↗
                                    </button>
                                    {model.schemaSource && (
                                        <button type="button"
                                            onClick={() =>
                                                source(model.schemaSource)
                                            }>
                                            JSON ↗
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="se-toolbar">
                                <span>Inheritance (MRO)</span>
                                {model.bases.map((base) => (
                                    <button type="button"
                                        key={base.id}
                                        onClick={() => source(base.source)}>
                                        {base.id} ↗
                                    </button>
                                ))}
                            </div>
                            <div className="se-toolbar">
                                <button type="button"
                                    disabled={history.position <= 0}
                                    onClick={() => travel(-1)}>
                                    ← Back
                                </button>
                                <button type="button"
                                    disabled={
                                        history.position >=
                                            history.entries.length - 1
                                    }
                                    onClick={() => travel(1)}>
                                    Forward →
                                </button>
                            </div>
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
                ) : (
                    <p>
                        Select an item type to inspect its fields and
                        relationships.
                    </p>
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
