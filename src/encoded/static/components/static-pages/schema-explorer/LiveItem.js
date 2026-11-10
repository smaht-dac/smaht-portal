import React, { useState, useEffect, useRef, useMemo } from 'react';
import { describe } from './provenance';
import { loadItem } from './item-api';
import { Badge, shortValue } from './shared';

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
function ValueRow({ row, parent, bundle, query, inspect, request }) {
    const [expanded, setExpanded] = useState(false);
    const header = (
        <>
            <code>{row.name}</code>
            <OriginTags row={row} />
            <span className="se-value">{shortValue(row.value)}</span>
            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    inspect(row);
                }}>
                Origin ↗
            </button>
            {row.linkedItem && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        request(row.linkedItem);
                    }}>
                    Load →
                </button>
            )}
            {row.sourceItem !== (parent?.sourceItem || bundle.id) && (
                <small className="se-origin">
                    From: {row.sourceType} · {row.sourceItem}
                </small>
            )}
            {row.calculated &&
                row.owner &&
                !(
                    parent?.owner === row.owner &&
                    parent?.calculationField === row.calculationField
                ) && (
                <small className="se-origin">
                    Python: {row.owner}.{row.calculationField}
                </small>
            )}
        </>
    );
    if (!row.children.length)
        return <div className="se-value-row">{header}</div>;
    return (
        <details
            className="se-value-node"
            open={!!query || expanded}
            onToggle={(e) => setExpanded(e.currentTarget.open)}>
            <summary className="se-value-row">{header}</summary>
            {(expanded || query) && (
                <div className="se-value-children">
                    {row.children
                        .filter((child) => matches(child, query))
                        .map((child) => (
                            <ValueRow
                                key={child.path}
                                {...{
                                    row: child,
                                    parent: row,
                                    bundle,
                                    query,
                                    inspect,
                                    request,
                                }}
                            />
                        ))}
                    {row.truncated && (
                        <p>Additional values omitted by the tree size limit.</p>
                    )}
                </div>
            )}
        </details>
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
            const model = index.models.find((m) =>
                result.types.includes(m.name)
            );
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
    const normalized = query.toLowerCase();
    return (
        <section className="se-live" aria-label="Live item explorer">
            <h2>Live item explorer <small className="text-muted">Admin only</small></h2>
            <p className="text-muted">
                Current portal data + deployed source definitions
            </p>
            <form
                className="se-toolbar"
                onSubmit={(e) => {
                    e.preventDefault();
                    request(identifier);
                }}>
                <label>
                    Portal{' '}
                    <select id="environments" disabled value={location.host}>
                        <option>{location.host}</option>
                    </select>
                </label>
                <input
                    id="item-id"
                    required
                    aria-label="Item identifier"
                    placeholder="UUID, accession, /item/path/ or URL"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                />
                <label>
                    Frame{' '}
                    <select
                        value={frame}
                        onChange={(e) => setFrame(e.target.value)}>
                        {[
                            'auto',
                            'raw',
                            'object',
                            'embedded',
                            'page',
                            'columns',
                            'expand',
                        ].map((f) => (
                            <option key={f} value={f}>
                                {f === 'auto' ? 'Auto (embedded/object)' : f}
                            </option>
                        ))}
                    </select>
                </label>
                <button id="load-item" type="submit" disabled={loading}>
                    Load item
                </button>
                <button type="button" onClick={clear}>
                    Clear
                </button>
            </form>
            <p id="item-status" role="status">
                {loading
                    ? 'Loading item…'
                    : error
                        ? 'Item load failed.'
                        : bundle
                            ? `Loaded ${new Date(
                                bundle.fetchedAt
                            ).toLocaleString()} · ${bundle.frame} view · ${(
                                new TextEncoder().encode(JSON.stringify(bundle.view))
                                    .length / 1024
                            ).toFixed(1)} KB (JSON view)`
                            : 'Enter an item identifier from this portal.'}
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
                        <Badge>{bundle.types[0]}</Badge>{' '}
                        <Badge>{bundle.id}</Badge>
                    </>
                )}
            </div>
            {provenance && (
                <>
                    <details id="item-notes">
                        <summary>
                            Provenance notes ({provenance.notes.length})
                        </summary>
                        {provenance.notes.map((note, i) => (
                            <p key={i}>{note}</p>
                        ))}
                    </details>
                    <div className="se-value-tree">
                        {provenance.rows
                            .filter((row) => matches(row, normalized))
                            .map((row) => (
                                <ValueRow
                                    key={`${bundle.id}:${row.path}`}
                                    {...{
                                        row,
                                        bundle,
                                        query: normalized,
                                        inspect,
                                        request,
                                    }}
                                />
                            ))}
                    </div>
                </>
            )}
        </section>
    );
}
