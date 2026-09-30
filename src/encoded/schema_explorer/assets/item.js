// Live values stay in memory only. Keys and authorization headers never enter this view.
(() => {
  let index, bundle, provenance;
  const get = id => document.getElementById(id);
  function short(value) {
    if (Array.isArray(value)) return `Array (${value.length})`;
    if (value !== null && typeof value === 'object') return value.display_title || value['@id'] || `Object (${Object.keys(value).length} fields)`;
    const text = JSON.stringify(value);
    return text?.length > 160 ? text.slice(0, 157) + '…' : text;
  }
  function setTabToFields() {
    const button = document.querySelector('[data-tab="fields"]'); button?.click();
  }
  function request(identifier) {
    const env = get('environments').value;
    if (!env || !identifier.trim()) return;
    get('item-id').value = identifier;
    vscode.postMessage({ type: 'loadItem', environment: env, identifier, frame: get('item-frame').value });
  }
  function reset() {
    vscode.postMessage({ type: 'cancelItem' });
    bundle = null; provenance = null;
    get('load-item').disabled = false;
    get('item-heading').replaceChildren(); get('item-tree').replaceChildren(); get('item-notes').replaceChildren();
    get('item-error').hidden = true;
    get('item-status').textContent = 'Enter an item identifier from this portal.';
    get('item-status').title = '';
    renderContent();
  }
  function originBadges(row, full = false) {
    const tags = el('span', undefined, 'origin-tags');
    tags.append(badge(row.origin, 'origin-' + row.origin.toLowerCase().replaceAll(' ', '-')));
    if (row.calculated && row.origin !== 'Calculated') tags.append(badge('Calculated', 'origin-calculated'));
    if (row.calculated) {
      tags.title = `Calculated property · ${row.calculationBasis}`;
      if (full) tags.append(badge(row.calculationBasis === 'local source' ? 'Deployed definition' : 'Environment profile'));
    }
    return tags;
  }
  function sourceSummary(row, parent = null) {
    const summary = el('span', undefined, 'field-origin-summary');
    // The enclosing item already supplies the source for ordinary fields.
    if (row.sourceItem !== (parent?.sourceItem || bundle.id)) {
      summary.append(el('span', `From: ${row.sourceType} · ${row.sourceItem}`, 'origin-item'));
    }
    if (row.calculated && row.owner && !(parent?.owner === row.owner && parent?.calculationField === row.calculationField)) {
      const method = el('span', `Python: ${row.owner.split('.').pop()}.${row.calculationField}`, 'origin-method');
      method.title = `${row.owner}.${row.calculationField} · ${row.calculationBasis}`;
      summary.append(method);
    }
    return summary.childNodes.length ? summary : document.createDocumentFragment();
  }
  function detail(row) {
    showDetail(row.path, row.value, row.sources, `${row.origin} · ${row.evidence}`);
    const target = get('detail-content');
    const origin = el('div', undefined, 'note');
    origin.append(originBadges(row, true), el('p', `Source item: ${row.sourceItem}`), el('p', `Source field: ${row.sourcePath}`));
    if (row.owner) origin.append(el('p', `Python owner: ${row.owner}`));
    if (row.linkedItem) origin.append(button('Load linked item →', () => { get('detail').close(); request(row.linkedItem); }));
    if (row.sourceItem !== bundle.id) origin.append(button('Inspect source item →', () => { get('detail').close(); request(row.sourceItem); }));
    if (row.embedPaths.length) origin.append(el('p', 'Embed paths: ' + row.embedPaths.join(', ')));
    target.insertBefore(origin, target.querySelector('pre'));
    for (const [label, value] of [
      ['Raw value (upgrade=false)', row.raw ? row.raw.value : 'Not available in this frame'],
      ['Object value', row.object ? row.object.value : 'Not available in this frame'],
      ['Deployed definition', row.definition], ['Environment definition', row.remoteDefinition || 'No environment field definition available']
    ]) {
      const section = el('details'); section.append(el('summary', label), el('pre', JSON.stringify(value, null, 2))); target.append(section);
    }
    target.append(el('p', 'Source links refer to the deployed source. Calculated-property implementation is shown, but its execution and helper dependencies are not traced.', 'muted'));
  }
  function render() {
    if (!bundle || !index) return;
    provenance = SmahtProvenance.describe(bundle, index);
    const heading = get('item-heading'); heading.replaceChildren(el('h3', bundle.object.display_title || bundle.id));
    const info = el('div', undefined, 'counts');
    info.append(badge(bundle.environment), badge(bundle.types[0]), badge(bundle.id)); heading.append(info);
    const legend = el('div', undefined, 'counts');
    for (const label of ['Stored', 'Calculated', 'Embedded', 'Reverse link', 'Unverified']) legend.append(badge(label, 'origin-' + label.toLowerCase().replaceAll(' ', '-')));
    heading.append(legend);
    const notes = get('item-notes'); notes.replaceChildren();
    const diagnostics = el('details'); diagnostics.append(el('summary', `Provenance notes (${provenance.notes.length})`));
    provenance.notes.forEach(note => diagnostics.append(el('p', note, 'muted'))); notes.append(diagnostics);
    const tree = get('item-tree'); tree.replaceChildren();
    const text = get('search').value.toLowerCase();
    function matchesRow(row) {
      return `${row.path} ${row.origin} ${row.sourceItem} ${short(row.value)}`.toLowerCase().includes(text) || row.children.some(matchesRow);
    }
    function treeRow(row, parent = null) {
      const hasChildren = row.children.length > 0;
      const wrapper = el(hasChildren ? 'details' : 'div', undefined, 'value-node');
      const header = el(hasChildren ? 'summary' : 'div', undefined, 'value-header');
      header.append(el('span', row.name, 'value-name'), originBadges(row), el('span', short(row.value), 'value-preview'));
      header.append(sourceSummary(row, parent));
      const inspect = button('Origin ↗', event => { event?.preventDefault(); });
      inspect.onclick = event => { event.preventDefault(); event.stopPropagation(); detail(row); };
      header.append(inspect); wrapper.append(header);
      if (row.linkedItem) {
        const load = button('Load →', () => {});
        load.title = row.linkedItem;
        load.onclick = event => { event.preventDefault(); event.stopPropagation(); request(row.linkedItem); }; header.append(load);
      }
      if (hasChildren) {
        let rendered = false;
        const expand = () => {
          if (rendered) return; rendered = true;
          const children = el('div', undefined, 'value-children');
          row.children.filter(matchesRow).forEach(child => children.append(treeRow(child, row)));
          if (row.truncated) children.append(el('p', 'Additional values omitted by the tree size limit.', 'muted'));
          wrapper.append(children);
        };
        wrapper.addEventListener('toggle', () => { if (wrapper.open) expand(); });
        if (text) { expand(); wrapper.open = true; }
      }
      return wrapper;
    }
    provenance.rows.filter(matchesRow).forEach(row => tree.append(treeRow(row)));
    if (!tree.children.length) tree.append(el('p', 'No matching item fields.', 'muted'));
    renderContent();
  }
  get('item-form').onsubmit = event => { event.preventDefault(); request(get('item-id').value); };
  get('clear-item').onclick = reset;
  get('environments').onchange = reset;
  get('reload-envs').onclick = () => { reset(); vscode.postMessage({ type: 'environments' }); };
  window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== location.origin) return;
    const message = event.data;
    if (message.type === 'environments') {
      const previous = get('environments').value;
      get('environments').replaceChildren(...message.names.map(name => { const option = el('option', name); option.value = name; return option; }));
      if (message.names.includes(previous)) get('environments').value = previous;
      get('load-item').disabled = !message.names.length;
      if (message.error) { get('item-error').hidden = false; get('item-error').textContent = message.error; }
    }
    if (message.type === 'data') { index = message.data; render(); }
    if (message.type === 'itemLoading') {
      get('item-status').title = '';
      bundle = null; provenance = null;
      get('item-heading').replaceChildren(); get('item-tree').replaceChildren(); get('item-notes').replaceChildren();
      get('item-error').hidden = true; get('item-status').textContent = 'Loading item and comparing API frames…'; get('load-item').disabled = true;
      renderContent();
    }
    if (message.type === 'itemError') {
      get('load-item').disabled = false;
      get('item-error').hidden = false; get('item-error').textContent = message.message; get('item-status').textContent = 'Item load failed.';
    }
    if (message.type === 'item') {
      bundle = message.item; get('load-item').disabled = false;
      const displayed = bundle.view || bundle.embedded || bundle.object;
      const bytes = new Blob([JSON.stringify(displayed)]).size;
      const kilobytes = (bytes / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      get('item-status').textContent = `Loaded ${new Date(bundle.fetchedAt).toLocaleString()} · ${bundle.frame || (bundle.embedded ? 'embedded' : 'object')} view · ${kilobytes} KB JSON`;
      get('item-status').title = `${bytes.toLocaleString('en-US')} bytes · UTF-8 JSON for the displayed frame (1 KB = 1,000 bytes), excluding whitespace and HTTP/compression overhead.`;
      if (index) {
        const model = SmahtProvenance.modelFor(index, bundle.types);
        if (model) { select(model.name); setTabToFields(); }
      }
      render();
    }
  });
  window.SmahtItemView = {
    render,
    annotateField(field, type, element) {
      if (!bundle || !provenance || provenance.model !== type) return;
      const row = provenance.rows.find(r => r.name === field.name);
      if (!row) { element.append(el('span', 'Not returned for this item', 'field-origin-summary')); return; }
      const live = el('span', undefined, 'field-live');
      live.append(originBadges(row), el('span', short(row.value), 'value-preview'), sourceSummary(row));
      element.append(live);
    },
    showField(field, type) {
      if (!bundle || !provenance || provenance.model !== type) return false;
      const row = provenance.rows.find(r => r.name === field.name);
      if (!row) return false;
      detail(row); return true;
    }
  };
  vscode.postMessage({ type: 'ready' });
})();
