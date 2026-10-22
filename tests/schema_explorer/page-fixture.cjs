// Match the standard Page -> StaticSection representation, including JSX parsing.
module.exports = {
    '@id': '/schema-explorer',
    '@type': ['Schema-explorerPage', 'StaticPage', 'Portal'],
    identifier: 'schema-explorer',
    title: 'Schema Explorer',
    display_title: 'Schema Explorer',
    'table-of-contents': { enabled: false },
    content: [{
        '@id': '/static-sections/schema-explorer-content/',
        '@type': ['StaticSection', 'Item'],
        identifier: 'schema-explorer-content',
        content: '<SchemaExplorerSection />',
        filetype: 'jsx',
        options: { filetype: 'jsx', collapsible: false, default_open: true },
    }],
};
