import React from 'react';
import { domains, domainFor, abstractTypes } from './domains';
import { nodePresentation } from './node-presentation';

// Every schema grouped by area, as readable text: the entry screen of Schema details.
export default function SchemaCatalog({ index, query, onOpen, onOpenGroup }) {
    const needle = query.trim().toLowerCase();
    const groups = domains.map((domain) => {
        const all = index.models.filter((model) => domainFor(model.name) === domain.id)
            .sort((a, b) => a.name.localeCompare(b.name));
        const members = all.map((model) => { return { model, caption: nodePresentation(model.name, model).caption }; })
            .filter(({ model, caption }) => !needle || `${model.name} ${caption}`.toLowerCase().includes(needle));
        return { ...domain, total: all.length, members };
    }).filter((group) => group.total);
    const shown = groups.reduce((n, group) => n + group.members.length, 0);
    return (
        <section className="se-catalog" aria-label="All schemas">
            {/* The panels show every count, so the heading only adds one while a search narrows them. */}
            <header className="se-catalog-heading">
                <h2>All schemas</h2>
                {needle && <p className="se-catalog-match" role="status">{shown} of {index.models.length} schemas match “{query.trim()}”</p>}
            </header>
            <div className="se-catalog-grid">
                {groups.filter((group) => group.members.length).map((group) => (
                    // A portal panel: a plain title band (name, count, text link), then a ruled, zebra list.
                    <section className="se-catalog-group" key={group.id} aria-label={group.label}>
                        <header>
                            <h3>{group.label} <span className="se-catalog-count">{group.total}</span></h3>
                            {onOpenGroup && (
                                <button type="button" aria-label="Open group map" title={`Open the ${group.label} map`} onClick={() => onOpenGroup(group.id)}>
                                    Group map
                                </button>
                            )}
                        </header>
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
                ))}
                {!shown && <p className="se-flow-note">No schemas match “{query.trim()}”.</p>}
            </div>
        </section>
    );
}
