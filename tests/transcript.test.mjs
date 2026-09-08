import test from "node:test";
import assert from "node:assert/strict";
import { reflowTranscript } from "../js/transcript.js";

test("handwritten line endings reflow while real paragraphs remain separate", () => {
  assert.equal(reflowTranscript("My famly went\nto the beach.\nWe had fun!\n\nAfter lunch we\nwent home."), "My famly went to the beach. We had fun!\n\nAfter lunch we went home.");
});
test("Windows line endings and whitespace-only paragraph separators are supported", () => {
  assert.equal(reflowTranscript("  First line\r\n next line.\r\n \t\r\nHeading\r\n\r\nLast paragraph. "), "First line next line.\n\nHeading\n\nLast paragraph.");
});
test("reflow leaves spelling, punctuation, capitals and within-line spacing unchanged", () => {
  assert.equal(reflowTranscript("i  went to mum's\nhous, yesterday"), "i  went to mum's hous, yesterday");
  assert.equal(reflowTranscript(""), "");
});
