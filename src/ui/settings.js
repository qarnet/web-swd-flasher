export function init(elements) {
  const { btnTheme, clockSelect, rttRamStartInput, rttRamSizeInput, rttIntervalInput, memAddrInput, memLenInput } = elements;

  // Theme
  const saved = localStorage.getItem("theme") || "light";
  if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
  btnTheme?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  });

  // Settings persistence
  const PERSIST = [
    { el: clockSelect,       key: "swd-clock-hz",  event: "change" },
    { el: rttRamStartInput,  key: "rtt-ram-start",  event: "change" },
    { el: rttRamSizeInput,   key: "rtt-ram-size",   event: "change" },
    { el: rttIntervalInput,  key: "rtt-interval",   event: "change" },
    { el: memAddrInput,      key: "mem-addr",       event: "change" },
    { el: memLenInput,       key: "mem-len",        event: "change" },
  ];

  for (const { el, key, event } of PERSIST) {
    const saved = localStorage.getItem(key);
    if (saved !== null) el.value = saved;
    el.addEventListener(event, () => localStorage.setItem(key, el.value));
  }
}
