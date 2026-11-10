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
            <header className="se-diagram-header">
                <div className="se-diagram-heading">
                    <span className="se-diagram-eyebrow">Schema details</span>
                    <h2>All schemas</h2>
                    <p className="se-diagram-question">Every schema in the model, grouped by area. Choose one to see its fields and relationships.</p>
                    <ul className="se-diagram-facts" aria-label="Catalog summary">
                        <li>{index.models.length} schemas</li>
                        <li>{groups.length} groups</li>
                        {needle && <li>{shown} matching “{query.trim()}”</li>}
                    </ul>
                </div>
            </header>
            <div className="se-catalog-grid">
                {groups.filter((group) => group.members.length).map((group) => (
                    <section className="se-catalog-group" key={group.id} aria-label={group.label}>
                        <header>
                            <h3>{group.label} <span>{group.total}</span></h3>
                            {onOpenGroup && <button type="button" onClick={() => onOpenGroup(group.id)}>Open group map →</button>}
                        </header>
                        <ul>
                            {group.members.map(({ model, caption }) => (
                                <li key={model.name}>
                                    <button type="button" className={abstractTypes.has(model.name) ? 'se-catalog-abstract' : undefined} onClick={() => onOpen(model.name)}>
                                        <strong>{model.name}</strong>
                                        {abstractTypes.has(model.name) && <span className="se-catalog-badge">Abstract</span>}
                                        {caption.replace(/\s/g, '').toLowerCase() !== model.name.toLowerCase() && <small>{caption}</small>}
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
