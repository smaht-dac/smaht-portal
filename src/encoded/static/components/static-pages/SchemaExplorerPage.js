import React, { useEffect, useRef, useState } from 'react';

// Load the explorer only on this route. It shares the portal document/session;
// its shadow root keeps diagram styles and IDs out of the surrounding UI.
export default function SchemaExplorerPage() {
    const host = useRef(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    useEffect(() => {
        let cancelled = false;
        let dispose;
        import(/* webpackIgnore: true */ '/schema-explorer/assets/native.js')
            .then(({ mount }) => {
                if (cancelled) return;
                dispose = mount(host.current);
                setLoading(false);
            })
            .catch(() => {
                if (cancelled) return;
                setLoading(false);
                setError(true);
            });
        return () => {
            cancelled = true;
            if (dispose) dispose();
        };
    }, []);
    return (
        <section className="container-fluid py-3" aria-label="Schema Explorer">
            {loading && <p role="status">Loading Schema Explorer…</p>}
            {error && (
                <p role="alert" className="alert alert-warning">
                    Schema Explorer could not load. Check your admin session and reload this page.
                </p>
            )}
            <div ref={host} data-schema-explorer="" />
        </section>
    );
}
