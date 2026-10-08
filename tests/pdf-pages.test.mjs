import { test } from "node:test";
import assert from "node:assert/strict";
import { isPdf, pdfRenderScale } from "../js/pdf-pages.js";

test("isPdf: spots a PDF by its type or its name, and leaves photos alone", () => {
  assert.equal(isPdf({ type: "application/pdf", name: "story" }), true);
  assert.equal(isPdf({ type: "", name: "Student 01 - Y2ATCN.PDF" }), true, "some pickers give no type");
  assert.equal(isPdf({ type: "image/jpeg", name: "IMG_0001.jpg" }), false);
  assert.equal(isPdf({ type: "image/heic", name: "pdf-notes.heic" }), false);
  assert.equal(isPdf(null), false);
});

test("pdfRenderScale: the longer edge lands on the target, either way round", () => {
  assert.equal(Math.round(842 * pdfRenderScale(596, 842, 2000)), 2000, "portrait A4");
  assert.equal(Math.round(842 * pdfRenderScale(842, 596, 2000)), 2000, "landscape A4");
  assert.equal(pdfRenderScale(0, 0, 2000), 1, "an empty page does not divide by zero");
});
