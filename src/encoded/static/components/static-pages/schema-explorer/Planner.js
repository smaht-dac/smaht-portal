import React, { useState, useMemo } from 'react';
import Modal from 'react-bootstrap/esm/Modal';
import { analyze, fields } from './path-analysis';
import { Badge, SourceLinks } from './shared';

function Chain({ steps, source, onSource }) {
    return (
        <div className="se-chain">
            <Badge>{source}</Badge>
            {steps.map((step, i) => (
                <div key={i}>
                    <code>
                        {step.field} → {step.to}
                    </code>{' '}
                    <Badge kind={step.kind}>
                        {step.missing
                            ? 'Missing reverse link'
                            : step.reverse
                                ? 'Calculated reverse'
                                : step.kind === 'calculated'
                                    ? 'Calculated'
                                    : 'Stored link'}
                    </Badge>
                    {step.conditional && (
                        <p className="text-warning">
                            Requires subtype {step.to}; declared target:{' '}
                            {step.declaredTarget}.
                        </p>
                    )}
                    {step.owner && <small> Python: {step.owner}</small>}
                    <SourceLinks sources={step.sources} onSource={onSource} />
                </div>
            ))}
        </div>
    );
}
export default function Planner({ index, initialSource, onClose, onSource }) {
    const [source, setSource] = useState(
        initialSource || index.models[0]?.name || ''
    );
    const [target, setTarget] = useState(index.models[0]?.name || '');
    const targetFields = useMemo(
        () => fields(index.models.find((m) => m.name === target)),
        [index, target]
    );
    const [field, setField] = useState('');
    const [depth, setDepth] = useState('4');
    const [storedOnly, setStored] = useState(false),
        [subtypes, setSubtypes] = useState(true);
    const [report, setReport] = useState(null),
        [error, setError] = useState('');
    const options = index.models.map((m) => (
        <option key={m.name}>{m.name}</option>
    ));
    const update = (setter) => (event) => {
        setter(event.target.value);
        setReport(null);
    };
    return (
        <Modal
            show
            onHide={onClose}
            size="xl"
            className="schema-explorer-modal"
            aria-labelledby="path-title">
            <Modal.Header closeButton>
                <Modal.Title id="path-title">Find embed path</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <p>
                    Trace directed links from a starting type to a field on
                    another type. All resolved types are considered.
                </p>
                <form
                    id="path-form"
                    onSubmit={(e) => {
                        e.preventDefault();
                        try {
                            setReport(
                                analyze(index, {
                                    source,
                                    target,
                                    field: field || targetFields[0]?.path,
                                    depth,
                                    storedOnly,
                                    subtypes,
                                })
                            );
                            setError('');
                        } catch (err) {
                            setReport(null);
                            setError(err.message);
                        }
                    }}>
                    <div className="se-planner-controls">
                        <label>
                            Starting type
                            <select
                                id="path-source"
                                value={source}
                                onChange={update(setSource)}>
                                {options}
                            </select>
                        </label>
                        <label>
                            Target type
                            <select
                                id="path-target"
                                value={target}
                                onChange={(e) => {
                                    setTarget(e.target.value);
                                    setField('');
                                    setReport(null);
                                }}>
                                {options}
                            </select>
                        </label>
                        <label>
                            Target field
                            <select
                                id="path-field"
                                value={field || targetFields[0]?.path || ''}
                                onChange={update(setField)}>
                                {targetFields.map((f) => (
                                    <option key={f.path} value={f.path}>
                                        {f.path} ·{' '}
                                        {f.field.calculated
                                            ? 'calculated'
                                            : f.link
                                                ? 'stored link'
                                                : 'stored schema field'}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Max hops
                            <select value={depth} onChange={update(setDepth)}>
                                {[1, 2, 3, 4, 5, 6].map((n) => (
                                    <option key={n}>{n}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <div className="se-toolbar">
                        <label>
                            <input
                                type="checkbox"
                                checked={storedOnly}
                                onChange={(e) => {
                                    setStored(e.target.checked);
                                    setReport(null);
                                }}
                            />{' '}
                            Stored links only
                        </label>
                        <label>
                            <input
                                type="checkbox"
                                checked={subtypes}
                                onChange={(e) => {
                                    setSubtypes(e.target.checked);
                                    setReport(null);
                                }}
                            />{' '}
                            Include conditional subtype routes
                        </label>
                        <button type="submit">Analyze paths</button>
                    </div>
                </form>
                {error && <p role="alert">{error}</p>}
                {report && (
                    <div id="path-results">
                        <h3>
                            {report.target}.{report.targetField.path}
                        </h3>
                        <Badge>
                            {report.targetField.field.calculated
                                ? 'Calculated target'
                                : 'Stored target'}
                        </Badge>
                        <p>
                            {report.routes.length} ranked routes ·{' '}
                            {report.candidateCount} candidates found
                            {report.truncated && ' · Limited results'}. Select a
                            route to view its steps.
                        </p>
                        {report.routes.map((route, i) => (
                            <details className="se-route" key={i}>
                                <summary>
                                    <strong>#{i + 1}</strong>{' '}
                                    <code>{route.embed.path}</code> ·{' '}
                                    {route.steps.length} hops{' '}
                                    <Badge>{route.embed.status}</Badge>
                                    {!!route.conditional && (
                                        <Badge>Conditional</Badge>
                                    )}
                                    {!!route.calculated && (
                                        <Badge>Calculated</Badge>
                                    )}
                                </summary>
                                <Chain
                                    steps={route.steps}
                                    source={report.source}
                                    onSource={onSource}
                                />
                                <p>{route.ranking.reasons.join(' · ')}</p>
                                <p>{route.embed.message}</p>
                                <pre>{JSON.stringify(route.embed.path)}</pre>
                                {!!route.conditional && (
                                    <p>
                                        Validate the subtype-specific route
                                        against the runtime registry before
                                        adding the embed.
                                    </p>
                                )}
                                {!!route.embed.matches.length && (
                                    <p>
                                        Matched:{' '}
                                        {route.embed.matches.join(', ')}
                                    </p>
                                )}
                                <SourceLinks
                                    sources={[report.embedSource]}
                                    onSource={onSource}
                                />
                            </details>
                        ))}
                        {!report.routes.length && (
                            <>
                                <h4>
                                    {report.reachableBeyondLimit
                                        ? 'A route exists beyond the listing limits'
                                        : 'No traversable route found'}
                                </h4>
                                <p>
                                    {report.reachableBeyondLimit
                                        ? 'Increase Max hops or narrow the options.'
                                        : 'An embed alone cannot create a missing relationship.'}
                                </p>
                                {report.repairs.map((steps, i) => (
                                    <details className="se-route" key={i}>
                                        <summary>
                                            Possible repair ·{' '}
                                            {[
                                                report.source,
                                                ...steps.map((s) => s.to),
                                            ].join(' → ')}
                                        </summary>
                                        <Chain
                                            steps={steps}
                                            source={report.source}
                                            onSource={onSource}
                                        />
                                        <p>
                                            Proposal only: implement and
                                            validate the missing reverse
                                            property before adding an embed.
                                            Reverse links may return multiple
                                            items.
                                        </p>
                                    </details>
                                ))}
                                {!report.repairs.length && (
                                    <p>
                                        Consider a stored linkTo or calculated
                                        link. The join key and relationship must
                                        be defined by the domain.
                                    </p>
                                )}
                            </>
                        )}
                        <details className="se-route">
                            <summary>Analysis notes</summary>
                            <p>{report.limitations}</p>
                            <p>
                                Ranking: fewer subtype conditions → existing
                                embed → fewer calculated links → fewer hops →
                                fewer array traversals.
                            </p>
                            <p>
                                Arrays remain arrays. Embedding does not flatten
                                or aggregate values. Storage dependencies of
                                calculated targets are not inferred.
                            </p>
                            {report.truncated && (
                                <p>
                                    Up to 12 routes, within Max hops and a
                                    15,000-state search budget. More routes may
                                    exist.
                                </p>
                            )}
                            {report.diagnostics.map((note, i) => (
                                <p key={i}>{note}</p>
                            ))}
                            <SourceLinks
                                sources={report.targetField.field.sources}
                                onSource={onSource}
                            />
                        </details>
                    </div>
                )}
            </Modal.Body>
        </Modal>
    );
}
