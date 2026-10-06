/* Lazy portal UI entry. Each React mount owns its DOM, events and requests.
 * The backend inserts only trusted packaged markup/styles/scripts below.
 * Shadow DOM isolates legacy explorer selectors without a nested document.
 */
export function mount(host) {
  const owner = host.ownerDocument;
  const root = host.shadowRoot || host.attachShadow({mode: 'open'});
  const style = owner.createElement('style');
  style.textContent = /* EXPLORER_CSS */;
  const body = owner.createElement('div');
  body.className = 'explorer-root';
  body.innerHTML = /* EXPLORER_HTML */;
  root.replaceChildren(style, body);
  const lifetime = new AbortController();
  const timers = new Set();
  const setTimeout = (callback, delay) => {
    const id = globalThis.setTimeout(() => { timers.delete(id); callback(); }, delay);
    timers.add(id);
    return id;
  };
  const clearTimeout = id => { timers.delete(id); globalThis.clearTimeout(id); };
  // Keep application messages and exports local to this mount, not the portal window.
  const window = new EventTarget();
  const document = {
    body,
    fonts: owner.fonts,
    scrollingElement: owner.scrollingElement,
    getElementById: id => root.getElementById(id),
    querySelector: selector => root.querySelector(selector),
    querySelectorAll: selector => root.querySelectorAll(selector),
    createElement: owner.createElement.bind(owner),
    createElementNS: owner.createElementNS.bind(owner),
    createDocumentFragment: owner.createDocumentFragment.bind(owner),
    addEventListener: root.addEventListener.bind(root)
  };
  const acquireVsCodeApi = () => window.acquireVsCodeApi();
  function dispose() {
    window.dispatchEvent(new Event('pagehide'));
    lifetime.abort();
    timers.forEach(globalThis.clearTimeout);
    timers.clear();
    root.replaceChildren();
  }
  try {
    /* EXPLORER_SCRIPTS */
  } catch (error) {
    dispose();
    throw error;
  }
  return dispose;
}
