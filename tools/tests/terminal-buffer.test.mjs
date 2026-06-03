import test from "node:test";
import assert from "node:assert/strict";
import { TerminalBuffer } from "../../src/ui/terminal-buffer.js";

function encode(s) {
  return new TextEncoder().encode(s);
}

test("TerminalBuffer: empty buffer", () => {
  const b = new TerminalBuffer({ channelId: "test" });
  assert.deepEqual(b.lines, []);
  assert.equal(b.pending, null);
  assert.equal(b.toPlainText(), "");
  assert.equal(b.droppedTotal, 0);
});

test("TerminalBuffer: single chunk no newline", () => {
  const b = new TerminalBuffer({ channelId: "test" });
  let delta = null;
  b.on("change", d => { delta = d; });
  b.append(encode("hello"));
  assert.equal(b.lines.length, 0);
  assert.ok(b.pending);
  assert.equal(b.pending.runs.length, 1);
  assert.equal(b.pending.runs[0].text, "hello");
  assert.deepEqual(delta, { added: 0, pendingDirty: true, dropped: 0, cleared: false });
});

test("TerminalBuffer: single line terminated by \\n", () => {
  const b = new TerminalBuffer({ channelId: "test" });
  b.append(encode("hello\n"));
  assert.equal(b.lines.length, 1);
  assert.equal(b.pending, null);
  assert.equal(b.lines[0].runs.map(r => r.text).join(""), "hello");
});

test("TerminalBuffer: two lines in one chunk", () => {
  const b = new TerminalBuffer({ channelId: "test" });
  b.append(encode("foo\nbar\n"));
  assert.equal(b.lines.length, 2);
  assert.equal(b.pending, null);
  assert.equal(b.lines[0].runs[0].text, "foo");
  assert.equal(b.lines[1].runs[0].text, "bar");
  assert.equal(b.toPlainText(), "foo\nbar\n");
});

test("TerminalBuffer: ANSI escape splits a chunk, produces two runs", () => {
  const b = new TerminalBuffer({ channelId: "test" });
  b.appendString("foo\x1b[31mbar\n");
  assert.equal(b.lines.length, 1);
  assert.equal(b.pending, null);
  const line = b.lines[0];
  assert.equal(line.runs.length, 2);
  assert.equal(line.runs[0].text, "foo");
  assert.equal(line.runs[0].fg, null);
  assert.equal(line.runs[1].text, "bar");
  assert.equal(line.runs[1].fg, "#c23621");
});

test("TerminalBuffer: partial ANSI escape across chunks via append", () => {
  const b = new TerminalBuffer({ channelId: "test" });
  b.append(encode("\x1b["));
  b.append(encode("31mfoo\n"));
  assert.equal(b.lines.length, 1);
  const line = b.lines[0];
  assert.equal(line.runs.length, 1);
  assert.equal(line.runs[0].text, "foo");
  assert.equal(line.runs[0].fg, "#c23621");
});

test("TerminalBuffer: SGR state persists across newlines", () => {
  const b = new TerminalBuffer({ channelId: "test" });
  b.appendString("\x1b[31mfoo\nbar\n");
  assert.equal(b.lines.length, 2);
  assert.equal(b.lines[0].runs[0].fg, "#c23621");
  assert.equal(b.lines[1].runs[0].fg, "#c23621");
});

test("TerminalBuffer: coalescing runs with same SGR", () => {
  const b = new TerminalBuffer({ channelId: "test" });
  b.appendString("hel");
  b.appendString("lo");
  b.appendString("\n");
  assert.equal(b.lines.length, 1);
  assert.equal(b.lines[0].runs.length, 1);
  assert.equal(b.lines[0].runs[0].text, "hello");
});

test("TerminalBuffer: \\r\\n split produces one line", () => {
  const b = new TerminalBuffer({ channelId: "test" });
  b.appendString("foo\r\nbar\r\n");
  assert.equal(b.lines.length, 2);
  assert.equal(b.lines[0].runs[0].text, "foo");
  assert.equal(b.lines[1].runs[0].text, "bar");
});

test("TerminalBuffer: bare \\r with crAsNewline true", () => {
  const b = new TerminalBuffer({ channelId: "test", crAsNewline: true });
  b.appendString("a\rb\rc\n");
  assert.equal(b.lines.length, 3);
  assert.equal(b.lines[0].runs[0].text, "a");
  assert.equal(b.lines[1].runs[0].text, "b");
  assert.equal(b.lines[2].runs[0].text, "c");
});

test("TerminalBuffer: bare \\r with crAsNewline false", () => {
  const b = new TerminalBuffer({ channelId: "test", crAsNewline: false });
  b.appendString("a\rb\rc\n");
  assert.equal(b.lines.length, 1);
  assert.equal(b.lines[0].runs[0].text, "a\rb\rc");
});

test("TerminalBuffer: setCrAsNewline mid-stream - old lines unchanged", () => {
  const b = new TerminalBuffer({ channelId: "test", crAsNewline: true });
  b.appendString("a\rb\r"); // two lines: "a", "b"
  assert.equal(b.lines.length, 2);
  b.setCrAsNewline(false);
  b.appendString("c\rd\n"); // one line: "c\rd"
  assert.equal(b.lines.length, 3);
  assert.equal(b.lines[2].runs[0].text, "c\rd");
});

test("TerminalBuffer: ring cap evicts oldest lines", () => {
  const b = new TerminalBuffer({ channelId: "test", maxLines: 10 });
  for (let i = 0; i < 25; i++) {
    b.appendString(`line${i}\n`);
  }
  assert.equal(b.lines.length, 10);
  assert.equal(b.lines[0].runs[0].text, "line15");
  assert.equal(b.lines[9].runs[0].text, "line24");
  assert.equal(b.droppedTotal, 15);
});

test("TerminalBuffer: ring cap in one append", () => {
  const b = new TerminalBuffer({ channelId: "test", maxLines: 10 });
  const lines = Array.from({ length: 30 }, (_, i) => `line${i}`).join("\n") + "\n";
  b.appendString(lines);
  assert.equal(b.lines.length, 10);
  assert.equal(b.lines[0].runs[0].text, "line20");
  assert.equal(b.droppedTotal, 20);
});

test("TerminalBuffer: clear() resets everything", () => {
  const b = new TerminalBuffer({ channelId: "test" });
  b.appendString("hello\nworld\n");
  assert.equal(b.lines.length, 2);
  let cleared = false;
  b.on("change", delta => { if (delta.cleared) cleared = true; });
  b.clear();
  assert.equal(b.lines.length, 0);
  assert.equal(b.pending, null);
  assert.equal(b.droppedTotal, 0);
  assert.ok(cleared);
  // decoder reset: append after clear works
  b.append(encode("foo\n"));
  assert.equal(b.lines[0].runs[0].text, "foo");
});

test("TerminalBuffer: change event fires once per append", () => {
  const b = new TerminalBuffer({ channelId: "test" });
  let count = 0;
  b.on("change", () => { count++; });
  b.appendString("a\nb\nc\nd\n");
  assert.equal(count, 1);
});

test("TerminalBuffer: appendString with source tx", () => {
  const b = new TerminalBuffer({ channelId: "test" });
  b.appendString("hello", { source: "tx" });
  assert.ok(b.pending);
  assert.equal(b.pending.source, "tx");
  b.appendString("\n");
  assert.equal(b.lines[0].source, "tx");
});

test("TerminalBuffer: UTF-8 multi-byte split across append() calls", () => {
  const b = new TerminalBuffer({ channelId: "test" });
  const emoji = "🚀"; // 4 bytes in UTF-8: F0 9F 9A 80
  const bytes = new TextEncoder().encode(emoji);
  b.append(bytes.slice(0, 2));
  b.append(bytes.slice(2));
  b.append(encode("\n"));
  assert.equal(b.lines.length, 1);
  assert.equal(b.lines[0].runs[0].text, emoji);
});

test("TerminalBuffer: toPlainText strips ANSI escapes", () => {
  const b = new TerminalBuffer({ channelId: "test" });
  b.appendString("\x1b[31mred\x1b[0m normal\n\x1b[32mgreen\n");
  assert.equal(b.toPlainText(), "red normal\ngreen\n");
});

test("TerminalBuffer: toPlainText with pending line (no trailing newline)", () => {
  const b = new TerminalBuffer({ channelId: "test" });
  b.appendString("line1\nline2");
  assert.equal(b.toPlainText(), "line1\nline2");
  b.appendString(" continued\n");
  assert.equal(b.toPlainText(), "line1\nline2 continued\n");
});

test("TerminalBuffer: listener errors do not stop other listeners", () => {
  const b = new TerminalBuffer({ channelId: "test" });
  let warned = null;
  const b2 = new TerminalBuffer({ channelId: "test2", onWarning: (msg) => { warned = msg; } });
  let count = 0;
  b2.on("change", () => { count++; });
  b2.on("change", () => { throw new Error("boom"); });
  b2.on("change", () => { count++; });
  b2.appendString("ok\n");
  assert.equal(count, 2);
  assert.ok(warned && warned.includes("boom"), "should log warning about listener error");
});

test("TerminalBuffer: maxPendingChars force-finalises pending line", () => {
  let warnings = [];
  const b = new TerminalBuffer({
    channelId: "test",
    maxLines: 100,
    onWarning: (msg) => warnings.push(msg),
  });
  b.appendString("x".repeat(100_001));
  assert.ok(b.lines.length >= 1, "should have force-finalised at least one line");
  assert.ok(warnings.some(m => m.includes("pending line exceeded")), "should warn about force-finalise");
});

test("TerminalBuffer: crAsNewline default is true", () => {
  const b = new TerminalBuffer({ channelId: "test" });
  b.appendString("a\rb\n");
  assert.equal(b.lines.length, 2);
});

test("TerminalBuffer: clear resets decoder so multi-byte state does not leak", () => {
  const b = new TerminalBuffer({ channelId: "test" });
  const emoji = "🚀";
  const bytes = new TextEncoder().encode(emoji);
  b.append(bytes.slice(0, 2)); // partial multi-byte held by decoder
  b.clear();
  b.append(encode("hello\n"));
  assert.equal(b.lines[0].runs[0].text, "hello");
});

test("TerminalBuffer: append runs decoded text through same parser", () => {
  const b = new TerminalBuffer({ channelId: "test" });
  b.append(encode("\x1b[32mgreen\n"));
  assert.equal(b.lines[0].runs[0].fg, "#2bc464");
});

test("TerminalBuffer: multiple subscribe/unsubscribe", () => {
  const b = new TerminalBuffer({ channelId: "test" });
  let c1 = 0, c2 = 0;
  const u1 = b.on("change", () => { c1++; });
  const u2 = b.on("change", () => { c2++; });
  b.appendString("test\n");
  assert.equal(c1, 1);
  assert.equal(c2, 1);
  u1();
  b.appendString("test2\n");
  assert.equal(c1, 1);
  assert.equal(c2, 2);
  u2();
  b.appendString("test3\n");
  assert.equal(c1, 1);
  assert.equal(c2, 2);
});
