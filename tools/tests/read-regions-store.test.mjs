import test from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../../src/core/event-bus.js";
import { Topics } from "../../src/core/event-bus-topics.js";
import { ReadRegionsStore } from "../../src/core/read-regions-store.js";

test("ReadRegionsStore starts with empty regions", () => {
  const bus = new EventBus();
  const store = new ReadRegionsStore(bus);
  assert.deepStrictEqual(store.regions, []);
});

test("ReadRegionsStore.set() stores regions and emits event", () => {
  const bus = new EventBus();
  const store = new ReadRegionsStore(bus);
  const events = [];
  bus.on(Topics.READ_REGIONS_CHANGED, (e) => events.push(e));

  store.set([{ start: 0, size: 256, ok: true }]);

  assert.deepStrictEqual(store.regions, [{ start: 0, size: 256, ok: true }]);
  assert.equal(events.length, 1);
  assert.deepStrictEqual(events[0], { regions: [{ start: 0, size: 256, ok: true }] });
});

test("ReadRegionsStore.set() with empty array", () => {
  const bus = new EventBus();
  const store = new ReadRegionsStore(bus);
  store.set([{ start: 0, size: 100, ok: false }]);
  store.set([]);
  assert.deepStrictEqual(store.regions, []);
});

test("ReadRegionsStore.set() with non-array normalizes to array", () => {
  const bus = new EventBus();
  const store = new ReadRegionsStore(bus);
  store.set("not an array");
  assert.deepStrictEqual(store.regions, []);
});

test("ReadRegionsStore.clear() empties regions", () => {
  const bus = new EventBus();
  const store = new ReadRegionsStore(bus);
  store.set([{ start: 0, size: 100, ok: true }]);
  store.clear();
  assert.deepStrictEqual(store.regions, []);
});

test("ReadRegionsStore.clear() emits READ_REGIONS_CHANGED", () => {
  const bus = new EventBus();
  const store = new ReadRegionsStore(bus);
  const events = [];
  bus.on(Topics.READ_REGIONS_CHANGED, (e) => events.push(e));
  store.clear();
  assert.equal(events.length, 1);
  assert.deepStrictEqual(events[0], { regions: [] });
});
