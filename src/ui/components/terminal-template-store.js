const TEMPLATES_KEY = "terminal:templates";
const TEMPLATE_VARS_KEY = "terminal:template-vars";
export const TEMPLATE_CAP = 50;
export const VAR_RE = /\$\{([A-Z_][A-Z0-9_]*)\}/g;

let _listeners = new Set();
let _storageBound = false;

let _templates = [];
let _templateVars = {};

try {
  const raw = localStorage.getItem(TEMPLATES_KEY);
  if (raw) {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) _templates = p;
  }
} catch { _templates = []; }

try {
  const raw = localStorage.getItem(TEMPLATE_VARS_KEY);
  if (raw) {
    const p = JSON.parse(raw);
    if (p && typeof p === "object" && !Array.isArray(p)) _templateVars = p;
  }
} catch { _templateVars = {}; }

function _save() {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(_templates));
    if (Object.keys(_templateVars).length === 0) {
      localStorage.removeItem(TEMPLATE_VARS_KEY);
    } else {
      localStorage.setItem(TEMPLATE_VARS_KEY, JSON.stringify(_templateVars));
    }
  } catch {}
}

function _emit() {
  for (const cb of _listeners) {
    try { cb(); } catch {}
  }
}

function _ensureStorage() {
  if (_storageBound) return;
  _storageBound = true;
  window.addEventListener("storage", (e) => {
    if (e.key === TEMPLATES_KEY || e.key === TEMPLATE_VARS_KEY) {
      _templates = loadTemplates();
      _templateVars = loadVars();
      _emit();
    }
  });
}

function _uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : _fallbackUuid();
}

function _fallbackUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function loadTemplates() {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch { return []; }
}

export function loadVars() {
  try {
    const raw = localStorage.getItem(TEMPLATE_VARS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return (p && typeof p === "object" && !Array.isArray(p)) ? p : {};
  } catch { return {}; }
}

export function deriveVars(body) {
  const seen = new Set();
  const result = [];
  const re = new RegExp(VAR_RE.source, "g");
  let m;
  while ((m = re.exec(body)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      result.push(m[1]);
    }
  }
  return result;
}

export function resolve(body, vars) {
  return body.replace(VAR_RE, (_, name) => vars?.[name] ?? "");
}

export function saveTemplate(tpl) {
  if (!tpl.name || !tpl.name.trim()) return { ok: false, reason: "Name required" };
  if (tpl.name.length > 60) return { ok: false, reason: "Name max 60 chars" };
  if (tpl.body && tpl.body.length > 2000) return { ok: false, reason: "Body max 2000 chars" };

  const normName = tpl.name.trim().toLowerCase();
  const duplicate = _templates.find(t => t.id !== tpl.id && t.name.trim().toLowerCase() === normName);
  if (duplicate) return { ok: false, reason: "Duplicate name" };

  if (!tpl.id) {
    if (_templates.length >= TEMPLATE_CAP) return { ok: false, reason: "Template cap reached (50)" };
    tpl.id = _uuid();
  }

  tpl.name = tpl.name.trim();
  tpl.vars = deriveVars(tpl.body || "");
  tpl.body = tpl.body || "";

  const idx = _templates.findIndex(t => t.id === tpl.id);
  if (idx >= 0) {
    _templates[idx] = tpl;
  } else {
    _templates.push(tpl);
  }
  _save();
  _emit();
  return { ok: true, id: tpl.id };
}

export function deleteTemplate(id) {
  const idx = _templates.findIndex(t => t.id === id);
  if (idx < 0) return;
  _templates.splice(idx, 1);
  delete _templateVars[id];
  _save();
  _emit();
}

export function setVarValue(templateId, varName, value) {
  if (!_templateVars[templateId]) _templateVars[templateId] = {};
  if (value === "") {
    delete _templateVars[templateId][varName];
    if (Object.keys(_templateVars[templateId]).length === 0) delete _templateVars[templateId];
  } else {
    _templateVars[templateId][varName] = value;
  }
  _save();
  _emit();
}

export function getVarValues(templateId) {
  return _templateVars[templateId] || {};
}

export function getTemplates() {
  return _templates;
}

export function subscribe(cb) {
  _listeners.add(cb);
  _ensureStorage();
  return () => { _listeners.delete(cb); };
}
