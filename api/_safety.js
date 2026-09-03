// Safeguarding. A child's writing can carry a disclosure that needs a trusted adult, not
// writing advice. Two layers run before any feedback prompt: quick local rules for the plainest
// first-person cases (and for obvious contact details), then the provider's moderation check,
// which weighs context, for everything else. Levels: "ordinary" (carry on), "needs_adult",
// "immediate_risk". Nothing that passes through here is ever logged.
import { apiUrl, fetchWithTimeout } from "./_provider.js";

const MODERATION_TIMEOUT_MS = 15_000;
const DEFAULT_MODERATION_MODEL = "omni-moderation-latest";

// Kept deliberately narrow and first-person: stories about villains, battles and monsters pass
// through to the moderation check rather than tripping these.
const IMMEDIATE = [
  /\b(kill|hurt|cut|stab|hang|drown|shoot)(ing)? myself\b/i,
  /\b(want|wanted|wanna|going|gonna|plan|planning) to (die|be dead|kill myself|end (it|my life|it all))\b/i,
  /\b(wish|wished) i (was|were) dead\b/i,
  /\bdon'?t want to (live|be alive|be here) any ?more\b/i,
  /\bsuicid(e|al)\b/i,
  /\bself[- ]?harm/i,
  /\bend my life\b/i,
];
// Physical harm needs an adult or carer as the subject: "Dad hits me" is a disclosure, "the
// wave hit me" is a beach story and "my brother hit me" is for the moderation check and the
// teacher, not an automatic stop.
const CARER = "(?:dad|daddy|mum|mummy|mom|father|mother|step\\w+|uncle|aunt|auntie|nan|nanna|nanny|pop|grandad|grandpa|grandma|carer|foster \\w+|my (?:mum|mom|dad)'?s? \\w+)";
const HARM = "(?:hits?|hitting|punch(?:es|ed|ing)?|kicks?|kicking|beats?|beating|slaps?|slapping|chokes?|choking|strangl(?:es|ed|ing)|whips?|whipping|burns?|burning|hurts?|hurting)";
const NEEDS_ADULT = [
  new RegExp(`\\b(?:my )?${CARER} (?:\\w+ )?${HARM} me\\b`, "i"),
  /\b(touch(es|ed|ing)?|grab(s|bed|bing)?) (me|my) (private|privates|bum|bottom|willy|vagina|penis|breasts?|boobs?)\b/i,
  /\btouch(es|ed|ing)? me (there|down there|where i don'?t (like|want))\b/i,
  /\b(scared|frightened|afraid|terrified) (of|to go) home\b/i,
  /\b(scared|frightened|afraid|terrified) of (my )?(dad|daddy|mum|mummy|mom|father|mother|stepdad|stepmum|stepfather|stepmother|uncle|aunt|brother|sister|nan|pop|grandad|grandma|grandpa|carer)\b/i,
  /\b(threatens?|threatened|threatening) to (kill|hurt|hit|bash) (me|us|my)\b/i,
  /\b(nobody|no one|no-one) (feeds|looks after|cares about|cares for) me\b/i,
  /\bi (hate|hated) (myself|my life)\b/i,
  /\b(locks?|locked|locking) me (in|up|outside|out)\b/i,
  /\b(made|make|makes) me (touch|watch|do) (him|her|them|it|things)\b/i,
  /\bnot allowed to (eat|have (any )?(dinner|food|breakfast|lunch))\b/i,
];

export function localSafetyScan(text) {
  const value = String(text || "");
  if (IMMEDIATE.some((re) => re.test(value))) return "immediate_risk";
  if (NEEDS_ADULT.some((re) => re.test(value))) return "needs_adult";
  return "ordinary";
}

// Obvious contact details are blanked before the writing goes to the feedback model: email
// addresses, Australian phone numbers and street addresses. The child's copy on the iPad is
// untouched.
export function minimiseContactDetails(text) {
  return String(text || "")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/(?:\+?61|0)[2-9](?:[ -]?\d){8}\b/g, "[phone number]")
    .replace(
      /\b\d{1,5}[a-z]?(?:\/\d+)? [A-Z][a-z]+(?: [A-Z][a-z]+)* (?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Crescent|Cres|Place|Pl|Lane|Ln|Way|Parade|Pde|Close|Cl|Highway|Hwy|Terrace|Tce|Boulevard|Blvd)\b\.?/g,
      "[address]",
    );
}

// Thresholds for a children's writing app. Plain "violence" is not listed on purpose: stories
// are full of battles and monsters, and the local rules above catch first-person harm.
const IMMEDIATE_CATEGORIES = { "self-harm/intent": 0.4, "self-harm/instructions": 0.4, "sexual/minors": 0.3 };
const ADULT_CATEGORIES = { "self-harm": 0.4, sexual: 0.5, "harassment/threatening": 0.6, "hate/threatening": 0.6, "violence/graphic": 0.8 };

// The provider's moderation check. Returns a level, or null when it could not be run.
export async function moderationLevel(text, { fetchImpl, env }) {
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      apiUrl(env, "moderations"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: env.OPENAI_MODERATION_MODEL || DEFAULT_MODERATION_MODEL, input: text }),
      },
      MODERATION_TIMEOUT_MS,
    );
    if (!response.ok) return null;
    const data = await response.json();
    const scores = data?.results?.[0]?.category_scores;
    if (!scores || typeof scores !== "object") return null;
    const over = (table) => Object.entries(table).some(([key, min]) => Number(scores[key]) >= min);
    if (over(IMMEDIATE_CATEGORIES)) return "immediate_risk";
    if (over(ADULT_CATEGORIES)) return "needs_adult";
    return "ordinary";
  } catch {
    return null;
  }
}

// The full check. Local rules first (no network); the moderation check only when they pass.
// If the moderation check fails or times out, the local result stands rather than every child
// being turned away, and `checked` records that.
export async function assessSafety(text, deps) {
  const local = localSafetyScan(text);
  if (local !== "ordinary") return { level: local, checked: "local" };
  const remote = await moderationLevel(text, deps);
  if (remote === null) return { level: "ordinary", checked: "local_only" };
  return { level: remote, checked: "full" };
}

// What the child sees instead of feedback. DRAFT: the school's safeguarding lead should approve
// this wording, and the teacher note, before children use the app.
const RESPONSES = {
  needs_adult: {
    title: "This writing needs a trusted adult",
    message: "Thank you for writing this. It sounds like something important is going on. Please show your teacher or another adult you trust now. They will help.",
  },
  immediate_risk: {
    title: "Please show a trusted adult right now",
    message:
      "Thank you for telling the truth in your writing. You matter, and you should not carry this on your own. Please show your teacher or another adult you trust right now. If you need to talk to someone straight away, Kids Helpline is free any time on 1800 55 1800.",
  },
};
const TEACHER_NOTE =
  "For the teacher: this piece of writing may include something that needs your attention. Please read it with the student and follow the school's wellbeing and child-safety steps. The app has not given any writing feedback on it.";

// A safety result has none of the feedback fields, so the app cannot show power-ups, spelling
// or word power by mistake.
export function safetyPayload(level) {
  const response = RESPONSES[level] || RESPONSES.needs_adult;
  return { safety: level in RESPONSES ? level : "needs_adult", title: response.title, message: response.message, teacherNote: TEACHER_NOTE };
}
