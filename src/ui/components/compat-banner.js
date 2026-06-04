export class CompatBanner {
  static check() {
    if (!window.isSecureContext) {
      return { ok: false, msg: "Secure context required (use localhost)." };
    }
    if (!navigator.usb) {
      return { ok: false, msg: "navigator.usb unavailable in this browser profile." };
    }
    return { ok: true, msg: "" };
  }

  static render(bannerEl, msgEl, { ok, msg }) {
    if (ok) {
      bannerEl.hidden = true;
      return true;
    }
    msgEl.textContent = msg;
    bannerEl.hidden = false;
    return false;
  }
}
