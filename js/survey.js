// Trial survey on the Mission complete slide (docs/superpowers/specs/2026-10-28-trial-survey-design.md).
// Shown only when the app is opened from the trial link (?trial=1). The wording is fixed by the design.

export const SURVEY_QUESTIONS = [
  { key: "understood", text: "Did you understand your feedback?" },
  { key: "liked", text: "Did you like using Sidekick?" },
  { key: "stronger", text: "Did Sidekick help make your writing stronger?" },
];

export const SURVEY_CHOICES = [
  { value: "yes", emoji: "😀", label: "Yes" },
  { value: "bit", emoji: "😐", label: "A bit" },
  { value: "no", emoji: "🙁", label: "No" },
];

export const isTrial = (search) => new URLSearchParams(search).get("trial") === "1";

export const isComplete = (answers) => SURVEY_QUESTIONS.every((q) => answers[q.key]);

// What goes to the server: the year level and the three answers, nothing else. Null when no
// question was answered, so nothing is sent.
export function surveyPayload(answers, yearLevel) {
  if (!SURVEY_QUESTIONS.some((q) => answers[q.key])) return null;
  return { yearLevel, ...Object.fromEntries(SURVEY_QUESTIONS.map((q) => [q.key, answers[q.key] || null])) };
}
