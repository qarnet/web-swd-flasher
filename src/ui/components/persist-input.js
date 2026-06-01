export function persistInput(el, key, { event = "change" } = {}) {
  const saved = localStorage.getItem(key);
  if (saved !== null) el.value = saved;
  el.addEventListener(event, () => localStorage.setItem(key, el.value));
}
