export function downloadLog(plainText, filename) {
  const blob = new Blob([plainText], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function autoScrollObserver(el, checkbox) {
  const observer = new MutationObserver(() => {
    if (checkbox.checked) {
      el.scrollTop = el.scrollHeight;
    }
  });
  observer.observe(el, { childList: true, characterData: true, subtree: true });
  return observer;
}