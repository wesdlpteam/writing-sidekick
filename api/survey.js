import { handlePreamble } from "./_cors.js";
import { handleSurvey } from "./_survey.js";

// Trial survey: saves one anonymous row, or returns the counts for stats.html. See api/_survey.js.
export default async function handler(req, res) {
  if (handlePreamble(req, res)) return;
  const { status, payload } = await handleSurvey(req.body, { fetchImpl: fetch, env: process.env });
  res.status(status).json(payload);
}
