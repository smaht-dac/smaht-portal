// Exercise the production React component and its mount/unmount lifecycle.
const React = require('react');
const ReactDOM = require('react-dom/client');
const Page = require('../../src/encoded/static/components/static-pages/SchemaExplorerPage').default;
const section = document.querySelector('section[aria-label="Schema Explorer"]');
const container = document.createElement('div');
section.replaceWith(container);
let root;
window.mountExplorer = (isAdmin = true) => { root = ReactDOM.createRoot(container); root.render(React.createElement(Page, { context: { can_view_items: isAdmin } })); };
window.unmountExplorer = () => { root.unmount(); root = null; };
window.mountExplorer();
