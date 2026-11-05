const fs = require('node:fs');
const assert = require('node:assert/strict');
const load = async name => import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync(`src/encoded/static/components/static-pages/schema-explorer/${name}.js`)).toString('base64')}`);
(async()=>{
 const {concepts,buildResearchMap,traceProvenance,researchLabels,overviewFlow}=await load('research-map');
 const {routeEdges,segmentClear}=await load('routing');
 const model=JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/schema-explorer-hierarchy.json')).model;
 const available=model.models.map(m=>({name:m.name}));
 const ids=concepts.flatMap(c=>c.types.split(' '));
 assert.equal(new Set(ids).size,ids.length,'Every schema belongs to one concept');
 for(const viewport of [{width:1230,height:650},{width:900,height:650},{width:630,height:585}]){
  const graph=buildResearchMap(model,available,viewport);
  assert.equal(graph.nodes.length,11);
  assert.equal(graph.edges.length,10,'The initial model shows its meaningful relationships');
  const nodeMap=new Map(graph.nodes.map(n=>[n.id,n]));
  for(const edge of graph.edges){
   assert.ok(edge.edges.length);
   assert.ok(edge.question && edge.explanation,'Each connection has a research question and explanatory context');
   assert.ok(edge.edges.every(e=>model.edges.includes(e) && e.kind==='linkTo'));
   assert.ok(edge.edges.every(e=>nodeMap.get(edge.from).members.includes(e.from) && nodeMap.get(edge.to).members.includes(e.to)),'Concept endpoints match actual schema endpoints');
  }
  const flow=overviewFlow(graph);
  for(const edge of flow.edges){
   const original=graph.edges.find(reference=>reference.key===edge.key);
   assert.equal(edge.edges,original.edges,'Display direction preserves exact schema-reference data');
   if(edge.primary){
    assert.ok(nodeMap.get(edge.from).step<nodeMap.get(edge.to).step,'Numbered arrows follow biological progression');
    assert.equal(edge.from,original.to);assert.equal(edge.to,original.from);
   }else{assert.equal(edge.from,original.from);assert.equal(edge.to,original.to);}
  }
  const flowRoutes=routeEdges(flow.positions,flow.edges,flow.nodeWidth,flow.nodeHeight);
  assert.equal(Object.keys(researchLabels(flow,flowRoutes)).length,10,'Forward-flow labels fit at each viewport');
  for(const edge of flow.edges){
   const end=flowRoutes[edge.key].end,target=flow.positions[edge.to];
   assert.ok(Math.abs(Math.abs(end.x-target.x)-flow.nodeWidth/2)<0.01 || Math.abs(Math.abs(end.y-target.y)-flow.nodeHeight/2)<0.01,'Arrow tips attach to the displayed target');
  }
  const routes=routeEdges(graph.positions,graph.edges,graph.nodeWidth,graph.nodeHeight);
  assert.equal(Object.keys(routes).length,graph.edges.length);
  const labels=researchLabels(graph,routes);
  assert.equal(Object.keys(labels).length,graph.edges.length,'Every relationship is explained on the diagram');
  const boxes=graph.nodes.map(n=>({left:graph.positions[n.id].x-graph.nodeWidth/2,right:graph.positions[n.id].x+graph.nodeWidth/2,top:graph.positions[n.id].y-graph.nodeHeight/2,bottom:graph.positions[n.id].y+graph.nodeHeight/2}));
  for(const route of Object.values(routes))for(let i=1;i<route.points.length;i++)assert.ok(segmentClear(route.points[i-1],route.points[i],boxes));
  for(const label of Object.values(labels))for(const b of boxes)assert.ok(label.left+label.width<=b.left || label.left>=b.right || label.top+label.height<=b.top || label.top>=b.bottom,'Labels avoid nodes');
  const trace=traceProvenance(graph,'files');
  assert.deepEqual([...trace.nodes],['files','fileSet','library','analyte','sample','material','donor']);
  assert.equal(trace.edges.size,6);
  assert.ok(!trace.nodes.has('quality') && !trace.nodes.has('analysis'),'Provenance trace excludes processing/quality branches');
  assert.deepEqual(buildResearchMap(model,[...available].reverse(),viewport),graph,'Stable concept order');
 }
 const graph=buildResearchMap(model,available);
 const withoutSampleLinks={...model,edges:model.edges.filter(e=>!(e.kind==='linkTo' && e.field==='sample_sources[]'))};
 const partial=buildResearchMap(withoutSampleLinks,available);
 assert.ok(!partial.edges.some(e=>e.key==='sample-material'),'A missing reference is never invented');
 assert.ok(!traceProvenance(partial,'files').nodes.has('donor'));
 assert.equal(buildResearchMap(model,[]).nodes.length,0);
 assert.equal(buildResearchMap(model,[]).edges.length,0);
 const noFiles=buildResearchMap(model,available.filter(n=>!concepts.find(c=>c.id==='files').types.split(' ').includes(n.name)));
 assert.ok(!noFiles.nodes.some(n=>n.id==='files'));
 assert.ok(!noFiles.edges.some(e=>e.from==='files' || e.to==='files'));
 assert.equal(graph.edges.find(e=>e.key==='material-donor').edges.some(e=>e.from==='Tissue' && e.field==='donor'),true);
 console.log('Research overview: real schema projection, provenance trace, 11 concepts / 10 labeled connections, responsive routing and missing-reference handling passed.');
})();
