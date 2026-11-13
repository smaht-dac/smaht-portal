const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/encoded/static/components/static-pages/schema-explorer/explorer-route.js','utf8');
(async()=>{
 const {parseRoute,routeHash,sameRoute,isMapRoute,overviewRoute}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const routes=[
  overviewRoute,
  {view:'concept',concept:'analyte'},
  {view:'group',group:'samples'},
  {view:'schemas'},
  {view:'schema',schema:'TissueSample'},
  {view:'schema',schema:'TissueSample',connections:true},
 ];
 for(const route of routes)assert.deepEqual(parseRoute(routeHash(route)),route,`${JSON.stringify(route)} survives the URL`);
 assert.deepEqual(routes.map(routeHash),['','#concepts/analyte','#groups/samples','#schemas','#schemas/TissueSample','#schemas/TissueSample/connections'],'Readable hashes');
 assert.deepEqual(parseRoute('#concepts/sample/map'),{view:'concept',concept:'sample'},'Links from the former Map tab open the concept page');
 assert.deepEqual(parseRoute('#/schemas/A%20B'),{view:'schema',schema:'A B'},'Schema names are decoded and a leading slash is accepted');
 assert.deepEqual(parseRoute('#main'),overviewRoute,'Unrelated hashes keep the overview');
 assert.deepEqual(parseRoute('#concepts'),overviewRoute,'A section without its id keeps the overview');
 assert.ok(sameRoute({view:'group',group:'files'},{view:'group',group:'files'}));
 assert.ok(!sameRoute({view:'concept',concept:'files'},{view:'concept',concept:'sample'}));
 assert.deepEqual(routes.map(isMapRoute),[true,true,true,false,true,true],'Only the catalog is off the map; a schema opens on its group map');
 console.log('Explorer route: hash round trips, defaults and map/detail split passed.');
})();
