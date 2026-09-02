import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateBackground, scanCurve, flattenToScan } from "../js/scan.js";

// A "photographed page": brightness falls from 235 on the left to 120 on the right (a shadow),
// with a few dark 2px-wide strokes drawn across it.
function shadedPage(width, height) {
  const gray = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const paper = Math.round(235 - (115 * x) / (width - 1));
      const onStroke = (y % 20 === 10 || y % 20 === 11) && x > 8 && x < width - 8;
      gray[y * width + x] = onStroke ? Math.round(paper * 0.35) : paper;
    }
  }
  return gray;
}

test("estimateBackground follows the paper brightness, not the strokes", () => {
  const w = 120;
  const h = 80;
  const gray = shadedPage(w, h);
  const bg = estimateBackground(gray, w, h, 8);
  // Sample a stroke pixel near the left, middle and right: the background estimate there
  // should sit close to the local paper value, far above the stroke's own value.
  for (const x of [20, 60, 100]) {
    const y = 30; // a stroke row
    const paper = Math.round(235 - (115 * x) / (w - 1));
    const value = bg[y * w + x];
    assert.ok(Math.abs(value - paper) < 25, `bg at x=${x} was ${value}, paper ${paper}`);
    assert.ok(value > gray[y * w + x] + 60, "background must be much brighter than the stroke");
  }
});

test("scanCurve maps paper to white and ink to near black", () => {
  assert.equal(scanCurve(1.0), 255);
  assert.equal(scanCurve(0.97), 255);
  assert.ok(scanCurve(0.7) < 120, "pencil-grey ink should come out clearly dark");
  assert.ok(scanCurve(0.35) < 15, "pen ink should come out near black");
  assert.equal(scanCurve(0), 0);
});

test("flattenToScan whitens a shadowed page and keeps the writing dark", () => {
  const w = 120;
  const h = 80;
  const out = flattenToScan(shadedPage(w, h), w, h);
  // Paper pixels away from strokes, on both the bright and the shadowed side.
  for (const [x, y] of [[20, 2], [100, 2], [20, 60], [100, 60]]) {
    assert.ok(out[y * w + x] >= 245, `paper at ${x},${y} was ${out[y * w + x]}`);
  }
  // Stroke pixels on both sides.
  for (const [x, y] of [[20, 30], [100, 30], [60, 50]]) {
    assert.ok(out[y * w + x] <= 60, `ink at ${x},${y} was ${out[y * w + x]}`);
  }
});

test("flattenToScan leaves a blank page blank", () => {
  const w = 40;
  const h = 40;
  const gray = new Uint8ClampedArray(w * h).fill(180);
  const out = flattenToScan(gray, w, h);
  assert.ok(out.every((v) => v >= 250));
});
