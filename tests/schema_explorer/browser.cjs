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
   return route.fulfill({json:{'@id':'/demo/','@type':['Donor'],uuid:'demo',accession:'DEMO',display_title:'Demo donor'}});
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
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();
 const zoomedCamera=await page.locator('#entity-svg > g').getAttribute('transform');
 await page.locator('[data-entity="File"]').focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('#entity-svg > g').getAttribute('transform'),zoomedCamera,'Node selection must preserve zoom and pan');
 await page.locator('#entity-show-neighborhood').click();
 assert.equal(await page.locator('#entity-show-neighborhood').getAttribute('aria-pressed'),'true');
 assert.ok(await page.locator('#entity-svg .entity-node').count()>1);
 await page.locator('#entity-show-neighborhood').click();
 assert.equal(await page.locator('#entity-show-neighborhood').getAttribute('aria-pressed'),'false');
 assert.equal(await page.locator('#environments').isDisabled(),true);
 assert.equal(await page.locator('#environments option').count(),1);
 await page.locator('#open-entity').click(); // Switch from the default schema map to item view.
 await page.selectOption('#types','ProtectedDonor');
 await page.locator('#open-entity').click();await page.waitForSelector('#entity-svg .entity-node');
 await page.locator('#entity-fullscreen').click();
 assert.equal(await page.locator('#entity-fullscreen').getAttribute('aria-pressed'),'true');
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
 }
 assert.deepEqual(errors,[]);
 console.log('Portal bootstrap also passed: authenticated SSR user_info survives three page loads.');
 console.log('Browser passed: React components, lazy webpack chunk, mount/unmount, portal menu, single heading, no iframe, fullscreen, real model, source viewer, PNG download, planner, same-origin item fetch, missing raw permission, no persistent storage.');
 }finally{await browser.close();}
})();
