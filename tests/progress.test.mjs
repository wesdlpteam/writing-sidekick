import { test } from "node:test";
import assert from "node:assert/strict";
import { creep, blocksLit, BLOCKS } from "../js/progress.js";

test("creep: starts at the stage start, moves forward, never reaches the stage end", () => {
  assert.equal(creep(0.2, 1, 0, 10000), 0.2);
  const early = creep(0.2, 1, 5000, 10000);
  const late = creep(0.2, 1, 60000, 10000);
  assert.ok(early > 0.2 && late > early, "keeps moving forward");
  assert.ok(creep(0.2, 1, 10 ** 9, 10000) < 1, "waiting forever still leaves the last bit for the real finish");
  assert.equal(creep(0, 1, -50, 10000), 0, "a clock blip backwards does not go below the start");
});

test("blocksLit: whole blocks only, clamped to the bar", () => {
  assert.equal(blocksLit(0), 0);
  assert.equal(blocksLit(0.5), BLOCKS / 2);
  assert.equal(blocksLit(0.99), BLOCKS - 1, "the last block waits for the finish");
  assert.equal(blocksLit(1), BLOCKS);
  assert.equal(blocksLit(1.4), BLOCKS);
  assert.equal(blocksLit(-1), 0);
});
