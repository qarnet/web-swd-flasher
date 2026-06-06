export function renderBuildTimestamp(el, timestamp) {
  if (!el || !timestamp || timestamp === "__BUILD_TIMESTAMP__") return;
  const ts = timestamp.endsWith("Z") ? timestamp : timestamp + "Z";
  const d = new Date(ts);
  const base = `Build ${isNaN(d) ? timestamp : d.toLocaleString()}`;

  const apply = () => {
    const nav = performance?.getEntriesByType?.("navigation")?.[0];
    const cached = nav ? nav.transferSize === 0 : null;
    el.textContent = `${base} · ${cached === null ? "unknown" : cached ? "cached" : "live"}`;
  };

  // Show unknown immediately so label is always present, then refine after load.
  apply();
  if (typeof document === "undefined") return;
  if (document.readyState !== "complete") {
    window.addEventListener("load", apply, { once: true });
  }
}
