/* Browser adapter for the shared explorer UI. No keys, server selector or proxy. */
(() => {
  let state = {}, selection, modelTicket = 0, itemTicket = 0, itemController;
  const environment = location.host;
  const send = data => window.dispatchEvent(Object.assign(new Event('message'), {
    data, source: window, origin: location.origin
  }));
  const itemURL = identifier => {
    if (typeof identifier !== 'string' || !identifier.trim()) throw new Error('Enter an item identifier.');
    const url = new URL(identifier.trim(), location.origin + '/');
    if (url.origin !== location.origin || url.username || url.password) throw new Error('Use an item from this portal only.');
    url.search = ''; url.hash = '';
    return url;
  };
  async function json(url, signal) {
    // mode=same-origin also rejects redirects to other origins; cookies never go there.
    const response = await fetch(url, {method:'GET', mode:'same-origin', credentials:'same-origin',
      cache:'no-store', headers:{Accept:'application/json'}, signal:AbortSignal.any([signal, lifetime.signal].filter(Boolean))});
    if (!response.ok) throw new Error(`Portal returned HTTP ${response.status}.`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder(); let size = 0, text = '';
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16 * 1024 * 1024) throw new Error('Response exceeds the 16 MB limit.');
        text += decoder.decode(value, {stream:true});
      }
      return JSON.parse(text + decoder.decode());
    } catch (error) { await reader.cancel(); throw error; }
    finally { reader.releaseLock(); }
  }
  async function refresh() {
    const ticket = ++modelTicket;
    send({type:'loading'});
    try {
      const data = await json('/schema-explorer/model', AbortSignal.timeout(60000));
      if (ticket === modelTicket) send({type:'data', data, selected:selection});
    } catch (error) {
      if (ticket === modelTicket) send({type:'error', message:error.message});
    }
  }
  async function loadItem(message) {
    itemController?.abort(); itemController = new AbortController();
    const controller = itemController, ticket = ++itemTicket;
    const deadline = setTimeout(() => controller.abort(), 20000);
    send({type:'itemLoading'});
    try {
      const frame = message.frame || 'auto';
      if (!['auto','raw','object','embedded','page','columns','expand'].includes(frame)) throw new Error('Unsupported frame.');
      const frameURL = (base, name) => {
        const url = new URL(base);
        url.searchParams.set('frame', name); url.searchParams.set('datastore', 'database');
        if (name === 'raw') url.searchParams.set('upgrade', 'false');
        return url;
      };
      const object = await json(frameURL(itemURL(message.identifier), 'object'), controller.signal);
      if (!object || Array.isArray(object) || typeof object['@id'] !== 'string' || !Array.isArray(object['@type']) || !object['@type'].length || object['@graph']) throw new Error('Enter a single item, not a search or collection.');
      const canonical = itemURL(object['@id']);
      const names = ['raw', 'embedded', 'profile'];
      const urls = [frameURL(canonical, 'raw'), frameURL(canonical, 'embedded'),
        new URL('/profiles/' + encodeURIComponent(object['@type'][0]) + '.json', location.origin)];
      if (['page','columns','expand'].includes(frame)) { names.push(frame); urls.push(frameURL(canonical, frame)); }
      const results = await Promise.allSettled(urls.map(url => json(url, controller.signal)));
      const bundle = {environment, id:object['@id'], types:object['@type'], object,
        raw:null, embedded:null, profile:null, notes:[], fetchedAt:new Date().toISOString()};
      names.forEach((name,i) => {
        const result = results[i];
        if (result.status !== 'fulfilled') bundle.notes.push(`${name} unavailable: ${result.reason.message}`);
        else if (!result.value || typeof result.value !== 'object' || Array.isArray(result.value)) bundle.notes.push(`${name} unavailable: invalid response.`);
        else if (name !== 'profile' && object.uuid && result.value.uuid && object.uuid !== result.value.uuid) bundle.notes.push(`${name} identity differs; frame ignored.`);
        else bundle[name] = result.value;
      });
      bundle.frame = frame === 'auto' ? bundle.embedded ? 'embedded' : 'object' : frame;
      bundle.view = bundle[bundle.frame];
      if (!bundle.view) throw new Error(`Requested ${frame} frame unavailable.`);
      if (ticket === itemTicket) send({type:'item', item:bundle});
    } catch (error) {
      if (ticket === itemTicket) send({type:'itemError', message:controller.signal.aborted ? 'Request cancelled or timed out.' : error.message});
    } finally { clearTimeout(deadline); }
  }
  function environments() {
    send({type:'environments', names:[environment]});
    document.getElementById('environments').disabled = true;
    document.getElementById('reload-envs').hidden = true;
  }
  async function source(message) {
    try {
      const url = new URL('/schema-explorer/source', location.origin);
      url.searchParams.set('file', message.file);
      const result = await json(url, AbortSignal.timeout(20000));
      if (lifetime.signal.aborted) return;
      const lines = result.text.split('\n');
      const line = Math.max(1, Math.min(lines.length, Number(message.line) || 1));
      const start = Math.max(0, line - 12), end = Math.min(lines.length, line + 28);
      showDetail(`${result.file}:${line}`, {}, []);
      const pre = document.querySelector('#detail-content pre');
      pre.textContent = lines.slice(start,end).map((text,i) => `${start+i+1 === line ? '→' : ' '} ${start+i+1}  ${text}`).join('\n');
      const full = document.createElement('details'), label = document.createElement('summary'), code = document.createElement('pre');
      label.textContent = 'Full source'; code.textContent = result.text;
      full.append(label,code); document.getElementById('detail-content').append(full);
    } catch (error) { if (lifetime.signal.aborted) return; showDetail('Source unavailable', {message:error.message}, []); }
  }
  window.acquireVsCodeApi = () => ({
    getState: () => state,
    setState: value => { state = value; }, // In memory only; no live values in browser storage.
    postMessage: message => {
      switch (message.type) {
        case 'ready': environments(); void refresh(); break;
        case 'refresh': void refresh(); break;
        case 'environments': environments(); break;
        case 'select': selection = message.name; break;
        case 'loadItem': void loadItem(message); break;
        case 'cancelItem': ++itemTicket; itemController?.abort(); break;
        case 'source': void source(message); break;
        case 'exportPng': {
          if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(message.data)) break;
          const link = document.createElement('a'); link.href = message.data;
          link.download = String(message.name || 'schema-map').replace(/[^a-zA-Z0-9_-]/g,'_') + '.png';
          document.body.append(link); link.click(); link.remove(); break;
        }
      }
    }
  });
  window.addEventListener('pagehide', () => { ++modelTicket; ++itemTicket; itemController?.abort(); state = {}; });
})();
