import test from "node:test";
import assert from "node:assert/strict";
import { SearchIndex } from "../../src/ui/components/terminal-search-index.js";
import { TerminalBuffer } from "../../src/ui/terminal-buffer.js";

function newBuffer() {
  return new TerminalBuffer({ channelId: "test" });
}

test("SearchIndex: empty buffer has 0 matches", () => {
  const b = newBuffer();
  const idx = new SearchIndex(b);
  idx.setQuery("foo", "plain");
  idx.rebuildIfNeeded();
  assert.deepEqual(idx.matches, []);
});

test("SearchIndex: plain match across multiple lines", () => {
  const b = newBuffer();
  b.appendString("foo\nbar\nfoo\n");
  const idx = new SearchIndex(b);
  idx.setQuery("foo", "plain");
  idx.rebuildIfNeeded();
  assert.equal(idx.matches.length, 2);
  assert.equal(idx.matches[0].lineIndex, 0);
  assert.equal(idx.matches[1].lineIndex, 2);
});

test("SearchIndex: regex match", () => {
  const b = newBuffer();
  b.appendString("foo\nbar\nbaz\n");
  const idx = new SearchIndex(b);
  idx.setQuery("^b", "regex");
  idx.rebuildIfNeeded();
  assert.equal(idx.matches.length, 2);
  assert.equal(idx.matches[0].lineIndex, 1);
});

test("SearchIndex: invalid regex sets error, matches empty", () => {
  const b = newBuffer();
  b.appendString("test\n");
  const idx = new SearchIndex(b);
  idx.setQuery("(", "regex");
  assert.ok(idx.error);
  assert.deepEqual(idx.matches, []);
});

test("SearchIndex: buffer change dirties index", () => {
  const b = newBuffer();
  b.appendString("foo\n");
  const idx = new SearchIndex(b);
  idx.setQuery("foo", "plain");
  idx.rebuildIfNeeded();
  assert.equal(idx.matches.length, 1);
  b.appendString("foo foo\n");
  idx.rebuildIfNeeded();
  assert.equal(idx.matches.length, 3);
});

test("SearchIndex: matchLine checks single line", () => {
  const b = newBuffer();
  b.appendString("hello world\nbye\n");
  const idx = new SearchIndex(b);
  idx.setQuery("hello", "plain");
  assert.ok(idx.matchLine(b.lines[0]));
  assert.ok(!idx.matchLine(b.lines[1]));
});

test("SearchIndex: matchLine regex", () => {
  const b = newBuffer();
  b.appendString("abc123\ndef456\n");
  const idx = new SearchIndex(b);
  idx.setQuery("\\d+", "regex");
  assert.ok(idx.matchLine(b.lines[0]));
  assert.ok(idx.matchLine(b.lines[1]));
});

test("SearchIndex: clear sets dirty and empties", () => {
  const b = newBuffer();
  b.appendString("foo\n");
  const idx = new SearchIndex(b);
  idx.setQuery("foo", "plain");
  idx.rebuildIfNeeded();
  assert.equal(idx.matches.length, 1);
  b.clear();
  idx.rebuildIfNeeded();
  assert.deepEqual(idx.matches, []);
  assert.equal(idx.query, "");
  assert.equal(idx.mode, "plain");
  assert.equal(idx.error, null);
});

test("SearchIndex: destroy unsubscribes from buffer", () => {
  const b = newBuffer();
  const idx = new SearchIndex(b);
  let count = 0;
  const unsub = b.on("change", () => { count++; });
  b.appendString("test\n");
  assert.equal(count, 1);
  unsub();
  b.appendString("test2\n");
  assert.equal(count, 1);
  idx.destroy();
});
