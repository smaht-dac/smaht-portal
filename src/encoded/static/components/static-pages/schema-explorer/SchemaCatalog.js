import React, { useState } from 'react';
import SchemaAtlas from './SchemaAtlas';
import { domains, domainFor, abstractTypes } from './domains';
import { nodePresentation } from './node-presentation';

// One group's schemas as a portal panel: a plain title band (name, count, an optional text link to its map), then a
// ruled, zebra list of names and captions. The catalog shows one per group; a group's page shows its own as a list.
export function CatalogPanel({ group, onOpen, onOpenGroup, titled = true }) {
    return (
        <section className="se-catalog-group" aria-label={group.label}>
            {/* Untitled on a group's own page, whose heading already names it and counts its schemas. */}
            {titled && (
                <header>
                    <h3>{group.label} <span className="se-catalog-count">{group.total}</span></h3>
                    {onOpenGroup && (
                        <button type="button" aria-label="Open group map" title={`Open the ${group.label} map`} onClick={() => onOpenGroup(group.id)}>
                            Group map
                        </button>
                    )}
                </header>
            )}
            <ul>
                {group.members.map(({ model, caption }) => (
                    <li key={model.name}>
                        <button type="button" className={abstractTypes.has(model.name) ? 'se-catalog-abstract' : undefined} onClick={() => onOpen(model.name)}>
                            <span className="se-catalog-name">
                                <strong>{model.name}</strong>
                                {abstractTypes.has(model.name) && <span className="se-catalog-badge">Abstract</span>}
                            </span>
                            {/* A caption that only restates the name shows as the portal's muted dash. */}
                            {caption.replace(/\s/g, '').toLowerCase() !== model.name.toLowerCase()
                                ? <small>{caption}</small> : <small className="se-catalog-none" aria-hidden="true">—</small>}
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}

// A group's schemas, sorted, with their captions, narrowed by a search.
export function catalogGroup(index, domain, needle = '') {
    const all = index.models.filter((model) => domainFor(model.name) === domain.id).sort((a, b) => a.name.localeCompare(b.name));
    const members = all.map((model) => { return { model, caption: nodePresentation(model.name, model).caption }; })
        .filter(({ model, caption }) => !needle || `${model.name} ${caption}`.toLowerCase().includes(needle));
    return { ...domain, total: all.length, members };
}

// Every schema grouped by area, as readable text (List) or on one canvas (Map): the entry screen of Schema details.
export default function SchemaCatalog({ index, query, onOpen, onOpenGroup }) {
    const [tab, setTab] = useState('list');
    const needle = query.trim().toLowerCase();
    const groups = domains.map((domain) => catalogGroup(index, domain, needle)).filter((group) => group.total);
    const shown = groups.reduce((n, group) => n + group.members.length, 0);
    return (
        <section className="se-catalog" aria-label="All schemas">
            {/* The panels show every count, so the heading only adds one while a search narrows them. */}
            <header className="se-catalog-heading">
                <h2>All schemas</h2>
                {needle && <p className="se-catalog-match" role="status">{shown} of {index.models.length} schemas match “{query.trim()}”</p>}
            </header>
            <div className="se-inspector-tabs se-catalog-tabs" role="tablist" aria-label="Show schemas as">
                {[['list', 'List'], ['map', 'Map']].map(([id, label]) => (
                    <button type="button" role="tab" key={id} id={`catalog-tab-${id}`} aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
                ))}
            </div>
            {tab === 'map' && <SchemaAtlas index={index} query={query} onOpen={onOpen} />}
            <div className="se-catalog-grid" hidden={tab !== 'list'}>
                {groups.filter((group) => group.members.length).map((group) => (
                    <CatalogPanel key={group.id} group={group} onOpen={onOpen} onOpenGroup={onOpenGroup} />
                ))}
                {!shown && <p className="se-flow-note">No schemas match “{query.trim()}”.</p>}
            </div>
        </section>
    );
}
