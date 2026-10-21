import React, { useEffect, useState } from 'react';

// Use the portal page lifecycle. Webpack loads the React UI only on this route.
export default function SchemaExplorerPage({ context }) {
    const [Explorer, setExplorer] = useState(null);
    const [error, setError] = useState(false);
    useEffect(() => {
        let cancelled = false;
        import(
            /* webpackChunkName: "schema-explorer" */ './schema-explorer/Explorer'
        )
            .then((module) => {
                if (!cancelled) setExplorer(() => module.default);
            })
            .catch(() => {
                if (!cancelled) setError(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);
    return (
        <section className="container-fluid py-3" aria-label="Schema Explorer">
            {error ? (
                <p role="alert" className="alert alert-warning">
                    Schema Explorer could not load. Reload this page to retry.
                </p>
            ) : Explorer ? (
                <Explorer isAdmin={context?.can_view_items === true} />
            ) : (
                <p role="status">Loading Schema Explorer…</p>
            )}
        </section>
    );
}
