(function(root) {
  const own = (value, key) => value != null && Object.prototype.hasOwnProperty.call(value, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function modelFor(index, types = []) { return types.map(t => index.models.find(m => m.name === t)).find(Boolean); }
  function describe(bundle, index) {
    const model = modelFor(index, bundle.types);
    const value = bundle.view ?? bundle.embedded ?? bundle.object;
    let count = 0;
    const notes = [...bundle.notes];
    notes.push('API frames are separate reads, not an atomic snapshot. Local source definitions may differ from the deployed environment.');
    const maxNodes = 12000;
    function node(name, value, raw, obj, context, schema, path, depth = 0) {
      if (++count > maxNodes || depth > 35) return null;
      const top = depth === 0;
      const localField = context.model?.fields.find(f => f.name === (top ? name : context.field));
      const remote = top ? bundle.profile?.properties?.[name] : null;
      const calculated = !!(remote?.calculatedProperty || (!remote && localField?.calculated));
      let origin, evidence;
      if (context.linked) {
        origin = 'Embedded'; evidence = `Value returned under linked item ${context.item}. Its storage/computation is not verified until that item is loaded.`;
      } else if (context.rawKnown && raw.present) {
        origin = 'Stored'; evidence = name === 'uuid' && top ? 'UUID is injected by the raw view from the item identity.' : 'Present in raw (upgrade=false).';
        if (JSON.stringify(raw.value) !== JSON.stringify(value)) evidence += ' The displayed value differs from raw (for example, link expansion or schema upgrades); compare the frames below.';
      } else if (calculated) {
        origin = 'Calculated'; evidence = remote ? 'Declared calculated in the environment profile.' : 'Declared calculated in local Python source; deployment not verified.';
      } else if (context.model?.reverse?.[name] && top) {
        origin = 'Reverse link'; evidence = 'Declared by the local Python rev mapping.';
      } else {
        origin = 'Unverified'; evidence = context.rawKnown ? 'Not present in raw; may be generated, upgraded or expanded by the server.' : 'Raw frame unavailable; stored origin cannot be confirmed.';
      }
      const reverse = top ? context.model?.reverse?.[name] : null;
      if (reverse && origin === 'Calculated') { origin = 'Reverse link'; evidence += ` Local rev: ${reverse[0]}.${reverse[1]}.`; }
      const result = { name, path, value, origin, evidence, sources: localField?.sources || [],
        calculated, calculationBasis: calculated ? (remote ? 'environment profile' : 'local source') : null,
        calculationField: top ? name : context.field, embedded: !!context.linked,
        sourceType: context.model?.name || (top ? bundle.types[0] : 'Unknown type'),
        definition: schema || {}, remoteDefinition: remote, owner: localField?.owner,
        sourceItem: context.item, sourcePath: context.sourcePath || name,
        raw: raw.present ? { value: raw.value } : null, object: obj.present ? { value: obj.value } : null,
        children: [], linkedItem: null, embedPaths: (model?.embeds || []).filter(p => {
          const normalized = path.replace(/\[\d+\]/g, '');
          return p === normalized || p.startsWith(normalized + '.') || p.endsWith('.*') && normalized.startsWith(p.slice(0, -1));
        }) };
      const linkTargets = schema?.linkTo || schema?.items?.linkTo;
      let childContext = { ...context, field: top ? name : context.field };
      let childSchema = schema;
      if (object(value) && typeof value['@id'] === 'string' && value['@id'] !== bundle.id) {
        const inferredTypes = Array.isArray(linkTargets) ? linkTargets : linkTargets ? [linkTargets] : [];
        const linkedModel = modelFor(index, value['@type'] || inferredTypes);
        result.linkedItem = value['@id'];
        result.origin = 'Embedded';
        result.embedded = true;
        result.sourceType = linkedModel?.name || value['@type']?.[0] || inferredTypes.join(' | ') || 'Unknown type';
        result.evidence = 'Nested item representation returned by the API. Load the linked item to verify its own field origins.';
        result.sourceItem = value['@id'];
        result.sourcePath = '(item)';
        childContext = { item: value['@id'], model: linkedModel, linked: true, rawKnown: false, field: null, sourcePath: '' };
        childSchema = linkedModel?.schema;
      } else if (typeof value === 'string' && linkTargets && value.startsWith('/')) result.linkedItem = value;
      if (value !== null && typeof value === 'object') {
        const entries = Object.entries(value);
        for (const [key, child] of entries) {
          const array = Array.isArray(value);
          const nextPath = array ? `${path}[${key}]` : `${path}.${key}`;
          let def = array ? (Array.isArray(childSchema?.items) ? childSchema.items[Number(key)] : childSchema?.items) : childSchema?.properties?.[key];
          let nextContext = { ...childContext, sourcePath: childContext.sourcePath ? `${childContext.sourcePath}.${key}` : key };
          if (childContext.linked && childContext.model && !childContext.field && !array) nextContext.field = key;
          const next = node(key, child, { present: own(raw.value, key), value: raw.value?.[key] }, { present: own(obj.value, key), value: obj.value?.[key] }, nextContext, def, nextPath, depth + 1);
          if (!next) { result.truncated = true; break; }
          result.children.push(next);
        }
      }
      return result;
    }
    const rows = [];
    for (const name of Object.keys(value)) {
      const row = node(name, value[name], { present: own(bundle.raw, name), value: bundle.raw?.[name] },
        { present: own(bundle.object, name), value: bundle.object?.[name] },
        { item: bundle.id, model, rawKnown: !!bundle.raw, linked: false, field: name, sourcePath: name },
        model?.fields.find(f => f.name === name)?.schema || bundle.profile?.properties?.[name], name);
      if (row) rows.push(row); else { notes.push('Tree limited to 12,000 nodes. Load a linked item separately to inspect further.'); break; }
    }
    if (!model) notes.push('No matching local item type. Values remain available; local source mapping is unavailable.');
    return { rows, notes, model: model?.name };
  }
  const api = { describe, modelFor };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SmahtProvenance = api;
})(typeof window === 'object' ? window : globalThis);
