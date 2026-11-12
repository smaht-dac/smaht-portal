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
 // The explorer's one schema search: type, then pick a suggestion.
 const finder=()=>page.locator('#schema-finder');
 const finderNames=async(text)=>{await finder().fill(text);const names=await page.locator('#schema-finder-results [role="option"] strong').allTextContents();await finder().fill('');return names;};
 const openSchema=async(name)=>{await finder().fill(name);await page.locator('#schema-finder-results [role="option"]').filter({has:page.locator('strong',{hasText:new RegExp('^'+name+'$')})}).click();await page.locator('#heading h2',{hasText:new RegExp('^'+name+'$')}).waitFor();};
 // A schema's address is its group map with the schema selected and its details underneath.
 const selectOnGroupMap=openSchema;
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
 const excludedSchemas=new Set(['User','SubmissionCenter','Consortium','Consortia','AccessKey']);
 const rawModel=snapshot.model;
 snapshot.model={...rawModel,models:rawModel.models.filter(m=>!excludedSchemas.has(m.name)),edges:rawModel.edges.filter(e=>!excludedSchemas.has(e.from)&&!excludedSchemas.has(e.to))};
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
  if(url.pathname==='/schema-explorer/model')return route.fulfill({json:{...rawModel,can_view_items:isAdmin}});
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
 await page.waitForFunction(()=>!!document.getElementById('schema-finder'));
 assert.equal(await shell.locator('iframe').count(),0,'Explorer must not use an iframe');
 assert.ok(await shell.locator('.navbar').isVisible(),'Portal navigation must remain visible');
 assert.equal(await shell.getByText('Loading Schema Explorer…',{exact:true}).count(),0);
 assert.equal(await shell.getByRole('heading',{name:'Schema Explorer',exact:true}).count(),1);
 assert.equal(await finder().inputValue(),'');
 assert.equal(await page.locator('[data-schema-explorer]').evaluate(el=>el.shadowRoot),null);
 assert.equal(await page.getByRole('heading',{name:'From donor to data',exact:true}).count(),1);
 assert.equal(await page.locator('#research-svg [data-concept]').count(),11);
 assert.equal(await page.locator('#research-svg .se-research-edge').count(),10);
 assert.equal(await page.locator('#research-svg .se-research-label').count(),10);
 assert.equal(await page.locator('#research-svg .se-research-label[data-reference="library-analyte"] text').textContent(),'is made into');
 assert.match(await page.locator('#research-svg [data-reference="material-donor"] path').getAttribute('aria-label'),/Donor → Source material/);
 assert.match(await page.locator('#research-svg [data-reference="files-fileSet"] path').getAttribute('aria-label'),/Experiment \/ FileSet → Data files/);
 assert.equal(await page.locator('#research-svg').evaluate(svg=>{
  const pairs=[['material-donor','material'],['sample-material','sample'],['analyte-sample','analyte'],['library-analyte','library'],['fileSet-library','fileSet'],['files-fileSet','files']];
  return pairs.every(([key,target])=>{
   // The arrowhead is an end marker whose tip (refX) sits on the path's final point.
   const path=svg.querySelector(`[data-reference="${key}"] path`),point=path.getPointAtLength(path.getTotalLength());
   const node=svg.querySelector(`[data-concept="${target}"]`),matrix=node.transform.baseVal.consolidate().matrix,rect=node.querySelector('rect');
   const x=point.x-matrix.e,y=point.y-matrix.f,w=Number(rect.getAttribute('width')),h=Number(rect.getAttribute('height'));
   return x>=-0.1&&x<=w+0.1&&y>=-0.1&&y<=h+0.1&&(Math.abs(x)<0.1||Math.abs(x-w)<0.1||Math.abs(y)<0.1||Math.abs(y-h)<0.1);
  });
 }),true,'Entry-map arrowheads point to the next biological stage');
 assert.equal(await page.locator('#research-svg [data-concept] rect[width="4"]').count(),0,'Concept cards have no decorative side stripe');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.locator('#research-svg').evaluate(svg=>{const b=svg.getBoundingClientRect();return [...svg.querySelectorAll('[data-concept]')].every(n=>{const r=n.getBoundingClientRect();return r.left>=b.left && r.right<=b.right && r.top>=b.top && r.bottom<=b.bottom;});}),true,'The first view fits all concepts at readable size');

 assert.equal(await page.locator('#entity-svg').count(),0,'Opening view explains relationships rather than listing all types');
 for(const name of excludedSchemas)assert.ok(!(await finderNames(name)).includes(name),`${name} is excluded from the schema search`);
 // The search suggests by name first and works from the keyboard.
 assert.equal((await finderNames('tissue'))[0],'Tissue','Names that start with the text come first');
 await finder().fill('tissuesam');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');
 assert.equal(new URL(page.url()).hash,'#schemas/TissueSample','Enter opens the highlighted schema');
 assert.equal(await finder().inputValue(),'','Choosing a schema clears the search');
 await page.goBack();
 const sourceConcept=page.locator('[data-concept]').filter({has:page.locator('[aria-label^="Explore Source material connections:"]')});
 const cardPaint=()=>sourceConcept.locator('.se-research-card').evaluate(node=>({fill:getComputedStyle(node).fill,stroke:getComputedStyle(node).stroke}));
 await page.locator('h2').first().hover();
 const normalPaint=await cardPaint();
 await sourceConcept.locator('.se-research-diagram-action').hover();
 assert.notDeepEqual(await cardPaint(),normalPaint,'Hovering the diagram action highlights its card');
 await page.locator('h2').first().hover();
 // The reading guide sits behind the info icon beside the map title, like the portal's chart titles.
 assert.equal(await page.locator('.se-research-legend').count(),0,'No separate guide grid above the map');
 await page.getByRole('button',{name:'How to read the map',exact:true}).hover();
 const guide=page.locator('.se-map-guide-popover');
 await guide.waitFor();
 for(const text of ['Follow the numbered workflow forward','Read each arrow as a sentence','arrows point to the referenced schema','opens its schema diagram','Drag to pan'])assert.ok((await guide.textContent()).includes(text),`The guide keeps: ${text}`);
 await guide.screenshot({path:path.join(output,'map-reading-guide.png')});
 await page.locator('h2').first().hover();
 await guide.waitFor({state:'detached'});
 await page.locator('#research-svg').screenshot({path:path.join(output,'research-overview.png')});
 assert.equal(await page.getByRole('button',{name:/^(Whole model|Trace a file to its donor)$/}).count(),0,'The overview has one mode');
 // Concept navigation: a map card opens its diagram, Summary/Map tabs switch views, the stepper moves between concepts.
 // The side menu is the explorer's one navigation, and every place is in the page URL.
 const sideNav=page.getByRole('navigation',{name:'Schema Explorer',exact:true});
 const navTo=name=>sideNav.getByRole('link',{name,exact:true}).click();
 const search=()=>new URL(page.url()).hash;
 const diagramBack=()=>sideNav.getByRole('link',{name:'Overview',exact:true});
 const stepper=page.getByRole('navigation',{name:'Place in the donor-to-data workflow',exact:true});
 const goToConcept=label=>stepper.getByRole('button',{name:new RegExp(`${label.replace(/[/]/g,'\\/')}$`)}).click();
 const conceptHeading=()=>page.locator('.se-concept-heading h3').textContent();
 await page.locator('#research-svg [data-concept="sample"] > g[role="button"]').click();
 assert.ok(await page.locator('#entity-svg [data-entity="Sample"]').count(),'A concept card opens its connections directly');
 assert.equal(search(),'#concepts/sample','A concept page has its own URL');
 // One schema search, in the same place on every view.
 const finderBox=async()=>finder().evaluate(input=>{const r=input.getBoundingClientRect(),m=input.closest('.se-main').getBoundingClientRect();return [Math.round(r.left-m.left),Math.round(r.top-m.top),Math.round(r.width)];});
 const conceptFinder=await finderBox();
 assert.equal(await sideNav.locator('[aria-current="page"]').textContent(),'Sample','The side menu marks the open concept');
 assert.equal(await sideNav.getByRole('link',{name:'Samples, Tissue & Cell Lines'}).count(),0,'The menu holds one grouping, the donor-to-data path; schema groups live in the catalog');
 // The menu collapses with the portal's sliding sidebar arrow, as on the benchmarking data pages.
 await page.getByRole('button',{name:'Toggle Side Navigation',exact:true}).click();
 assert.equal(await sideNav.isVisible(),false,'The side menu collapses');
 await page.getByRole('button',{name:'Toggle Side Navigation',exact:true}).click();
 assert.equal(await sideNav.isVisible(),true,'The side menu opens again');
 await page.goBack();
 assert.equal(search(),'','The browser Back button returns to the overview');
 await page.locator('#research-svg').waitFor();
 await page.goForward();
 await page.locator('#entity-svg [data-entity="Sample"]').waitFor();
 await diagramBack().click();
 assert.ok(await page.locator('#research-map-context').isVisible(),'Back from a map card returns to the map');
 assert.equal(search(),'','The overview is the bare page URL');
 assert.equal(await page.getByRole('region',{name:'Sample details',exact:true}).count(),0,'Back does not unexpectedly open concept details');
 await page.locator('[data-concept="fileSet"] .se-research-diagram-action').click();
 await page.locator('[data-external-group]').first().waitFor();
 assert.ok(await page.locator('[data-external-group]').count()>1,'Large external context is grouped by domain');
 assert.equal(await page.locator('[data-entity="AlignedReads"]').count(),0,'Collapsed external schemas do not form a long side list');
 assert.equal(await page.locator('#entity-svg .entity-node:not(:has(.se-context-domain))').count(),11,'The primary group stays complete');
 await page.locator('.se-concept-diagram').screenshot({path:path.join(output,'fileset-external-groups.png')});
 const fileGroup=page.locator('[data-external-group="files"]');
 assert.match(await fileGroup.locator('.se-external-group-map').textContent(),/^Map: Data files/,'External groups name the map boxes they contain');
 assert.equal(await page.locator('[data-external-group="administrative"] .se-external-group-title').textContent(),'Admin, Content & Ontology','External groups reuse the catalog group name');
 assert.equal(await page.locator('[data-external-group="administrative"] .se-external-group-map').textContent(),'Not on the Donor to data map');
 await fileGroup.click();
 assert.equal(await fileGroup.getAttribute('aria-expanded'),'true');
 assert.equal(await page.locator('[data-entity="AlignedReads"]').count(),1,'Expanding reveals the actual schema in place');
 await page.locator('[data-entity="AlignedReads"]').focus();await page.keyboard.press('Enter');
 const alignedEdge=page.locator('.se-edge[aria-label="AlignedReads to FileSet"]');
 assert.ok(await alignedEdge.count(),'Expanded arrows retain actual schema direction when inspecting a schema');
 assert.match(await alignedEdge.first().locator('title').textContent(),/On the Donor to data map: Experiment \/ FileSet produces Data files/,'Schema arrows name their map sentence');
 assert.equal(await page.locator('#entity-svg .se-cross-group-cue').count(),0,'With links to other groups drawn, the node cue does not repeat them');
 await fileGroup.focus();await page.keyboard.press('Enter');
 assert.equal(await fileGroup.getAttribute('aria-expanded'),'false');
 assert.equal(await page.locator('[data-entity="AlignedReads"]').count(),0);
 await diagramBack().click();
 await page.locator('#research-svg [data-concept="sample"] > g[role="button"]').click();
 assert.match(await page.getByRole('region',{name:'Sample details',exact:true}).textContent(),/sample_sources/);
 assert.equal(await page.locator('#research-map-context').count(),0,'A concept page replaces the overview map');
 assert.equal(search(),'#concepts/sample');
 await page.waitForFunction(()=>document.activeElement?.textContent==='Sample');
 assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Sample','Selection focuses the main detail heading');
 // One page per concept: its map, with the concept's relationships underneath while nothing is selected.
 const relationshipRows=()=>page.locator('#concept-summary .se-relationship-table tbody tr');
 assert.ok(await relationshipRows().count()>=2);
 assert.equal(await page.getByRole('tablist').count(),0,'No Summary/Map tabs: the concept page is one view');
 assert.ok(await page.locator('#entity-svg [data-entity="TissueSample"]').count(),'The concept page draws its map');
 // Pointing at a table row traces its arrow on the map.
 await relationshipRows().filter({hasText:'sample_sources[]'}).hover();
 assert.ok(await page.locator('#entity-svg .se-traced-edge').count()>0,'A table row traces its references on the map');
 await page.mouse.move(0,0);
 assert.equal(await page.locator('#entity-svg .se-traced-edge').count(),0);
 // Selecting a schema swaps the concept's relationships for the schema's own; clearing brings them back.
 await page.locator('[data-entity="TissueSample"]').focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('#concept-summary').count(),0,'A selected schema replaces the concept relationships');
 assert.ok(await page.locator('#entity-details').isVisible());
 await page.getByRole('button',{name:/^Clear selection of /}).click();
 assert.ok(await page.locator('#concept-summary').isVisible(),'Clearing the selection shows the concept relationships again');
 await relationshipRows().first().getByRole('button',{name:/^Details/}).click();
 assert.ok(await page.getByRole('dialog').isVisible(),'A table row opens its details');
 await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
 await page.locator('.modal-backdrop').waitFor({state:'detached'});
 await page.locator('.se-research-detail').screenshot({path:path.join(output,'sample-workspace.png')});
 await goToConcept('Library');
 assert.equal(await conceptHeading(),'Library');
 assert.ok(await relationshipRows().filter({hasText:'analytes[]'}).count(),'Library summary lists its source analytes');
 // Measured once the stepper's smooth scroll has settled.
 const conceptTop=()=>page.locator('.se-concept-heading h3').evaluate(heading=>new Promise(done=>{
  let last=NaN;const settle=()=>{if(scrollY===last)done(Math.round(heading.getBoundingClientRect().top));else{last=scrollY;setTimeout(settle,100);}};settle();
 }));
 assert.ok(await conceptTop()>-1000);
 assert.equal(search(),'#concepts/library');
 // The path under the heading moves between concepts, and Overview leads back to the whole map.
 assert.ok(await stepper.isVisible());
 await goToConcept('Analyte');
 assert.equal(search(),'#concepts/analyte','Moving along the path opens that concept');
 await page.goBack();
 assert.equal(search(),'#concepts/library');
 assert.ok(await stepper.getByRole('button',{name:'Overview',exact:true}).isVisible(),'The path starts with a way back to the overview');
 assert.equal(await page.locator('#research-svg').count(),0,'A concept page does not repeat the overview map');
 assert.equal(await page.locator('.se-concept-diagram .se-diagram-header').count(),0,'The diagram does not repeat the concept heading');
 const visibleSchemas=()=>page.locator('#entity-svg .entity-node').evaluateAll(nodes=>nodes.map(node=>node.dataset.entity).sort());
 assert.equal(await page.locator('#entity-svg .entity-node:not(:has(.se-context-domain))').count(),11,'Library opens the entire group directly');
 assert.equal(await page.locator('[data-entity="Library"].se-concept-center').count(),1,'The original concept remains visually anchored');
 assert.equal(await page.locator('.se-research-detail .se-concept-eyebrow').textContent(),'Analytes, Libraries & Sequencing','The concept names its group above the title');
 assert.equal(await page.locator('.se-concept-diagram .se-diagram-facts').count(),0,'The diagram carries no separate fact chips');
 assert.equal(await page.locator('.se-concept-diagram > .se-diagram-legend, .se-concept-diagram > .se-flow-note').count(),0,'Reading help is not stacked above the canvas');
 await page.getByRole('button',{name:'How to read this diagram',exact:true}).click();
 const diagramGuide=page.locator('.se-diagram-guide-popover');
 await diagramGuide.waitFor();
 assert.ok((await diagramGuide.locator('.se-diagram-legend').textContent()).includes('In focus: Library'),'The legend explains the outlined concept schemas');
 assert.match(await diagramGuide.textContent(),/Highlighted schemas belong to Library/,'The reading note moved into the guide');
 await page.keyboard.press('Escape');await page.locator('.se-concept-heading h3').click();
 await diagramGuide.waitFor({state:'detached'});
 for(const pair of ['Library to Analyte','FileSet to Library','Library to LibraryPreparation'])assert.ok(await page.locator(`#entity-svg .se-edge[aria-label="${pair}"]`).count(),'The overview connections and additional preparation metadata are present');
 await page.locator('.se-concept-diagram').screenshot({path:path.join(output,'library-simplified-entry.png')});
 await page.locator('.se-diagram > .se-canvas-wrap').screenshot({path:path.join(output,'library-direct-connections.png')});
 assert.equal(await page.getByRole('button',{name:/Show entire group/}).count(),0,'No redundant scope toggle');
 assert.equal(await page.locator('.se-diagram-controls details[open]').count(),0,'Technical controls are folded on entry');
 assert.ok(await page.locator('#entity-svg').evaluate(svg=>svg.getBoundingClientRect().top < innerHeight / 2),'The diagram is visible immediately on entry');
 assert.equal(await conceptHeading(),'Library');
 await goToConcept('Analyte');
 for(const field of ['samples[]','analyte_preparation','analytes[]'])assert.ok(await page.locator('.se-relationship-field code').filter({hasText:field}).count(),`Analyte summary retains ${field}`);
 assert.equal(await page.locator('#entity-svg .entity-node:not(:has(.se-context-domain))').count(),11,'Analyte uses the same full group view');
 assert.equal(await page.locator('#entity-svg .se-domain-frame').count(),1,'External context does not introduce an entire additional group');
 assert.match(await page.locator('[data-entity="Sample"] .se-context-domain').textContent(),/Other group/);

 for(const pair of ['Analyte to Sample','Analyte to AnalytePreparation','Library to Analyte'])assert.ok(await page.locator(`#entity-svg .se-edge[aria-label="${pair}"]`).count(),`The diagram retains ${pair} from the summary`);
 await page.locator('.se-diagram > .se-canvas-wrap').screenshot({path:path.join(output,'analyte-consistent-context.png')});
 await page.locator('[data-entity="Sample"]').focus();await page.keyboard.press('Enter');
 await page.locator('#entity-show-neighborhood').click();
 const sampleNeighbors=[...new Set(['Sample',...snapshot.model.edges.filter(edge=>edge.kind==='linkTo' && (edge.from==='Sample' || edge.to==='Sample')).flatMap(edge=>[edge.from,edge.to])])].sort();
 const relationshipSummary=()=>page.locator('details:has(.se-link-filter-popover) > summary');
 await relationshipSummary().filter({hasText:'Relationships 3/3'}).waitFor({timeout:5000}); // A neighborhood opens with every relationship kind.
 const shownNeighbors=await visibleSchemas();
 assert.ok(sampleNeighbors.every(name=>shownNeighbors.includes(name)),'Explicit neighborhood exploration is not restricted by the previous concept scope');
 assert.ok((await page.locator('#entity-svg .se-neighborhood-group').allTextContents()).includes('Analytes, Libraries & Sequencing'),'Neighbors are grouped under catalog group names');
 assert.equal(await page.locator('#entity-svg').evaluate(svg=>{
  const x=name=>svg.querySelector(`[data-entity="${name}"]`).transform.baseVal.consolidate().matrix.e;
  return x('Analyte')<x('Sample');
 }),true,'Schemas linking to the selection sit to its left');
 assert.equal(await page.getByLabel('Connection detail',{exact:true}).isDisabled(),false,'The neighborhood can switch between shared definitions and all references');
 await page.locator('#entity-svg').screenshot({path:path.join(output,'sample-neighborhood.png')});
 await page.locator('#entity-show-neighborhood').click();
 await relationshipSummary().filter({hasText:'Relationships 1/3'}).waitFor({timeout:5000}); // Leaving the neighborhood restores the group filter.
 await goToConcept('Data files');
 assert.equal(await page.locator('#entity-svg .se-domain-frame').count(),1,'Data files must not expand all related domains');
 assert.equal(await page.locator('#entity-svg .entity-node').count(),17,'The approved file stages and support schemas remain intact');
 assert.equal(await page.locator('#entity-svg .entity-node .se-subtitle').count(),17,'Every file schema retains its description in concept view');
 assert.match(await page.locator('[data-entity="UnalignedReads"] .se-subtitle').textContent(),/Unaligned sequencing reads/);
 assert.equal(await page.locator('#entity-svg .se-edge:not([aria-label*="external-group:"])').count(),17,'Inherited file references stay combined at their shared definitions');
 const fileScale=await page.locator('#entity-svg > g').evaluate(group=>group.transform.baseVal.consolidate().matrix.a);
 assert.ok(fileScale>=0.85,`File exploration retains a readable scale (${fileScale})`);
 assert.equal(await page.locator('#entity-svg [data-entity="Donor"]').count(),0,'External donor references are not added automatically');
 assert.ok(await page.locator('[data-external-group]').count()>0,'Multi-schema concepts keep links to other groups visible as collapsed cards');
 assert.equal(await page.locator('#entity-svg .se-concept-center').count(),10,'Every Data files schema is outlined, as the legend states');
 await page.locator('.se-diagram > .se-canvas-wrap').screenshot({path:path.join(output,'files-concept-restored.png')});
 await page.locator('[data-entity="UnalignedReads"]').focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('#entity-svg .se-cross-group-cue').count(),0,'The cue is hidden while links to other groups are drawn');
 assert.ok(await page.locator('#entity-details .se-selected-table').filter({hasText:'FileSet'}).count(),'The selected panel lists links drawn through a collapsed external group');
 // The embed path finder starts from the selected schema, so it sits on its panel (and on its details page).
 await page.locator('#entity-details').getByRole('button',{name:'Find embed path…',exact:true}).click();
 assert.equal(await page.locator('#path-source').inputValue(),await page.locator('#entity-details #heading h2').textContent(),'The finder opens on the selected schema');
 await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
 await page.locator('.modal-backdrop').waitFor({state:'detached'});
 const externalToggle=page.getByLabel('Links to other groups',{exact:true});
 await externalToggle.uncheck();
 await page.locator('[data-entity="UnalignedReads"]').focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('#entity-details .se-selected-table').filter({hasText:'FileSet'}).count(),0,'Hidden external links leave the panel');
 await page.locator('#entity-svg .se-cross-group-cue [role="button"]').click();
 assert.ok(await page.locator('.se-cross-group-popover').isVisible(),'Without drawn external links, the cue keeps them available beside the selected file');
 assert.equal(await page.locator('.se-cross-group-list [data-domain="administrative"]').count(),0);
 await page.getByRole('button',{name:'Close external connections',exact:true}).click();
 await externalToggle.check();
 assert.equal(await page.locator('.se-cross-group-popover').count(),0,'Drawing external links closes the cue panel');
 assert.equal(await conceptHeading(),'Data files');
 await goToConcept('Donor');
 // The concept's schemas are its outlined cards on the map; the abstract base keeps its dashed look there.
 assert.deepEqual(await page.locator('#entity-svg .entity-node.se-concept-center').evaluateAll(nodes=>nodes.map(n=>n.dataset.entity).sort()),['AbstractDonor','Donor','ProtectedDonor']);
 assert.equal(await page.locator('[data-entity="AbstractDonor"].se-node-abstract').count(),1);
 // Selecting a schema on a concept page shows its full details under the map and keeps the concept open.
 await page.locator('[data-entity="ProtectedDonor"]').focus();await page.keyboard.press('Enter');
 assert.equal(search(),'#concepts/donor','Selecting a concept schema keeps the concept page');
 assert.equal(await page.locator('#entity-details #heading h2').textContent(),'ProtectedDonor');
 assert.equal(await page.locator('#entity-details').getByRole('tab',{name:'Links',exact:true}).getAttribute('aria-selected'),'true','Its links come first');
 await page.locator('#entity-details').getByRole('tab',{name:/^Fields/}).click();
 assert.ok(await page.locator('#entity-details .se-inspector-list button.se-field').count()>5,'Its fields are one tab away');
 assert.equal(await page.locator('.se-schema-trail').textContent(),'All schemasDonor & Clinical HistoryProtectedDonor','A schema page names its catalog group');
 assert.equal(await page.locator('.se-schema-concept a').textContent(),'1 · Donor','A schema page links its place on the metadata map');
 assert.deepEqual(await finderBox(),conceptFinder,'The schema search sits in the same place on concept and schema pages');
 await page.getByRole('button',{name:/^Clear selection of /}).click();
 assert.ok(await page.locator('#concept-summary').isVisible());
 assert.equal(await conceptHeading(),'Donor');
 // A schema has no page of its own: its address opens its group map with it selected.
 await openSchema('ProtectedDonor');
 assert.equal(search(),'#schemas/ProtectedDonor');
 assert.equal(await page.getByLabel('Schema group',{exact:true}).inputValue(),'donors','A schema opens on its group map');
 assert.equal(await page.locator('[data-entity="ProtectedDonor"].selected').count(),1);
 await page.locator('[data-entity="Donor"]').focus();await page.keyboard.press('Enter');
 assert.equal(search(),'#schemas/Donor','Selecting on a group map moves to that schema');
 await page.goBack();
 assert.equal(search(),'#schemas/ProtectedDonor');
 await page.locator('#entity-details #heading h2',{hasText:/^ProtectedDonor$/}).waitFor({timeout:5000}); // Back reselects the previous schema.
 await page.getByRole('button',{name:/^Clear selection of /}).click();
 assert.equal(search(),'#groups/donors','Clearing a selection returns to the group map');

 await navTo('Data files');
 await page.locator('#concept-summary').waitFor();
 assert.ok(await relationshipRows().count()>=4);
 assert.equal(await page.locator('#entity-svg .entity-node.se-concept-center').count(),10);
 const fileSetRow=relationshipRows().filter({hasText:'Which experiment is this file associated with?'});
 assert.match(await fileSetRow.textContent(),/file_sets\[\]/);
 assert.match(await fileSetRow.textContent(),/on 7 schemas/,'Every file subtype that stores file_sets is counted');
 await page.locator('.se-research-detail').screenshot({path:path.join(output,'data-files-workspace.png')});
 await diagramBack().click();
 assert.equal(await page.locator('#research-map-context').isVisible(),true,'The side menu leads back to the overview map');

 const coreEdge=page.locator('#research-svg [data-reference="sample-material"] .se-research-edge');
 await coreEdge.focus();await page.keyboard.press('Enter');
 assert.match(await page.getByRole('dialog').textContent(),/sample_sources/);
 await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
 await page.locator('.modal-backdrop').waitFor({state:'detached'});
 const researchDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export PNG',exact:true}).click();
 await (await researchDownload).saveAs(path.join(output,'research-overview-export.png'));
 await page.getByRole('button',{name:'Enter full screen',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Exit full screen',exact:true}).getAttribute('aria-pressed'),'true');
 await page.keyboard.press('Escape');
 assert.equal(await page.getByRole('button',{name:'Enter full screen',exact:true}).getAttribute('aria-pressed'),'false');
 await page.getByRole('button',{name:/^All \d+ schemas$/}).click();
 const catalog=page.getByRole('region',{name:'All schemas',exact:true});
 assert.ok(await catalog.isVisible(),'All schemas opens the catalog');
 assert.equal(search(),'#schemas');
 assert.match(await sideNav.locator('[aria-current="page"]').textContent(),/^All schemas$/,'The side menu marks the catalog');
 assert.equal(await catalog.locator('.se-catalog-group').count(),6);
 assert.ok(await catalog.getByRole('region',{name:'Admin, Content & Ontology',exact:true}).count(),'The catalog and external cards share one group name');
 await catalog.screenshot({path:path.join(output,'schema-catalog.png')});
 await catalog.getByRole('region',{name:'Donor & Clinical History',exact:true}).getByRole('button',{name:'Open group map',exact:true}).click();
 assert.equal(await page.getByLabel('Diagram layout',{exact:true}).inputValue(),'hierarchical');
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
 await page.locator('details:has(.se-link-filter-popover) > summary').click();
 await page.locator('.se-link-filter-popover').getByLabel('Calculated',{exact:true}).check();
 await page.locator('.se-link-filter-popover').getByLabel('Reverse',{exact:true}).check();
 assert.ok(await page.locator('#entity-svg .se-edge.calculated, #entity-svg .se-edge.reverse').count()>0);
 assert.deepEqual(await nodePositions(),donorPositions,'Relationship filters preserve stages and horizontal placement');
 await page.locator('.se-link-filter-popover').getByLabel('Calculated',{exact:true}).uncheck();
 await page.locator('.se-link-filter-popover').getByLabel('Reverse',{exact:true}).uncheck();
 await page.locator('details:has(.se-link-filter-popover) > summary').click();
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
   assert.equal(await page.locator('.se-diagram:has(#entity-svg) .se-diagram-heading h2').textContent(),'Files & Quality Metrics','The group title heads the diagram');
   assert.equal(await page.locator('#entity-svg .se-domain-frame text').count(),0,'A single group is not titled again inside the canvas');
   const before=await nodePositions();
   assert.equal(await page.getByLabel('Connection detail',{exact:true}).inputValue(),'shared');
   assert.equal(await page.locator('#entity-svg .se-edge').count(),17,'Inherited references are summarized at their defining base');
   assert.match(await page.locator('[data-entity="UnalignedReads"] .se-inherited-tag text').textContent(),/^↑ \d+ links via File, SubmittedFile$/,'Subtypes name the base their inherited arrows are drawn at');
   await page.locator('[data-entity="UnalignedReads"] .se-inherited-tag').hover();
   assert.ok(await page.locator('#entity-svg .se-edge.se-traced-edge').count()>0,'Hovering the tag traces the inherited arrows');
   assert.ok(await page.locator('[data-entity="UnalignedReads"].se-covered').count(),'The hovered subtype is marked as covered by them');
   await page.locator('h2').first().hover();
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

   // A focused arrow keeps tracing its ends; release it so cards show their resting style.
   await page.evaluate(()=>document.activeElement?.blur());
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
   await page.getByRole('button',{name:/^Clear selection of /}).click();
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
   await page.locator('.se-diagram > .se-canvas-wrap').screenshot({path:path.join(output,'cross-group-local-popover.png')});
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
   await page.locator('.se-diagram > .se-canvas-wrap').screenshot({path:path.join(output,'cross-group-compact-connections.png')});
   await outsideRegion.locator('details[data-domain="workflows"] summary').click();
   assert.deepEqual(await nodePositions(),beforeOutside,'Opening cross-group details preserves node placement');
   assert.equal(await page.locator('#entity-svg > g').getAttribute('transform'),cameraOutside,'Opening cross-group details preserves zoom');
   await outsideRegion.locator('details[data-domain="workflows"]').getByRole('button',{name:'Inspect relationship',exact:true}).first().click();
   assert.ok(await page.locator('.se-connection-card').first().isVisible());
   await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
   await page.locator('.modal-backdrop').waitFor({state:'detached'});
   await page.locator('details:has(.se-link-filter-popover) > summary').click();
   await page.locator('.se-link-filter-popover').getByLabel('Calculated',{exact:true}).check();
   const withCalculated=snapshot.model.edges.filter(e=>['linkTo','calculated'].includes(e.kind) && (e.from==='File' || e.to==='File') && (!enabled.has(e.from) || !enabled.has(e.to)));
   assert.equal(await outsideRegion.locator('summary span').evaluateAll(spans=>spans.reduce((sum,span)=>sum+Number.parseInt(span.textContent),0)),new Set(withCalculated.map(e=>e.from==='File'?e.to:e.from).filter(name=>!standardAdministrative.has(name))).size,'Cross-group counts follow relationship filters');
   await page.locator('.se-link-filter-popover').getByLabel('Calculated',{exact:true}).uncheck();
   await page.locator('details:has(.se-link-filter-popover) > summary').click();
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
   await outsideRegion.getByRole('button',{name:'WorkflowRun',exact:true}).click();
   assert.equal(await page.getByLabel('Schema group',{exact:true}).inputValue(),'workflows','External schema navigation opens its group');
   await page.locator('[data-entity="WorkflowRun"].selected').waitFor({timeout:5000});
   assert.equal(search(),'#schemas/WorkflowRun','An external schema opens at its own address');
  }

 }
 await diagramBack().click();
 assert.equal(await page.locator('.se-research-overview').count(),1);
 await selectOnGroupMap('Donor');
 assert.equal(await page.getByLabel('Schema group',{exact:true}).inputValue(),'donors');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const beforeClearing=await page.locator('#entity-svg > g').getAttribute('transform');
 await page.getByRole('button',{name:/^Clear selection of /}).click();
 assert.equal(await page.locator('#entity-svg > g').getAttribute('transform'),beforeClearing,'Clear selection preserves the current group camera');


 await selectOnGroupMap('TissueSample');
 assert.equal(await page.getByLabel('Schema group',{exact:true}).inputValue(),'samples');
 await selectSetting('Diagram layout','network');
 assert.equal(await page.locator('.se-domain-frame').count(),0);
 await selectSetting('Diagram layout','hierarchical');
 assert.equal(await page.locator('.se-domain-frame').count(),1);
 await selectSetting('Schema group','');
 assert.equal(await page.locator('.se-research-overview').count(),1,'Leaving every group returns to the metadata map');
 await selectOnGroupMap('File');
 assert.equal(await page.getByLabel('Schema group',{exact:true}).inputValue(),'files');
 await page.getByRole('button',{name:/^Clear selection of /}).click();
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();
 const zoomedCamera=await page.locator('#entity-svg > g').getAttribute('transform');
 await page.locator('[data-entity="File"]').focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('#entity-svg > g').getAttribute('transform'),zoomedCamera,'Node selection must preserve zoom and pan');
 await page.locator('#entity-show-neighborhood').click();
 assert.equal(await page.locator('#entity-show-neighborhood').getAttribute('aria-pressed'),'true');
 assert.ok(await page.locator('#entity-svg .entity-node').count()>1);
 await page.locator('#entity-show-neighborhood').click();
 assert.equal(await page.locator('#entity-show-neighborhood').getAttribute('aria-pressed'),'false');
 const mapPlace=search();
 const toCatalog=()=>sideNav.getByRole('link',{name:/^All schemas/}).click();
 await toCatalog(); // Leave the map for schema details through the side menu.
 // Live item loading is folded into an admin-only panel under the schema heading.
 const openLivePanel=async()=>{if(!await page.locator('.se-live-panel').evaluate(panel=>panel.open))await page.locator('.se-live-panel > summary').click();};
 await openSchema('ProtectedDonor');
 await openLivePanel();
 assert.equal(await page.locator('#environments').isDisabled(),true);
 assert.equal(await page.locator('#environments option').count(),1);
 assert.equal(search(),'#schemas/ProtectedDonor','Choosing a schema puts it in the URL');
 await page.goBack();await page.goBack(); // Back to the map exactly as it was left.
 assert.equal(search(),mapPlace);
 await page.waitForSelector('#entity-svg .entity-node');
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
 await page.goForward();await page.goForward();
 assert.equal(search(),'#schemas/ProtectedDonor','Forward returns to the schema');
 await page.locator('#heading button').filter({hasText:'Python'}).click();
 await page.waitForFunction(()=>document.querySelector('#detail-content pre')?.textContent.includes('class ProtectedDonor'));
 await page.getByRole('dialog').getByRole('button', {name:'Close',exact:true}).click();
 await openLivePanel();
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
 assert.equal(await finder().count(),0);
 await page.evaluate(()=>window.mountExplorer());
 await page.waitForFunction(()=>!!document.getElementById('schema-finder'));
 assert.equal(calls.filter(url=>new URL(url).pathname==='/schema-explorer/model').length,before+1);
 assert.equal(await page.locator('#heading h2').textContent(),decodeURIComponent(search().split('/')[1]),'Remounting reopens the schema named in the URL');
 assert.equal(await page.locator('#item-heading h3').count(),0,'Remounting does not restore a previously loaded item');
 await diagramBack().click();
 assert.deepEqual(errors,[]);
 isAdmin=false;
 await page.evaluate(()=>{window.unmountExplorer();window.mountExplorer();});
 await page.waitForFunction(()=>!!document.getElementById('schema-finder'));
 assert.equal(await page.locator('.se-item-view').isVisible(),false);
 await toCatalog();
 assert.equal(await page.locator('.se-item-view').isVisible(),true);
 await openSchema('File');
 assert.equal(await page.locator('#heading h2').textContent(),'File');
 assert.equal(await page.locator('.se-live-panel').count(),0,'Live item loading is admin only');
 await diagramBack().click();
 assert.equal(await page.locator('.se-item-view').isVisible(),false);
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
  await page.waitForFunction(()=>!!document.getElementById('schema-finder'),null,{timeout:20000}).catch(async error=>{console.log('Portal bootstrap errors:',errors,'Recent requests:',calls.slice(-15));await page.screenshot({path:path.join(output,'bootstrap-failure.png')});throw error;});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('user_info'))?.details?.email),'admin@example.org');
  assert.equal(await finder().inputValue(),'');
  await page.waitForSelector('#research-svg [data-concept]');
  assert.equal(await page.locator('#research-svg .se-research-edge').count(),10,'The real portal bootstrap opens the relationship map');
 }
 assert.deepEqual(errors,[]);
 console.log('Portal bootstrap also passed: authenticated SSR user_info survives three page loads.');
 console.log('Browser passed: React components, lazy webpack chunk, mount/unmount, portal menu, single heading, no iframe, fullscreen, real model, source viewer, PNG download, planner, same-origin item fetch, missing raw permission, no persistent storage.');
 }finally{await browser.close();}
})();
