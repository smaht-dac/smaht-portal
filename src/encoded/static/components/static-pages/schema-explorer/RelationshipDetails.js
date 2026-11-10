import React from 'react';
import { SourceLinks } from './shared';
import { relationshipPresentation } from './relationship-presentation';

export default function RelationshipDetails({ references, index, intro, sources, onSource }) {
    const entries = relationshipPresentation(references, index);
    return (
        <div className="se-connection-details">
            {entries.map((entry) => (
                <article className="se-connection-card" key={entry.key}>
                    <h4>{entry.title}</h4>
                    {entry.meaning && <p>{entry.meaning}</p>}
                    <div className="se-connection-meta">
                        <code>{entry.field}</code>
                        <span>{entry.from.length === 1 ? entry.from[0] : `${entry.from.length} source types`} → {entry.to}</span>
                        <span>{entry.multiple ? 'Multiple references' : 'Single reference'}</span>
                        {entry.kind !== 'linkTo' && <span>{entry.kind === 'reverse' ? 'Reverse relationship' : 'Calculated relationship'}</span>}
                    </div>
                </article>
            ))}
            <details className="se-connection-technical">
                <summary>Technical details · fields, JSON &amp; sources</summary>
                {intro && <p>{intro}</p>}
                <ul>{references.map((edge, i) => <li key={i}><code>{edge.from}.{edge.field}</code> → <code>{edge.to}</code></li>)}</ul>
                {entries.filter((entry) => entry.description && entry.description !== entry.meaning).map((entry) => (
                    <p key={entry.key}><code>{entry.field}</code>: {entry.description}</p>
                ))}
                <SourceLinks sources={sources} onSource={onSource} />
                <pre>{JSON.stringify(references, null, 2)}</pre>
            </details>
        </div>
    );
}
