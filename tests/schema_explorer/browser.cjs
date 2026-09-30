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
 const page=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const base='src/encoded/schema_explorer/assets/';
 const snapshot=JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
 let calls=[];
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());calls.push(url.href);
  if(url.origin!=='https://portal.test')throw Error('External request: '+url.href);
  if(url.pathname==='/schema-explorer/ui'){
   let html=fs.readFileSync(base+'index.html','utf8');
   const files={portal:'portal.js',style:'style.css',script:'app.js',entityScript:'entity-diagram.js',itemScript:'item.js',provenance:'provenance.js',pathAnalysis:'path-analysis.js',pathFinder:'path-finder.js'};
   for(const [key,value] of Object.entries(files))html=html.replaceAll('{{'+key+'}}','/schema-explorer/assets/'+value);
   html=html.replaceAll('{{nonce}}','testnonce');
   return route.fulfill({contentType:'text/html',body:html,headers:{'Content-Security-Policy':"default-src 'none'; script-src 'nonce-testnonce'; style-src 'self' 'unsafe-inline'; img-src blob: data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"}});
  }
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
 await page.goto('https://portal.test/schema-explorer/ui');
 await page.waitForFunction(()=>document.getElementById('types').options.length>30);
 assert.equal(await page.locator('#environments').isDisabled(),true);
 assert.equal(await page.locator('#environments option').count(),1);
 await page.selectOption('#types','ProtectedDonor');
 await page.locator('#open-entity').click();await page.waitForSelector('#entity-svg .entity-node');
 const dl=page.waitForEvent('download');await page.locator('#entity-export').click();const download=await dl;
 await download.saveAs(path.join(output,'schema-map.png'));
 assert.deepEqual([...fs.readFileSync(path.join(output,'schema-map.png')).subarray(0,8)],[137,80,78,71,13,10,26,10]);
 await page.locator('#open-entity').click();
 await page.locator('#heading button').filter({hasText:'Python'}).click();
 await page.waitForFunction(()=>document.querySelector('#detail-content pre')?.textContent.includes('class ProtectedDonor'));
 await page.locator('#close-detail').click();
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
 await page.screenshot({path:path.join(output,'planner.png')});
 console.log('Browser passed: real model, source viewer, PNG download, planner, same-origin item fetch, missing raw permission, no persistent storage.');
 }finally{await browser.close();}
})();
