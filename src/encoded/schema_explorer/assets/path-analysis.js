/* Directed schema path analysis. Never executes calculated properties or changes schemas. */
(function(root) {
  const normalize = path => path.replaceAll('[]', '');
  function fields(model) {
    const result = [];
    function walk(schema, path, field) {
      if (!schema || typeof schema !== 'object') return;
      if (schema.linkTo) { result.push({path, schema, field, link:true}); return; }
      if (schema.items && !Array.isArray(schema.items)) { walk(schema.items, path + '[]', field); return; }
      if (schema.properties) {
        for (const [key, value] of Object.entries(schema.properties)) walk(value, path + '.' + key, field);
      } else result.push({path, schema, field, link:false});
    }
    for (const field of model?.fields || []) walk(field.schema, field.name, field);
    return result;
  }
  function graph(index, {storedOnly = false, subtypes = true} = {}) {
    const models = new Map(index.models.map(m => [m.name,m]));
    const adjacent = new Map(index.models.map(m => [m.name,[]]));
    const seen = new Set();
    for (const e of index.edges) {
      if (!['linkTo','calculated'].includes(e.kind) || storedOnly && e.kind === 'calculated') continue;
      const source = models.get(e.from);
      const rootField = e.field.split('.')[0].replaceAll('[]','');
      const field = source?.fields.find(f => f.name === rootField);
      const candidates = index.models.filter(m => m.name === e.to || subtypes && m.bases?.some(b => b.name === e.to));
      for (const target of candidates) {
        const key = [e.from, target.name, e.field, e.kind].join('|');
        if (seen.has(key)) continue; seen.add(key);
        const rev = source?.reverse?.[rootField];
        adjacent.get(e.from)?.push({...e, to:target.name, declaredTarget:e.to, conditional:target.name!==e.to,
          reverse:rev || null, sources:field?.sources || [], owner:field?.owner, missing:false});
      }
    }
    // Stable shortest-route order: direct stored links before calculated or subtype routes.
    for (const values of adjacent.values()) values.sort((a,b)=>Number(a.conditional)-Number(b.conditional) || Number(a.kind==='calculated')-Number(b.kind==='calculated') || a.field.localeCompare(b.field) || a.to.localeCompare(b.to));
    return {models, adjacent};
  }
  function reachable(adjacent, source) {
    const reached = new Set([source]), queue = [source];
    for(let i=0;i<queue.length;i++) for(const edge of adjacent.get(queue[i]) || []) if(!reached.has(edge.to)){reached.add(edge.to);queue.push(edge.to);}
    return reached;
  }
  function search(adjacent, source, target, depth, {repairs=false, limit=12, budget=15000} = {}) {
    const queue=[{at:source,steps:[],visited:new Set([source]),missing:0}];
    const paths=[];let cursor=0,budgetHit=false;
    for(;cursor<queue.length && cursor<budget && paths.length<limit;cursor++) {
      const state=queue[cursor];
      if(state.at===target && (!repairs || state.missing===1)){paths.push(state.steps);continue;}
      if(state.steps.length>=depth)continue;
      for(const edge of adjacent.get(state.at)||[]) {
        const missing=state.missing+Number(edge.missing);
        if(missing>(repairs?1:0) || state.visited.has(edge.to))continue;
        if(queue.length>=budget){budgetHit=true;break;}
        queue.push({at:edge.to,steps:[...state.steps,edge],visited:new Set([...state.visited,edge.to]),missing});
      }
    }
    return {paths,truncated:budgetHit||cursor<queue.length};
  }
  function coverage(model, steps, targetField) {
    const parts=steps.map(step=>normalize(step.field));
    const path=[...parts,normalize(targetField)].join('.');
    if(!steps.length)return {path,status:'local',matches:[],message:'The field is on the starting item; no cross-item embed is needed.'};
    const exact=(model.embeds||[]).filter(p=>p===path);
    if(exact.length)return {path,status:'present',matches:exact,message:'This exact path is already in the starting type’s embedded_list.'};
    // A wildcard on a previous linked item does not expand the next link.
    const targetPrefix=parts.join('.')+'.';
    const wildcards=(model.embeds||[]).filter(p=>p.endsWith('.*') && p.slice(0,-1).startsWith(targetPrefix) && path.startsWith(p.slice(0,-1)));
    if(wildcards.length)return {path,status:'wildcard',matches:wildcards,message:'An explicit wildcard on the target object covers this field (subject to more-specific embed overrides).'};
    const automatic=['@id','@type','display_title','uuid','status','principals_allowed'];
    if(automatic.includes(normalize(targetField).split('.')[0])) return {path,status:'automatic',matches:[],message:'This is a framework default field. Verify the resolved runtime embeds before adding it; the linked path may still need expansion.'};
    return {path,status:'missing',matches:[],message:'No exact or target-object wildcard entry was found in the starting type’s explicit embedded_list. Add this path after validating the route.'};
  }
  // Lexicographic preference, not a probability of domain correctness.
  function rank(route) {
    const conditional=route.steps.filter(s=>s.conditional).length;
    const calculated=route.steps.filter(s=>s.kind==='calculated').length;
    const arrays=route.steps.reduce((n,s)=>n+(s.field.match(/\[\]/g)||[]).length,0);
    const embedOrder={local:0,present:0,wildcard:1,automatic:2,missing:3};
    return {key:[conditional,embedOrder[route.embed.status],calculated,route.steps.length,arrays],
      reasons:[conditional ? `${conditional} subtype condition(s)` : 'No subtype assumptions',
        ({local:'No embed needed',present:'Exact embed exists',wildcard:'Wildcard coverage',automatic:'Framework defaults need verification',missing:'Embed entry needed'})[route.embed.status],
        `${calculated} calculated link(s)`,`${route.steps.length} hop(s)`,`${arrays} array traversal(s)`]};
  }
  function compareRoutes(a,b) {
    for(let i=0;i<a.ranking.key.length;i++)if(a.ranking.key[i]!==b.ranking.key[i])return a.ranking.key[i]-b.ranking.key[i];
    return a.embed.path.localeCompare(b.embed.path) || JSON.stringify(a.steps.map(s=>s.to)).localeCompare(JSON.stringify(b.steps.map(s=>s.to)));
  }
  function analyze(index, {source,target,field,depth=4,storedOnly=false,subtypes=true}) {
    depth=Math.max(1,Math.min(6,Number(depth)||4));
    const {models,adjacent}=graph(index,{storedOnly,subtypes});
    if(!models.has(source)||!models.has(target))throw new Error('Select valid source and target types.');
    const targetField=fields(models.get(target)).find(f=>normalize(f.path)===normalize(field));
    if(!targetField)throw new Error('Choose a field defined on the target type.');
    const result=search(adjacent,source,target,depth,{limit:15000});
    const allReachable=reachable(adjacent,source);
    const candidates=result.paths.map(steps=>({steps,embed:coverage(models.get(source),steps,targetField.path),conditional:steps.some(s=>s.conditional),calculated:steps.some(s=>s.kind==='calculated')}));
    for(const route of candidates)route.ranking=rank(route);
    candidates.sort(compareRoutes);
    const routes=candidates.slice(0,12);
    const repairs=[];
    if(!routes.length && !allReachable.has(target)) {
      // Infer a possible missing reverse from an actual existing forward link.
      const augmented=new Map([...adjacent].map(([k,v])=>[k,[...v]]));
      for(const edges of adjacent.values())for(const edge of edges) {
        if(edge.kind!=='linkTo'||edge.conditional||edge.from===edge.to||normalize(edge.field).includes('.'))continue;
        if((adjacent.get(edge.to)||[]).some(e=>e.to===edge.from))continue;
        augmented.get(edge.to)?.push({from:edge.to,to:edge.from,field:'<new reverse property>',kind:'missingReverse',missing:true,
          existingLink:edge, sources:edge.sources, conditional:false});
      }
      repairs.push(...search(augmented,source,target,depth,{repairs:true,limit:5}).paths);
    }
    const rawReverse=index.edges.filter(e=>e.kind==='reverse' && e.from===source && !index.edges.some(other=>['linkTo','calculated'].includes(other.kind)&&other.from===e.from&&normalize(other.field)===normalize(e.field)&&other.to===e.to));
    return {source,target,targetField,depth,routes,repairs,reachable:[...allReachable],reachableBeyondLimit:!routes.length&&allReachable.has(target),truncated:result.truncated||candidates.length>12,candidateCount:candidates.length,searchTruncated:result.truncated,
      diagnostics:[...rawReverse.map(e=>`${source}.rev declares ${e.field}, but an exposed linkTo/calculated field was not resolved; it is not treated as an executable path.`), ...(index.warnings?.length ? [`The source index has ${index.warnings.length} diagnostics. Unresolved definitions may hide relationships; review Diagnostics before concluding a schema change is required.`] : [])],
      embedSource:models.get(source).embedded_listSource||models.get(source).source,
      limitations:'Static schema paths, not proof that a particular item has links or permissions. Calculated properties may return nothing. Subtype routes require runtime/schema validation. A schema route does not establish that it is the correct domain relationship. An embed expands existing links; it cannot create a relationship or a new flattened calculated field.'};
  }
  const api={analyze,fields,graph,coverage};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.SmahtPathAnalysis=api;
})(typeof window==='object'?window:globalThis);
