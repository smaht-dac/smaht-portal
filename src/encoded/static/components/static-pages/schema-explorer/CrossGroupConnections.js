import React, { useState } from 'react';
import { domains, domainFor } from './domains';
import { groupRelationships } from './relationship-view';
import { edgeLabel } from './shared';

export function outsideConnections(selected, edges) {
    if (!selected) return [];
    const outside = groupRelationships(edges.filter((edge) =>
        (edge.from === selected || edge.to === selected) && domainFor(edge.from) !== domainFor(edge.to)
    ));
    return domains.map((domain) => {
        const connections = outside.filter((edge) => domainFor(edge.from === selected ? edge.to : edge.from) === domain.id);
        const count = new Set(connections.map((edge) => edge.from === selected ? edge.to : edge.from)).size;
        return { ...domain, connections, count };
    }).filter((group) => group.count && !(group.id === 'administrative' &&
        group.connections.every((connection) => ['User', 'Consortium', 'SubmissionCenter'].includes(
            connection.from === selected ? connection.to : connection.from
        ))));
}

function fieldLabel(path) {
    const parts = path.replaceAll('[]', '').split('.');
    if (parts.length > 1 && ['value', 'file'].includes(parts.at(-1))) parts.pop();
    return parts.map((part) => {
        const words = part.replaceAll('_', ' ');
        return words.charAt(0).toUpperCase() + words.slice(1);
    }).join(' / ');
}

export default function CrossGroupConnections({ selected, groups, sectionRef, onChoose, onInspect, onShowAll, onClose }) {
    const [expanded, setExpanded] = useState(null);
    return (
        <section ref={sectionRef} id="cross-group-connections" className="se-cross-group" aria-label={`${selected}: connections outside this group`}>
            <div className="se-cross-group-heading">
                <strong>{selected} · External connections</strong>
                <button type="button" data-close-connections="" onClick={onClose} aria-label="Close external connections"><i className="icon icon-fw icon-times fas" aria-hidden="true" /></button>
            </div>
            <div className="se-cross-group-list">
                {groups.map((group) => (
                    <details key={group.id} data-domain={group.id} open={expanded === group.id}>
                        <summary onClick={(event) => { event.preventDefault(); setExpanded(expanded === group.id ? null : group.id); }}>{group.label}<span>{group.count} connected {group.count === 1 ? 'schema' : 'schemas'}</span></summary>
                        <ul>{group.connections.map((connection) => {
                            const outgoing = connection.from === selected;
                            const peer = outgoing ? connection.to : connection.from;
                            return (
                                <li key={connection.key}>
                                    <div className="se-cross-group-row-heading">
                                        <button type="button" className="se-cross-group-peer" onClick={() => onChoose(peer)}>{peer} <i className="icon icon-fw icon-angle-right fas" aria-hidden="true" /></button>
                                        <span className="se-cross-group-direction">{outgoing ? 'Outgoing' : 'Incoming'} · {edgeLabel(connection)}</span>
                                    </div>
                                    <div className="se-cross-group-row-detail">
                                        <span className="se-cross-group-fields">{connection.edges.map((edge) => (
                                            <span key={edge.field} title={`${edge.from}.${edge.field} → ${edge.to}`}>{fieldLabel(edge.field)}</span>
                                        ))}
                                        </span>
                                        <button type="button" className="se-cross-group-inspect" aria-label="Inspect relationship" onClick={() => onInspect(connection)}>Details</button>
                                    </div>
                                </li>
                            );
                        })}
                        </ul>
                    </details>
                ))}
            </div>
            <button className="se-cross-group-show-all" type="button" onClick={onShowAll}>Show all connected schemas</button>
        </section>
    );
}
