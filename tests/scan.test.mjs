import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLevels } from "../js/scan.js";

test("flat histogram spreads close to full range", () => {
  const { lo, hi } = computeLevels(new Array(256).fill(10));
  assert.ok(lo <= 10, `lo was ${lo}`);
  assert.ok(hi >= 245, `hi was ${hi}`);
});

test("narrow histogram maps to its own bounds", () => {
  const histogram = new Array(256).fill(0);
  for (let i = 100; i <= 140; i++) histogram[i] = 50;
  const { lo, hi } = computeLevels(histogram);
  assert.ok(lo >= 100 && lo <= 105, `lo was ${lo}`);
  assert.ok(hi >= 135 && hi <= 140, `hi was ${hi}`);
});

test("single-bin histogram never divides by zero", () => {
  const histogram = new Array(256).fill(0);
  histogram[128] = 1000;
  const { lo, hi } = computeLevels(histogram);
  assert.ok(hi > lo, `expected hi > lo, got ${lo}..${hi}`);
});

test("empty histogram falls back to full range", () => {
  const { lo, hi } = computeLevels(new Array(256).fill(0));
  assert.equal(lo, 0);
  assert.equal(hi, 255);
});
