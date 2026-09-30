import React from 'react';

// Keep the explorer's scripts and CSS out of the normal portal bundle and DOM.
// Its same-origin endpoints enforce admin access, including direct iframe access.
export default function SchemaExplorerPage() {
    return (
        <section className="container-fluid py-3">
            <iframe
                title="Schema Explorer"
                src="/schema-explorer/ui"
                style={{ width: '100%', height: '85vh', minHeight: 600, border: 0 }}
            />
        </section>
    );
}
