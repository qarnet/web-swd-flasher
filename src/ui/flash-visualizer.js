const BAR_H = 32;
const SVG_H = BAR_H + 24;
const W = 1000;

// Named sub-regions for known targets
const NAMED_REGIONS = {
  nrf52840: [
    { label: "MBR", start: 0x000000, end: 0x000fff, color: "#6b7280" },
    { label: "BL", start: 0x001000, end: 0x025fff, color: "#9ca3af" }
  ],
  nrf52832: [
    { label: "MBR", start: 0x000000, end: 0x000fff, color: "#6b7280" }
  ],
  nrf52833: [
    { label: "MBR", start: 0x000000, end: 0x000fff, color: "#6b7280" }
  ]
};

function a2x(addr, flashStart, flashSize) {
  return Math.max(0, Math.min(W, ((addr - flashStart) / flashSize) * W));
}

function fmtAddr(addr) {
  return "0x" + addr.toString(16).padStart(8, "0");
}

function rect(x1, x2, y, h, fill, title = "") {
  const w = Math.max(1, x2 - x1);
  const safe = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return `<rect x="${x1.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${h}" fill="${fill}"><title>${safe}</title></rect>`;
}

export function renderFlashVisualizer(container, {
  flashStart = 0,
  flashSize = 1024 * 1024,
  targetId = null,
  files = [],       // [{name, segments, color}]
  readRegions = []  // [{start, size, ok}]
} = {}) {
  const ax = (a) => a2x(a, flashStart, flashSize);
  const parts = [];

  // Background bar
  parts.push(`<rect x="0" y="0" width="${W}" height="${BAR_H}" fill="#e5e7eb" rx="4"/>`);

  // Named regions
  const named = NAMED_REGIONS[targetId] ?? [];
  for (const r of named) {
    const x1 = ax(r.start);
    const x2 = ax(r.end + 1);
    parts.push(rect(x1, x2, 0, BAR_H, r.color, `${r.label}: ${fmtAddr(r.start)}-${fmtAddr(r.end)}`));
  }

  // Read-back regions
  for (const r of readRegions) {
    const x1 = ax(r.start);
    const x2 = ax(r.start + r.size);
    parts.push(rect(x1, x2, 0, BAR_H, r.ok ? "#bbf7d0" : "#fecaca", `Read: ${fmtAddr(r.start)}+${r.size}B`));
  }

  // File segments — drawn as colored bands, slightly inset
  for (const f of files) {
    for (const seg of f.segments) {
      // Only show segments within flash range
      const segEnd = seg.end + 1;
      if (segEnd <= flashStart || seg.start >= flashStart + flashSize) continue;
      const x1 = ax(Math.max(seg.start, flashStart));
      const x2 = ax(Math.min(segEnd, flashStart + flashSize));
      const tip = `${f.name}: ${fmtAddr(seg.start)}-${fmtAddr(seg.end)} (${seg.length}B)`;
      parts.push(rect(x1, x2, 3, BAR_H - 6, f.color + "cc", tip));
    }
  }

  // Border
  parts.push(`<rect x="0" y="0" width="${W}" height="${BAR_H}" fill="none" stroke="#d1d5db" stroke-width="1" rx="4"/>`);

  // Tick marks and labels
  const ticks = [
    { addr: flashStart, label: fmtAddr(flashStart), anchor: "start" },
    { addr: flashStart + flashSize - 1, label: fmtAddr(flashStart + flashSize), anchor: "end" }
  ];
  if (named.length > 0) {
    const appStart = named[named.length - 1].end + 1;
    ticks.push({ addr: appStart, label: fmtAddr(appStart), anchor: "middle" });
  }

  for (const t of ticks) {
    const x = ax(t.addr);
    parts.push(`<line x1="${x.toFixed(1)}" y1="${BAR_H}" x2="${x.toFixed(1)}" y2="${BAR_H + 5}" stroke="#6b7280" stroke-width="1"/>`);
    parts.push(`<text x="${x.toFixed(1)}" y="${BAR_H + 18}" font-size="9" text-anchor="${t.anchor}" fill="#374151">${t.label}</text>`);
  }

  container.innerHTML = `<svg viewBox="0 0 ${W} ${SVG_H}" width="100%" height="${SVG_H}" style="display:block;overflow:visible">${parts.join("")}</svg>`;
}
