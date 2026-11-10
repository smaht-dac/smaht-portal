// Exercise the production React component and its mount/unmount lifecycle.
const React = require('react');
const ReactDOM = require('react-dom/client');
const { StaticEntryContent } = require('../../src/encoded/static/components/static-pages/StaticPage');
const context = require('./page-fixture.cjs');
const section = document.querySelector('section[aria-label="Schema Explorer"]');
const container = document.createElement('div');
section.replaceWith(container);
let root;
window.mountExplorer = () => { root = ReactDOM.createRoot(container); root.render(React.createElement(StaticEntryContent, { section: context.content[0] })); };
window.unmountExplorer = () => { root.unmount(); root = null; };
window.mountExplorer();
