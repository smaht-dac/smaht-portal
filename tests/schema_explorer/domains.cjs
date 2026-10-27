const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
    const source = fs.readFileSync('src/encoded/static/components/static-pages/schema-explorer/domains.js', 'utf8');
    const { domains, domainFor, groupedLayout } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const names = domains.flatMap(d => d.types.split(' ').filter(Boolean));
    assert.equal(new Set(names).size, names.length, 'Each type has one primary domain');
    const nodes = [...names, 'FutureType'].map(name => ({ name }));
    const { positions, frames } = groupedLayout(nodes, 236, 66);
    assert.equal(Object.keys(positions).length, nodes.length);
    assert.equal(domainFor('FutureType'), 'other');
    for (const [name, point] of Object.entries(positions)) {
        const frame = frames.find(f => f.id === domainFor(name));
        assert.ok(point.x - 118 >= frame.left && point.x + 118 <= frame.left + frame.width);
        assert.ok(point.y - 33 >= frame.top + 60 && point.y + 33 <= frame.top + frame.height);
    }
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = positions[nodes[i].name], b = positions[nodes[j].name];
        assert.ok(Math.abs(a.x - b.x) >= 236 || Math.abs(a.y - b.y) >= 66, 'Nodes must not overlap');
    }
    assert.deepEqual(groupedLayout([], 236, 66), { positions: {}, frames: [] });
    assert.deepEqual(groupedLayout(nodes, 236, 66).positions, positions, 'Stable placement');
    console.log('Domain taxonomy, fallback, containment and non-overlap passed.');
})();
