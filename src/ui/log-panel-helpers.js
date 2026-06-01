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

export function setupAutoScroll(el, checkbox) {
  function updateScroll() {
    if (checkbox.checked) {
      el.scrollTop = el.scrollHeight;
    }
  }
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) updateScroll();
  });
  return updateScroll;
}