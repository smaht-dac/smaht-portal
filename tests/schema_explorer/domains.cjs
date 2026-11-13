const fs = require('node:fs');
const assert = require('node:assert/strict');
const load = async name => import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync(`src/encoded/static/components/static-pages/schema-explorer/${name}.js`, 'utf8')).toString('base64')}`);
(async () => {
    const { domains, domainFor, hierarchicalLayout: layoutWith, stages, abstractTypes } = await load('domains');
    // Group maps are always laid out with the donor-to-data concepts, as in the explorer.
    const { concepts } = await load('research-map');
    const hierarchicalLayout = (nodes, width, height, edges, viewport) => layoutWith(nodes, width, height, edges, viewport, concepts);
    const { routeEdges, segmentClear, panelRoutes } = await load('routing');
    assert.ok(abstractTypes.has('AbstractDonor') && abstractTypes.has('File') && abstractTypes.has('Sample'));
    assert.ok(!abstractTypes.has('Donor') && !abstractTypes.has('WorkflowRun'),'Concrete parent classes are not classified as abstract');
    const names = domains.flatMap(d => d.types.split(' ').filter(Boolean));
    assert.equal(new Set(names).size, names.length, 'Each type has one primary domain');
    const assigned = Object.values(stages).flatMap(rows => rows.flatMap(row => row[1].split(' ')));
    assert.equal(new Set(assigned).size, assigned.length, 'Each configured type has one stage');
    assert.deepEqual([...assigned].sort(), [...names].sort(), 'Every known type has an explicit role');
    const nodes = [...names, 'FutureType'].map(name => ({ name }));
    const { positions, frames, layers } = hierarchicalLayout(nodes, 236, 66);
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
    const flow = ['donors', 'samples', 'sequencing', 'workflows', 'files'].map(id => frames.find(f => f.id === id));
    for (let i = 1; i < flow.length; i++) assert.ok(flow[i].top > flow[i-1].top + flow[i-1].height);
    assert.ok(frames.find(f => f.id === 'administrative').top > flow.at(-1).top, 'Support groups follow biological groups in the directory');
    // One grouping per map: concept panels named and numbered as on the path, then unnumbered stages for the rest.
    const labels = id => layers.filter(l => l.domain === id).map(l => l.label);
    assert.deepEqual(labels('donors'), ['1. Donor', 'Clinical context', 'Clinical details', 'Collection']);
    assert.deepEqual(labels('samples'), ['2. Source material', '3. Sample', 'Pathology'], 'No stage repeats a concept under another name or number');
    assert.deepEqual(labels('sequencing'), ['4. Analyte', '5. Library', '6. Experiment / FileSet', 'Sequencing', 'Supporting types']);
    assert.deepEqual(labels('files'), ['7. Data files', 'Quality assessment', 'Supporting types']);
    assert.deepEqual(labels('administrative')[0], 'Base types', 'A group off the path keeps its stages, base types first');
    for (const concept of concepts) {
        const panel = layers.find(l => l.concept === concept.id);
        assert.deepEqual([...panel.names].sort(), concept.types.split(' ').sort(), `${concept.label}: its panel holds exactly its schemas`);
    }
    assert.ok(layers.find(l => l.id === 'samples-Pathology').names.includes('PathologyReport'), 'A base type outside the concepts sits with its subtypes');
    assert.ok(layers.find(l => l.id === 'sequencing-Supporting types').names.includes('Treatment'), 'A partly covered stage gives its rest to Supporting types');
    for (const [name, label] of [['AbstractDonor', '1. Donor'], ['Donor', '1. Donor'], ['MedicalHistory', 'Clinical context'], ['Diagnosis', 'Clinical details'], ['TissueCollection', 'Collection']]) {
        const point=positions[name], panel=layers.find(l=>l.domain==='donors' && l.label===label).panel;
        assert.ok(point.x>=panel.left && point.x<=panel.left+panel.width && point.y>=panel.top && point.y<=panel.top+panel.height);
    }
    const filtered = hierarchicalLayout(nodes.filter(n => ['Donor', 'TissueCollection'].includes(n.name)), 236, 66);
    assert.deepEqual(filtered.layers.map(l => l.label), ['1. Donor', 'Collection'], 'Empty layers collapse');
    assert.deepEqual(hierarchicalLayout([], 236, 66), { positions: {}, frames: [], layers: [] });
    assert.deepEqual(hierarchicalLayout([...nodes].reverse(), 236, 66), { positions, frames, layers }, 'Input order does not affect placement');
    assert.equal(layers.find(l => l.domain === 'other').label, 'Other types');

    function assertPanelSeparation(layout) {
        for (const layer of layout.layers) {
            const p=layer.panel;
            for (const name of layer.names) {
                const node=layout.positions[name];
                assert.ok(node.x-118>=p.left+18 && node.x+118<=p.left+p.width-18,`${name}: horizontal panel inset`);
                assert.ok(node.y-33>=p.top+40 && node.y+33<=p.top+p.height-16,`${name}: header and bottom inset`);
            }
        }
        for(let i=0;i<layout.layers.length;i++)for(let j=i+1;j<layout.layers.length;j++){
            const a=layout.layers[i].panel,b=layout.layers[j].panel;
            assert.ok(a.left+a.width+20<=b.left || b.left+b.width+20<=a.left || a.top+a.height+20<=b.top || b.top+b.height+20<=a.top,'Stage panels have distinct gutters, including the base strip');
        }
    }
    assertPanelSeparation({positions,layers});
    const edge = (from, to, kind='linkTo') => ({ from, to, kind, key: `${from}-${to}-${kind}` });
    function validateRoutes(points, edges, headings = []) {
        const routes = routeEdges(points, edges, 236, 66, headings);
        assert.equal(Object.keys(routes).length, edges.length, 'Every edge must have a route');
        const boxes = Object.entries(points).map(([name, p]) => ({ name, left: p.x - 118, right: p.x + 118, top: p.y - 33, bottom: p.y + 33 }));
        const obstacles = [...boxes, ...headings.map(h => ({ left: h.left, right: h.left + h.width, top: h.top, bottom: h.top + h.height }))];
        for (const e of edges) {
            const route = routes[e.key];
            if (route.points.length > 2) assert.ok(route.d.includes('Q'), 'Corners are rounded');
            for (let i=1;i<route.points.length;i++) assert.ok(segmentClear(route.points[i-1], route.points[i], obstacles), `Unobstructed ${e.key}`);
            const last = route.points.at(-1), target = boxes.find(b => b.name === e.to);
            assert.ok(last.x === target.left || last.x === target.right || last.y === target.top || last.y === target.bottom, 'Arrow terminates at target boundary');
            assert.equal(Math.abs(route.ux) + Math.abs(route.uy), 1);
        }
        assert.deepEqual(routeEdges(points, edges, 236, 66, headings), routes, 'Stable routing');
        return routes;
    }
    const fixture = { A: { x:0, y:0 }, B: { x:0, y:200 }, C: { x:0, y:400 }, D: { x:400, y:200 } };
    const edges = [edge('A','C'),edge('C','A'),edge('B','D'),edge('A','A'),edge('A','C','calculated')];
    const routes = validateRoutes(fixture, edges);
    assert.notDeepEqual(routes[edges[0].key].points, routes[edges[4].key].points, 'Parallel relations have separate routes');
    validateRoutes({ ...fixture, B: { x:170, y:260 } }, edges, [{ left:-118, top:90, width:636, height:24 }]);
    const donors = nodes.filter(n => domainFor(n.name) === 'donors');
    const donorEdges = [edge('Diagnosis','AbstractDonor'),edge('MedicalTreatment','MedicalHistory'),edge('Donor','MedicalHistory'),edge('MedicalHistory','Donor'),edge('ProtectedDonor','TissueCollection')];
    const donor = hierarchicalLayout(donors, 236, 66, donorEdges);
    validateRoutes(donor.positions, donorEdges, [...donor.layers, ...donor.frames.map(f => ({ left:f.left+18, top:f.top+12, width:Math.min(f.width-36,f.label.length*15+12), height:38 }))]);
    // Connectivity changes horizontal ordering without moving biological stages.
    const orderingEdges = [edge('Demographic','ProtectedDonor'), edge('MedicalHistory','Donor')];
    const ordered = hierarchicalLayout(donors,236,66,orderingEdges).positions;
    assert.ok(ordered.MedicalHistory.y < ordered.Demographic.y || ordered.MedicalHistory.y === ordered.Demographic.y && ordered.MedicalHistory.x < ordered.Demographic.x);
    for(const viewport of [{width:1230,height:650},{width:760,height:500},{width:1900,height:950}]){
        for(const domain of domains){
            const groupNodes=nodes.filter(n=>domainFor(n.name)===domain.id);
            const compact=hierarchicalLayout(groupNodes,236,66,[],viewport);
            if(!compact.frames.length)continue;
            assertPanelSeparation(compact);
            const f=compact.frames[0];
            const scale=Math.min(viewport.width/(f.width+40),viewport.height/(f.height+40));
            if(viewport.width===1230)assert.ok(scale>=0.8,`Readable ${domain.id}: ${scale}`);
            assert.deepEqual(hierarchicalLayout(groupNodes,236,66,[],viewport),compact);
        }
    }
    assert.notDeepEqual(hierarchicalLayout(donors,236,66,[],{width:600,height:800}).positions,hierarchicalLayout(donors,236,66,[],{width:1700,height:650}).positions,'Stage packing adapts to aspect ratio');
    if (process.argv[2]) {
        const snapshot = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
        const model = snapshot.model || snapshot;
        const actualNodes = model.models.map(m => ({name:m.name}));
        const actual = hierarchicalLayout(actualNodes,236,66,model.edges);
        const grouped = new Map();
        for (const e of model.edges) {
            const key = `${e.from}-${e.to}-${e.kind}-${!!e.reverse}`;
            grouped.set(key,{...e,key});
        }
        const start = Date.now();
        validateRoutes(actual.positions,[...grouped.values()], [...actual.layers,...actual.frames.map(f=>({left:f.left+18,top:f.top+12,width:Math.min(f.width-36,f.label.length*15+12),height:38}))]);
        console.log(`Full model routing: ${grouped.size} groups, ${Date.now()-start} ms (including repeat).`);
    }
    // Panel arrows run between panel boxes in the widened gaps, never cross a panel, never run along each other,
    // and each takes its own point on a panel side.
    const { panelRelationships } = await load('relationship-view');
    const model = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/schema-explorer-hierarchy.json')).model;
    let straightCount = 0, bentCount = 0;
    for (const id of ['donors', 'samples', 'sequencing', 'files', 'workflows']) {
        const groupNodes = nodes.filter(n => domainFor(n.name) === id);
        const wide = layoutWith(groupNodes, 236, 66, model.edges, { width: 1200, height: 650 }, concepts, { gap: 96, columnGap: 140 });
        const owners = new Map(wide.layers.flatMap(l => l.names.map(n => [n, l.id])));
        const { groups } = panelRelationships(model.edges.filter(e => e.kind === 'linkTo'), owners);
        const boxes = Object.fromEntries(wide.layers.map(l => [l.id, { x: l.panel.left + l.panel.width / 2, y: l.panel.top + l.panel.height / 2, width: l.panel.width, height: l.panel.height }]));
        // As in the explorer: panelRoutes draws what it can; routeEdges takes the rest.
        const own = panelRoutes(boxes, groups);
        for (const route of Object.values(own)) {
            if (route.straight) straightCount++; else bentCount++;
            for (let i = 1; i < route.points.length; i++) assert.ok(route.points[i - 1].x === route.points[i].x || route.points[i - 1].y === route.points[i].y, `${id}: panel arrows run horizontally or vertically`);
        }
        const routes = { ...routeEdges(boxes, groups.filter(g => !own[g.key]), 236, 66, [], { spreadPorts: true }), ...own };
        assert.equal(Object.keys(routes).length, groups.length, `${id}: every panel arrow is routed`);
        assert.equal(Object.keys(own).length, groups.length, `${id}: every panel arrow fits a straight line, a Z or a lane around the map`);
        const rects = wide.layers.map(l => ({ left: l.panel.left, right: l.panel.left + l.panel.width, top: l.panel.top, bottom: l.panel.top + l.panel.height }));
        for (const route of Object.values(routes)) for (let i = 1; i < route.points.length; i++) assert.ok(segmentClear(route.points[i - 1], route.points[i], rects), `${id}: panel arrows stay out of panels`);
        const segments = Object.entries(own).flatMap(([key, r]) => r.points.slice(1).map((p, i) => ({ key, a: r.points[i], b: p })));
        for (const s of segments) for (const t of segments) {
            if (s.key === t.key) continue;
            const horizontal = s.a.y === s.b.y && t.a.y === t.b.y && Math.abs(s.a.y - t.a.y) < 18 && Math.min(Math.max(s.a.x, s.b.x), Math.max(t.a.x, t.b.x)) > Math.max(Math.min(s.a.x, s.b.x), Math.min(t.a.x, t.b.x));
            const vertical = s.a.x === s.b.x && t.a.x === t.b.x && Math.abs(s.a.x - t.a.x) < 18 && Math.min(Math.max(s.a.y, s.b.y), Math.max(t.a.y, t.b.y)) > Math.max(Math.min(s.a.y, s.b.y), Math.min(t.a.y, t.b.y));
            assert.ok(!horizontal && !vertical, `${id}: ${s.key} and ${t.key} do not run along each other`);
        }
        const ends = Object.values(own).flatMap(r => [r.points[0], r.points[r.points.length - 1]]);
        ends.forEach((p, i) => ends.slice(i + 1).forEach(q => assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= 30, `${id}: arrows meet a panel at their own points`)));
    }
    assert.ok(straightCount > 5 && bentCount > 0, `Facing panels are joined by straight arrows, the rest by Z-shaped ones (${straightCount}/${bentCount})`);
    console.log('Biological stages, determinism, filtering, containment and obstacle-free routing passed.');
})();
