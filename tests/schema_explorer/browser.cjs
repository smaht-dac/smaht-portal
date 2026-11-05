const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs');const assert=require('node:assert/strict');
const path=require('path'),os=require('os');
const artifact=process.argv[2];
if(!artifact)throw Error('Pass the model artifact path as the first argument.');
const snapshotPath=path.resolve(artifact);
process.chdir(path.resolve(__dirname,'../..'));
const output=fs.mkdtempSync(path.join(os.tmpdir(),'schema-explorer-browser-'));
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}),headless:true});
 try {
 const shell=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true});
 let page=shell;
 const selectSetting = async (label, value) => {
  const field=page.getByLabel(label,{exact:true});
  if(!await field.isVisible())await page.locator('.se-map-settings > summary').click();
  await field.selectOption(value);
  if(await page.locator('.se-map-settings > summary').count())await page.locator('.se-map-settings > summary').click();
 };
 const clickDiagramEdge = async () => {
  const point = await page.locator('#entity-svg .se-edge').evaluateAll(edges => {
   for (const edge of edges) {
    const length = edge.getTotalLength();
    for (let fraction = .05; fraction < 1; fraction += .05) {
     const p = edge.getPointAtLength(length * fraction).matrixTransform(edge.getScreenCTM());
     if (document.elementFromPoint(p.x, p.y) === edge) return { x: p.x, y: p.y };
    }
   }
   return null;
  });
  assert.ok(point, 'A relationship has a visible clickable segment');
  await page.mouse.click(point.x, point.y);
  await page.getByRole('dialog').waitFor({state:'visible'});
  assert.ok(await page.locator('.se-connection-card h4').first().isVisible(), 'Research explanations lead the relationship inspector');
  assert.equal(await page.locator('#detail-content pre').isVisible(), false, 'Raw JSON is initially folded away');
  await page.locator('.se-connection-technical summary').click();
  assert.equal(await page.locator('#detail-content pre').isVisible(), true, 'Exact references remain accessible');
  await page.locator('.se-connection-technical summary').click();
  assert.equal(await page.getByRole('dialog').evaluate(dialog => {
   const rect = dialog.querySelector('.modal-content').getBoundingClientRect();
   return dialog.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + 25));
  }), true, 'Relationship details appear above the canvas');
 };
 const {spawnSync}=require('child_process');
 const pageContext=require('./page-fixture.cjs');
 let isAdmin=true;
 const rendered=spawnSync(process.execPath,['src/encoded/static/build/renderer.js','--debug',JSON.stringify(pageContext)],{encoding:'utf8',maxBuffer:8*1024*1024});
 assert.equal(rendered.status,0,rendered.stderr);
 let shellMarkup=rendered.stdout.slice(rendered.stdout.indexOf('<!DOCTYPE html>')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 assert.ok(shellMarkup.includes('Loading Schema Explorer'));
 const webpack=require('webpack');
 const portalConfig=require('../../webpack.config')[0];
 await new Promise((resolve,reject)=>webpack({...portalConfig,mode:'development',devtool:false,optimization:{},
  entry:path.resolve('tests/schema_explorer/browser-entry.cjs'),
  output:{path:output,filename:'harness.js',publicPath:'/test-assets/'},
  module:portalConfig.module
 },(err,stats)=>err||stats.hasErrors()?reject(err||Error(stats.toString())):resolve()));
 shellMarkup=shellMarkup.replace('</body>','<script src="/test-harness.js"></script></body>');
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const snapshot=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
 let calls=[];
 let fullMarkup=null;
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  // Portal chrome references external fonts; stub these without network access.
  if(['fonts.googleapis.com','fonts.gstatic.com','www.gravatar.com','secure.gravatar.com'].includes(url.hostname))return route.fulfill({body:''});
  calls.push(url.href);
  if(url.origin!=='https://portal.test')throw Error('External request: '+url.href);
  if(url.pathname==='/schema-explorer')return route.fulfill({contentType:'text/html',body:fullMarkup || shellMarkup});
  if(url.pathname.startsWith('/static/build/'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join('src/encoded/static/build',path.basename(url.pathname)))});
  if(url.pathname==='/static/css/style.css')return route.fulfill({contentType:'text/css',body:fs.readFileSync('src/encoded/static/css/style.css')});
  if(url.pathname==='/schema-explorer/ui')return route.fulfill({status:302,headers:{location:'/schema-explorer'}});
  if(url.pathname==='/test-harness.js')return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(output,'harness.js'))});
  if(url.pathname.startsWith('/test-assets/'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(output,path.basename(url.pathname)))});
  if(url.pathname==='/schema-explorer/model')return route.fulfill({json:{...snapshot.model,can_view_items:isAdmin}});
  if(url.pathname==='/schema-explorer/source')return route.fulfill({json:{file:url.searchParams.get('file'),text:snapshot.sources[url.searchParams.get('file')]}});
  if(url.pathname==='/profiles/Donor.json')return route.fulfill({json:{properties:{accession:{type:'string'}}}});
  if(url.pathname==='/redirect/')return route.fulfill({status:302,headers:{location:'https://evil.test/demo/'}});
  if(url.pathname==='/demo/'){
   if(url.searchParams.get('frame')==='raw')return route.fulfill({status:403,json:{detail:'Forbidden'}});
   return route.fulfill({json:{'@id':'/demo/','@type':['Donor'],uuid:'demo',accession:'DEMO',display_title:'Demo donor',principals_allowed:{view:['hidden-principal']},groups:['hidden-group'],donor_groups:['Visible study group'],profile:{roles:['hidden-role'],label:'Visible profile'}}});
  }
  return route.fulfill({status:404,json:{detail:'Not found'}});
 });
 await page.goto('https://portal.test/schema-explorer');
 await shell.waitForURL('https://portal.test/schema-explorer');
 await page.waitForFunction(()=>document.getElementById('types')?.options.length>30);
 assert.equal(await shell.locator('iframe').count(),0,'Explorer must not use an iframe');
 assert.ok(await shell.locator('.navbar').isVisible(),'Portal navigation must remain visible');
 assert.equal(await shell.getByText('Loading Schema Explorer…',{exact:true}).count(),0);
 assert.equal(await shell.getByRole('heading',{name:'Schema Explorer',exact:true}).count(),1);
 assert.equal(await page.locator('#types').inputValue(),'');
 assert.equal(await page.locator('[data-schema-explorer]').evaluate(el=>el.shadowRoot),null);
 assert.equal(await page.getByRole('heading',{name:'From donor to data',exact:true}).count(),1);
 assert.equal(await page.locator('#research-svg [data-concept]').count(),11);
 assert.equal(await page.locator('#research-svg .se-research-edge').count(),10);
 assert.equal(await page.locator('#research-svg .se-research-label').count(),10);
 assert.equal(await page.locator('#research-svg .se-research-label[data-reference="library-analyte"] text').textContent(),'used for');
 assert.match(await page.locator('#research-svg [data-reference="material-donor"] path').getAttribute('aria-label'),/Donor → Source material/);
 assert.match(await page.locator('#research-svg [data-reference="files-fileSet"] path').getAttribute('aria-label'),/Experiment \/ FileSet → Data files/);
 assert.equal(await page.locator('#research-svg').evaluate(svg=>{
  const pairs=[['material-donor','material'],['sample-material','sample'],['analyte-sample','analyte'],['library-analyte','library'],['fileSet-library','fileSet'],['files-fileSet','files']];
  return pairs.every(([key,target])=>{
   const point=svg.querySelector(`[data-reference="${key}"] polygon`).points.getItem(0);
   const node=svg.querySelector(`[data-concept="${target}"]`),matrix=node.transform.baseVal.consolidate().matrix,rect=node.querySelector('rect');
   const x=point.x-matrix.e,y=point.y-matrix.f,w=Number(rect.getAttribute('width')),h=Number(rect.getAttribute('height'));
   return x>=-0.1&&x<=w+0.1&&y>=-0.1&&y<=h+0.1&&(Math.abs(x)<0.1||Math.abs(x-w)<0.1||Math.abs(y)<0.1||Math.abs(y-h)<0.1);
  });
 }),true,'Entry-map arrowheads point to the next biological stage');
 assert.equal(await page.locator('#research-svg [data-concept] rect[width="4"]').count(),0,'Concept cards have no decorative side stripe');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.locator('#research-svg').evaluate(svg=>{const b=svg.getBoundingClientRect();return [...svg.querySelectorAll('[data-concept]')].every(n=>{const r=n.getBoundingClientRect();return r.left>=b.left && r.right<=b.right && r.top>=b.top && r.bottom<=b.bottom;});}),true,'The first view fits all concepts at readable size');

 assert.equal(await page.locator('#entity-svg').count(),0,'Opening view explains relationships rather than listing all types');
 const sourceConcept=page.locator('[data-concept]').filter({has:page.locator('[aria-label^="Explore Source material connections:"]')});
 const cardPaint=()=>sourceConcept.locator('.se-research-card').evaluate(node=>({fill:getComputedStyle(node).fill,stroke:getComputedStyle(node).stroke}));
 await page.locator('h2').first().hover();
 const normalPaint=await cardPaint();
 await sourceConcept.locator('.se-research-diagram-action').hover();
 assert.notDeepEqual(await cardPaint(),normalPaint,'Hovering the diagram action highlights its card');
 await sourceConcept.locator('[data-overview]').hover();
 assert.deepEqual(await cardPaint(),normalPaint,'Overview hover does not highlight the diagram action');
 assert.equal(await sourceConcept.locator('[data-overview] text').evaluate(node=>getComputedStyle(node).textDecorationLine),'underline','Overview has its own hover treatment');
 await page.locator('h2').first().hover();
 await page.locator('.se-research-legend').screenshot({path:path.join(output,'map-reading-guide.png')});
 await page.locator('#research-svg').screenshot({path:path.join(output,'research-overview.png')});
 assert.equal(await page.getByRole('button',{name:/^(Whole model|Trace a file to its donor)$/}).count(),0,'The overview has one mode');
 await page.locator('#research-svg [data-concept="sample"] > g[role="button"]:not([data-overview])').click();
 assert.ok(await page.locator('#entity-svg [data-entity="Sample"]').count(),'A concept card opens its connections directly');
 await page.getByRole('button',{name:'← Back to Sample overview',exact:true}).click();
 assert.match(await page.getByRole('region',{name:'Sample details',exact:true}).textContent(),/sample_sources/);
 assert.equal(await page.locator('#research-map-context').isVisible(),false,'Selecting a concept promotes the detail workspace and folds the overview');
 await page.waitForFunction(()=>document.activeElement?.textContent==='Sample');
 assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Sample','Selection focuses the main detail heading');
 assert.ok(await page.locator('.se-relationship-card').count()>=2);
 await page.locator('.se-research-detail').screenshot({path:path.join(output,'sample-workspace.png')});
 await page.getByLabel('Explore another concept',{exact:true}).selectOption('library');
 assert.equal(await page.locator('.se-relationship-card').count(),5);
 await page.getByRole('button',{name:'Explore Library connections →',exact:true}).click();
 const visibleSchemas=()=>page.locator('#entity-svg .entity-node').evaluateAll(nodes=>nodes.map(node=>node.dataset.entity).sort());
 assert.equal(await page.locator('#entity-svg .entity-node:not(:has(.se-context-domain))').count(),11,'Library opens the entire group directly');
 assert.equal(await page.locator('[data-entity="Library"].se-concept-center').count(),1,'The original concept remains visually anchored');
 for(const pair of ['Library to Analyte','FileSet to Library','Library to LibraryPreparation'])assert.ok(await page.locator(`#entity-svg .se-edge[aria-label="${pair}"]`).count(),'The overview connections and additional preparation metadata are present');
 await page.locator('.se-canvas-wrap').screenshot({path:path.join(output,'library-direct-connections.png')});
 assert.equal(await page.getByLabel('Diagram scope',{exact:true}).getByRole('button').count(),0,'No redundant scope toggle');
 await page.getByRole('button',{name:'← Back to Library overview',exact:true}).click();
 assert.equal(await page.getByLabel('Explore another concept',{exact:true}).inputValue(),'library','Back restores the concept instead of the whole-model overview');
 assert.equal(await page.locator('.se-relationship-card').count(),5);
 await page.getByLabel('Explore another concept',{exact:true}).selectOption('analyte');
 for(const field of ['samples[]','analyte_preparation','analytes[]'])assert.ok(await page.locator('.se-relationship-fields code').filter({hasText:field}).count(),`Analyte summary retains ${field}`);
 await page.getByRole('button',{name:'Explore Analyte connections →',exact:true}).click();
 assert.equal(await page.locator('#entity-svg .entity-node:not(:has(.se-context-domain))').count(),11,'Analyte uses the same full group view');
 assert.equal(await page.locator('#entity-svg .se-domain-frame').count(),1,'External context does not introduce an entire additional group');
 assert.match(await page.locator('[data-entity="Sample"] .se-context-domain').textContent(),/Other group/);

 for(const pair of ['Analyte to Sample','Analyte to AnalytePreparation','Library to Analyte'])assert.ok(await page.locator(`#entity-svg .se-edge[aria-label="${pair}"]`).count(),`The diagram retains ${pair} from the summary`);
 await page.locator('.se-canvas-wrap').screenshot({path:path.join(output,'analyte-consistent-context.png')});
 await page.locator('[data-entity="Sample"]').focus();await page.keyboard.press('Enter');
 await page.locator('#entity-svg .se-cross-group-cue [role="button"]').click();
 await page.getByRole('region',{name:'Sample: connections outside this group',exact:true}).getByRole('button',{name:'Show all connected schemas',exact:true}).click();
 const sampleNeighbors=[...new Set(['Sample',...snapshot.model.edges.filter(edge=>edge.kind==='linkTo' && (edge.from==='Sample' || edge.to==='Sample')).flatMap(edge=>[edge.from,edge.to])])].sort();
 assert.deepEqual(await visibleSchemas(),sampleNeighbors,'Explicit neighborhood exploration is not restricted by the previous concept scope');
 await page.locator('#entity-show-neighborhood').click();
 await page.getByRole('button',{name:'← Back to Analyte overview',exact:true}).click();
 await page.getByLabel('Explore another concept',{exact:true}).selectOption('files');
 await page.getByRole('button',{name:'Explore Data files connections →',exact:true}).click();
 assert.equal(await page.locator('#entity-svg .se-domain-frame').count(),1,'Data files must not expand all related domains');
 assert.equal(await page.locator('#entity-svg .entity-node').count(),17,'The approved file stages and support schemas remain intact');
 assert.equal(await page.locator('#entity-svg .se-edge').count(),17,'Inherited file references stay combined at their shared definitions');
 assert.ok(await page.locator('#entity-svg > g').evaluate(group=>group.transform.baseVal.consolidate().matrix.a)>=0.85,'File exploration retains a readable scale');
 assert.equal(await page.locator('#entity-svg [data-entity="Donor"]').count(),0,'External donor references are not added automatically');
 assert.ok(await page.getByLabel('Overview connections to other groups',{exact:true}).isVisible(),'Multi-schema concepts keep external overview relationships explicitly visible without expanding them');
 assert.equal(await page.locator('#entity-svg .se-concept-center').count(),0,'Multi-schema concepts do not highlight every file card');
 await page.locator('.se-canvas-wrap').screenshot({path:path.join(output,'files-concept-restored.png')});
 await page.locator('[data-entity="UnalignedReads"]').focus();await page.keyboard.press('Enter');
 await page.locator('#entity-svg .se-cross-group-cue [role="button"]').click();
 assert.ok(await page.locator('.se-cross-group-popover').isVisible(),'External connections remain available beside the selected file');
 assert.equal(await page.locator('.se-cross-group-list [data-domain="administrative"]').count(),0);
 await page.getByRole('button',{name:'Close external connections',exact:true}).click();
 await page.getByRole('button',{name:'← Back to Data files overview',exact:true}).click();
 assert.equal(await page.getByLabel('Explore another concept',{exact:true}).inputValue(),'files');
 await page.getByLabel('Explore another concept',{exact:true}).selectOption('donor');
 assert.deepEqual(await page.locator('.se-concept-schema').evaluateAll(cards=>cards.map(card=>card.dataset.schema)),['AbstractDonor','Donor','ProtectedDonor']);
 assert.equal(await page.locator('.se-concept-schema').first().getAttribute('data-abstract'),'true');
 assert.equal(await page.locator('.se-concept-schema-abstract .se-concept-abstract-badge').textContent(),'Abstract');
 assert.equal(await page.locator('.se-concept-schema-abstract').evaluate(card=>getComputedStyle(card).borderTopStyle),'dashed');
 await page.locator('.se-concept-schemas').screenshot({path:path.join(output,'abstract-donor-schemas.png')});

 await page.getByLabel('Explore another concept',{exact:true}).selectOption('files');
 assert.ok(await page.locator('.se-relationship-card').count()>=4);
 assert.equal(await page.locator('.se-concept-schema').count(),10);
 const fileSetCard=page.locator('.se-relationship-card').filter({hasText:'Which experiment is this file associated with?'});
 assert.match(await fileSetCard.textContent(),/file_sets\[\]/);
 await fileSetCard.locator('summary').click();
 assert.equal(await fileSetCard.locator('li').count(),7);
 await page.locator('.se-research-detail').screenshot({path:path.join(output,'data-files-workspace.png')});
 await page.getByLabel('Explore another concept',{exact:true}).selectOption('sample');
 await page.getByRole('button',{name:/Show overview/}).click();
 assert.equal(await page.locator('#research-map-context').isVisible(),true);

 const coreEdge=page.locator('#research-svg [data-reference="sample-material"] .se-research-edge');
 await coreEdge.focus();await page.keyboard.press('Enter');
 assert.match(await page.getByRole('dialog').textContent(),/sample_sources/);
 await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
 await page.locator('.modal-backdrop').waitFor({state:'detached'});
 await page.getByRole('button',{name:'← Back to overview',exact:true}).click();
 const researchDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export PNG',exact:true}).click();
 await (await researchDownload).saveAs(path.join(output,'research-overview-export.png'));
 await page.getByRole('button',{name:'Enter full screen',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Exit full screen',exact:true}).getAttribute('aria-pressed'),'true');
 await page.keyboard.press('Escape');
 assert.equal(await page.getByRole('button',{name:'Enter full screen',exact:true}).getAttribute('aria-pressed'),'false');
 await page.getByRole('button',{name:/^All \d+ schemas$/}).click();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.getByLabel('Diagram layout',{exact:true}).inputValue(),'hierarchical');
 assert.equal(await page.locator('.se-domain-frame').count(),6);
 assert.equal(await page.locator('.se-overview').count(),1);
 assert.equal(await page.locator('#entity-svg .se-edge').count(),0,'Overview is a readable directory');
 assert.ok(await page.locator('#entity-svg .entity-node text').first().evaluate(n=>Number.parseFloat(getComputedStyle(n).fontSize)*document.querySelector('#entity-svg > g').transform.baseVal.consolidate().matrix.a)>=10.5,'Overview type names remain readable');
 await page.locator('#entity-svg').screenshot({path:path.join(output,'overview-canvas.png')});
 await shell.screenshot({path:path.join(output,'hierarchical-map.png')});
 await selectSetting('Schema group','donors');
 assert.equal(await page.locator('.se-domain-frame').count(),1);
 assert.equal(await page.locator('[data-entity="File"]').count(),0);
 assert.equal(await page.locator('[data-entity="Donor"]').count(),1);
 await shell.screenshot({path:path.join(output,'hierarchical-donors.png')});
 const nodePositions=()=>page.locator('#entity-svg .entity-node').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.dataset.entity,n.getAttribute('transform')])));
 const donorPositions=await nodePositions();
 assert.deepEqual(await page.locator('#entity-svg .se-stage-label').allTextContents(),['Base types','1. Donors','2. Clinical context','3. Clinical details','4. Collection']);
 assert.ok(await page.locator('#entity-svg .entity-node text').first().evaluate(n=>Number.parseFloat(getComputedStyle(n).fontSize)*document.querySelector('#entity-svg > g').transform.baseVal.consolidate().matrix.a)>=10.5,'Selected group type names remain readable');
 await page.locator('#entity-svg').screenshot({path:path.join(output,'donor-canvas.png')});
 assert.equal(await page.locator('#entity-svg .se-stage-label').count(),5);
 assert.equal(await page.locator('#entity-svg').evaluate(svg=>{
  const section=getComputedStyle(svg.querySelector('.se-stage-label'));
  const title=getComputedStyle(svg.querySelector('.se-node-title'));
  const description=getComputedStyle(svg.querySelector('.se-subtitle'));
  return parseFloat(section.fontSize)>parseFloat(title.fontSize) && parseFloat(title.fontSize)>parseFloat(description.fontSize) && Number(section.fontWeight)>=Number(title.fontWeight) && Number(title.fontWeight)>Number(description.fontWeight);
 }),true,'Section headings, item names and descriptions have a clear typographic hierarchy');

 assert.equal(await page.locator('#entity-svg').evaluate(svg=>{
  const panels=[...svg.querySelectorAll('.se-stage-panel')].map(n=>n.getBBox());
  for(let i=0;i<panels.length;i++)for(let j=i+1;j<panels.length;j++){const a=panels[i],b=panels[j];if(!(a.x+a.width+19<=b.x || b.x+b.width+19<=a.x || a.y+a.height+19<=b.y || b.y+b.height+19<=a.y))return false;}
  return [...svg.querySelectorAll('.entity-node')].every(n=>{const r=n.querySelector('rect').getBBox(),m=n.transform.baseVal.consolidate().matrix;return panels.some(p=>r.x+m.e>=p.x+17 && r.x+m.e+r.width<=p.x+p.width-17 && r.y+m.f>=p.y+39 && r.y+m.f+r.height<=p.y+p.height-15);});
 }),true,'Stage backgrounds are separate and leave space around every node');

 assert.equal(await page.locator('#entity-svg').evaluate(svg=>{
  const obstacles=[...svg.querySelectorAll('.entity-node')].map(n=>{const b=n.getBBox(),m=n.transform.baseVal.consolidate().matrix;return {x:b.x+m.e,y:b.y+m.f,width:b.width,height:b.height};});
  obstacles.push(...[...svg.querySelectorAll('.se-stage-label,.se-domain-frame text')].map(n=>n.getBBox()));
  return [...svg.querySelectorAll('.se-edge')].every(edge=>{
   const length=edge.getTotalLength();
   for(let distance=1;distance<length;distance+=3){const p=edge.getPointAtLength(distance);if(obstacles.some(b=>p.x>b.x+1 && p.x<b.x+b.width-1 && p.y>b.y+1 && p.y<b.y+b.height-1))return false;}
   return true;
  });
 }),true,'Rendered arrows avoid actual node and heading bounds');

 await shell.setViewportSize({width:900,height:900});
 await page.waitForFunction(()=>{const svg=document.querySelector('#entity-svg'),box=svg.getBoundingClientRect();return box.width<800 && svg.querySelector('[data-world]').transform.baseVal.consolidate().matrix.a>=0.85 && [...svg.querySelectorAll('.entity-node')].every(n=>{const r=n.getBoundingClientRect();return r.left>=box.left && r.right<=box.right;});});
 await page.locator('#entity-svg').screenshot({path:path.join(output,'donor-narrow-canvas.png')});
 await shell.setViewportSize({width:1500,height:1000});
 await page.waitForFunction(before=>document.querySelector('[data-entity="Donor"]').getAttribute('transform')===before,donorPositions.Donor);
 assert.equal(await page.locator('#entity-svg .se-edge.calculated, #entity-svg .se-edge.reverse').count(),0);
 await page.locator('.se-link-filters summary').click();
 await page.locator('.se-link-filters').getByLabel('Calculated',{exact:true}).check();
 await page.locator('.se-link-filters').getByLabel('Reverse',{exact:true}).check();
 assert.ok(await page.locator('#entity-svg .se-edge.calculated, #entity-svg .se-edge.reverse').count()>0);
 assert.deepEqual(await nodePositions(),donorPositions,'Relationship filters preserve stages and horizontal placement');
 await page.locator('.se-link-filters').getByLabel('Calculated',{exact:true}).uncheck();
 await page.locator('.se-link-filters').getByLabel('Reverse',{exact:true}).uncheck();
 await page.locator('.se-link-filters summary').click();
 await clickDiagramEdge();
 assert.equal(await page.getByRole('dialog').count(),1,'Edges open the field inspector');
 await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
 await page.locator('.modal-backdrop').waitFor({state:'detached'});
 const donorNode=page.locator('[data-entity="Donor"]');
 await donorNode.focus();await page.keyboard.press('Enter');
 assert.deepEqual(await nodePositions(),donorPositions,'Selection preserves placement');
 const pathsBeforeDrag=await page.locator('#entity-svg .se-edge').evaluateAll(edges=>edges.map(e=>e.getAttribute('d')));
 await donorNode.evaluate(node=>node.scrollIntoView({block:'center',inline:'center'}));
 const donorBox=await donorNode.boundingBox();
 assert.equal(await page.evaluate(box=>document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)?.closest('[data-entity]')?.dataset.entity,donorBox),'Donor','Pointer must reach the node');
 await page.mouse.move(donorBox.x+donorBox.width/2,donorBox.y+donorBox.height/2);
 await page.mouse.down();await page.mouse.move(donorBox.x+donorBox.width/2+12,donorBox.y+donorBox.height/2+10,{steps:3});await page.mouse.up();
 await page.waitForFunction(before=>document.querySelector('[data-entity="Donor"]').getAttribute('transform')!==before,donorPositions.Donor,{timeout:3000});
 assert.notEqual((await nodePositions()).Donor,donorPositions.Donor,'Node dragging moves the node');
 assert.notDeepEqual(await page.locator('#entity-svg .se-edge').evaluateAll(edges=>edges.map(e=>e.getAttribute('d'))),pathsBeforeDrag,'Dragging recalculates connected routes');
 await page.getByRole('button',{name:'Reset layout',exact:true}).click();
 assert.deepEqual(await nodePositions(),donorPositions);
 const donorDownload=page.waitForEvent('download');await page.locator('#entity-export').click();
 await (await donorDownload).saveAs(path.join(output,'hierarchical-donors-export.png'));
 // A selected node must not restore the previous group's camera when navigating.
 for(const group of ['sequencing','files','workflows']){
  await selectSetting('Schema group',group);
  assert.ok(await page.locator('#entity-svg > g').evaluate(group => group.transform.baseVal.consolidate().matrix.a)>=0.85,'Group framing retains its original readable minimum');
  await page.locator('#entity-svg').screenshot({path:path.join(output,`${group}-canvas.png`)});
  if(group==='files'){
   assert.equal(await page.locator('.se-diagram:has(#entity-svg) > .se-toolbar > h2').count(),0,'The group title is not repeated above the diagram');
   assert.equal(await page.locator('#entity-svg .se-domain-frame text').count(),1,'The diagram retains one group title');
   const before=await nodePositions();
   assert.equal(await page.getByLabel('Connection detail',{exact:true}).inputValue(),'shared');
   assert.equal(await page.locator('#entity-svg .se-edge').count(),17,'Inherited references are summarized at their defining base');
   await page.locator('#entity-svg .se-edge[aria-label="VariantCalls to ReferenceGenome"]').focus();
   await page.keyboard.press('Enter');
   assert.match(await page.locator('.se-connection-card').innerText(), /does not establish coordinate compatibility/);
   assert.equal(await page.locator('#detail-content pre').isVisible(), false);
   assert.equal(await page.locator('.se-connection-lead, .se-connection-use, .se-connection-context, .se-connection-note').count(),0,'Relationship dialogs omit tutorial framing and repeated schema explanations');
   assert.equal(await page.locator('.se-connection-meta code').textContent(),'reference_genome');
   await page.getByRole('dialog').screenshot({path:path.join(output,'research-relationship-details.png'),animations:'disabled'});
   await page.locator('.se-connection-technical summary').click();
   assert.match(await page.locator('#detail-content pre').textContent(), /reference_genome/);
   assert.ok(await page.locator('#detail-content .se-sources button').count());
   await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
   await page.locator('.modal-backdrop').waitFor({state:'detached'});
   await page.locator('#entity-svg .se-edge[aria-label="DonorSpecificAssembly to File"]').focus();
   await page.keyboard.press('Enter');
   assert.equal(await page.locator('.se-connection-card h4').textContent(),'Assembly input provenance');
   assert.match(await page.locator('.se-connection-card').innerText(),/direct input provenance/);
   assert.equal(await page.locator('.se-connection-meta code').textContent(),'derived_from[]');
   await page.getByRole('dialog').screenshot({path:path.join(output,'assembly-provenance-details.png'),animations:'disabled'});
   await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
   await page.locator('.modal-backdrop').waitFor({state:'detached'});

   assert.equal(await page.locator('[data-entity="AlignedReads"] .se-subtitle').textContent(),'Reads aligned to a genome');
   assert.equal(await page.locator('[data-entity="UnalignedReads"] .se-subtitle').textContent(),'Unaligned sequencing reads');
   assert.equal((await page.locator('#entity-svg .se-subtitle').allTextContents()).some(text=>text.includes('inherited')),false,'Node captions describe their role without repeating inheritance metadata');
   assert.equal(await page.locator('[data-entity="File"] .se-node-abstract-label').textContent(),'Abstract');
   assert.equal(await page.locator('#entity-svg .entity-node').evaluateAll(nodes=>nodes.every(n=>{const box=n.querySelector('.se-node-body').getBBox(),title=n.querySelector('.se-node-title').getBBox(),badge=n.querySelector('.se-node-abstract-badge')?.getBBox();return title.x+title.width<=box.width-10 && (!badge || title.x+title.width+6<=badge.x);})),true,'Emphasized names fit their cards and do not overlap Abstract badges');

   assert.equal(await page.locator('[data-entity="File"] .se-node-body').evaluate(rect=>getComputedStyle(rect).strokeDasharray)!=='none',true);
   assert.equal(await page.locator('#entity-svg .se-node-accent').count(),0,'Node cards have no decorative side stripe');
   assert.equal(await page.locator('#entity-svg .entity-node').evaluateAll(nodes=>nodes.every(n=>{const b=n.querySelector('.se-node-body').getBBox(),t=n.querySelector('.se-subtitle')?.getBBox();return !t || t.x>=b.x+10 && t.x+t.width<=b.x+b.width-10;})),true,'Role captions fit inside their cards');

   await page.getByLabel('Connection detail',{exact:true}).selectOption('all');
   assert.equal(await page.locator('#entity-svg .se-edge').count(),64,'All references remain available explicitly');
   await page.locator('#entity-svg').screenshot({path:path.join(output,'files-all-references.png')});
   await page.getByLabel('Connection detail',{exact:true}).selectOption('shared');
   assert.deepEqual(await nodePositions(),before,'Connection detail does not move nodes');
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const cameraBeforeFocus=await page.locator('#entity-svg > g').getAttribute('transform');
   await page.locator('[data-entity="UnalignedReads"]').focus();await page.keyboard.press('Enter');
   const enabled=new Set(Object.keys(before));
   const exact=new Set(snapshot.model.edges.filter(e=>e.kind==='linkTo' && enabled.has(e.from) && enabled.has(e.to) && (e.from==='UnalignedReads' || e.to==='UnalignedReads')).map(e=>JSON.stringify([e.from,e.to,e.kind,!!e.reverse])));
   assert.equal(await page.locator('#entity-svg .se-edge').count(),exact.size,'Selection restores exact inherited and self-links for that type');
   assert.match(await page.locator('.se-inheritance-detail').textContent(),/inherited from File, SubmittedFile|inherited from SubmittedFile, File/);

   assert.equal(await page.locator('#entity-svg > g').getAttribute('transform'),cameraBeforeFocus,'Selection preserves the camera');
   assert.deepEqual(await nodePositions(),before);
   await page.locator('#entity-svg').screenshot({path:path.join(output,'files-selected-references.png')});
   await page.getByRole('button',{name:'Clear selection',exact:true}).click();
   assert.equal(await page.locator('#entity-svg .se-edge').count(),17);
   await page.locator('[data-entity="File"]').focus();await page.keyboard.press('Enter');
   const outsideRegion=page.getByRole('region',{name:'File: connections outside this group',exact:true});
   assert.equal(await outsideRegion.count(),0,'Selection does not create a detached panel above the diagram');
   const outsideExpected=snapshot.model.edges.filter(e=>e.kind==='linkTo' && (e.from==='File' || e.to==='File') && (!enabled.has(e.from) || !enabled.has(e.to)));
   const standardAdministrative=new Set(['User','Consortium','SubmissionCenter']);
   const peerCount=new Set(outsideExpected.map(e=>e.from==='File'?e.to:e.from).filter(name=>!standardAdministrative.has(name))).size;
   assert.ok(peerCount>0);
   const beforeOutside=await nodePositions(),cameraOutside=await page.locator('#entity-svg > g').getAttribute('transform');
   const outsideCue=page.locator('#entity-svg .se-cross-group-cue [role="button"]');
   assert.equal(await outsideCue.getAttribute('aria-controls'),'cross-group-connections');
   assert.match(await outsideCue.locator('text').textContent(),/^External connections · \d+ groups$/);
   assert.match(await outsideCue.locator('title').textContent(),/Workflows & Analysis Runs/);
   await outsideCue.click();
   assert.equal(await outsideCue.getAttribute('aria-expanded'),'true');
   assert.ok(await outsideRegion.isVisible());
   assert.equal(await outsideRegion.locator('summary span').evaluateAll(spans=>spans.reduce((sum,span)=>sum+Number.parseInt(span.textContent),0)),peerCount,'Counts omit a group containing only standard administrative schemas');
   assert.ok(await outsideRegion.getByRole('button',{name:'Close external connections',exact:true}).evaluate(button=>document.activeElement===button),'The local connection panel receives focus');
   assert.equal(await page.locator('.se-cross-group-popover').evaluate(panel=>{
    const canvas=panel.parentElement.getBoundingClientRect(),rect=panel.getBoundingClientRect();
    return rect.left>=canvas.left && rect.right<=canvas.right+1 && rect.top>=canvas.top && rect.bottom<=canvas.bottom+1;
   }),true,'Connection details remain inside the diagram');
   await page.keyboard.press('Escape');
   assert.equal(await outsideRegion.count(),0);
   assert.ok(await outsideCue.evaluate(cue=>document.activeElement===cue),'Closing local details returns focus to the node cue');
   await page.keyboard.press('Enter');
   await outsideRegion.locator('details[data-domain="workflows"] summary').click();
   await page.locator('.se-canvas-wrap').screenshot({path:path.join(output,'cross-group-local-popover.png')});
   assert.match(await outsideRegion.locator('details[data-domain="workflows"]').innerText(),/Incoming/);
   assert.ok((await outsideRegion.locator('.se-cross-group-fields > span').evaluateAll(labels=>labels.map(label=>label.title))).some(title=>title.includes('input_files[].value')),'Exact paths remain available on the compact labels');
   assert.equal(await outsideRegion.locator('.se-cross-group-fields code').count(),0,'Long code paths do not dominate the popover');
   assert.equal(await outsideRegion.locator('details[data-domain="administrative"]').count(),0,'Routine administrative metadata does not occupy the popover');
   await outsideRegion.locator('details[data-domain="sequencing"] summary').click();
   assert.equal(await outsideRegion.locator('details[open]').count(),1,'Opening a group closes the previous group');
   await outsideRegion.locator('.se-cross-group-list').evaluate(list=>{list.scrollTop=list.scrollHeight;});
   assert.equal(await page.locator('.se-cross-group-popover').evaluate(panel=>{
    const rect=panel.getBoundingClientRect();
    return [...panel.querySelectorAll('[data-close-connections], .se-cross-group-show-all')].every(button=>{
     const box=button.getBoundingClientRect();return box.top>=rect.top && box.bottom<=rect.bottom;
    });
   }),true,'Close and show-all controls remain visible when the relationship list scrolls');
   await page.locator('.se-canvas-wrap').screenshot({path:path.join(output,'cross-group-compact-connections.png')});
   await outsideRegion.locator('details[data-domain="workflows"] summary').click();
   assert.deepEqual(await nodePositions(),beforeOutside,'Opening cross-group details preserves node placement');
   assert.equal(await page.locator('#entity-svg > g').getAttribute('transform'),cameraOutside,'Opening cross-group details preserves zoom');
   await outsideRegion.locator('details[data-domain="workflows"]').getByRole('button',{name:'Inspect relationship',exact:true}).first().click();
   assert.ok(await page.locator('.se-connection-card').first().isVisible());
   await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
   await page.locator('.modal-backdrop').waitFor({state:'detached'});
   await page.locator('.se-link-filters summary').click();
   await page.locator('.se-link-filters').getByLabel('Calculated',{exact:true}).check();
   const withCalculated=snapshot.model.edges.filter(e=>['linkTo','calculated'].includes(e.kind) && (e.from==='File' || e.to==='File') && (!enabled.has(e.from) || !enabled.has(e.to)));
   assert.equal(await outsideRegion.locator('summary span').evaluateAll(spans=>spans.reduce((sum,span)=>sum+Number.parseInt(span.textContent),0)),new Set(withCalculated.map(e=>e.from==='File'?e.to:e.from).filter(name=>!standardAdministrative.has(name))).size,'Cross-group counts follow relationship filters');
   await page.locator('.se-link-filters').getByLabel('Calculated',{exact:true}).uncheck();
   await page.locator('.se-link-filters summary').click();
   await outsideRegion.screenshot({path:path.join(output,'cross-group-connections.png')});
   await outsideRegion.getByRole('button',{name:'Show all connected schemas',exact:true}).click();
   assert.equal(await page.locator('#entity-show-neighborhood').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('#entity-svg .se-cross-group-cue').count(),0,'The cue disappears when external schemas are present in the neighborhood');
   const peers=await page.locator('#entity-svg .entity-node').evaluateAll(nodes=>nodes.map(n=>n.dataset.entity));
   assert.ok(outsideExpected.every(e=>peers.includes(e.from) && peers.includes(e.to)),'Neighborhood reveals every cross-group endpoint, including hidden types');
   await page.locator('#entity-show-neighborhood').click();
   assert.equal(await outsideRegion.count(),0);
   await outsideCue.click();
   assert.ok(await outsideRegion.isVisible());
   await outsideRegion.locator('details[data-domain="workflows"] summary').click();
   await outsideRegion.getByRole('button',{name:'WorkflowRun →',exact:true}).click();
   assert.equal(await page.getByLabel('Schema group',{exact:true}).inputValue(),'workflows','External schema navigation opens its group');
   assert.ok(await page.locator('[data-entity="WorkflowRun"].selected').count());
  }

 }
 await page.getByRole('button',{name:'← Metadata map',exact:true}).click();
 assert.equal(await page.locator('.se-research-overview').count(),1);
 await page.getByLabel('Search schemas',{exact:true}).fill('Donor');
 await page.getByRole('button',{name:'Donor',exact:true}).click();
 assert.equal(await page.getByLabel('Schema group',{exact:true}).inputValue(),'donors');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const beforeClearing=await page.locator('#entity-svg > g').getAttribute('transform');
 await page.getByRole('button',{name:'Clear selection',exact:true}).click();
 assert.equal(await page.locator('#entity-svg > g').getAttribute('transform'),beforeClearing,'Clear selection preserves the current group camera');


 await page.getByLabel('Search schemas',{exact:true}).fill('TissueSample');
 await page.getByRole('button',{name:'TissueSample',exact:true}).click();
 assert.equal(await page.getByLabel('Schema group',{exact:true}).inputValue(),'samples');
 await selectSetting('Schema group','');
 await page.getByRole('button',{name:/^All \d+ schemas$/}).click();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await selectSetting('Diagram layout','network');
 assert.equal(await page.locator('.se-domain-frame').count(),0);
 await selectSetting('Diagram layout','hierarchical');
 assert.equal(await page.locator('.se-overview').count(),1);
 await page.getByRole('button',{name:'File',exact:true}).click();
 assert.equal(await page.getByLabel('Schema group',{exact:true}).inputValue(),'files');
 await page.getByRole('button',{name:'Clear selection',exact:true}).click();
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();
 const zoomedCamera=await page.locator('#entity-svg > g').getAttribute('transform');
 await page.locator('[data-entity="File"]').focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('#entity-svg > g').getAttribute('transform'),zoomedCamera,'Node selection must preserve zoom and pan');
 await page.locator('#entity-show-neighborhood').click();
 assert.equal(await page.locator('#entity-show-neighborhood').getAttribute('aria-pressed'),'true');
 assert.ok(await page.locator('#entity-svg .entity-node').count()>1);
 await page.locator('#entity-show-neighborhood').click();
 assert.equal(await page.locator('#entity-show-neighborhood').getAttribute('aria-pressed'),'false');
 await page.locator('#open-entity').click(); // Switch from the default schema map to item view.
 assert.equal(await page.locator('#environments').isDisabled(),true);
 assert.equal(await page.locator('#environments option').count(),1);
 await page.selectOption('#types','ProtectedDonor');
 await page.locator('#open-entity').click();await page.waitForSelector('#entity-svg .entity-node');
 await page.locator('#entity-fullscreen').click();
 assert.equal(await page.locator('#entity-fullscreen').getAttribute('aria-pressed'),'true');
 await clickDiagramEdge();
 await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
 await page.locator('.modal-backdrop').waitFor({state:'detached'});
 assert.equal(await page.locator('#entity-fullscreen').getAttribute('aria-pressed'),'true','Closing details preserves full screen');
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#entity-fullscreen').getAttribute('aria-pressed'),'false');
 const dl=shell.waitForEvent('download');await page.locator('#entity-export').click();const download=await dl;
 await download.saveAs(path.join(output,'schema-map.png'));
 assert.deepEqual([...fs.readFileSync(path.join(output,'schema-map.png')).subarray(0,8)],[137,80,78,71,13,10,26,10]);
 await page.locator('#open-entity').click();
 await page.locator('#heading button').filter({hasText:'Python'}).click();
 await page.waitForFunction(()=>document.querySelector('#detail-content pre')?.textContent.includes('class ProtectedDonor'));
 await page.getByRole('dialog').getByRole('button', {name:'Close',exact:true}).click();
 await page.locator('#item-id').fill('https://evil.test/demo/');await page.locator('#load-item').click();
 await page.waitForFunction(()=>document.getElementById('item-error').textContent.includes('this portal only'));
 await page.locator('#item-id').fill('/redirect/');await page.locator('#load-item').click();
 await page.waitForFunction(()=>document.getElementById('item-status').textContent==='Item load failed.');
 assert.ok(calls.every(url=>url.startsWith('https://portal.test/')));
 await page.locator('#item-id').fill('/demo/');await page.locator('#load-item').click();
 await page.waitForFunction(()=>document.getElementById('item-heading').textContent.includes('Demo donor'));
 assert.match(await page.locator('#item-notes').textContent(),/raw unavailable.*403/);
 assert.doesNotMatch(await page.locator('.se-value-tree').textContent(),/principals_allowed|hidden-principal|hidden-group|hidden-role/);
 assert.match(await page.locator('.se-value-tree').textContent(),/donor_groups/);
 await page.locator('#open-path-finder').click();
 await page.selectOption('#path-source','TissueSample');await page.selectOption('#path-target','Donor');await page.selectOption('#path-field','study');
 await page.locator('#path-form button[type=submit]').click();
 await page.waitForFunction(()=>document.getElementById('path-results').textContent.includes('sample_sources.donor.study'));
 assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 assert.deepEqual(errors,[]);
 await shell.screenshot({path:path.join(output,'planner.png')});
 await page.getByRole('dialog').getByRole('button', {name:'Close',exact:true}).click();
 const before=calls.filter(url=>new URL(url).pathname==='/schema-explorer/model').length;
 await page.evaluate(()=>window.unmountExplorer());
 assert.equal(await page.locator('#types').count(),0);
 await page.evaluate(()=>window.mountExplorer());
 await page.waitForFunction(()=>document.getElementById('types')?.options.length>30);
 assert.equal(calls.filter(url=>new URL(url).pathname==='/schema-explorer/model').length,before+1);
 await page.locator('#open-entity').click();
 assert.equal(await page.locator('#item-heading').textContent(),'');
 assert.deepEqual(errors,[]);
 isAdmin=false;
 await page.evaluate(()=>{window.unmountExplorer();window.mountExplorer();});
 await page.waitForFunction(()=>document.getElementById('types')?.options.length>30);
 assert.equal(await page.locator('#types').isVisible(),false);
 await page.locator('#open-entity').click();
 assert.equal(await page.locator('#types').isVisible(),true);
 assert.equal(await page.locator('.se-live').count(),0);
 await page.locator('#types').selectOption('File');
 assert.equal(await page.locator('#heading h2').textContent(),'File');
 await page.locator('#open-entity').click();
 assert.equal(await page.locator('#types').isVisible(),false);
 // Now use the real portal bootstrap (browser.js), not the isolated component harness.
 const userInfo={details:{email:'admin@example.org',first_name:'Schema',last_name:'Admin',groups:['admin'],uuid:'test-admin'},user_actions:[]};
 isAdmin=true;
 const context=JSON.stringify(pageContext);
 const wire='HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nX-Request-URL: https://portal.test/schema-explorer\r\nX-Request-JWT: fixture-session\r\nX-User-Info: '+JSON.stringify(userInfo)+'\r\nContent-Length: '+Buffer.byteLength(context)+'\r\n\r\n'+context;
 const full=spawnSync(process.execPath,['src/encoded/static/build/renderer.js'],{input:wire,encoding:'utf8',maxBuffer:8*1024*1024});
 assert.equal(full.status,0,full.stderr);
 fullMarkup=full.stdout.slice(full.stdout.indexOf('<!DOCTYPE html>'));
 for(let reload=0;reload<3;reload++){
  if(reload===0)await page.goto('https://portal.test/schema-explorer');else await page.reload();
  await page.waitForFunction(()=>document.getElementById('types')?.options.length>30,null,{timeout:20000}).catch(async error=>{console.log('Portal bootstrap errors:',errors,'Recent requests:',calls.slice(-15));await page.screenshot({path:path.join(output,'bootstrap-failure.png')});throw error;});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('user_info'))?.details?.email),'admin@example.org');
  assert.equal(await page.locator('#types').inputValue(),'');
  await page.waitForSelector('#research-svg [data-concept]');
  assert.equal(await page.locator('#research-svg .se-research-edge').count(),10,'The real portal bootstrap opens the relationship map');
 }
 assert.deepEqual(errors,[]);
 console.log('Portal bootstrap also passed: authenticated SSR user_info survives three page loads.');
 console.log('Browser passed: React components, lazy webpack chunk, mount/unmount, portal menu, single heading, no iframe, fullscreen, real model, source viewer, PNG download, planner, same-origin item fetch, missing raw permission, no persistent storage.');
 }finally{await browser.close();}
})();
