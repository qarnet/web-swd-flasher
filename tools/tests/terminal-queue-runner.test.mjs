import test from "node:test";
import assert from "node:assert/strict";
import { QueueRunner } from "../../src/ui/components/terminal-queue-runner.js";

test("QueueRunner: push adds item", () => {
  const calls = [];
  const r = new QueueRunner({ send: async () => {} });
  r.push("item1");
  assert.equal(r.getItems().length, 1);
  assert.equal(r.getItems()[0].text, "item1");
  assert.equal(r.getItems()[0].status, "pending");
});

test("QueueRunner: remove removes item", () => {
  const r = new QueueRunner({ send: async () => {} });
  r.push("a");
  r.push("b");
  const id = r.getItems()[0].id;
  r.remove(id);
  assert.equal(r.getItems().length, 1);
  assert.equal(r.getItems()[0].text, "b");
});

test("QueueRunner: setDelay updates item delay", () => {
  const r = new QueueRunner({ send: async () => {} });
  r.push("x");
  const id = r.getItems()[0].id;
  r.setDelay(id, 500);
  assert.equal(r.getItems()[0].delayMs, 500);
});

test("QueueRunner: clear empties queue when not running", () => {
  const r = new QueueRunner({ send: async () => {} });
  r.push("a");
  r.push("b");
  assert.ok(r.clear());
  assert.equal(r.getItems().length, 0);
});

test("QueueRunner: clear refused while running", async () => {
  let resolve;
  const r = new QueueRunner({
    send: async () => {},
    delay: () => new Promise(r => { resolve = r; }),
  });
  r.push("a");
  r.start();
  await new Promise(r2 => setTimeout(r2, 5));
  assert.equal(r.clear(), false);
  assert.equal(r.isRunning(), true);
  resolve();
  r.stop();
});

test("QueueRunner: items sent in order with correct delays", async () => {
  const sent = [];
  const delays = [];
  const r = new QueueRunner({
    send: async (text) => { sent.push(text); },
    delay: async (ms) => { delays.push(ms); },
  });
  r.push("a");
  r.setDelay(r.getItems()[0].id, 100);
  r.push("b");
  r.push("c");
  r.setDelay(r.getItems()[2].id, 50);
  r.start();
  await new Promise(r2 => setTimeout(r2, 20));
  r.stop();
  assert.deepEqual(sent, ["a", "b", "c"]);
  assert.deepEqual(delays, [100, 0, 50]);
});

test("QueueRunner: stop during delay keeps item pending", async () => {
  const sent = [];
  let resolve;
  const r = new QueueRunner({
    send: async (text) => { sent.push(text); },
    delay: () => new Promise(r => { resolve = r; }),
  });
  r.push("first");
  r.push("second");
  r.start();
  await new Promise(r2 => setTimeout(r2, 5));
  r.stop();
  resolve(); // unblock delay
  await new Promise(r2 => setTimeout(r2, 5));
  const items = r.getItems();
  assert.equal(items[0].status, "pending");
  assert.equal(items[1].status, "pending");
  assert.equal(sent.length, 0);
});

test("QueueRunner: send throws marks failed and pauses", async () => {
  const sent = [];
  const r = new QueueRunner({
    send: async (text) => {
      if (text === "bad") throw new Error("failed!");
      sent.push(text);
    },
    delay: async () => {},
  });
  r.push("good1");
  r.push("bad");
  r.push("good2");
  r.start();
  await new Promise(r2 => setTimeout(r2, 20));
  assert.deepEqual(sent, ["good1"]);
  assert.equal(r.getItems()[1].status, "failed");
  assert.equal(r.getItems()[1].error, "failed!");
  assert.equal(r.getItems()[2].status, "pending");
  assert.equal(r.isRunning(), false);
});

test("QueueRunner: emit sequence fires change and running events", async () => {
  const events = [];
  const r = new QueueRunner({
    send: async () => {},
    delay: async () => {},
  });
  r.on("running", (v) => events.push("running:" + v));
  r.on("change", () => events.push("change"));
  r.on("itemSent", (item) => events.push("itemSent:" + item.text));
  r.push("x");
  r.start();
  await new Promise(r2 => setTimeout(r2, 5));
  const idxRunning = events.findIndex(e => e === "running:true");
  const idxChange = events.findIndex(e => e === "change");
  assert.ok(idxRunning >= 0);
  assert.ok(idxChange >= 0);
});

test("QueueRunner: setItems restores persisted items", () => {
  const r = new QueueRunner({ send: async () => {} });
  r.setItems([{ text: "persisted", delayMs: 200, status: "pending" }]);
  const items = r.getItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].text, "persisted");
  assert.equal(items[0].delayMs, 200);
});
