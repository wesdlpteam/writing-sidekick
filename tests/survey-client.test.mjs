import test from "node:test";
import assert from "node:assert/strict";
import { SURVEY_QUESTIONS, SURVEY_CHOICES, isTrial, surveyPayload, isComplete } from "../js/survey.js";

test("the three questions and three faces, word for word from the design", () => {
  assert.deepEqual(SURVEY_QUESTIONS.map((q) => [q.key, q.text]), [
    ["understood", "Did you understand your feedback?"],
    ["liked", "Did you like using Sidekick?"],
    ["stronger", "Did Sidekick help make your writing stronger?"],
  ]);
  assert.deepEqual(SURVEY_CHOICES, [
    { value: "yes", emoji: "😀", label: "Yes" },
    { value: "bit", emoji: "😐", label: "A bit" },
    { value: "no", emoji: "🙁", label: "No" },
  ]);
});

test("only the trial link shows the survey", () => {
  assert.equal(isTrial("?trial=1"), true);
  assert.equal(isTrial("?idle=5&trial=1"), true);
  assert.equal(isTrial(""), false);
  assert.equal(isTrial("?trial=0"), false);
});

test("the payload carries the year level and answers, or nothing when none were tapped", () => {
  assert.equal(surveyPayload({}, 3), null);
  assert.deepEqual(surveyPayload({ liked: "yes" }, 3), { yearLevel: 3, understood: null, liked: "yes", stronger: null });
  assert.equal(isComplete({ understood: "yes", liked: "bit" }), false);
  assert.equal(isComplete({ understood: "yes", liked: "bit", stronger: "no" }), true);
});
