import { reflowTranscript } from "./transcript.js?v=20260909-powers";
import { writingStrength, skillExplanation, heroPowers } from "./feedback-visuals.js?v=20260909-powers";
import { prepareScan, rotate90, rotateBy, thumbnail } from "./scan.js?v=20260909-powers";
import { transcribePage, getFeedback, checkSynonym, detectOrientation } from "./api.js?v=20260909-powers";
import { buildFeedbackImage, saveFeedbackImage } from "./share-image.js?v=20260909-powers";

const MAX_PAGES = 2;

const state = {
  yearLevel: null,
  genre: "narrative",
  pages: [], // cleaned-up page photos as data URLs, in order
  transcript: "", // the typed copy of the whole piece (pages joined), kept up to date as the child edits
  feedback: null,
};

const $ = (id) => document.getElementById(id);

function show(screenId) {
  $("app").classList.toggle("review-wide", screenId === "screen-review");
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === screenId));
  window.scrollTo(0, 0);
  focusHeading(document.querySelector(`#${screenId} h1`));
}

// Screen readers need telling where they are: after a screen, slide or page change, focus
// lands on its heading.
function focusHeading(node) {
  if (!node) return;
  node.tabIndex = -1;
  // A tick later: the loading overlay's `finally` has switched the screens back on by then.
  setTimeout(() => node.focus({ preventScroll: true }), 0);
}

const joinOr = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}` : items[0]);

// While the sidekick works, the screens underneath are switched off (inert) so nothing can be
// tapped twice, and the app reports itself busy.
function setLoading(visible, message) {
  if (message) $("loading-msg").textContent = message;
  $("loading").hidden = !visible;
  document.querySelectorAll(".screen").forEach((s) => {
    s.inert = visible;
  });
  $("app").setAttribute("aria-busy", visible ? "true" : "false");
}

function showError(message) {
  $("error-msg").textContent = message;
  $("error-banner").hidden = false;
}

// ---- start screen ----------------------------------------------------------

function refreshStartButton() {
  $("btn-start").disabled = !state.yearLevel;
  $("btn-start").textContent = state.yearLevel ? "Let's go →" : "Choose your year first";
}

function setSeniorLook() {
  document.body.classList.toggle("senior", state.yearLevel >= 5);
}

$("year-buttons").addEventListener("click", (event) => {
  const btn = event.target.closest(".year-btn");
  if (!btn) return;
  state.yearLevel = Number(btn.dataset.year);
  document.querySelectorAll(".year-btn").forEach((b) => markSelected(b, b === btn));
  setSeniorLook();
  refreshStartButton();
});

$("genre-chips").addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  state.genre = chip.dataset.genre;
  document.querySelectorAll(".chip").forEach((c) => markSelected(c, c === chip));
});

// The selected year and kind of writing are told to screen readers too, not just coloured.
function markSelected(button, selected) {
  button.classList.toggle("selected", selected);
  button.setAttribute("aria-pressed", selected ? "true" : "false");
}
document.querySelectorAll(".year-btn, .chip").forEach((b) => markSelected(b, b.classList.contains("selected")));

$("btn-start").addEventListener("click", () => show("screen-camera"));
// Return to the year selection before submitting writing.
$("btn-back-start").addEventListener("click", () => show("screen-start"));
$("btn-back-camera").addEventListener("click", () => show("screen-camera"));

// ---- pages: photo -> cleaned scan, up to two pages -------------------------

async function addPage(file) {
  if (!file || state.pages.length >= MAX_PAGES) return;
  try {
    setLoading(true, "Tidying up your photo…");
    // Every page keeps full size: each one is sent in its own request (see btn-read below).
    const { dataUrl } = await prepareScan(file);
    state.pages.push(dataUrl);
    renderPages();
  } catch {
    showError("That photo didn't work. Please try taking it again.");
  } finally {
    setLoading(false);
  }
}

function renderPages() {
  const list = $("pages-list");
  list.innerHTML = "";
  state.pages.forEach((dataUrl, index) => {
    const li = document.createElement("li");
    const img = document.createElement("img");
    img.src = dataUrl;
    img.alt = `Page ${index + 1}`;
    const label = document.createElement("span");
    label.className = "page-num";
    label.textContent = `Page ${index + 1}`;
    const tools = document.createElement("div");
    tools.className = "page-tools";
    for (const [action, text, name] of [
      ["rotate", "↻ Rotate", "Rotate"],
      ["remove", "✕ Remove", "Remove"],
    ]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ghost small";
      btn.dataset.action = action;
      btn.dataset.index = index;
      btn.textContent = text;
      btn.setAttribute("aria-label", `${name} page ${index + 1}`);
      tools.appendChild(btn);
    }
    li.append(img, label, tools);
    list.appendChild(li);
  });
  const count = state.pages.length;
  $("pages-box").hidden = count === 0;
  $("first-photo").hidden = count > 0;
  $("add-page").hidden = count >= MAX_PAGES;
  $("pages-title").textContent = count === 1 ? "Your page" : `Your ${count} pages`;
  resetIdle();
}

$("pages-list").addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const index = Number(btn.dataset.index);
  if (btn.dataset.action === "remove") state.pages.splice(index, 1);
  else state.pages[index] = await rotate90(state.pages[index]);
  renderPages();
});

for (const id of ["photo-input", "photo-add"]) {
  $(id).addEventListener("change", (e) => {
    addPage(e.target.files[0]);
    e.target.value = "";
  });
}

// ---- step 1: pages -> transcript -> review screen ---------------------------

// A page photographed sideways or upside down reads badly, so before the reading each page
// is checked with a small copy and turned upright. If the check fails, the page goes as it is
// (the Rotate button is still there).
async function straighten(dataUrl) {
  try {
    const { rotate } = await detectOrientation({ image: await thumbnail(dataUrl), yearLevel: state.yearLevel });
    return rotate ? await rotateBy(dataUrl, rotate) : dataUrl;
  } catch {
    return dataUrl;
  }
}

$("btn-read").addEventListener("click", async () => {
  if (!state.pages.length) return;
  try {
    setLoading(true, state.pages.length === 1 ? "Checking your page is the right way up…" : "Checking your pages are the right way up…");
    state.pages = await Promise.all(state.pages.map(straighten));
    renderPages();
    setLoading(
      true,
      state.pages.length === 1
        ? "Your sidekick is reading your writing…"
        : `Your sidekick is reading all ${state.pages.length} pages…`,
    );
    // One request per page, read side by side, then joined in page order with a blank line
    // between pages. One big request for all pages used to trip the server's upload limit.
    const pages = await Promise.all(state.pages.map((image) => transcribePage({ image, yearLevel: state.yearLevel })));
    state.transcript = pages
      .map((page) => reflowTranscript(page.transcript).trim())
      .filter(Boolean)
      .join("\n\n");
    // Years 1 to 3 do not check the typing: it is a lot of reading for a young writer, so the
    // feedback comes straight back. Year 4 and up still get to fix anything the app misread.
    // An unreadable photo always shows the typing screen, whatever the year, so the writing
    // can be typed in rather than the child being stuck.
    if (checksTyping() || !fullTranscript()) {
      show("screen-review");
      showReview();
      return;
    }
    await submitWriting();
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
});

// ---- the typed copy: the whole piece in one document-style box that grows with the writing --

function autosizeTranscript() {
  const box = $("transcript");
  box.style.height = "auto";
  box.style.height = `${Math.max(320, box.scrollHeight + 4)}px`;
}

// The first measurement can be short if the writing font or the screen size arrives late,
// which used to leave a page of writing cut off halfway. Measure again when either changes.
document.fonts?.ready.then(autosizeTranscript).catch(() => {});
window.addEventListener("resize", autosizeTranscript);

// Shows the whole piece, every page joined in order with a blank line between pages, so a
// two-page piece reads as one document.
function showReview() {
  $("transcript").value = state.transcript;
  autosizeTranscript();
  window.scrollTo(0, 0);
  resetIdle();
}

$("transcript").addEventListener("input", () => {
  state.transcript = $("transcript").value;
  autosizeTranscript();
});

function fullTranscript() {
  return state.transcript.trim();
}

// ---- step 2: the writing -> feedback ---------------------------------------

// Year 4 and up see the typed copy and can fix it before the feedback comes back.
const checksTyping = () => state.yearLevel >= 4;

$("btn-confirm").addEventListener("click", () => submitWriting());

async function submitWriting() {
  const transcript = fullTranscript();
  if (!transcript) {
    showError("The typing box is empty. If the photo was too hard to read, try taking it again, or type your writing in.");
    return;
  }
  try {
    setLoading(true, "Your sidekick is thinking about your writing…");
    state.feedback = await getFeedback({ transcript, yearLevel: state.yearLevel, genre: state.genre });
    renderFeedback();
    show("screen-feedback");
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
}

const errorTotalLines = (feedback) => [
  ["Spelling errors", "spelling"],
  ["Punctuation errors", "punctuation"],
  ["Capital letter errors", "capital_letters"],
].map(([label, key]) => `${label}: ${feedback.errorTotals?.[key] ?? "Not available"}`);
const editingTask = "Go back to your writing. Find and fix the errors, then read it again to check.";

function renderPractice() {
  $("practice-card").hidden = false;
  const list = $("practice-words");
  list.innerHTML = "";
  for (const [label, key, symbol] of [["Capitals", "capital_letters", "Aa"], ["Spelling", "spelling", "abc"], ["Punctuation", "punctuation", "?!"]]) {
    const value = state.feedback.errorTotals?.[key];
    const valid = Number.isSafeInteger(value) && value >= 0;
    const li = document.createElement("li");
    li.className = valid && value === 0 ? "editing-clear" : "editing-find";
    const icon = document.createElement("span");
    icon.className = "editing-symbol";
    icon.textContent = symbol;
    icon.setAttribute("aria-hidden", "true");
    const title = document.createElement("strong");
    title.textContent = label;
    const ring = document.createElement("span");
    ring.className = "editing-ring";
    ring.textContent = valid ? value : "?";
    const caption = document.createElement("span");
    caption.className = "editing-caption";
    caption.textContent = !valid ? "Not available" : value === 0 ? "No errors found" : value === 1 ? "error to find" : "errors to find";
    li.append(icon, title, ring, caption);
    list.appendChild(li);
  }
  $("practice-tip").hidden = false;
  $("practice-tip").textContent = editingTask;
}

// Word power: each plain word climbs a ladder of four synonyms, from a small step up to a
// stretch word, so the child can pick the rung that fits their sentence.
function renderBoost() {
  const boost = state.feedback.wordBoost;
  const card = $("boost-card");
  card.hidden = !boost;
  if (!boost) return;
  const list = $("boost-swaps");
  list.innerHTML = "";
  for (const { from, to } of boost.swaps) {
    const li = el("li", "boost-swap");
    li.appendChild(el("strong", "boost-from", from));
    const ladder = el("ol", "synonym-ladder");
    ladder.setAttribute("aria-label", `Stronger words for ${from}, from a small step up to a big one`);
    to.forEach((word, index) => ladder.appendChild(el("li", `rung rung-${index + 1}`, word)));
    li.appendChild(ladder);
    list.appendChild(li);
  }
  const hasExample = boost.before && boost.after;
  $("boost-example").hidden = !hasExample;
  if (hasExample) {
    $("boost-before").textContent = boost.before;
    $("boost-after").textContent = boost.after;
  }
  // The synonym challenge starts in Year 2 (the server sends none for Year 1 anyway).
  renderChallenge(state.yearLevel >= 2 ? boost.challenge || [] : []);
}

// The synonym challenge: three more of the child's own words, a box and a Check button each.
// One good synonym is a win; nothing has to be filled in.
function renderChallenge(challenge) {
  const box = $("boost-challenge");
  const list = $("challenge-list");
  list.innerHTML = "";
  box.hidden = challenge.length === 0;
  challenge.forEach(({ word, sentence }, index) => {
    const li = el("li", "challenge-item");
    const label = el("label", "challenge-label");
    label.htmlFor = `challenge-input-${index}`;
    label.append("A synonym for ", el("strong", "", word));
    const input = el("input", "challenge-input");
    input.id = `challenge-input-${index}`;
    input.type = "text";
    input.maxLength = 40;
    input.autocomplete = "off";
    input.autocapitalize = "none";
    input.spellcheck = false;
    input.placeholder = "Type your word";
    const btn = el("button", "secondary challenge-check", "Check");
    btn.type = "button";
    const result = el("p", "challenge-result");
    result.hidden = true;
    result.setAttribute("role", "status");
    btn.addEventListener("click", () => checkChallenge({ word, sentence, input, btn, result, li }));
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      btn.click();
    });
    li.append(label, input, btn, result);
    list.appendChild(li);
  });
}

const VERDICTS = {
  yes: { css: "is-yes", lead: "Synonym!" },
  close: { css: "is-close", lead: "Close!" },
  no: { css: "is-no", lead: "Not quite." },
};

async function checkChallenge({ word, sentence, input, btn, result, li }) {
  const attempt = input.value.trim();
  if (!attempt) {
    input.focus();
    return;
  }
  li.classList.remove("is-yes", "is-close", "is-no");
  result.hidden = true;
  btn.disabled = true;
  btn.textContent = "Checking…";
  try {
    const reply = await checkSynonym({ yearLevel: state.yearLevel, word, attempt, sentence });
    const verdict = VERDICTS[reply.verdict] || VERDICTS.no;
    li.classList.add(verdict.css);
    result.replaceChildren(el("strong", "", `${verdict.lead} `), reply.note || "");
    result.hidden = false;
  } catch (error) {
    showError(error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Check";
    resetIdle();
  }
}

function labelledLine(label, value, tag) {
  const p = document.createElement("p");
  p.className = "power-line";
  const span = document.createElement("span");
  span.className = "power-label";
  span.textContent = label;
  const el = document.createElement(tag);
  el.textContent = value;
  p.append(span, " ", el);
  return p;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// A named writing strategy (The Writing Revolution's word, and the school's): its name, the
// rule, and a fresh example, so the child can recognise the strategy and use it again.
function moveNote(move) {
  const box = el("div", "move-note");
  const title = el("p", "st-title");
  title.append(emoji("⚡"), "Writing strategy: ", el("strong", "", move.name));
  const rule = el("p", "st-rule", move.rule);
  const example = el("p", "st-example");
  example.append("Another one: ", el("em", "", move.example));
  box.append(title, rule, example);
  return box;
}

const moveSpeech = (move) => (move ? `Writing strategy: ${move.name}. ${move.rule} Another one: ${move.example}` : "");

// Emoji live in a span so the senior look (Years 5 and 6) can hide them; screen readers skip them.
function emoji(char) {
  const node = el("span", "h-emoji", `${char} `);
  node.setAttribute("aria-hidden", "true");
  return node;
}

// Each power-up: the skill, why it matters here, the skill shown on a sentence LIKE the
// child's (before and after, never their own line rewritten, so there is nothing to copy),
// the strategy note, then their own quoted line and a task that sends them back to it.
function renderPowerUps(powerUps) {
  const box = $("power-ups");
  box.innerHTML = "";
  powerUps.forEach((p, index) => {
    const card = el("section", "power-card");
    card.id = `power-up-${index + 1}`;
    const head = el("div", "power-head");
    head.appendChild(el("h3", "power-title", `Power-up ${index + 1}: ${p.skill}`));
    if (p.areaLabel) head.appendChild(el("span", "power-area", p.areaLabel));
    card.append(head, el("p", "power-why", p.why));
    if (p.example) {
      const demo = el("div", "power-demo");
      demo.appendChild(el("p", "demo-title", "See it work on a sentence like yours"));
      demo.appendChild(labelledLine("Before:", p.example.before, "span"));
      demo.appendChild(labelledLine("After:", p.example.after, "strong"));
      card.appendChild(demo);
    }
    if (p.move) card.appendChild(moveNote(p.move));
    if (p.yourLine || p.nowYou) {
      const task = el("div", "power-task");
      const title = el("p", "task-title");
      title.append(emoji("✍️"), el("strong", "", "Now you"));
      task.appendChild(title);
      if (p.yourLine) task.appendChild(labelledLine("Your line:", p.yourLine, "q"));
      if (p.nowYou) task.appendChild(el("p", "task-text", p.nowYou));
      card.appendChild(task);
    }
    box.appendChild(card);
  });
}

const STATUS = {
  strength: { emoji: "⭐", label: "Strength", css: "is-strength" },
  steady: { emoji: "👍", label: "On track", css: "is-steady" },
  next_step: { emoji: "🚀", label: "Next step", css: "is-next" },
};

// The ten-area check-up is no longer shown to the child; it goes into the teacher report
// (print and saved picture) with the highest-impact goal.

// The writing strength card: one tappable chip per skill, coloured by how it went. A tap
// opens the explanation (what the skill means, in a child's words) with what the sidekick saw
// in their own writing. "Key strength" and "Next focus" open the same panel.
function renderStrength() {
  const summary = writingStrength(state.feedback.criteria);
  const bar = $("strength-bar");
  bar.replaceChildren();
  for (const area of summary.areas) {
    const chip = el("button", `skill-chip ${area.status}`);
    chip.type = "button";
    chip.dataset.key = area.key;
    chip.setAttribute("aria-expanded", "false");
    chip.setAttribute("aria-controls", "skill-detail");
    const dot = el("span", "skill-dot");
    dot.setAttribute("aria-hidden", "true");
    chip.append(dot, area.label, el("span", "sr-only", `: ${STATUS[area.status].label}`));
    chip.addEventListener("click", () => showSkill(area.key));
    bar.appendChild(chip);
  }
  const description = summary.areas.length ? `${summary.strong} of ${summary.areas.length} writing skills showing strength` : "Writing strength not available";
  $("strength-summary").textContent = description;
  for (const [id, label, key] of [["strength-key", summary.keyStrength, summary.keyStrengthKey], ["strength-focus", summary.focus, summary.focusKey]]) {
    const btn = $(id);
    btn.textContent = label;
    btn.dataset.key = key;
    btn.disabled = !key;
  }
  closeSkill();
}

function closeSkill() {
  const detail = $("skill-detail");
  detail.hidden = true;
  detail.dataset.key = "";
  document.querySelectorAll(".skill-chip").forEach((chip) => {
    chip.classList.remove("is-open");
    chip.setAttribute("aria-expanded", "false");
  });
}

function showSkill(key) {
  const area = state.feedback?.criteria.find((c) => c.key === key);
  const detail = $("skill-detail");
  if (!area || (detail.dataset.key === key && !detail.hidden)) {
    closeSkill();
    return;
  }
  closeSkill();
  const status = STATUS[area.status] || STATUS.steady;
  const guide = skillExplanation(area.key);
  detail.dataset.key = key;
  detail.className = `skill-detail ${status.css}`;
  $("skill-detail-title").textContent = area.label;
  $("skill-detail-status").textContent = status.label;
  $("skill-detail-what").textContent = guide.what;
  $("skill-detail-how").textContent = guide.how;
  $("skill-detail-how").hidden = !guide.how;
  const strength = $("skill-detail-strength");
  strength.hidden = !area.strength;
  strength.lastElementChild.textContent = area.strength;
  const next = $("skill-detail-next");
  const nextText = area.powerUp ? `See Power-up ${area.powerUp} below.` : area.nextStep;
  next.hidden = !nextText;
  next.lastElementChild.textContent = nextText || "";
  detail.hidden = false;
  document.querySelectorAll(`.skill-chip[data-key="${key}"]`).forEach((chip) => {
    chip.classList.add("is-open");
    chip.setAttribute("aria-expanded", "true");
  });
  focusHeading($("skill-detail-title"));
  resetIdle();
}

for (const id of ["strength-key", "strength-focus"]) {
  $(id).addEventListener("click", () => showSkill($(id).dataset.key));
}
$("skill-detail-close").addEventListener("click", closeSkill);

// What is already working, quoting the child's writing: the positive half of the feedback.
function renderHeroPowers() {
  const powers = heroPowers(state.feedback.criteria);
  $("powers-card").hidden = powers.length === 0;
  const list = $("powers-list");
  list.innerHTML = "";
  for (const power of powers) {
    const li = el("li", "power-item");
    const chip = el("button", "power-area", power.label);
    chip.type = "button";
    chip.addEventListener("click", () => {
      showSkill(power.key);
      $("skill-detail").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    li.append(chip, el("span", "power-text", power.text));
    list.appendChild(li);
  }
}

function renderFeedback() {
  const { powerUps } = state.feedback;
  renderStrength();
  renderHeroPowers();
  renderPractice();
  renderBoost();
  $("save-brief").checked = true;
  $("save-detail").checked = true;
  rebuildShareImage();
  renderPowerUps(powerUps);
  showSlide(0);
  resetIdle();
}

// The teacher's one-line takeaway: the first power-up is the most useful change, so it is the
// highest-impact goal for this student on this piece.
function highestImpactGoal() {
  const goal = state.feedback?.powerUps?.[0];
  if (!goal) return "";
  return `${goal.skill}${goal.areaLabel ? ` (${goal.areaLabel})` : ""}. ${goal.why}`;
}

// ---- feedback slides: one part at a time -----------------------------------

// The server's one-line headline is not shown: Nathan found it doubled up on the rest.
const SLIDES = [
  { key: "power", label: "Power-ups" },
  { key: "words", label: "Word lab" },
  { key: "finish", label: "Mission complete" },
];
let slideIndex = 0;

// The words slide only exists when there is word power or spelling to show.
function activeSlides() {
  const fb = state.feedback;
  const hasWords = Boolean(fb);
  return SLIDES.filter((s) => s.key !== "words" || hasWords);
}

function renderSteps(slides, index) {
  const nav = $("fb-steps");
  nav.innerHTML = "";
  slides.forEach((s, i) => {
    const step = el("button", `fb-step${i === index ? " is-current" : i < index ? " is-done" : ""}`);
    step.type = "button";
    step.append(el("span", "fb-step-num", String(i + 1)), s.label);
    if (i === index) step.setAttribute("aria-current", "step");
    step.addEventListener("click", () => showSlide(i));
    nav.appendChild(step);
  });
}

function showSlide(index) {
  const slides = activeSlides();
  slideIndex = Math.max(0, Math.min(slides.length - 1, index));
  const current = slides[slideIndex].key;
  document.querySelectorAll(".fb-slide").forEach((s) => s.classList.toggle("active", s.dataset.slide === current));
  playSlideClip(current);
  renderSteps(slides, slideIndex);
  const next = slides[slideIndex + 1];
  $("btn-slide-back").hidden = slideIndex === 0;
  $("btn-slide-next").hidden = !next;
  if (next) $("btn-slide-next").textContent = `Next: ${next.label} →`;
  window.scrollTo(0, 0);
  focusHeading(document.querySelector(`.fb-slide[data-slide="${current}"] .fb-heading`));
}

// The Power-ups slide opens with a short clip of the sidekick powering up. It plays once,
// muted, from the start each time the slide opens and rests on its last frame. If the browser
// will not play it, or the child prefers less motion, the poster frame stands in.
function playSlideClip(current) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll(".fb-slide").forEach((slide) => {
    const clip = slide.querySelector("video.stage-video");
    if (!clip) return;
    if (slide.dataset.slide === current && !reduceMotion) {
      clip.currentTime = 0;
      clip.play().catch(() => {});
    } else {
      clip.pause();
    }
  });
}

$("btn-slide-back").addEventListener("click", () => showSlide(slideIndex - 1));
$("btn-slide-next").addEventListener("click", () => showSlide(slideIndex + 1));

// ---- save picture / print / restart ---------------------------------------

// The picture is pre-built for the ticked options so the save tap can share it instantly
// (Safari only allows sharing right after a tap).
let shareCache = { key: "", blob: null };

function shareOptions() {
  return { brief: $("save-brief").checked, detail: $("save-detail").checked };
}

// Photos of the writing only leave the app when the child ticks the box (off by default).
const includePhotos = () => $("include-photos").checked;

function shareImageInputs(include) {
  return { pages: includePhotos() ? state.pages : [], feedback: state.feedback, yearLevel: state.yearLevel, include };
}

function rebuildShareImage() {
  if (!state.feedback) return;
  const include = shareOptions();
  const key = `${include.brief}|${include.detail}`;
  shareCache = { key, blob: null };
  $("btn-save-go").disabled = !include.brief && !include.detail;
  if (!include.brief && !include.detail) return;
  buildFeedbackImage(shareImageInputs(include))
    .then((blob) => {
      if (shareCache.key === key) shareCache.blob = blob;
    })
    .catch(() => {});
}

$("save-brief").addEventListener("change", rebuildShareImage);
$("save-detail").addEventListener("change", rebuildShareImage);
$("include-photos").addEventListener("change", rebuildShareImage);
$("btn-save-pic").addEventListener("click", () => $("save-dialog").showModal());
$("btn-save-cancel").addEventListener("click", () => $("save-dialog").close());

$("btn-save-go").addEventListener("click", async () => {
  const include = shareOptions();
  if (!include.brief && !include.detail) return;
  $("save-dialog").close();
  try {
    const key = `${include.brief}|${include.detail}`;
    const blob = (shareCache.key === key && shareCache.blob) || (await buildFeedbackImage(shareImageInputs(include)));
    await saveFeedbackImage(blob);
  } catch {
    showError("Hmm, the picture didn't save. You can use Print instead, or try again.");
  }
});

$("btn-print").addEventListener("click", () => {
  const { criteria, powerUps } = state.feedback;
  $("print-goal").textContent = highestImpactGoal() ? `Highest-impact goal for this student: ${highestImpactGoal()}` : "";
  $("print-date").textContent = new Date().toLocaleDateString("en-AU", {
    day: "numeric", month: "long", year: "numeric",
  });
  const pagesBox = $("print-pages");
  pagesBox.innerHTML = "";
  (includePhotos() ? state.pages : []).forEach((dataUrl, index) => {
    const img = document.createElement("img");
    img.src = dataUrl;
    img.alt = `Page ${index + 1}`;
    pagesBox.appendChild(img);
  });
  $("print-transcript").textContent = fullTranscript();
  const powersBox = $("print-powers");
  powersBox.innerHTML = "";
  const powers = heroPowers(criteria);
  if (powers.length) {
    const h = document.createElement("h2");
    h.textContent = "Hero powers: what is already working";
    const ul = document.createElement("ul");
    for (const power of powers) {
      const li = document.createElement("li");
      li.textContent = `${power.label}: ${power.text}`;
      ul.appendChild(li);
    }
    powersBox.append(h, ul);
  }
  const powerBox = $("print-powerups");
  powerBox.innerHTML = "";
  powerUps.forEach((p, index) => {
    const h = document.createElement("h3");
    h.textContent = `Power-up ${index + 1}: ${p.skill}${p.areaLabel ? ` (${p.areaLabel})` : ""}`;
    powerBox.appendChild(h);
    for (const line of [
      p.why,
      p.example && `See it work on a sentence like yours. Before: ${p.example.before} After: ${p.example.after}`,
      moveSpeech(p.move),
      p.yourLine && `Your line: ${p.yourLine}`,
      p.nowYou && `Now you: ${p.nowYou}`,
    ]) {
      if (!line) continue;
      const para = document.createElement("p");
      para.textContent = line;
      powerBox.appendChild(para);
    }
  });
  const checkupBox = $("print-checkup");
  checkupBox.innerHTML = "";
  {
    const h = document.createElement("h2");
    h.textContent = "Hero scan: writing check-up";
    const ul = document.createElement("ul");
    for (const c of criteria) {
      const li = document.createElement("li");
      const status = (STATUS[c.status] || STATUS.steady).label;
      const next = c.powerUp ? `See Power-up ${c.powerUp}.` : c.nextStep;
      li.textContent = `${c.label} (${status}): ${[c.strength, next].filter(Boolean).join(" ")}`;
      ul.appendChild(li);
    }
    checkupBox.append(h, ul);
  }
  const practiceBox = $("print-practice");
  practiceBox.innerHTML = "";
  const h = document.createElement("h2");
  h.textContent = "Find and fix";
  const ul = document.createElement("ul");
  for (const line of errorTotalLines(state.feedback)) {
    const li = document.createElement("li");
    li.textContent = line;
    ul.appendChild(li);
  }
  const task = document.createElement("p");
  task.textContent = editingTask;
  practiceBox.append(h, ul, task);
  const boostBox = $("print-boost");
  boostBox.innerHTML = "";
  const boost = state.feedback.wordBoost;
  if (boost) {
    const h = document.createElement("h2");
    h.textContent = "Word power";
    boostBox.appendChild(h);
    const ul = document.createElement("ul");
    for (const { from, to } of boost.swaps) {
      const li = document.createElement("li");
      li.textContent = `${from} → ${to.join(", ")}`;
      ul.appendChild(li);
    }
    boostBox.appendChild(ul);
    if (boost.before && boost.after) {
      const p = document.createElement("p");
      p.textContent = `Your sentence: ${boost.before} With word power: ${boost.after}`;
      boostBox.appendChild(p);
    }
    if (boost.challenge?.length) {
      const p = document.createElement("p");
      p.textContent = `Synonym challenge: think of a synonym for ${joinOr(boost.challenge.map((c) => c.word))}.`;
      boostBox.appendChild(p);
    }
  }
  window.print();
});

// ---- finish and clear: shared iPads must not hand one child's work to the next ------------

// Everything the app holds about this piece of writing, gone: photos, typing, feedback,
// the prepared share picture, and the copies drawn on screen.
function clearEverything() {
  state.pages = [];
  state.transcript = "";
  state.feedback = null;
  shareCache = { key: "", blob: null };
  $("transcript").value = "";
  $("include-photos").checked = false;
  $("camera-title").textContent = "Photo time";
  for (const id of ["strength-bar", "powers-list", "power-ups", "practice-words", "boost-swaps", "challenge-list", "print-pages", "print-powers", "print-powerups", "print-checkup", "print-practice", "print-boost"]) {
    $(id).innerHTML = "";
  }
  for (const id of ["strength-summary", "strength-key", "strength-focus", "skill-detail-title", "skill-detail-what", "skill-detail-how", "print-transcript", "print-goal"]) $(id).textContent = "";
  for (const id of ["skill-detail-strength", "skill-detail-next"]) $(id).lastElementChild.textContent = "";
  $("boost-before").textContent = "";
  $("boost-after").textContent = "";
  $("powers-card").hidden = true;
  $("boost-challenge").hidden = true;
  closeSkill();
  renderPages();
}

// Every "Finish and clear" button: a first tap arms it, a second tap within 4 seconds clears.
let armedFinish = null; // { button, label, timer }

function disarmFinish() {
  if (!armedFinish) return;
  clearTimeout(armedFinish.timer);
  armedFinish.button.textContent = armedFinish.label;
  armedFinish = null;
}

document.querySelectorAll(".btn-finish").forEach((button) => {
  button.addEventListener("click", () => {
    if (armedFinish && armedFinish.button === button) {
      disarmFinish();
      clearEverything();
      show("screen-start");
      return;
    }
    disarmFinish();
    armedFinish = { button, label: button.textContent, timer: setTimeout(disarmFinish, 4000) };
    button.textContent = "Sure? Tap again";
  });
});

// Left alone with work on screen, the iPad warns after nine minutes and clears itself a
// minute later, so the next child cannot find the last one's writing. Any tap or key press
// starts the clock again. Nothing clears while the camera or another app is in front.
// (?idle=<seconds> shortens the wait for testing.)
const IDLE_TEST_SECONDS = Number(new URLSearchParams(location.search).get("idle")) || 0;
const IDLE_WARN_MS = IDLE_TEST_SECONDS ? IDLE_TEST_SECONDS * 1000 : 9 * 60_000;
const IDLE_CLEAR_MS = IDLE_TEST_SECONDS ? 4_000 : 60_000;
let idleWarnTimer = null;
let idleClearTimer = null;

const hasWork = () => state.pages.length > 0 || state.transcript.length > 0 || state.feedback !== null;

function resetIdle() {
  clearTimeout(idleWarnTimer);
  clearTimeout(idleClearTimer);
  $("idle-banner").hidden = true;
  if (!hasWork()) return;
  idleWarnTimer = setTimeout(() => {
    if (document.hidden) {
      resetIdle();
      return;
    }
    $("idle-banner").hidden = false;
    idleClearTimer = setTimeout(() => {
      if (document.hidden) {
        resetIdle();
        return;
      }
      $("idle-banner").hidden = true;
      disarmFinish();
      clearEverything();
      show("screen-start");
    }, IDLE_CLEAR_MS);
  }, IDLE_WARN_MS);
}

for (const type of ["pointerdown", "keydown", "touchstart", "input"]) {
  document.addEventListener(type, resetIdle, { passive: true });
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) resetIdle();
});


// ---- error banner ----------------------------------------------------------

$("btn-error-close").addEventListener("click", () => {
  $("error-banner").hidden = true;
});



renderPages();

refreshStartButton();
