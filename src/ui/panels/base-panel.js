export class BasePanel {
  constructor() {
    this._unsubs = [];
    this._domBindings = [];
  }

  _bindBusListener(bus, topic, fn) {
    this._unsubs.push(bus.on(topic, fn));
  }

  _bindDomListener(el, event, fn) {
    el.addEventListener(event, fn);
    this._domBindings.push({ el, event, fn });
  }

  _teardown() {
    for (const u of this._unsubs) u();
    for (const { el, event, fn } of this._domBindings) el.removeEventListener(event, fn);
    this._unsubs = [];
    this._domBindings = [];
  }
}
