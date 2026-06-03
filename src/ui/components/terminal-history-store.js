const HISTORY_KEY = "terminal:history";
const HISTORY_CAP = 500;

let _listeners = new Set();
let _storageBound = false;

let _history = [];
try {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (raw) _history = JSON.parse(raw);
  if (!Array.isArray(_history)) _history = [];
} catch {
  _history = [];
}

function _save() {
  try {
    if (_history.length === 0) {
      localStorage.removeItem(HISTORY_KEY);
    } else {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(_history));
    }
    return true;
  } catch {
    return false;
  }
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
    if (e.key !== HISTORY_KEY) return;
    _history = loadHistory();
    _emit();
  });
}

export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushHistory(text) {
  text = text.trim();
  if (!text) return;
  if (_history.length > 0 && _history[_history.length - 1] === text) return;
  _history.push(text);
  while (_history.length > HISTORY_CAP) _history.shift();
  _save();
  _emit();
}

export function clearHistory() {
  _history = [];
  _save();
  _emit();
}

export function subscribe(cb) {
  _listeners.add(cb);
  _ensureStorage();
  return () => { _listeners.delete(cb); };
}

export function getHistory() {
  return _history;
}
