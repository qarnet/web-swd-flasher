import test from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../../src/core/event-bus.js";

test("EventBus on/emit delivers payloads", () => {
  const bus = new EventBus();
  const received = [];
  bus.on("test", (payload) => received.push(payload));
  bus.emit("test", { value: 42 });
  assert.deepStrictEqual(received, [{ value: 42 }]);
});

test("EventBus on returns unsubscribe function", () => {
  const bus = new EventBus();
  const received = [];
  const unsub = bus.on("test", (payload) => received.push(payload));
  unsub();
  bus.emit("test", { value: 1 });
  assert.deepStrictEqual(received, []);
});

test("EventBus multiple listeners on same topic", () => {
  const bus = new EventBus();
  const a = [];
  const b = [];
  bus.on("test", (p) => a.push(p));
  bus.on("test", (p) => b.push(p));
  bus.emit("test", { x: 1 });
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
});

test("EventBus emit with no listeners does not throw", () => {
  const bus = new EventBus();
  bus.emit("nonexistent", {});
});

test("EventBus once fires exactly once", () => {
  const bus = new EventBus();
  const received = [];
  bus.once("test", (payload) => received.push(payload));
  bus.emit("test", { a: 1 });
  bus.emit("test", { a: 2 });
  assert.deepStrictEqual(received, [{ a: 1 }]);
});

test("EventBus off removes specific listener", () => {
  const bus = new EventBus();
  const a = [];
  const b = [];
  const fnA = (p) => a.push(p);
  const fnB = (p) => b.push(p);
  bus.on("test", fnA);
  bus.on("test", fnB);
  bus.off("test", fnA);
  bus.emit("test", { x: 1 });
  assert.equal(a.length, 0);
  assert.equal(b.length, 1);
});

test("EventBus off with unknown topic is no-op", () => {
  const bus = new EventBus();
  bus.off("unknown", () => {});
});

test("EventBus clear(topic) removes all listeners for topic", () => {
  const bus = new EventBus();
  const received = [];
  bus.on("test", (p) => received.push(p));
  bus.clear("test");
  bus.emit("test", {});
  assert.equal(received.length, 0);
});

test("EventBus clear() removes all listeners for all topics", () => {
  const bus = new EventBus();
  const a = [];
  const b = [];
  bus.on("topic1", (p) => a.push(p));
  bus.on("topic2", (p) => b.push(p));
  bus.clear();
  bus.emit("topic1", {});
  bus.emit("topic2", {});
  assert.equal(a.length, 0);
  assert.equal(b.length, 0);
});

test("EventBus listener throw does not stop other listeners", () => {
  const bus = new EventBus();
  const received = [];
  bus.on("test", () => { throw new Error("boom"); });
  bus.on("test", (p) => received.push(p));
  bus.emit("test", { ok: true });
  assert.equal(received.length, 1);
  assert.deepStrictEqual(received[0], { ok: true });
});

test("EventBus on throws for non-function listener", () => {
  const bus = new EventBus();
  assert.throws(() => bus.on("test", "not a function"), TypeError);
});
