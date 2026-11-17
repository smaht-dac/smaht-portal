import React, { useMemo, useState } from 'react';
import { domains, domainFor } from './domains';
import { nodePresentation } from './node-presentation';

// The explorer's one search, in the same place on every view: suggestions by schema name, group or caption, and
// choosing one opens that schema. On the catalog the same text also filters the cards.
const limit = 8;

export default function SchemaFinder({ index, query, onQuery, onOpen }) {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const needle = query.trim().toLowerCase();
    const matches = useMemo(() => {
        if (!needle) return [];
        // Names that start with the text come first, then names that contain it, then group or caption matches.
        const rank = (name) => (name.toLowerCase().startsWith(needle) ? 0 : name.toLowerCase().includes(needle) ? 1 : 2);
        return index.models.map((model) => {
            return { name: model.name, group: domains.find((d) => d.id === domainFor(model.name))?.label || '', caption: nodePresentation(model.name, model).caption };
        })
            .filter((entry) => `${entry.name} ${entry.group} ${entry.caption}`.toLowerCase().includes(needle))
            .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
            .slice(0, limit);
    }, [index, needle]);
    const shown = open && matches.length > 0;
    const choose = (name) => {
        onQuery('');
        setOpen(false);
        onOpen(name);
    };
    const onKeyDown = (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActive((i) => (matches.length ? (i + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length : 0));
        } else if (event.key === 'Enter' && shown) {
            event.preventDefault();
            choose(matches[Math.min(active, matches.length - 1)].name);
        } else if (event.key === 'Escape') {
            setOpen(false);
        }
    };
    return (
        <div className="se-finder">
            <i className="icon icon-search fas" aria-hidden="true" />
            <input id="schema-finder" type="search" role="combobox" aria-label="Find a schema" placeholder="Find a schema…" autoComplete="off"
                aria-autocomplete="list" aria-controls="schema-finder-results" aria-expanded={shown}
                aria-activedescendant={shown ? `schema-finder-option-${active}` : undefined}
                value={query} onKeyDown={onKeyDown} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
                onChange={(event) => { onQuery(event.target.value); setOpen(true); setActive(0); }} />
            {shown && (
                <ul id="schema-finder-results" className="se-finder-results" role="listbox" aria-label="Matching schemas">
                    {matches.map((entry, i) => (
                        // Choosing on mouse down keeps the input from losing focus (and closing the list) first.
                        <li key={entry.name} id={`schema-finder-option-${i}`} role="option" aria-selected={i === active}
                            onMouseEnter={() => setActive(i)} onMouseDown={(event) => { event.preventDefault(); choose(entry.name); }}>
                            <strong>{entry.name}</strong>
                            <span>{entry.group}</span>
                            {entry.caption && <small>{entry.caption}</small>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
