import { strict as assert } from "node:assert"
import { test } from "node:test"
import { sanitizeHtmlToText } from "../sanitize-html"

test("sanitizeHtmlToText: returns empty string for nullish input", () => {
  assert.equal(sanitizeHtmlToText(undefined), "")
  assert.equal(sanitizeHtmlToText(null), "")
  assert.equal(sanitizeHtmlToText(""), "")
})

test("sanitizeHtmlToText: leaves plain text untouched (just trims)", () => {
  assert.equal(sanitizeHtmlToText("  Hello world  "), "Hello world")
})

test("sanitizeHtmlToText: strips simple HTML tags", () => {
  const out = sanitizeHtmlToText("<p>Bonjour <b>monde</b></p>")
  assert.equal(out, "Bonjour monde")
})

test("sanitizeHtmlToText: decodes named HTML entities (fr accents)", () => {
  const input = "Cet h&ocirc;tel 4 &eacute;toiles &agrave; Hammamet"
  assert.equal(sanitizeHtmlToText(input), "Cet hôtel 4 étoiles à Hammamet")
})

test("sanitizeHtmlToText: handles double-encoded HTML (myGo description)", () => {
  // Real-world myGo response: the LongDescription is double-encoded
  const input =
    '&lt;span style="color: rgb(26, 26, 26);"&gt;Cet h&amp;ocirc;tel 4 &amp;eacute;toiles est situ&amp;eacute; &amp;agrave; 8 km du centre-ville&lt;/span&gt;'
  const out = sanitizeHtmlToText(input)
  assert.ok(!out.includes("<"), `should not contain '<', got: ${out}`)
  assert.ok(!out.includes("&"), `should not contain '&', got: ${out}`)
  assert.ok(out.includes("hôtel"), "should contain decoded 'hôtel'")
  assert.ok(out.includes("étoiles"))
  assert.ok(out.includes("situé"))
  assert.ok(out.includes("8 km du centre-ville"))
})

test("sanitizeHtmlToText: numeric character references", () => {
  // &#39; → ', &#233; → é
  assert.equal(sanitizeHtmlToText("L&#39;h&#244;tel"), "L'hôtel")
})

test("sanitizeHtmlToText: br/p convert to newlines, collapses whitespace", () => {
  const input = "<p>Ligne 1</p><p>Ligne 2</p><br><br>Ligne 3"
  const out = sanitizeHtmlToText(input)
  assert.match(out, /Ligne 1\n+Ligne 2\n+Ligne 3/)
})

test("sanitizeHtmlToText: removes script/style content entirely", () => {
  const input =
    "Avant<script>alert('xss')</script>Après<style>body{color:red}</style>fin"
  const out = sanitizeHtmlToText(input)
  assert.equal(out, "AvantAprèsfin")
})
