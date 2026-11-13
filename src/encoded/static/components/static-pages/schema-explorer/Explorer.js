import React, { useState, useEffect, useRef, useMemo } from 'react';
import Modal from 'react-bootstrap/esm/Modal';
import { navigate } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/navigate';
import Diagram from './Diagram';
import ExplorerNav from './ExplorerNav';
import SchemaFinder from './SchemaFinder';
import { domains, domainFor } from './domains';
import { concepts } from './research-map';
import SlidingSidebarLayout from '../../shared/SlidingSidebarLayout';
import { overviewRoute, parseRoute, routeHash, sameRoute, isMapRoute } from './explorer-route';
import SchemaCatalog from './SchemaCatalog';
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

// Puts the explorer's place in the page URL's hash through the portal's own navigation, which keeps the page
// without a new request; outside the portal app (tests, embeds) the History API does the same.
function pushLocation(hash) {
    const href = `${window.location.pathname}${window.location.search}${hash}`;
    try { navigate(href, { skipRequest: true }); }
    catch { window.history.pushState(window.history.state, '', href); }
}

// Short class names, qualified by their module when two bases share a name (base.Item, resources.Item).
function baseLabel(id, bases) {
    const name = id.split('.').pop();
    return bases.filter((base) => base.id.split('.').pop() === name).length > 1 ? id.split('.').slice(-2).join('.') : name;
}

const hasOwnDescription = (model) => {
    const description = typeof model.schema?.description === 'string' ? model.schema.description.trim() : '';
    return !!description && description.replace(/[\s_.-]/g, '').toLowerCase() !== model.name.toLowerCase();
};

const fieldFilters = [
    ['all', 'All', () => true],
    ['links', 'Links', (field) => linkTargets(field.schema).length > 0],
    ['calculated', 'Calculated', (field) => field.calculated],
    ['required', 'Required', (field) => field.required],
];

// A schema's contents. `links` is its links on the map, the first tab when the schema is selected there.
function Inspector({ model, index, query, onDetail, onSource, live, links }) {
    const [tab, setTab] = useState(links ? 'links' : 'fields'),
        [filter, setFilter] = useState('all'),
        [queries, setQueries] = useState({
            fields: '',
            embeds: '',
            diagnostics: '',
            links: '',
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
    const labels = { ...(links ? { links: 'Links' } : {}), fields: 'Fields', embeds: 'Embeds', diagnostics: 'Diagnostics' };
    return (
        <section className="se-inspector" aria-label={`${model.name} contents`}>
            <div className="se-inspector-tabs" role="tablist" aria-label="Schema contents">
                {Object.keys(labels).map((name) => (
                    <button type="button" role="tab" key={name} aria-selected={tab === name} onClick={() => setTab(name)}>
                        {labels[name]} {name in totals && <span>{totals[name]}</span>}
                    </button>
                ))}
            </div>
            {tab === 'links' && <div className="se-inspector-links">{links}</div>}
            <div className="se-inspector-search" hidden={tab === 'links'}>
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
            <div className="se-inspector-list" hidden={tab === 'links'}>
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
        [query, setQuery] = useState('');
    // Where the reader is (see explorer-route.js). The map keeps its last place while schema details are open.
    const [route, setRoute] = useState(overviewRoute),
        [mapRoute, setMapRoute] = useState(overviewRoute);
    // A schema chosen from the catalog opens on its own connections first (its neighborhood), not its whole group.
    const [neighborhoodRequest, setNeighborhoodRequest] = useState(null);
    const mode = isMapRoute(route) ? 'map' : 'item';
    const explorerRoot = useRef();
    const show = (next) => {
        setRoute(next);
        if (isMapRoute(next)) setMapRoute(next);
    };
    // The URL is read after mounting (the server renders no location) and again on Back/Forward.
    useEffect(() => {
        const sync = () => show(parseRoute(window.location.hash));
        sync();
        window.addEventListener('popstate', sync);
        window.addEventListener('hashchange', sync);
        return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
    }, []);
    // A schema shares its group's page: selecting schemas on one group map stays on that page.
    const page = (r) => (r.view === 'schema' ? `group:${domainFor(r.schema)}` : `${r.view}:${r.concept || r.group || ''}`);
    // `reveal` scrolls to a schema's map when it is opened from elsewhere (search, catalog, links): the diagram comes
    // first, its details follow underneath.
    function go(next, { reveal = false } = {}) {
        if (sameRoute(next, route)) return;
        const samePage = page(next) === page(route);
        show(next);
        pushLocation(routeHash(next));
        // A search belongs to the page it was typed on (it also filters the catalog), so a new page starts clear.
        if (!samePage) setQuery('');
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (reveal && next.view === 'schema') explorerRoot.current?.querySelector('#entity-svg')?.closest('.se-diagram')?.scrollIntoView({ block: 'start' });
            // A new page starts at the explorer's top.
            else if (!samePage && explorerRoot.current?.getBoundingClientRect().top < 0) explorerRoot.current.scrollIntoView({ block: 'start' });
        }));
    }
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
    const live = useMemo(
        () => (index && bundle ? describe(bundle, index) : null),
        [index, bundle]
    );
    const select = (name) => go(name ? { view: 'schema', schema: name } : { view: 'schemas' }, { reveal: true });
    // In-page links keep their URL for new tabs; a plain click moves within the explorer.
    const follow = (event, next) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        go(next);
    };
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
    // A schema is shown on its group map: selecting it there opens these details under the map, with its links
    // on the map as the first tab beside its fields, embeds and diagnostics.
    const renderSchema = (name, links) => {
        const model = index.models.find((m) => m.name === name);
        if (!model) return links;
        const modelConcept = concepts.find((concept) => concept.types.split(' ').includes(model.name));
        return (
            <>
                {/* Laid out like the concept heading and the portal's item pages: title, description, then ruled
                    label | value rows with plain links. */}
                <header id="heading" className="se-schema-heading">
                    {/* Embed paths start from a schema, so the tool lives on the schema it starts from. */}
                    <button type="button" id="open-path-finder" className="se-heading-action"
                        title={`Find how ${model.name} can embed fields from another schema`}
                        onClick={() => setPlanner({ source: model.name })}>
                        Find embed path…
                    </button>
                    <h2>{model.name}</h2>
                    {/* A description that only restates the name (e.g. death_circumstances) adds nothing under the title. */}
                    {hasOwnDescription(model) && <p className="se-schema-description">{model.schema.description}</p>}
                    <dl className="se-schema-facts">
                        <dt>Schema group</dt>
                        <dd>
                            <a href={routeHash({ view: 'group', group: domainFor(model.name) })} onClick={(event) => follow(event, { view: 'group', group: domainFor(model.name) })}>
                                {domains.find((d) => d.id === domainFor(model.name))?.label}
                            </a>
                        </dd>
                        {modelConcept && (
                            <>
                                <dt>Metadata map</dt>
                                <dd>
                                    <a href={routeHash({ view: 'concept', concept: modelConcept.id })} onClick={(event) => follow(event, { view: 'concept', concept: modelConcept.id })}>
                                        {modelConcept.step ? `${modelConcept.step}. ` : ''}{modelConcept.label}
                                    </a>
                                </dd>
                            </>
                        )}
                        {/* Source sits in the narrow column; the longer inheritance chain takes the wide one. */}
                        <dt>Source</dt>
                        <dd>
                            <button type="button" className="se-text-link" onClick={() => source(model.source)}>Python source</button>
                            {model.schemaSource && <><span className="se-schema-sep" aria-hidden="true">·</span><button type="button" className="se-text-link" onClick={() => source(model.schemaSource)}>JSON schema</button></>}
                        </dd>
                        {model.bases.length > 0 && (
                            <>
                                <dt>Inherits from</dt>
                                <dd aria-label="Inheritance (method resolution order)">
                                    {model.bases.map((base, i) => (
                                        <React.Fragment key={base.id}>
                                            {i > 0 && <span className="se-schema-sep" aria-hidden="true">›</span>}
                                            <button type="button" className="se-text-link" title={`${base.id} · open source`} onClick={() => source(base.source)}>{baseLabel(base.id, model.bases)}</button>
                                        </React.Fragment>
                                    ))}
                                </dd>
                            </>
                        )}
                    </dl>
                </header>
                {isAdmin && (
                    <details className="se-live-panel">
                        <summary>Inspect a live {model.name} item <small>Admin only · loads current portal data</small></summary>
                        <LiveItem index={index} query="" onSelect={select} onBundle={setBundle} onDetail={setDetail} />
                    </details>
                )}
                <Inspector key={model.name} {...{ model, index, live, links }} query="" onDetail={setDetail} onSource={source} />
            </>
        );
    };
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
            <SlidingSidebarLayout>
                <ExplorerNav route={route} onNavigate={go} />
                <div className="se-main">
                    <SchemaFinder index={index} query={query} onQuery={setQuery} onOpen={select} />
                    {error && (
                        <p role="alert" className="alert alert-warning">
                            {error}
                        </p>
                    )}
                    <div hidden={mode !== 'map'}>
                        <Diagram
                            index={index}
                            route={mapRoute}
                            onNavigate={go}
                            renderSchema={renderSchema}
                            onBrowseAll={() => go({ view: 'schemas' })}
                            onPlanner={(name) => setPlanner({ source: name })}
                            onDetail={setDetail}
                            neighborhoodRequest={neighborhoodRequest}
                        />
                    </div>
                    <div hidden={mode !== 'item'} className="se-item-view">
                        <SchemaCatalog index={index} query={query}
                            onOpen={(name) => { setNeighborhoodRequest({ schema: name, at: Date.now() }); select(name); }} onOpenGroup={(id) => go({ view: 'group', group: id })} />
                    </div>
                </div>
            </SlidingSidebarLayout>
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
                            intro={detail.intro} meaning={detail.meaning} sources={detail.sources} onSource={source} />
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
