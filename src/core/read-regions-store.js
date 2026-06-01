import { Topics } from "./event-bus-topics.js";

export class ReadRegionsStore {
  constructor(bus) {
    this._bus = bus;
    this._regions = [];
  }

  get regions() {
    return this._regions;
  }

  set(regions) {
    this._regions = Array.isArray(regions) ? regions : [];
    this._bus.emit(Topics.READ_REGIONS_CHANGED, { regions: this._regions });
  }

  clear() {
    this.set([]);
  }
}
