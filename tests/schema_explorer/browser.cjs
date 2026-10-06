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
 const rendered=spawnSync(process.execPath,['src/encoded/static/build/renderer.js','--debug',JSON.stringify({'@id':'/schema-explorer','@type':['SchemaExplorerPage'],title:'Schema Explorer'})],{encoding:'utf8',maxBuffer:8*1024*1024});
 assert.equal(rendered.status,0,rendered.stderr);
 let shellMarkup=rendered.stdout.slice(rendered.stdout.indexOf('<!DOCTYPE html>')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 assert.ok(shellMarkup.includes('data-schema-explorer'));
 const webpack=require('webpack');
 await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,
  entry:path.resolve('tests/schema_explorer/browser-entry.cjs'),
  output:{path:output,filename:'harness.js'},
  module:{rules:[{test:/\.js$/,include:path.resolve('src/encoded/static'),use:'babel-loader'}]}
 },(err,stats)=>err||stats.hasErrors()?reject(err||Error(stats.toString())):resolve()));
 shellMarkup=shellMarkup.replace('</body>','<script src="/test-harness.js"></script></body>');
 const native=spawnSync(process.env.PYTHON || '../vsmaht3.12/bin/python', ['-c',
  'from encoded.schema_explorer import native_module; print(native_module())'],
  {encoding:'utf8',env:{...process.env,PYTHONPATH:'src'},maxBuffer:8*1024*1024});
 assert.equal(native.status,0,native.stderr);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const base='src/encoded/schema_explorer/assets/';
 const snapshot=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
 let calls=[];
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  // Portal chrome references external fonts; stub these without network access.
  if(['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return route.fulfill({body:''});
  calls.push(url.href);
  if(url.origin!=='https://portal.test')throw Error('External request: '+url.href);
  if(url.pathname==='/schema-explorer')return route.fulfill({contentType:'text/html',body:shellMarkup});
  if(url.pathname==='/static/css/style.css')return route.fulfill({contentType:'text/css',body:fs.readFileSync('src/encoded/static/css/style.css')});
  if(url.pathname==='/schema-explorer/ui')return route.fulfill({status:302,headers:{location:'/schema-explorer'}});
  if(url.pathname==='/test-harness.js')return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(output,'harness.js'))});
  if(url.pathname==='/schema-explorer/assets/native.js')return route.fulfill({contentType:'application/javascript',body:native.stdout});
  if(url.pathname.startsWith('/schema-explorer/assets/'))return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(base+url.pathname.split('/').at(-1))});
  if(url.pathname==='/schema-explorer/model')return route.fulfill({json:snapshot.model});
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
 await page.waitForFunction(()=>document.querySelector('[data-schema-explorer]')?.shadowRoot?.getElementById('types')?.options.length>30);
 assert.equal(await shell.locator('iframe').count(),0,'Explorer must not use an iframe');
 assert.ok(await shell.locator('.navbar').isVisible(),'Portal navigation must remain visible');
 assert.equal(await shell.getByText('Loading Schema Explorer…',{exact:true}).count(),0);
 assert.equal(await shell.getByRole('heading',{name:'Schema Explorer',exact:true}).count(),1);
 assert.equal(await page.locator('#environments').isDisabled(),true);
 assert.equal(await page.locator('#environments option').count(),1);
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
 await page.waitForFunction(()=>document.querySelector('[data-schema-explorer]').shadowRoot.querySelector('#detail-content pre')?.textContent.includes('class ProtectedDonor'));
 await page.locator('#close-detail').click();
 await page.locator('#item-id').fill('https://evil.test/demo/');await page.locator('#load-item').click();
 await page.waitForFunction(()=>document.querySelector('[data-schema-explorer]').shadowRoot.getElementById('item-error').textContent.includes('this portal only'));
 await page.locator('#item-id').fill('/redirect/');await page.locator('#load-item').click();
 await page.waitForFunction(()=>document.querySelector('[data-schema-explorer]').shadowRoot.getElementById('item-status').textContent==='Item load failed.');
 assert.ok(calls.every(url=>url.startsWith('https://portal.test/')));
 await page.locator('#item-id').fill('/demo/');await page.locator('#load-item').click();
 await page.waitForFunction(()=>document.querySelector('[data-schema-explorer]').shadowRoot.getElementById('item-heading').textContent.includes('Demo donor'));
 assert.match(await page.locator('#item-notes').textContent(),/raw unavailable.*403/);
 await page.locator('#open-path-finder').click();
 await page.selectOption('#path-source','TissueSample');await page.selectOption('#path-target','Donor');await page.selectOption('#path-field','study');
 await page.locator('#path-form button[type=submit]').click();
 await page.waitForFunction(()=>document.querySelector('[data-schema-explorer]').shadowRoot.getElementById('path-results').textContent.includes('sample_sources.donor.study'));
 assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 assert.deepEqual(errors,[]);
 await shell.screenshot({path:path.join(output,'planner.png')});
 await page.locator('#close-path-finder').click();
 const before=calls.filter(url=>url.endsWith('/schema-explorer/model')).length;
 await page.evaluate(()=>window.unmountExplorer());
 assert.equal(await page.locator('#types').count(),0);
 await page.evaluate(()=>window.mountExplorer());
 await page.waitForFunction(()=>document.querySelector('[data-schema-explorer]')?.shadowRoot?.getElementById('types')?.options.length>30);
 assert.equal(calls.filter(url=>url.endsWith('/schema-explorer/model')).length,before+1);
 assert.equal(await page.locator('#item-heading').textContent(),'');
 assert.deepEqual(errors,[]);
 console.log('Browser passed: native React mount/unmount, portal menu, single heading, no iframe, fullscreen, real model, source viewer, PNG download, planner, same-origin item fetch, missing raw permission, no persistent storage.');
 }finally{await browser.close();}
})();
