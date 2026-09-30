/* Full model graph. No CDN or external diagram service is used. */
(() => {
  const get = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const width = 236, height = 66;
  let index, nodes = [], groups = [], positions = new Map(), selectedType, active = false;
  let camera = { x: 0, y: 0, scale: 1 }, drag;
  let fullscreen = false, previousCamera, previousScroll;
  let allPositions = new Map();
  const kinds = new Set(['linkTo', 'calculated', 'reverse']);
  const colors = {linkTo: '#58a6ff', calculated: '#c49aff', reverse: '#e9b66b'};
  const svg = get('entity-svg');
  const defaults = ['User', 'Consortium', 'Consortia'];
  const savedHidden = vscode.getState()?.hiddenEntityTypes;
  const hiddenTypes = new Set(Array.isArray(savedHidden) ? savedHidden.filter(name => typeof name === 'string') : defaults);
  function updateTypeCount() {
    get('entity-type-count').textContent = `${nodes.filter(n => !hiddenTypes.has(n.name)).length}/${nodes.length}`;
  }
  function applyTypeVisibility() {
    vscode.setState({ ...vscode.getState(), hiddenEntityTypes: [...hiddenTypes] });
    if (hiddenTypes.has(selectedType)) { selectedType = null; get('entity-neighbors').checked = false; }
    get('entity-results').replaceChildren();
    updateTypeCount(); refreshNeighborhood();
  }
  function renderTypePicker() {
    updateTypeCount();
    const term = get('entity-type-search').value.trim().toLowerCase();
    const list = get('entity-type-list'); list.replaceChildren();
    for (const node of nodes.filter(n => n.name.toLowerCase().includes(term))) {
      const label = el('label'), input = el('input');
      input.type = 'checkbox'; input.checked = !hiddenTypes.has(node.name); input.dataset.type = node.name;
      input.onchange = () => { input.checked ? hiddenTypes.delete(node.name) : hiddenTypes.add(node.name); applyTypeVisibility(); };
      label.append(input, el('span', node.name)); list.append(label);
    }
    if (!list.children.length) list.append(el('p', 'No matching types.', 'muted'));
  }
  get('entity-type-search').oninput = renderTypePicker;
  for (const action of ['all', 'none', 'defaults']) get(`entity-types-${action}`).onclick = () => {
    hiddenTypes.clear();
    if (action === 'none') nodes.forEach(n => hiddenTypes.add(n.name));
    if (action === 'defaults') defaults.forEach(name => hiddenTypes.add(name));
    applyTypeVisibility(); renderTypePicker();
  };
  function element(tag, attrs, text) {
    const value = document.createElementNS(NS, tag);
    for (const [key, attr] of Object.entries(attrs || {})) value.setAttribute(key, attr);
    if (text !== undefined) value.textContent = text;
    return value;
  }
  function build() {
    const byName = new Map(index.models.map(model => [model.name, model]));
    for (const edge of index.edges) for (const name of [edge.from, edge.to]) if (!byName.has(name)) byName.set(name, null);
    nodes = [...byName].sort(([a], [b]) => a.localeCompare(b)).map(([name, model], i) => ({name, model, i}));
    const grouped = new Map();
    for (const edge of index.edges) {
      const key = JSON.stringify([edge.from, edge.to, edge.kind, !!edge.reverse]);
      if (!grouped.has(key)) grouped.set(key, {from:edge.from, to:edge.to, kind:edge.kind, reverse:!!edge.reverse, edges:[]});
      grouped.get(key).edges.push(edge);
    }
    groups = [...grouped.values()];
    if (hiddenTypes.has(selectedType) || !nodes.some(n => n.name === selectedType)) { selectedType = null; get('entity-neighbors').checked = false; }
    layout(); renderTypePicker();
  }
  function layout() {
    const points = nodes.map((n, i) => ({name:n.name, x:Math.cos(i * 2.39996) * Math.sqrt(i + 1) * 190,
      y:Math.sin(i * 2.39996) * Math.sqrt(i + 1) * 150, vx:0, vy:0}));
    const map = new Map(points.map(p => [p.name, p]));
    const unique = new Map();
    for (const e of groups) if (e.from !== e.to) unique.set([e.from,e.to].sort().join('\0'), e);
    // Deterministic spring layout, followed by rectangle collision resolution.
    for (let iteration = 0; iteration < 260; iteration++) {
      const cooling = 1 - iteration / 300;
      for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
        const a = points[i], b = points[j];
        const dx = a.x - b.x || .01, dy = a.y - b.y || .01;
        const distance = Math.max(50, Math.hypot(dx, dy));
        const force = Math.min(18, 90000 / (distance * distance));
        a.vx += dx / distance * force; a.vy += dy / distance * force;
        b.vx -= dx / distance * force; b.vy -= dy / distance * force;
      }
      for (const e of unique.values()) {
        const a = map.get(e.from), b = map.get(e.to);
        const dx = b.x - a.x, dy = b.y - a.y, distance = Math.max(1, Math.hypot(dx, dy));
        const force = (distance - 360) * .012;
        a.vx += dx / distance * force; a.vy += dy / distance * force;
        b.vx -= dx / distance * force; b.vy -= dy / distance * force;
      }
      for (const p of points) {
        p.vx = (p.vx - p.x * .0008) * .65; p.vy = (p.vy - p.y * .0008) * .65;
        p.x += Math.max(-25, Math.min(25, p.vx)) * cooling;
        p.y += Math.max(-25, Math.min(25, p.vy)) * cooling;
      }
    }
    for (let pass = 0; pass < 120; pass++) {
      let overlaps = false;
      for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
        const a = points[i], b = points[j], dx = b.x - a.x, dy = b.y - a.y;
        const overlapX = width + 28 - Math.abs(dx), overlapY = height + 32 - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;
        overlaps = true;
        if (overlapX < overlapY) { const shift = (overlapX / 2 + 1) * (dx >= 0 ? 1 : -1); a.x -= shift; b.x += shift; }
        else { const shift = (overlapY / 2 + 1) * (dy >= 0 ? 1 : -1); a.y -= shift; b.y += shift; }
      }
      if (!overlaps) break;
    }
    allPositions = map;
    positions = map;
    if (get('entity-neighbors').checked) layoutNeighbors();
  }
  function connected() {
    const names = new Set([selectedType]);
    for (const g of groups) if (relationshipVisible(g, kinds) && (g.from === selectedType || g.to === selectedType)) { names.add(g.from); names.add(g.to); }
    return names;
  }
  function visibleNodes() {
    const neighbors = connected();
    return nodes.filter(n => !hiddenTypes.has(n.name) && (!get('entity-neighbors').checked || neighbors.has(n.name)));
  }
  function layoutNeighbors() {
    if (!get('entity-neighbors').checked || !selectedType) { positions = allPositions; return; }
    const others = visibleNodes().filter(n => n.name !== selectedType);
    const rect = svg.getBoundingClientRect();
    const vw = rect.width || 1000, vh = rect.height || 650;
    const stepX = width + 180, stepY = height + 100;
    // Choose an odd grid with a reserved center, maximizing readable card size.
    let best = {columns:1, rows:1, score:-Infinity};
    const limit = Math.max(3, others.length + 1);
    for (let columns = 1; columns <= limit; columns += 2) {
      let rows = Math.ceil((others.length + 1) / columns);
      if (rows % 2 === 0) rows++;
      const w = (columns - 1) * stepX + width + 120;
      const h = (rows - 1) * stepY + height + 120;
      const score = Math.min(vw / w, vh / h);
      if (score > best.score) best = {columns, rows, score};
    }
    const slots = [];
    for (let row = -(best.rows-1)/2; row <= (best.rows-1)/2; row++) {
      for (let column = -(best.columns-1)/2; column <= (best.columns-1)/2; column++) {
        if (row || column) slots.push({x:column*stepX, y:row*stepY});
      }
    }
    slots.sort((a,b) => Math.hypot(a.x/vw,a.y/vh)-Math.hypot(b.x/vw,b.y/vh) || a.y-b.y || a.x-b.x);
    const map = new Map([[selectedType, {name:selectedType,x:0,y:0}]]);
    // Incoming-only types favor the left; outgoing types favor the right.
    for (const n of others) {
      const outgoing = groups.some(g => relationshipVisible(g, kinds) && g.from === selectedType && g.to === n.name);
      const preferred = slots.findIndex(p => outgoing ? p.x > 0 : p.x < 0);
      const point = slots.splice(preferred >= 0 ? preferred : 0, 1)[0];
      map.set(n.name, {name:n.name,...point});
    }
    positions = map;
  }
  function refreshNeighborhood() { layoutNeighbors(); draw(); fit(); }
  function transform() {
    get('entity-world')?.setAttribute('transform', `translate(${camera.x} ${camera.y}) scale(${camera.scale})`);
    get('entity-zoom-label').textContent = `${Math.round(camera.scale * 100)}%`;
  }
  function fit() {
    const visible = visibleNodes(); if (!visible.length) return;
    const rect = svg.getBoundingClientRect();
    const vw = rect.width || 1000, vh = rect.height || 650;
    const xs = visible.map(n => positions.get(n.name).x), ys = visible.map(n => positions.get(n.name).y);
    const left = Math.min(...xs) - width / 2 - 60, right = Math.max(...xs) + width / 2 + 60;
    const top = Math.min(...ys) - height / 2 - 60, bottom = Math.max(...ys) + height / 2 + 60;
    camera.scale = Math.max(.05, Math.min(1.5, vw / (right-left), vh / (bottom-top)));
    camera.x = (vw - (left+right)*camera.scale) / 2; camera.y = (vh - (top+bottom)*camera.scale) / 2;
    transform();
  }
  function zoom(factor, x, y) {
    const rect = svg.getBoundingClientRect();
    x ??= (rect.width || 1000)/2; y ??= (rect.height || 650)/2;
    const old = camera.scale; camera.scale = Math.max(.05, Math.min(3, old * factor));
    camera.x = x - (x-camera.x)*camera.scale/old; camera.y = y - (y-camera.y)*camera.scale/old; transform();
  }
  function endpoint(a, b) {
    const dx = b.x-a.x, dy = b.y-a.y;
    const scale = Math.min(dx ? width/2/Math.abs(dx) : Infinity, dy ? height/2/Math.abs(dy) : Infinity);
    return {x:a.x + dx*scale, y:a.y + dy*scale};
  }
  function edgeDetail(group) {
    const rows = group.edges.map(e => ({from:e.from, field:e.field, to:e.to, kind:relationshipLabel(e), ...(e.via ? {reverseField:e.via} : {})}));
    const sources = group.edges.flatMap(e => index.models.find(m => m.name === e.from)?.fields.find(f => f.name === e.field.split('.')[0].replaceAll('[]',''))?.sources || []);
    showDetail(`${group.from} → ${group.to}`, rows, sources, `${group.edges.length} ${relationshipLabel(group)} relationship(s). [] denotes an array; arrows point from the declaring type to the referenced type.`);
  }
  function draw() {
    if (!index) return;
    get('entity-neighbors').disabled = !selectedType;
    get('entity-show-neighborhood').disabled = !selectedType;
    svg.replaceChildren();
    const defs = element('defs');
    for (const kind of ['linkTo','calculated','reverse']) {
      const marker = element('marker', {id:`entity-arrow-${kind}`, viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto'});
      marker.append(element('path',{d:'M0 0L10 5L0 10z',fill:colors[kind]})); defs.append(marker);
    }
    svg.append(defs);
    const world = element('g',{id:'entity-world'}); svg.append(world);
    const visible = visibleNodes(), names = new Set(visible.map(n=>n.name)), neighbors = connected();
    const occupied = visible.map(n => { const p=positions.get(n.name);return {x:p.x-width/2-8,y:p.y-height/2-8,w:width+16,h:height+16}; });
    function placeLabel(a,b,text) {
      const w = text.length * 6.5 + 12, h = 18;
      const candidates = [];
      if(a===b) candidates.push({x:a.x,y:a.y-100});
      else for(const t of [.5,.35,.65,.2,.8]) for(const dy of [-12,12,-32,32,-52,52]) candidates.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t+dy});
      for(const p of candidates) {
        const box={x:p.x-w/2,y:p.y-h+3,w,h};
        if(occupied.some(r=>box.x<r.x+r.w && box.x+box.w>r.x && box.y<r.y+r.h && box.y+box.h>r.y))continue;
        occupied.push(box);return p;
      }
      return null; // The full field list remains available on the edge and below.
    }
    const term = get('entity-search').value.trim().toLowerCase();
    const visibleGroups = groups.filter(g=>relationshipVisible(g, kinds) && names.has(g.from) && names.has(g.to));
    for (const group of visibleGroups) {
      const a = positions.get(group.from), b = positions.get(group.to);
      const incident = selectedType && (group.from === selectedType || group.to === selectedType);
      let d;
      if (group.from === group.to) d=`M${a.x+70} ${a.y-height/2} C${a.x+160} ${a.y-130},${a.x-160} ${a.y-130},${a.x-70} ${a.y-height/2}`;
      else {
        const start=endpoint(a,b),end=endpoint(b,a);
        const offset = {linkTo:0,calculated:20,reverse:-20}[group.kind];
        const length=Math.max(1,Math.hypot(b.x-a.x,b.y-a.y));
        d=`M${start.x} ${start.y} Q${(start.x+end.x)/2-(b.y-a.y)/length*offset} ${(start.y+end.y)/2+(b.x-a.x)/length*offset} ${end.x} ${end.y}`;
      }
      const line=element('path',{d,class:`entity-edge ${group.kind}${incident?' incident':''}${selectedType&&!incident?' dim':''}`,'marker-end':`url(#entity-arrow-${group.kind})`,tabindex:0,role:'button','aria-label':`${group.from} to ${group.to}: ${group.edges.length} ${group.kind} fields`});
      line.append(element('title',{},group.edges.map(e=>`${e.from}.${e.field} → ${e.to}${e.via?'.'+e.via:''} (${relationshipLabel(e)})`).join('\n')));
      line.onclick=()=>edgeDetail(group); line.onkeydown=e=>{if(e.key==='Enter')edgeDetail(group);}; world.append(line);
      if (incident) {
        const first = group.edges[0].field;
        const text = (first.length > 30 ? first.slice(0,28) + '…' : first) + (group.edges.length > 1 ? ` (+${group.edges.length-1})` : '');
        const labelPosition = placeLabel(a,b,text);
        if (!labelPosition) continue;
        const label = element('text', {x:labelPosition.x, y:labelPosition.y, class:'entity-edge-label', 'text-anchor':'middle',tabindex:0,role:'button','aria-label':`${group.from} to ${group.to}: ${group.edges.length} fields`},text);
        label.onclick=()=>edgeDetail(group);label.onkeydown=e=>{if(e.key==='Enter')edgeDetail(group);};
        world.append(label);
      }
    }
    for (const n of visible) {
      const p=positions.get(n.name), hit=term && n.name.toLowerCase().includes(term);
      const group=element('g',{'data-entity':n.name,transform:`translate(${p.x} ${p.y})`,class:`entity-node${n.name===selectedType?' selected':''}${hit?' match':''}${selectedType&&!neighbors.has(n.name)?' dim':''}`,tabindex:0,role:'button','aria-label':n.name});
      group.append(element('rect',{x:-width/2,y:-height/2,width,height,rx:8}),element('text',{x:-width/2+12,y:-5},n.name.length>29?n.name.slice(0,27)+'…':n.name),element('text',{x:-width/2+12,y:16,class:'subtitle'},n.model?`${n.model.fields.length} fields · ${n.model.fields.filter(f=>f.calculated).length} calculated`:'Referenced type · no local definition'));
      group.append(element('title',{},`${n.name}\n${n.model?.schema?.description||''}`));
      group.onclick=()=>{if(!drag?.moved) choose(n.name);};
      group.ondblclick=()=>explore(n.name);
      group.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();choose(n.name);}};
      world.append(group);
    }
    if (!visible.length) svg.append(element('text', {x:20,y:40,class:'entity-empty'}, 'No types visible. Open Types to select schemas.'));
    transform();
    get('entity-count').textContent=`${visible.length} types · ${visibleGroups.reduce((sum,g)=>sum+g.edges.length,0)} relationships (${visibleGroups.length} grouped edges)`;
    details();
  }
  function choose(name) {
    if(hiddenTypes.has(name))return;
    selectedType=name;
    if (get('entity-neighbors').checked) refreshNeighborhood(); else draw();
  }
  function explore(name=selectedType) {
    if (!index.models.some(m=>m.name===name)) return;
    close();select(name);document.querySelector('.overview').scrollIntoView?.({block:'start'});
  }
  function details() {
    const target=get('entity-details');target.replaceChildren();
    if(!selectedType){target.append(el('p','Select a type to highlight its neighbors and inspect its relationships.','muted'));return;}
    const header=el('div',undefined,'section-title');header.append(el('h3',selectedType));
    if(index.models.some(m=>m.name===selectedType))header.append(button('Explore item type →',()=>explore()));
    header.append(button('Clear selection',()=>{selectedType=null;get('entity-neighbors').checked=false;refreshNeighborhood();}));target.append(header);
    const edges=index.edges.filter(e=>relationshipVisible(e, kinds)&&!hiddenTypes.has(e.from)&&!hiddenTypes.has(e.to)&&(e.from===selectedType||e.to===selectedType));
    for(const edge of edges){const row=el('div',undefined,'relation');row.append(badge(relationshipLabel(edge),edge.kind),el('span',`${edge.from}.${edge.field} → ${edge.to}${edge.via?'.'+edge.via:''}`,'path'),button('Inspect',()=>edgeDetail({from:edge.from,to:edge.to,kind:edge.kind,reverse:!!edge.reverse,edges:[edge]})));target.append(row);}
    if(!edges.length)target.append(el('p','No relationships for the selected filters.','muted'));
  }
  function setFullscreen(value) {
    if (value === fullscreen) return;
    if (value) {
      previousCamera = { ...camera };
      previousScroll = document.scrollingElement?.scrollTop || 0;
    }
    fullscreen = value;
    document.body.classList.toggle('entity-fullscreen', value);
    get('entity-fullscreen').textContent = value ? 'Exit full screen ⛶' : 'Full screen ⛶';
    get('entity-fullscreen').setAttribute('aria-pressed', String(value));
    get('entity-fullscreen').title = value ? 'Exit full screen (Esc)' : 'Fill the editor area (Esc to exit)';
    if (get('entity-neighbors').checked) { layoutNeighbors(); draw(); }
    if (value) fit();
    else {
      camera = previousCamera || camera; transform();
      if (document.scrollingElement) document.scrollingElement.scrollTop = previousScroll;
    }
    get('entity-fullscreen').focus();
  }
  get('entity-fullscreen').onclick = () => setFullscreen(!fullscreen);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && fullscreen && !get('detail').open && !get('path-dialog').open) {
      event.preventDefault(); setFullscreen(false);
    }
  });
  function open() {
    if(!index)return;
    active=true;get('entity-panel').hidden=false;document.querySelector('main').hidden=true;document.querySelector('.live-item').hidden=true;
    get('open-entity').setAttribute('aria-pressed','true');get('open-entity').textContent='Item view';
    if(get('entity-neighbors').checked)layoutNeighbors();
    draw();fit();
  }
  function close() {
    setFullscreen(false);
    active=false;get('entity-panel').hidden=true;document.querySelector('main').hidden=false;document.querySelector('.live-item').hidden=false;
    get('open-entity').setAttribute('aria-pressed','false');get('open-entity').textContent='All schemas';
  }
  window.SmahtEntitySelection = () => selectedType;
  get('open-entity').onclick=()=>active?close():open();
  get('entity-fit').onclick=fit; get('entity-zoom-in').onclick=()=>zoom(1.25);get('entity-zoom-out').onclick=()=>zoom(.8);
  get('entity-relayout').onclick=()=>{layout();draw();fit();};
  get('entity-neighbors').onchange=refreshNeighborhood;
  get('entity-show-neighborhood').onclick=()=>{
    if(!selectedType)return;
    // Add just the one-hop neighborhood; unrelated checkbox choices are preserved.
    for(const name of connected()) hiddenTypes.delete(name);
    get('entity-neighbors').checked=true;
    applyTypeVisibility(); renderTypePicker();
    get('entity-type-picker').open=false;
  };
  get('entity-search').oninput=()=>{
    const term=get('entity-search').value.trim().toLowerCase();
    const matches=nodes.filter(n=>!hiddenTypes.has(n.name)&&n.name.toLowerCase().includes(term));
    const results=get('entity-results');results.replaceChildren();
    if(term){for(const n of matches.slice(0,12))results.append(button(n.name,()=>{choose(n.name);if(get('entity-neighbors').checked)return;const p=positions.get(n.name),r=svg.getBoundingClientRect();camera={scale:1,x:(r.width||1000)/2-p.x,y:(r.height||650)/2-p.y};transform();}));if(!matches.length)results.append(el('span','No matching types.','muted'));}
    draw();
  };
  for(const kind of ['linkTo','calculated','reverse']){
    const label=el('label'),input=el('input');input.type='checkbox';input.checked=true;input.dataset.kind=kind;
    input.onchange=()=>{input.checked?kinds.add(kind):kinds.delete(kind);if(get('entity-neighbors').checked)refreshNeighborhood();else draw();};label.append(input,badge(labels[kind],kind));get('entity-filters').append(label);
  }
  svg.addEventListener('wheel',event=>{event.preventDefault();const rect=svg.getBoundingClientRect();zoom(Math.exp(-event.deltaY*.0015),event.clientX-rect.left,event.clientY-rect.top);},{passive:false});
  svg.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    const node=event.target.closest('[data-entity]');
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,node:node?.getAttribute('data-entity'),moved:false};
    svg.setPointerCapture?.(event.pointerId);
  });
  svg.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(!dx&&!dy)return;
    drag.moved=true;drag.x=event.clientX;drag.y=event.clientY;
    if(drag.node){const p=positions.get(drag.node);p.x+=dx/camera.scale;p.y+=dy/camera.scale;draw();}
    else{camera.x+=dx;camera.y+=dy;transform();}
  });
  svg.addEventListener('pointerup',event=>{if(drag?.id===event.pointerId){const previous=drag;svg.releasePointerCapture?.(event.pointerId);if(!previous.moved&&previous.node)choose(previous.node);setTimeout(()=>{if(drag===previous)drag=null;},0);}});
  svg.addEventListener('pointercancel',()=>{drag=null;});
  svg.addEventListener('keydown',event=>{if(event.target!==svg)return;const directions={ArrowLeft:[50,0],ArrowRight:[-50,0],ArrowUp:[0,50],ArrowDown:[0,-50]};if(directions[event.key]){event.preventDefault();camera.x+=directions[event.key][0];camera.y+=directions[event.key][1];transform();}});
  window.addEventListener('message',event=>{
    if (event.source !== window || event.origin !== location.origin) return;if(event.data.type==='data'){index=event.data.data;get('open-entity').disabled=false;build();if(active){draw();fit();}}});
})();
