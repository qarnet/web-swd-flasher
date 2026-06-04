import test from "node:test";
import assert from "node:assert/strict";
import { escHtml } from "../../src/ui/components/escape-html.js";

test("escHtml escapes &", () => {
  assert.equal(escHtml("a & b"), "a &amp; b");
});

test("escHtml escapes <", () => {
  assert.equal(escHtml("<script>"), "&lt;script&gt;");
});

test("escHtml escapes >", () => {
  assert.equal(escHtml("x > y"), "x &gt; y");
});

test("escHtml escapes \"", () => {
  assert.equal(escHtml('say "hello"'), "say &quot;hello&quot;");
});

test("escHtml leaves safe chars unchanged", () => {
  assert.equal(escHtml("hello world 123"), "hello world 123");
});

test("escHtml handles empty string", () => {
  assert.equal(escHtml(""), "");
});

test("escHtml escapes all four characters in one string", () => {
  assert.equal(escHtml("<a href=\"x\">&</a>"),
    "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
});
