(() => {
  let index;
  const get=id=>document.getElementById(id);
  const dialog=get('path-dialog');
  function targetFields() {
    const model=index?.models.find(m=>m.name===get('path-target').value);
    const previous=get('path-field').value;
    get('path-field').replaceChildren(...window.SmahtPathAnalysis.fields(model).map(f=>{
      const option=el('option',`${f.path} · ${f.field.calculated?'calculated':f.link?'stored link':'stored schema field'}`);
      option.value=f.path;return option;
    }));
    if([...get('path-field').options].some(o=>o.value===previous))get('path-field').value=previous;
    get('path-results').replaceChildren();
  }
  function open(source) {
    if(!index)return;
    if(index.models.some(m=>m.name===source))get('path-source').value=source;
    get('path-results').replaceChildren();
    if(!dialog.open)dialog.showModal();
  }
  function sourceLinks(sources,container) {
    const seen=new Set();
    for(const source of sources||[]){const key=source.file+':'+source.line;if(seen.has(key))continue;seen.add(key);container.append(sourceButton(source));}
  }
  function chain(steps, source) {
    const list=el('div',undefined,'bridge-chain');list.append(badge(source));
    for(const step of steps){
      const part=el('div',undefined,'bridge-step');
      part.append(el('span',`— ${step.field} →`,'bridge-edge'),badge(step.to),badge(step.missing?'Missing reverse link':step.reverse?'Calculated reverse':step.kind==='calculated'?'Calculated':'Stored link',step.missing?'reverse':step.kind));
      if(step.conditional)part.append(el('p',`Conditional: ${step.field} declares ${step.declaredTarget}; this route requires a ${step.to} item.`,'bridge-warning'));
      if(step.owner)part.append(el('small',`Python: ${step.owner}`,'muted'));
      sourceLinks(step.sources,part);list.append(part);
    }
    return list;
  }
  function run(event) {
    event?.preventDefault();
    const results=get('path-results');results.replaceChildren();
    try {
      const report=window.SmahtPathAnalysis.analyze(index,{source:get('path-source').value,target:get('path-target').value,field:get('path-field').value,
        depth:get('path-depth').value,storedOnly:get('path-stored').checked,subtypes:get('path-subtypes').checked});
      const heading=el('div',undefined,'bridge-results-heading');
      heading.append(el('h3',`${report.target}.${report.targetField.path}`),
        badge(report.targetField.field.calculated?'Calculated target':'Stored target'));
      results.append(heading);
      if(report.routes.length)results.append(el('p',`${report.routes.length} ranked routes · ${report.candidateCount} candidates found${report.truncated?' · Limited results':''}. Select a route to view its steps.`,'muted'));
      const notes=el('details',undefined,'bridge-notes');
      notes.append(el('summary',`Analysis notes${report.diagnostics.length?` · ${report.diagnostics.length} notice(s)`:''}${report.truncated?' · Search limits apply':''}`));
      notes.append(el('p',report.limitations));
      notes.append(el('p','Ranking priority: fewer subtype conditions → existing embed (exact, then wildcard) → fewer calculated links → fewer hops → fewer array traversals. Ranking is a structural preference, not proof of the correct domain relationship.'));
      notes.append(el('p',report.targetField.field.calculated?'The target is calculated. Its upstream storage dependencies are not inferred.':'The target is defined as a stored schema field; its presence in an individual raw item is not verified.'));
      sourceLinks(report.targetField.field.sources,notes);
      if(report.truncated)notes.append(el('p','Showing up to 12 ranked routes within Max hops and a 15,000-state search budget. More routes may exist; ranking is limited to discovered candidates.','bridge-warning'));
      for(const note of report.diagnostics)notes.append(el('p',note,'bridge-warning'));
      notes.append(el('p','Use the full embed path on the starting type. Intermediate types do not each need the same entry. Arrays remain arrays; embedding does not flatten or aggregate values.'));
      report.routes.forEach((route,i)=>{
        const card=el('details',undefined,'bridge-card');
        const summary=el('summary',undefined,'bridge-summary');
        summary.append(el('strong',`#${i+1}`),el('code',route.embed.path,'bridge-path'),
          el('span',`${route.steps.length} hop(s)`,'muted'),
          badge(({present:'Embed already present',wildcard:'Covered by wildcard',automatic:'Check defaults',local:'No embed needed',missing:'Embed entry missing'})[route.embed.status]));
        if(route.conditional)summary.append(badge('Conditional','reverse'));
        if(route.calculated)summary.append(badge('Calculated','calculated'));
        card.append(summary,chain(route.steps,report.source));
        card.append(el('p',route.ranking.reasons.join(' · '),'note'));
        card.append(el('p',route.embed.message));
        if(route.conditional)card.append(el('p','Validate this subtype-specific route against the runtime registry before adding the embed.','bridge-warning'));
        const code=el('pre',route.steps.length?JSON.stringify(route.embed.path):report.targetField.path);card.append(code);
        if(route.embed.matches.length)card.append(el('p','Matched: '+route.embed.matches.join(', '),'muted'));
        if(report.embedSource)card.append(sourceButton(report.embedSource,`Open ${report.source} embed definition ↗`));
        if(route.embed.status==='missing')card.append(el('p',`After validating this route, add the path to ${report.source}.embedded_list.`,'muted'));
        results.append(card);
      });
      if(!report.routes.length) {
        results.append(el('h3',report.reachableBeyondLimit?'A route exists beyond the listing limits':'No traversable route found in the resolved graph'));
        results.append(el('p',report.reachableBeyondLimit?'Increase Max hops or narrow the route options. Do not treat a search limit as a missing relationship.':`From ${report.source}, ${report.reachable.length} types are reachable with these options. An embed string alone cannot bridge to ${report.target}.`));
        for(const steps of report.repairs){
          const card=el('details',undefined,'bridge-card');card.append(el('summary',`Possible repair · ${[report.source,...steps.map(s=>s.to)].join(' → ')} · one missing reverse link`),chain(steps,report.source));
          const missing=steps.find(s=>s.missing),existing=missing.existingLink;
          card.append(el('p',`${existing.from}.${existing.field} already points to ${existing.to}. To traverse the other direction, ${missing.from} needs a named property returning links to ${missing.to}. A calculated reverse property with a matching rev mapping may provide it, if that relationship fits the domain.`));
          card.append(el('p','Proposal only: there is no copy-ready embed until the missing property is implemented and validated. Reverse links may return multiple items.','bridge-warning'));results.append(card);
        }
        if(!report.reachableBeyondLimit&&!report.repairs.length)results.append(el('p',`No one-reverse-link repair was found within ${report.depth} hops. Consider a stored linkTo to ${report.target}, or a calculated property that returns its links. The join key and relationship must be defined by the domain; no automatic match is assumed.`,'note'));
      }
      results.append(notes);
    } catch(error){results.append(el('p',error.message,'bridge-warning'));}
  }
  get('open-path-finder').onclick=()=>open(selected);
  get('entity-path-finder').onclick=()=>open(window.SmahtEntitySelection?.()||selected);
  get('close-path-finder').onclick=()=>dialog.close();
  get('path-form').onsubmit=run;
  get('path-target').onchange=targetFields;
  for(const id of ['path-source','path-field','path-depth','path-stored','path-subtypes'])get(id).addEventListener('change',()=>get('path-results').replaceChildren());
  window.addEventListener('message',event=>{
    if (event.source !== window || event.origin !== location.origin) return;
    if(event.data.type!=='data')return;index=event.data.data;
    for(const id of ['path-source','path-target']){const value=get(id).value;get(id).replaceChildren(...index.models.map(m=>{const option=el('option',m.name);option.value=m.name;return option;}));if(index.models.some(m=>m.name===value))get(id).value=value;}
    if(!get('path-target').dataset.initialized){get('path-target').value=index.models.some(m=>m.name==='Donor')?'Donor':index.models[0]?.name;get('path-target').dataset.initialized='true';}
    targetFields();get('open-path-finder').disabled=false;get('entity-path-finder').disabled=false;
  });
  window.SmahtPathFinder={open};
})();
