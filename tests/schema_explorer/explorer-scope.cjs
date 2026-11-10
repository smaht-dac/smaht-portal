const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
    const source = fs.readFileSync('src/encoded/static/components/static-pages/schema-explorer/explorer-scope.js', 'utf8');
    const { explorerIndex, excludedSchemas } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    const original = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/schema-explorer-hierarchy.json', 'utf8')).model;
    const before = JSON.stringify(original);
    const filtered = explorerIndex(original);
    assert.ok(filtered.models.length < original.models.length);
    assert.ok(filtered.models.some(model => model.name === 'Protocol'));
    for (const name of excludedSchemas) {
        assert.ok(!filtered.models.some(model => model.name === name));
        assert.ok(!filtered.edges.some(edge => edge.from === name || edge.to === name));
    }
    const remaining = new Set(filtered.models.map(model => model.name));
    filtered.edges.forEach(edge => { remaining.add(edge.from); remaining.add(edge.to); });
    for (const name of excludedSchemas) assert.ok(!remaining.has(name), 'Edges cannot recreate an excluded node');
    assert.equal(JSON.stringify(original), before, 'The original model remains intact');
    assert.deepEqual(explorerIndex(filtered), filtered);
    console.log('Explorer scope: excluded schemas and incoming/outgoing edges removed; model preserved.');
})();
