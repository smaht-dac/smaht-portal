import React, { useState } from 'react';
import { SourceLinks } from './shared';

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const fieldPath = (path) => path.replace(/\[\d+\]/g, '');
const kindLabel = { linkTo: 'stored link', calculated: 'calculated', reverse: 'reverse link' };

// The generic base type says nothing about a link, so it is not shown.
export const knownType = (type) => !!type && type !== 'Item' && type !== 'Unknown type';
// A linked item's name: its title when embedded, otherwise the last step of its path.
export const itemName = (row) => (row.value && typeof row.value === 'object' && !Array.isArray(row.value)
    ? row.value.display_title || row.value['@id'] : String(row.value).replace(/\/$/, '').split('/').pop());
// The linked items a field holds: one link, or a list made only of links.
export function fieldLinks(row) {
    if (row.linkedItem) return [row];
    const links = row.children.filter((child) => child.linkedItem);
    return Array.isArray(row.value) && links.length && links.length === row.children.length ? links : [];
}

// Every item the loaded item links to, one entry per field, with the kind of link the schema declares for it
// (stored, calculated or reverse) and where that field is defined.
export function itemLinkMap(index, bundle, rows) {
    const fromType = bundle.types.find((type) => index.models.some((m) => m.name === type)) || bundle.types[0];
    const model = index.models.find((m) => m.name === fromType);
    const owners = [fromType, ...(model?.bases || []).map((b) => b.name)];
    // The schema says how a field links; a link to a schema the explorer does not show (an admin type such as
    // Consortium) has no edge there, so the item itself answers: a value in the raw frame is stored.
    const kindOf = (row) => {
        const edges = index.edges.filter((e) => owners.includes(e.from) && e.field.replaceAll('[]', '').split('.')[0] === row.name);
        const edge = edges.find((e) => e.kind === 'linkTo') || edges.find((e) => e.kind === 'calculated') || edges[0];
        return edge?.kind || (row.raw ? 'linkTo' : row.calculated ? 'calculated' : 'link');
    };
    const links = rows.map((row) => {
        const items = fieldLinks(row);
        if (!items.length) return null;
        return {
            field: row.name,
            type: items.map((item) => item.sourceType).find(knownType) || '',
            kind: kindOf(row),
            items: items.map((item) => { return { id: item.linkedItem, title: itemName(item) }; }),
            sources: model?.fields.find((f) => f.name === row.name)?.sources || [],
        };
    }).filter(Boolean);
    return { from: { type: fromType, title: bundle.object.display_title || bundle.id, id: bundle.id }, links };
}

// Which field and item a clicked link is: a link nested in an embedded value is shown under its top field, and gets
// its own entry when that field holds no links itself.
export function linkSelection(map, row) {
    const field = row.path.split(/[.[]/)[0];
    if (map.links.some((link) => link.field === field)) return { map, field, id: row.linkedItem };
    const path = fieldPath(row.path);
    const entry = { field: path, type: knownType(row.sourceType) ? row.sourceType : '', kind: 'embedded',
        items: [{ id: row.linkedItem, title: itemName(row) }], sources: [] };
    return { map: { ...map, links: [...map.links, entry] }, field: path, id: row.linkedItem };
}

const cardWidth = 300, cardHeight = 58, rowGap = 12, centerWidth = 250, width = 1000;

// The loaded item in the middle with every item it links to around it: stored links on the left, calculated (and
// reverse) links on the right, one card per field. The chosen link is highlighted; choosing another card moves the
// highlight without leaving the popup.
export default function ItemLinkDiagram({ map, initialField, initialId, onSource, onInspect }) {
    const [selected, setSelected] = useState({ field: initialField, id: initialId });
    const stored = map.links.filter((link) => link.kind === 'linkTo' || link.kind === 'embedded'),
        other = map.links.filter((link) => !stored.includes(link));
    // One side only (every link stored, or every link calculated) splits evenly so the map stays balanced.
    let [left, right] = [stored, other];
    if (!left.length || !right.length) {
        const all = map.links, half = Math.ceil(all.length / 2);
        [left, right] = [all.slice(0, half), all.slice(half)];
    }
    const rows = Math.max(left.length, right.length, 1);
    const top = 30, height = top + rows * (cardHeight + rowGap) + 6;
    const columnTop = (count) => top + ((rows - count) * (cardHeight + rowGap)) / 2;
    const centerX = (width - centerWidth) / 2, centerY = top + (rows * (cardHeight + rowGap) - rowGap) / 2;
    const busLeft = cardWidth + (centerX - cardWidth) / 2, busRight = width - busLeft;
    const place = (links, side) => links.map((link, i) => {
        return { link, x: side === 'left' ? 0 : width - cardWidth, y: columnTop(links.length) + i * (cardHeight + rowGap), side };
    });
    const cards = [...place(left, 'left'), ...place(right, 'right')];
    const current = map.links.find((link) => link.field === selected.field) || map.links[0];
    const item = current?.items.find((entry) => entry.id === selected.id) || current?.items[0];
    // An arrow leaves the item's side, runs along that side's bus and turns into the card, with rounded corners.
    const arrow = ({ x, y, side }) => {
        const cy = y + cardHeight / 2, startX = side === 'left' ? centerX : centerX + centerWidth;
        const bus = side === 'left' ? busLeft : busRight, endX = side === 'left' ? x + cardWidth + 2 : x - 2;
        const dy = cy - centerY, r = Math.min(8, Math.abs(dy) / 2), sx = side === 'left' ? -1 : 1;
        if (Math.abs(dy) < 1) return `M${startX},${centerY} H${endX}`;
        const sy = Math.sign(dy);
        return `M${startX},${centerY} H${bus - sx * r} Q${bus},${centerY} ${bus},${centerY + sy * r} V${cy - sy * r} Q${bus},${cy} ${bus + sx * r},${cy} H${endX}`;
    };
    const choose = (link) => setSelected({ field: link.field, id: link.items[0].id });
    const ordered = [...cards.filter((card) => card.link !== current), ...cards.filter((card) => card.link === current)];
    return (
        <div className="se-item-link-detail">
            <svg className="se-item-link-diagram" viewBox={`-2 0 ${width + 4} ${height}`} role="group"
                aria-label={`${map.from.type} ${map.from.title} and the ${map.links.length} fields that link it to other items`}>
                <defs>
                    {['', '-muted'].map((suffix) => (
                        <marker key={suffix} id={`se-link-head${suffix}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                            <path d="M0,0 L10,5 L0,10 z" className={`se-link-head${suffix}`} />
                        </marker>
                    ))}
                </defs>
                {left.length > 0 && <text x={0} y={16} className="se-link-side">{left === stored ? 'Stored links' : 'Links'}</text>}
                {right.length > 0 && <text x={width} y={16} className="se-link-side se-link-side-right">{right === other ? 'Calculated links' : 'Links'}</text>}
                {ordered.map((card) => (
                    <path key={`arrow-${card.link.field}`} d={arrow(card)}
                        className={card.link === current ? 'se-link-arrow' : 'se-link-arrow-muted'}
                        markerEnd={`url(#se-link-head${card.link === current ? '' : '-muted'})`} />
                ))}
                <g className="se-link-box se-link-from" transform={`translate(${centerX},${centerY - 32})`}>
                    <title>{`${map.from.type}: ${map.from.title}`}</title>
                    <rect width={centerWidth} height={64} rx={4} />
                    <text x={14} y={24} className="se-link-type">{map.from.type}</text>
                    <text x={14} y={46} className="se-link-title">{clip(map.from.title, 26)}</text>
                </g>
                {cards.map((card) => {
                    const active = card.link === current;
                    const shown = active && item ? item : card.link.items[0];
                    const rest = card.link.items.length - 1;
                    // The field and its type share the first line: the field keeps its name, the type takes what is left.
                    const fieldChars = Math.min(card.link.field.length, 30);
                    const typeChars = Math.max(6, Math.floor((cardWidth - 24 - fieldChars * 7.6 - 14) / 6.8));
                    return (
                        <g key={card.link.field} className={`se-link-box se-link-card${active ? ' se-link-to' : ''}`}
                            transform={`translate(${card.x},${card.y})`} role="button" tabIndex={0} aria-pressed={active}
                            aria-label={`${card.link.field}: ${card.link.items.length} ${card.link.type || 'item'}${card.link.items.length === 1 ? '' : 's'} (${kindLabel[card.link.kind] || card.link.kind})`}
                            onClick={() => choose(card.link)}
                            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(card.link); } }}>
                            <title>{card.link.items.map((entry) => entry.title).join('\n')}</title>
                            <rect width={cardWidth} height={cardHeight} rx={4} />
                            <text x={12} y={22} className="se-link-field">{clip(card.link.field, fieldChars)}</text>
                            <text x={cardWidth - 12} y={22} className="se-link-type se-link-type-right">{clip(card.link.type, typeChars)}</text>
                            <text x={12} y={44} className="se-link-title">
                                {clip(shown.title, rest > 0 ? 25 : 31)}
                                {rest > 0 && <tspan className="se-link-more">{`  +${rest}`}</tspan>}
                            </text>
                        </g>
                    );
                })}
            </svg>
            {current && item && (
                <div className="se-item-link-selected">
                    {/* The chosen link as ruled label | value rows, like the facts under a schema's title. */}
                    <dl className="se-schema-facts se-link-facts">
                        <dt>Field</dt>
                        <dd><code>{current.field}</code></dd>
                        <dt>Link</dt>
                        <dd>
                            {current.kind === 'calculated' ? 'Calculated in Python' : (kindLabel[current.kind] || current.kind).replace(/^./, (c) => c.toUpperCase())}
                            {current.sources.length > 0 && <> · <SourceLinks sources={current.sources} onSource={onSource} /></>}
                        </dd>
                        <dt>Type</dt>
                        <dd>{current.type || 'Item'}</dd>
                        <dt>{current.items.length > 1 ? `Items (${current.items.length})` : 'Item'}</dt>
                        <dd>
                            {current.items.length > 1 ? (
                                <ul className="se-link-items">
                                    {current.items.map((entry) => (
                                        <li key={entry.id}>
                                            <button type="button" className="se-text-link" aria-pressed={entry === item}
                                                onClick={() => setSelected({ field: current.field, id: entry.id })}>
                                                {entry.title}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : <strong>{item.title}</strong>}
                        </dd>
                    </dl>
                    <div className="se-item-link-actions">
                        <button type="button" onClick={() => onInspect(item.id)}>Inspect this {current.type || 'item'} here</button>
                        <a href={item.id} target="_blank" rel="noopener noreferrer">Open item page</a>
                    </div>
                </div>
            )}
        </div>
    );
}
