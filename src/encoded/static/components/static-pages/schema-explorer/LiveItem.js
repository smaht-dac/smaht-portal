import React, { useState, useEffect, useRef, useMemo } from 'react';
import { describe } from './provenance';
import { loadItem } from './item-api';
import { Badge, shortValue } from './shared';
import { itemLinkMap, linkSelection, itemName, fieldLinks, knownType } from './ItemLinkDiagram';

export function OriginTags({ row }) {
    return (
        <>
            <Badge kind={row.origin.toLowerCase().replaceAll(' ', '-')}>
                {row.origin}
            </Badge>
            {row.calculated && row.origin !== 'Calculated' && (
                <Badge kind="calculated">Calculated</Badge>
            )}
        </>
    );
}
function matches(row, query) {
    return (
        `${row.path} ${row.origin} ${row.sourceItem} ${shortValue(row.value)}`
            .toLowerCase()
            .includes(query) ||
        row.children.some((child) => matches(child, query))
    );
}
function ItemLink({ row, request }) {
    return (
        <button type="button" className="se-item-link" title={`How this item links to ${itemName(row)}`} onClick={() => request(row)}>
            {itemName(row)}
        </button>
    );
}
// The value as a reader wants it: plain values as they are, a linked item as a link (with its type), and a list of
// linked items as their names, so references read as references rather than "Array (3)".
function ValueCell({ row, request, onMore }) {
    if (row.linkedItem) {
        return <>{knownType(row.sourceType) && <span className="se-item-type">{row.sourceType}</span>}<ItemLink row={row} request={request} /></>;
    }
    const links = fieldLinks(row);
    if (links.length) {
        const first = links.slice(0, 3), type = knownType(links[0].sourceType) && links[0].sourceType;
        return (
            <>
                {type && <span className="se-item-type">{type}</span>}
                {first.map((child, i) => <React.Fragment key={child.path}>{i > 0 && ', '}<ItemLink row={child} request={request} /></React.Fragment>)}
                {links.length > first.length && <button type="button" className="se-item-more" onClick={onMore}>+{links.length - first.length} more</button>}
            </>
        );
    }
    // A short list of plain values reads as the values themselves.
    if (Array.isArray(row.value) && row.value.length && row.value.every((v) => v === null || typeof v !== 'object')) {
        const first = row.value.slice(0, 3).map((v) => JSON.stringify(v)).join(', ');
        return <>{first}{row.value.length > 3 && <button type="button" className="se-item-more" onClick={onMore}>+{row.value.length - 3} more</button>}</>;
    }
    // An object reads as the fields it holds, not as a count of them.
    if (row.value && typeof row.value === 'object' && !Array.isArray(row.value)) {
        const keys = Object.keys(row.value);
        if (!keys.length) return <span className="se-item-keys">No fields</span>;
        return (
            <>
                <span className="se-item-keys">{keys.slice(0, 4).join(', ')}</span>
                {keys.length > 4 && <button type="button" className="se-item-more" onClick={onMore}>+{keys.length - 4} more</button>}
            </>
        );
    }
    return shortValue(row.value);
}
// One field as a table row; a field with nested values opens with +/- into indented rows, as in the portal's tables.
function ValueRow({ row, parent, depth = 0, bundle, query, inspect, request }) {
    const [expanded, setExpanded] = useState(false);
    const open = !!row.children.length && (!!query || expanded);
    return (
        <>
            <tr className={`se-value-row${depth ? ' se-value-child' : ''}`}>
                <th scope="row" style={{ paddingLeft: `${0.75 + depth * 1.1}rem` }}>
                    {row.children.length ? (
                        <button type="button" className="se-value-toggle" aria-expanded={open}
                            aria-label={`${open ? 'Hide' : 'Show'} the values in ${row.name}`} onClick={() => setExpanded(!open)}>
                            <i className={`icon icon-fw fas ${open ? 'icon-minus' : 'icon-plus'}`} aria-hidden="true" />
                        </button>
                    ) : <span className="se-value-toggle-space" aria-hidden="true" />}
                    <code>{row.name}</code>
                </th>
                <td className="se-value"><ValueCell row={row} request={request} onMore={() => setExpanded(true)} /></td>
                <td className="se-value-source">{row.origin}</td>
                <td className="se-selected-action">
                    <button type="button" onClick={() => inspect(row)}>Details <i className="icon icon-fw icon-angle-right fas" aria-hidden="true" /></button>
                </td>
            </tr>
            {open && row.children.filter((child) => matches(child, query)).map((child) => (
                <ValueRow key={child.path} {...{ row: child, parent: row, depth: depth + 1, bundle, query, inspect, request }} />
            ))}
            {open && row.truncated && (
                <tr className="se-value-child"><td colSpan={4} style={{ paddingLeft: `${1.85 + (depth + 1) * 1.1}rem` }}>Additional values omitted by the tree size limit.</td></tr>
            )}
        </>
    );
}
export default function LiveItem({
    index,
    query,
    onDetail,
    onBundle,
    onSelect,
}) {
    const [identifier, setIdentifier] = useState(''),
        [frame, setFrame] = useState('auto');
    const [bundle, setBundle] = useState(null),
        [loading, setLoading] = useState(false),
        [error, setError] = useState('');
    const controller = useRef();
    useEffect(() => () => {
        controller.current?.abort();
        controller.current = null;
    }, []);
    const provenance = useMemo(
        () => (bundle ? describe(bundle, index) : null),
        [bundle, index]
    );
    const clear = () => {
        controller.current?.abort();
        controller.current = null;
        setBundle(null);
        onBundle(null);
        setError('');
        setLoading(false);
    };
    async function request(id) {
        controller.current?.abort();
        const next = new AbortController();
        controller.current = next;
        const timer = setTimeout(() => next.abort(), 20000);
        setIdentifier(id);
        setLoading(true);
        setError('');
        setBundle(null);
        onBundle(null);
        try {
            const result = await loadItem(id, frame, next.signal);
            if (controller.current !== next) return;
            setBundle(result);
            onBundle(result);
            // An item's types run from its own type to its bases (SupplementaryFile, File, Item); its own type is chosen.
            const model = result.types.map((type) => index.models.find((m) => m.name === type)).find(Boolean);
            if (model) onSelect(model.name);
        } catch (err) {
            if (controller.current === next)
                setError(
                    next.signal.aborted
                        ? 'Request cancelled or timed out.'
                        : err.message
                );
        } finally {
            clearTimeout(timer);
            if (controller.current === next) setLoading(false);
        }
    }
    // A linked item opens a map of everything this item links to, with that link highlighted; loading the linked
    // item here is one choice in there.
    const showLink = (row) => {
        const { map, field, id } = linkSelection(itemLinkMap(index, bundle, provenance.rows), row);
        onDetail({
            title: `Links from ${map.from.title}`,
            itemMap: { map, field, id, inspect: request },
        });
    };
    const inspect = (row) =>
        onDetail({
            title: row.path,
            intro: `${row.origin} · ${row.evidence}`,
            value: row.value,
            sources: row.sources,
            metadata: {
                sourceItem: row.sourceItem,
                sourceField: row.sourcePath,
                owner: row.owner,
                embedPaths: row.embedPaths,
            },
            sections: [
                [
                    'Raw value (upgrade=false)',
                    row.raw?.value ?? 'Not available',
                ],
                ['Object value', row.object?.value ?? 'Not available'],
                ['Deployed definition', row.definition],
                [
                    'Environment definition',
                    row.remoteDefinition || 'Not available',
                ],
            ],
            actions: [
                row.linkedItem,
                row.sourceItem !== bundle.id && row.sourceItem,
            ]
                .filter(Boolean)
                .map((id) => {return { label: `Load ${id}`, run: () => request(id) };}),
        });
    const [filter, setFilter] = useState('');
    const normalized = `${query} ${filter}`.trim().toLowerCase();
    const shown = provenance ? provenance.rows.filter((row) => matches(row, normalized)) : [];
    return (
        <section className="se-live" aria-label="Live item explorer">
            <h2>Live item explorer <small className="text-muted">Admin only</small></h2>
            {/* data-bypass: the portal app would otherwise turn this form's submit into a navigation that drops the
                explorer's place (the URL hash); the explorer handles it itself. */}
            <form
                data-bypass="true"
                className="se-live-form"
                onSubmit={(e) => {
                    e.preventDefault();
                    request(identifier);
                }}>
                <input
                    id="item-id"
                    required
                    aria-label="Item identifier"
                    placeholder="UUID, accession, /item/path/ or URL on this portal"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                />
                <select aria-label="Frame" title="Frame" value={frame} onChange={(e) => setFrame(e.target.value)}>
                    {['auto', 'raw', 'object', 'embedded', 'page', 'columns', 'expand'].map((f) => (
                        <option key={f} value={f}>{f === 'auto' ? 'Auto frame' : `${f} frame`}</option>
                    ))}
                </select>
                <button id="load-item" type="submit" disabled={loading}>Load item</button>
                {bundle && <button type="button" className="se-text-link" onClick={clear}>Clear</button>}
            </form>
            {/* Only while there is something to say: once an item is loaded, its facts below say when and how. */}
            <p id="item-status" role="status" className="se-live-status">
                {loading ? 'Loading item…' : error ? 'Item load failed.' : bundle ? '' : 'Enter an item identifier from this portal.'}
            </p>
            {error && (
                <p id="item-error" role="alert" className="alert alert-warning">
                    {error}
                </p>
            )}
            <div id="item-heading">
                {bundle && (
                    <>
                        <h3>{bundle.object.display_title || bundle.id}</h3>
                        <dl className="se-schema-facts">
                            <dt>Type</dt><dd>{bundle.types[0]}</dd>
                            <dt>Loaded</dt><dd>{new Date(bundle.fetchedAt).toLocaleTimeString()} · {bundle.frame} view</dd>
                        </dl>
                    </>
                )}
            </div>
            {provenance && (
                <div className="se-relationship-section">
                    <h5 className="se-relationship-section-title">
                        Fields <span>{shown.length}</span>
                        <input className="se-value-filter" type="search" aria-label="Filter fields" placeholder="Filter fields…"
                            value={filter} onChange={(e) => setFilter(e.target.value)} />
                    </h5>
                    <table className="se-selected-table se-value-tree">
                        <colgroup><col className="se-col-field" /><col /><col className="se-col-source" /><col className="se-col-action" /></colgroup>
                        <thead><tr><th scope="col">Field</th><th scope="col">Value</th><th scope="col">Source</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
                        <tbody>
                            {shown.map((row) => (
                                <ValueRow key={`${bundle.id}:${row.path}`} {...{ row, bundle, query: normalized, inspect, request: showLink }} />
                            ))}
                            {!shown.length && <tr><td colSpan={4}>No fields match “{filter}”.</td></tr>}
                        </tbody>
                    </table>
                    <details id="item-notes" className="se-item-notes">
                        <summary>Provenance notes ({provenance.notes.length})</summary>
                        {provenance.notes.map((note, i) => (
                            <p key={i}>{note}</p>
                        ))}
                    </details>
                </div>
            )}
        </section>
    );
}
