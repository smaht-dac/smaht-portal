// Exercise the production React component and its mount/unmount lifecycle.
const React = require('react');
const ReactDOM = require('react-dom');
const Page = require('../../src/encoded/static/components/static-pages/SchemaExplorerPage').default;
const section = document.querySelector('[data-schema-explorer]').parentElement;
const container = document.createElement('div');
section.replaceWith(container);
window.mountExplorer = () => ReactDOM.render(React.createElement(Page), container);
window.unmountExplorer = () => ReactDOM.unmountComponentAtNode(container);
window.mountExplorer();
