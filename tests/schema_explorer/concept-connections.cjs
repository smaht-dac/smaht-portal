const fs=require('node:fs'),assert=require('node:assert/strict');
const base='src/encoded/static/components/static-pages/schema-explorer/';
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
(async()=>{
 const read=name=>fs.readFileSync(base+name+'.js','utf8');
 const source=read('concept-connections').replace("'./relationship-view'",JSON.stringify(url(read('relationship-view')))).replace("'./relationship-presentation'",JSON.stringify(url(read('relationship-presentation'))));
 const {conceptConnections}=await import(url(source));
 const {buildResearchMap}=await import(url(read('research-map')));
 const index=JSON.parse(fs.readFileSync(process.argv[2]||'/tmp/schema-explorer-hierarchy.json','utf8')).model;
 const nodes=index.models.filter(model=>!['User','Consortium','Consortia','SubmissionCenter'].includes(model.name)).map(model=>({name:model.name}));
 const enabled=new Set(nodes.map(node=>node.name));
 const graph=buildResearchMap(index,nodes);
 const key=edge=>JSON.stringify([edge.from,edge.to,edge.field,edge.kind]);
 for(const concept of graph.nodes){
  const members=new Set(concept.members);
  const cards=conceptConnections(index,concept,graph,nodes);
  const expected=index.edges.filter(edge=>edge.kind==='linkTo'&&enabled.has(edge.from)&&enabled.has(edge.to)&&(members.has(edge.from)||members.has(edge.to)));
  assert.deepEqual(new Set(cards.flatMap(card=>card.edges.map(key))),new Set(expected.map(key)),`${concept.label}: all relevant direct references remain represented in the summary`);
 }
 const analyte=conceptConnections(index,graph.nodes.find(node=>node.id==='analyte'),graph,nodes);
 for(const field of ['samples[]','analyte_preparation','analytes[]'])assert.ok(analyte.some(card=>card.edges.some(edge=>edge.field===field)),`Analyte context includes ${field}`);
 console.log('Concept context: complete model-backed references for every concept; Analyte source, preparation and library relationships preserved.');
})();
