/* All model text is inserted through textContent; no workspace HTML is evaluated. */
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : { postMessage() {}, getState() {}, setState() {} };
const $ = id => document.getElementById(id);
let data, selected, tab = 'fields', query = '';
let navigation = [], navigationPosition = -1;
let listQueries = { fields: '', embeds: '', diagnostics: '' };
const enabled = new Set(['linkTo', 'calculated', 'reverse']);
function relationshipVisible(edge, filters) { return filters.has(edge.kind) || !!edge.reverse && filters.has('reverse'); }
function relationshipLabel(edge) { return edge.reverse && edge.kind === 'calculated' ? 'Calculated · Reverse' : labels[edge.kind]; }
const labels = { linkTo: 'Link', calculated: 'Calculated', reverse: 'Reverse' };
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, action, className) { const node = el('button', text, className); node.onclick = action; return node; }
function sourceButton(source, label) {
  return button(label || `${source.file.split('/').slice(-2).join('/')}:${source.line}`, () => vscode.postMessage({ type: 'source', ...source }));
}
function badge(text, kind) { return el('span', text, `badge ${kind || ''}`); }
// Follow only the value schema and array items, not links inside object properties.
function fieldLinkTargets(schema) {
  const targets = new Set();
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    const links = Array.isArray(value.linkTo) ? value.linkTo : [value.linkTo];
    links.filter(link => typeof link === 'string').forEach(link => targets.add(link));
    if (Array.isArray(value.items)) value.items.forEach(visit);
    else visit(value.items);
    for (const keyword of ['anyOf', 'oneOf', 'allOf', 'prefixItems']) {
      if (Array.isArray(value[keyword])) value[keyword].forEach(visit);
    }
  }
  visit(schema);
  return [...targets];
}
function current() { return data?.models.find(m => m.name === selected); }
function navigationSnapshot() {
  const graph = document.querySelector('.graph-wrap');
  return { name: selected, tab, listQueries: { ...listQueries }, query: $('search').value, filters: [...enabled],
    graphTop: graph.scrollTop, graphLeft: graph.scrollLeft };
}
function saveNavigationPosition() {
  if (navigationPosition >= 0) navigation[navigationPosition] = navigationSnapshot();
}
function updateNavigationButtons() {
  const previous = navigation.slice(0, navigationPosition).some(entry => data?.models.some(m => m.name === entry.name));
  const next = navigation.slice(navigationPosition + 1).some(entry => data?.models.some(m => m.name === entry.name));
  $('schema-back').disabled = !previous;
  $('schema-forward').disabled = !next;
}
function select(name, restored = null) {
  const model = data.models.find(m => m.name === name || m.itemType === name);
  const next = (model || data.models[0])?.name;
  const changed = selected !== next;
  if (!restored && (changed || navigationPosition < 0)) {
    saveNavigationPosition();
    navigation = navigation.slice(0, navigationPosition + 1);
    navigation.push({ name: next });
    if (navigation.length > 100) navigation.shift();
    navigationPosition = navigation.length - 1;
  }
  selected = next;
  if (restored) {
    tab = restored.tab;
    listQueries = { fields: '', embeds: '', diagnostics: '', ...restored.listQueries };
    $('search').value = restored.query;
    query = restored.query.toLowerCase();
    enabled.clear(); restored.filters.forEach(kind => enabled.add(kind));
    document.querySelectorAll('#filters input').forEach(input => { input.checked = enabled.has(input.dataset.kind); });
    document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  }
  $('types').value = selected || '';
  vscode.setState({ ...vscode.getState(), selected });
  vscode.postMessage({ type: 'select', name: selected });
  render();
  const graph = document.querySelector('.graph-wrap');
  if (restored || changed) {
    graph.scrollTop = restored?.graphTop || 0;
    graph.scrollLeft = restored?.graphLeft || 0;
  }
  saveNavigationPosition();
  updateNavigationButtons();
  if (restored) window.SmahtItemView?.render();
}
function travel(direction) {
  let destination = navigationPosition + direction;
  while (destination >= 0 && destination < navigation.length) {
    if (data?.models.some(m => m.name === navigation[destination].name)) break;
    destination += direction;
  }
  if (destination < 0 || destination >= navigation.length) return;
  saveNavigationPosition();
  navigationPosition = destination;
  select(navigation[destination].name, navigation[destination]);
}
function matches(value) { return String(value).toLowerCase().includes(query); }
function showDetail(title, schema, sources = [], intro) {
  const target = $('detail-content'); target.replaceChildren(el('h2', title));
  if (intro) target.append(el('p', intro, 'description'));
  const links = el('div', undefined, 'sources');
  const seen = new Set();
  sources.forEach(source => { const key = source.file + ':' + source.line; if (!seen.has(key)) links.append(sourceButton(source)); seen.add(key); });
  target.append(links, el('pre', JSON.stringify(schema, null, 2)));
  if (!$('detail').open) $('detail').showModal();
}
function fieldDetail(field) {
  if (window.SmahtItemView?.showField(field, selected)) return;
  showDetail(field.name, field.schema, field.sources,
    [field.calculated ? `Calculated · ${field.owner}` : 'JSON field', field.required ? 'Required' : 'Not in the top-level required list'].join(' · '));
}
function relationDetail(edge) {
  const model = data.models.find(m => m.name === edge.from);
  const field = model?.fields.find(f => f.name === edge.field.split('.')[0].replaceAll('[]', ''));
  if (field) fieldDetail(field);
  else showDetail(edge.field, edge, model?.revSource ? [model.revSource] : []);
}
function relevantEdges() {
  return data.edges.filter(edge => (edge.from === selected || edge.to === selected) && relationshipVisible(edge, enabled)
    && matches(`${edge.from} ${edge.to} ${edge.field} ${edge.via || ''}`));
}
const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, text) {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs || {})) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
function drawGraph(edges) {
  const graph = $('graph'); graph.replaceChildren();
  const targets = [...new Set(edges.map(e => e.from === selected ? e.to : e.from))].sort();
  const width = 800, height = Math.max(220, targets.length * 70 + 45);
  graph.setAttribute('viewBox', `0 0 ${width} ${height}`);
  graph.setAttribute('height', height);
  const defs = svgEl('defs');
  for (const [kind, color] of [['linkTo', '#58a6ff'], ['calculated', '#c49aff'], ['reverse', '#e9b66b']]) {
    const marker = svgEl('marker', { id: `arrow-${kind}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
    marker.append(svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: color })); defs.append(marker);
  }
  graph.append(defs);
  const cy = height / 2;
  targets.forEach((target, i) => {
    const y = 40 + i * 70;
    const grouped = edges.filter(e => (e.from === selected ? e.to : e.from) === target);
    const kinds = [...new Set(grouped.map(e => e.kind))];
    kinds.forEach((kind, k) => {
      const subset = grouped.filter(e => e.kind === kind);
      const offset = (k - (kinds.length - 1) / 2) * 12;
      const outgoing = subset.some(e => e.from === selected);
      const incoming = subset.some(e => e.to === selected && e.from !== selected);
      const line = svgEl('path', { d: `M 245 ${cy + offset} C 385 ${cy + offset}, 435 ${y + offset}, 570 ${y + offset}`, class: `edge ${kind}`,
        ...(outgoing ? { 'marker-end': `url(#arrow-${kind})` } : {}), ...(incoming ? { 'marker-start': `url(#arrow-${kind})` } : {}) });
      line.append(svgEl('title', {}, subset.map(e => `${e.from}.${e.field} → ${e.to}`).join('\n'))); graph.append(line);
    });
    const label = svgEl('text', { x: 445, y: y - 10, class: 'edge-label', 'text-anchor': 'middle', tabindex: 0, role: 'button' },
      grouped[0].field.length > 27 ? grouped[0].field.slice(0, 25) + '…' : grouped[0].field);
    label.append(svgEl('title', {}, grouped.map(e => e.field).join('\n')));
    label.onclick = () => relationDetail(grouped[0]);
    label.onkeydown = event => { if (event.key === 'Enter') relationDetail(grouped[0]); };
    graph.append(label);
    node(target, 570, y - 23, false, `${grouped.length} connections${target === selected ? ' · self link' : ''}`);
  });
  node(selected, 25, cy - 25, true, `${current().fields.length} fields · ${current().embeds.length} embed`);
  function node(name, x, y, isCurrent, subtitle) {
    const available = data.models.some(m => m.name === name);
    const group = svgEl('g', { class: `node ${isCurrent ? 'current' : ''}`, tabindex: 0, role: 'button', 'aria-label': name });
    group.append(svgEl('rect', { x, y, width: 220, height: 50, rx: 7 }),
      svgEl('text', { x: x + 12, y: y + 20 }, name.length > 28 ? name.slice(0, 26) + '…' : name),
      svgEl('text', { x: x + 12, y: y + 37, class: 'subtitle' }, available ? subtitle : 'Source type not indexed'));
    group.append(svgEl('title', {}, name));
    group.onclick = () => { if (available) select(name); };
    group.onkeydown = event => { if (event.key === 'Enter' && available) select(name); };
    graph.append(group);
  }
}
function render() {
  const model = current(); if (!model) return;
  const heading = $('heading'); heading.replaceChildren(el('h3', model.name), el('p', model.schema.description || model.itemType, 'description'));
  const counts = el('div', undefined, 'counts');
  counts.append(badge(`${model.fields.length} fields`), badge(`${model.fields.filter(f => f.calculated).length} calculated`, 'calculated'), sourceButton(model.source, 'Python ↗'));
  if (model.schemaSource) counts.append(sourceButton(model.schemaSource, 'JSON ↗'));
  heading.append(counts);
  const inheritance = $('inheritance');
  const inheritanceLabel = el('span', 'Inheritance (MRO)', 'muted');
  inheritanceLabel.title = 'Method Resolution Order: after the selected class, Python searches these base classes from left to right for methods and attributes.';
  inheritance.replaceChildren(inheritanceLabel);
  model.bases.forEach(base => { const b = sourceButton(base.source, base.id + ' ↗'); b.title = base.id; inheritance.append(b); });
  const edges = relevantEdges(); drawGraph(edges);
  const relations = $('relations'); relations.replaceChildren();
  edges.forEach(edge => {
    const row = el('div', undefined, 'relation');
    row.append(badge(relationshipLabel(edge), edge.kind), el('span', `${edge.from}.${edge.field} → ${edge.to}${edge.via ? '.' + edge.via : ''}`, 'path'), button('Inspect', () => relationDetail(edge)));
    relations.append(row);
  });
  if (!edges.length) relations.append(el('p', 'No relationships match this filter.', 'empty'));
  renderContent();
}
function renderContent() {
  const model = current(); if (!model) return;
  const content = $('content'); content.replaceChildren();
  $('list-search').value = listQueries[tab];
  $('list-search').placeholder = tab === 'fields' ? 'Search names, types or link targets…' : tab === 'embeds' ? 'Search embed paths…' : 'Search diagnostics…';
  $('list-search').setAttribute('aria-label', `Search ${tab}`);
  $('clear-list-search').disabled = !listQueries[tab];
  const localQuery = listQueries[tab].trim().toLowerCase();
  const listMatches = text => matches(text) && String(text).toLowerCase().includes(localQuery);
  let shown = 0, total = 0;
  if (tab === 'fields') {
    total = model.fields.length;
    model.fields.filter(f => listMatches(f.name + ' ' + JSON.stringify(f.schema) + (f.calculated ? ' calculated' : ''))).sort((a, b) => a.name.localeCompare(b.name)).forEach(field => {
      shown++;
      const row = button('', () => fieldDetail(field), 'row');
      row.append(el('span', field.name + (field.required ? ' *' : ''), 'name'));
      const metadata = el('span', undefined, 'field-metadata');
      metadata.append(el('small', Array.isArray(field.schema.type) ? field.schema.type.join(' | ') : field.schema.type || '—'));
      const targets = fieldLinkTargets(field.schema);
      if (targets.length) {
        const link = badge(`linkTo → ${targets.join(' | ')}`, 'linkTo field-link');
        link.title = `Links to: ${targets.join(', ')}`;
        metadata.append(link);
      }
      if (field.calculated) metadata.append(badge('calculated', 'calculated'));
      row.append(metadata);
      window.SmahtItemView?.annotateField(field, selected, row);
      content.append(row);
    });
  } else if (tab === 'embeds') {
    content.append(el('p', 'Inherited and explicitly added paths from Python embedded_list definitions. Automatic framework embeds are not included.', 'description'));
    if (model.embedded_listSource) content.append(sourceButton(model.embedded_listSource, 'Open embed definition ↗'));
    total = model.embeds.length;
    model.embeds.filter(listMatches).forEach(embed => {
      shown++;
      const row = button(embed.split('.').join(' → '), () => showDetail(embed, { path: embed, segments: embed.split('.') },
        model.embedded_listSource ? [model.embedded_listSource] : []), 'row'); content.append(row);
    });
  } else {
    content.append(el('p', 'Local source analysis. Calculated properties are not executed. Dynamic Python expressions and runtime schema changes may be incomplete; unresolved definitions are listed below.', 'note'));
    content.append(el('h2', 'Package sources'));
    for (const [name, location] of Object.entries(data.packages)) content.append(el('p', `${name}: ${location}`, 'note'));
    content.append(el('h2', `${data.warnings.length} diagnostics`));
    total = data.warnings.length;
    data.warnings.filter(listMatches).forEach(message => { shown++; content.append(el('p', message, 'note')); });
  }
  $('list-count').textContent = `${shown} / ${total}`;
  if (!shown) content.append(el('p', 'No matching records.', 'empty'));
}
for (const kind of enabled) {
  const label = el('label'); const input = el('input'); input.type = 'checkbox'; input.checked = true; input.dataset.kind = kind;
  input.onchange = () => { input.checked ? enabled.add(kind) : enabled.delete(kind); render(); };
  label.append(input, badge(labels[kind], kind)); $('filters').append(label);
}
$('list-search').oninput = () => { listQueries[tab] = $('list-search').value; renderContent(); };
$('clear-list-search').onclick = () => { listQueries[tab] = ''; renderContent(); $('list-search').focus(); };
$('schema-back').onclick = () => travel(-1);
$('schema-forward').onclick = () => travel(1);
$('types').onchange = () => {
  navigation = [];
  navigationPosition = -1;
  select($('types').value);
};
$('search').oninput = () => { query = $('search').value.toLowerCase(); render(); window.SmahtItemView?.render(); };
$('refresh').onclick = () => vscode.postMessage({ type: 'refresh' });
$('close-detail').onclick = () => $('detail').close();
document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => {
  tab = button.dataset.tab;
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b === button)); renderContent();
});
window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== location.origin) return;
  const message = event.data;
  if (message.type === 'loading') $('status').textContent = 'Analyzing…';
  if (message.type === 'error') { $('error').hidden = false; $('error').textContent = message.message; $('status').textContent = 'Analysis failed'; }
  if (message.type === 'data') {
    data = message.data; $('error').hidden = true;
    $('status').textContent = `${data.models.length} types · ${data.warnings.length} diagnostics`;
    $('types').replaceChildren(...data.models.map(model => { const option = el('option', model.name); option.value = model.name; return option; }));
    select(message.selected || selected || vscode.getState()?.selected || 'TissueSample');
  }
});

// Rasterize a styled clone; never alter the interactive diagram or camera.
async function exportDiagram(svg, name, control) {
  control.disabled = true;
  const previous = control.textContent;
  control.textContent = 'Exporting…';
  let url;
  try {
    await document.fonts?.ready;
    if (lifetime.signal.aborted) return;
    const clone = svg.cloneNode(true);
    const originals = [svg, ...svg.querySelectorAll('*')];
    const copies = [clone, ...clone.querySelectorAll('*')];
    const properties = ['fill','fill-opacity','stroke','stroke-width','stroke-opacity','stroke-dasharray','stroke-linecap','stroke-linejoin','opacity','font-family','font-size','font-weight','font-style','text-anchor','dominant-baseline','paint-order','visibility','display'];
    originals.forEach((element, i) => {
      const computed = getComputedStyle(element);
      for (const property of properties) copies[i].style.setProperty(property, computed.getPropertyValue(property));
    });
    const world = svg.querySelector('#entity-world');
    let bounds;
    if (world && world.children.length) {
      bounds = world.getBBox();
      clone.querySelector('#entity-world').removeAttribute('transform');
    } else bounds = svg.viewBox.baseVal.width ? svg.viewBox.baseVal : svg.getBBox();
    const pad = 32, width = Math.max(1, bounds.width + pad * 2), height = Math.max(1, bounds.height + pad * 2);
    const scale = Math.min(2, 8192 / width, 8192 / height, Math.sqrt(24000000 / (width * height)));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('viewBox', `${bounds.x-pad} ${bounds.y-pad} ${width} ${height}`);
    clone.setAttribute('width', Math.ceil(width*scale)); clone.setAttribute('height', Math.ceil(height*scale));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width*scale); canvas.height = Math.ceil(height*scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('PNG rendering is unavailable.');
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], {type:'image/svg+xml;charset=utf-8'}));
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('Could not render the diagram.')); img.src = url; });
    if (lifetime.signal.aborted) return;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    vscode.postMessage({type:'exportPng', name, data:canvas.toDataURL('image/png')});
  } catch (error) {
    if (lifetime.signal.aborted) return;
    showDetail('PNG export failed', {message:error.message}, []);
  } finally {
    if (url) URL.revokeObjectURL(url);
    control.disabled = false; control.textContent = previous;
  }
}
$('graph-export').onclick = () => exportDiagram($('graph'), `${selected || 'schema'}-relationships`, $('graph-export'));
$('entity-export').onclick = () => exportDiagram($('entity-svg'), 'schema-map', $('entity-export'));
