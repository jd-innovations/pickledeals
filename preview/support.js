// Minimal local runtime for .dc.html artboards (localhost preview only).
// Supports {{holes}}, <sc-if>, <sc-for>, <dc-import>, onX handlers and setState re-render.
(function () {
  const style = document.createElement('style');
  style.textContent = 'x-dc{display:none!important}';
  document.head.appendChild(style);

  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(p) {
      Object.assign(this.state, typeof p === 'function' ? p(this.state, this.props) : p);
      if (this.__rerender) this.__rerender();
    }
    forceUpdate() { if (this.__rerender) this.__rerender(); }
  }
  window.DCLogic = DCLogic;

  const defs = {};
  const HOLE = /\{\{([^}]*)\}\}/g;
  const WHOLE = /^\s*\{\{([^}]*)\}\}\s*$/;

  function lookup(expr, scope) {
    expr = expr.trim();
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (expr === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return +expr;
    if (/^(['"]).*\1$/.test(expr)) return expr.slice(1, -1);
    const parts = expr.split('.');
    let v = scope[parts[0]];
    for (let i = 1; i < parts.length && v != null; i++) v = v[parts[i]];
    return v;
  }
  function interp(str, scope) {
    const m = str.match(WHOLE);
    if (m) return lookup(m[1], scope);
    return str.replace(HOLE, (_, e) => { const v = lookup(e, scope); return v == null ? '' : String(v); });
  }
  const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

  function makeDef(template, scriptEl) {
    const src = scriptEl ? scriptEl.textContent : 'class Component extends DCLogic { renderVals() { return {}; } }';
    const Cls = new Function('DCLogic', src + '\n;return Component;')(DCLogic);
    let defaults = {};
    try {
      const dp = JSON.parse(scriptEl.getAttribute('data-props') || '{}');
      Object.keys(dp).forEach((k) => { if (k[0] !== '$' && dp[k] && 'default' in dp[k]) defaults[k] = dp[k].default; });
    } catch (e) { /* ignore */ }
    return { template, Cls, defaults };
  }

  function collectImports(root, out) {
    root.querySelectorAll('dc-import').forEach((n) => out.add(n.getAttribute('name')));
  }
  async function load(name) {
    if (defs[name]) return defs[name];
    const res = await fetch(name + '.dc.html');
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const tpl = doc.querySelector('x-dc');
    const def = makeDef(tpl, doc.querySelector('script[data-dc-script]'));
    defs[name] = def;
    const more = new Set(); collectImports(tpl, more);
    for (const n of more) await load(n);
    return def;
  }

  function renderChildren(parent, scope, out) {
    parent.childNodes.forEach((n) => renderNode(n, scope, out));
  }
  function renderNode(node, scope, out) {
    if (node.nodeType === 3) {
      const t = node.textContent;
      out.appendChild(document.createTextNode(t.indexOf('{{') === -1 ? t : String(interpOrEmpty(t, scope))));
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.localName;
    if (tag === 'helmet') return;
    if (tag === 'sc-if') {
      if (lookup((node.getAttribute('value') || '').replace(/^\s*\{\{|\}\}\s*$/g, ''), scope)) renderChildren(node, scope, out);
      return;
    }
    if (tag === 'sc-for') {
      const list = lookup((node.getAttribute('list') || '').replace(/^\s*\{\{|\}\}\s*$/g, ''), scope) || [];
      const as = node.getAttribute('as') || 'item';
      list.forEach((item, i) => {
        const s = Object.create(scope); s[as] = item; s.$index = i;
        renderChildren(node, s, out);
      });
      return;
    }
    if (tag === 'dc-import') {
      const name = node.getAttribute('name');
      const props = {};
      Array.from(node.attributes).forEach((a) => {
        if (a.name === 'name' || a.name.indexOf('hint-') === 0) return;
        props[camel(a.name)] = interp(a.value, scope);
      });
      const host = document.createElement('div');
      host.style.display = 'contents';
      out.appendChild(host);
      if (defs[name]) mount(defs[name], props, host);
      return;
    }
    const el = document.createElementNS(node.namespaceURI || 'http://www.w3.org/1999/xhtml', tag);
    Array.from(node.attributes).forEach((a) => {
      if (/^on[a-z]+$/.test(a.name) && WHOLE.test(a.value)) {
        const fn = interp(a.value, scope);
        if (typeof fn === 'function') el.addEventListener(a.name.slice(2), (e) => fn(e));
        return;
      }
      const v = a.value.indexOf('{{') === -1 ? a.value : interp(a.value, scope);
      if (v === false || v == null) return;
      el.setAttribute(a.name, String(v));
    });
    renderChildren(node, scope, el);
    out.appendChild(el);
  }
  function interpOrEmpty(t, scope) { const v = interp(t, scope); return v == null ? '' : v; }

  function mount(def, props, host) {
    const inst = new def.Cls(Object.assign({}, def.defaults, props));
    const draw = () => {
      const vals = inst.renderVals ? inst.renderVals() : {};
      const frag = document.createDocumentFragment();
      renderChildren(def.template, vals, frag);
      host.replaceChildren(frag);
    };
    inst.__rerender = draw;
    draw();
    if (inst.componentDidMount) inst.componentDidMount();
    return inst;
  }

  async function boot() {
    const tpl = document.querySelector('x-dc');
    if (!tpl) return;
    const helmet = tpl.querySelector('helmet');
    if (helmet) Array.from(helmet.children).forEach((c) => document.head.appendChild(c.cloneNode(true)));
    const names = new Set(); collectImports(tpl, names);
    for (const n of names) await load(n);
    const def = makeDef(tpl, document.querySelector('script[data-dc-script]'));
    const q = new URLSearchParams(location.search);
    const props = {}; q.forEach((v, k) => { props[k] = v; });
    const host = document.createElement('div');
    tpl.parentNode.insertBefore(host, tpl);
    mount(def, props, host);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
