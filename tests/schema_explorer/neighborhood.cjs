const fs=require('node:fs'),assert=require('node:assert/strict');
const base='src/encoded/static/components/static-pages/schema-explorer/';
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
(async()=>{
 const read=name=>fs.readFileSync(base+name+'.js','utf8');
 const domainsUrl=url(read('domains'));
 const {neighborhoodLayout,neighborhoodSides}=await import(url(read('neighborhood').replace("'./domains'",JSON.stringify(domainsUrl))));
 const {domains,domainFor}=await import(domainsUrl);
 const {routeEdges,segmentClear}=await import(url(read('routing')));
 const {researchLabels}=await import(url(read('research-map')));
 const {groupRelationships,sharedRelationships}=await import(url(read('relationship-view')));
 const model=JSON.parse(fs.readFileSync(process.argv[2]||'/tmp/schema-explorer-hierarchy.json','utf8')).model;
 const excluded=new Set(['User','Consortium','Consortia','SubmissionCenter','AccessKey']);
 const neighborhood=(selected,kinds,shared=true)=>{
  const edges=model.edges.filter(e=>kinds.includes(e.kind)&&(e.from===selected||e.to===selected)&&!excluded.has(e.from)&&!excluded.has(e.to));
  const candidates=new Set([selected,...edges.flatMap(e=>[e.from,e.to])]);
  const grouped=groupRelationships(edges);
  return shared?sharedRelationships(model,grouped,candidates).groups:grouped;
 };

 const tissue=neighborhood('Tissue',['linkTo','calculated']);
 const sides=neighborhoodSides('Tissue',tissue);
 assert.deepEqual(sides.outgoing.sort(),['Donor','OntologyTerm'],'Tissue links to its donor and ontology term');
 assert.ok(sides.incoming.includes('AnalysisRun') && sides.incoming.includes('File'));
 assert.ok(!sides.incoming.includes('Donor'),'A schema referenced both ways sits once, with the schemas the selected schema links to');
 assert.ok(!sides.incoming.includes('AlignedReads'),'Shared definitions draw inherited sample_sources once, from File');
 assert.ok(neighborhoodSides('Tissue',neighborhood('Tissue',['linkTo','calculated'],false)).incoming.includes('AlignedReads'),'All references keep every subtype');

 for(const [selected,kinds] of [['Tissue',['linkTo','calculated']],['Donor',['linkTo','calculated','reverse']],['FileSet',['linkTo']],['File',['linkTo']],['Sample',['linkTo']]]){
  const groups=neighborhood(selected,kinds);
  const {positions,panels}=neighborhoodLayout(selected,groups,236,66);
  const {incoming,outgoing}=neighborhoodSides(selected,groups);
  assert.equal(positions[selected].x,0,`${selected} sits in the middle`);
  for(const name of incoming)assert.ok(positions[name].x<0,`${name} links to ${selected} from the left`);
  for(const name of outgoing)assert.ok(positions[name].x>0,`${selected} links to ${name} on the right`);
  for(const panel of panels){
   assert.equal(panel.label,domains.find(d=>d.id===panel.domain).label,'Panels reuse the catalog group names');
   for(const name of panel.names){
    assert.equal(domainFor(name),panel.domain);
    const p=positions[name];
    assert.ok(p.x-118>=panel.panel.left+18 && p.x+118<=panel.panel.left+panel.panel.width-18 && p.y-33>=panel.panel.top+40 && p.y+33<=panel.panel.top+panel.panel.height-16,`${name}: inside its group panel`);
   }
  }
  for(let i=0;i<panels.length;i++)for(let j=i+1;j<panels.length;j++){
   const a=panels[i].panel,b=panels[j].panel;
   assert.ok(a.left+a.width<=b.left || b.left+b.width<=a.left || a.top+a.height+20<=b.top || b.top+b.height+20<=a.top,'Group panels do not overlap');
  }
  const routes=routeEdges(positions,groups,236,66,panels,{spreadPorts:true});
  assert.equal(Object.keys(routes).length,groups.length,`${selected}: every arrow is routed`);
  const boxes=Object.values(positions).map(p=>({left:p.x-118,right:p.x+118,top:p.y-33,bottom:p.y+33}));
  for(const route of Object.values(routes))for(let i=1;i<route.points.length;i++)assert.ok(segmentClear(route.points[i-1],route.points[i],boxes),'Arrows avoid cards');
  const labels=researchLabels({nodes:Object.keys(positions).map(id=>({id})),positions,nodeWidth:236,nodeHeight:66,edges:groups.map(g=>({key:g.key,label:g.edges[0].field}))},routes,{avoidRoutes:true});
  for(const [key,box] of Object.entries(labels))for(const [other,route] of Object.entries(routes)){
   if(other===key)continue;
   for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1],b=route.points[i];
    const crosses=a.y===b.y?a.y>box.top&&a.y<box.top+box.height&&Math.max(a.x,b.x)>box.left&&Math.min(a.x,b.x)<box.left+box.width
     :a.x>box.left&&a.x<box.left+box.width&&Math.max(a.y,b.y)>box.top&&Math.min(a.y,b.y)<box.top+box.height;
    assert.ok(!crosses,`${selected}: a label never crosses another arrow`);
   }
  }
  if(selected!=='File')assert.equal(Object.keys(labels).length,groups.length,`${selected}: every arrow is labelled`);
 }
 console.log('Neighborhood: direction columns, shared inherited links, group panels, routed arrows and unambiguous labels passed.');
})();
