export function renderBuildTimestamp(el, timestamp) {
  if (!el || !timestamp || timestamp === "__BUILD_TIMESTAMP__") return;
  const ts = timestamp.endsWith("Z") ? timestamp : timestamp + "Z";
  const d = new Date(ts);
  el.textContent = `Build ${isNaN(d) ? timestamp : d.toLocaleString()}`;
}
