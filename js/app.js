import { reflowTranscript } from "./transcript.js?v=20260910-quality";
import { writingStrength, writingStrengthLines, skillExplanation, heroPowers, nextFocus, editingItems, editingCount, editingCaption, editingAdvice, editingLines, missionRows, EDITING_TASK, ROUGH_NOTE } from "./feedback-visuals.js?v=20261013-s4";
import { listenButton, stopSpeaking, clearSpeechCache } from "./speech.js?v=20261013-s4";
import { listensForYear, SAY_ALOUD, staticSpoken, strengthsSpoken, focusSpoken, powerUpSpoken, wordPowerSpoken, challengeSpoken, editingSpoken, missionSpoken } from "./spoken.js?v=20261013-s4";
import { prepareScan, rotate90, rotateBy, thumbnail, SCAN_MAX_EDGE } from "./scan.js?v=20261009-pdf";
import { isPdf, pdfPageCanvases } from "./pdf-pages.js?v=20261009-pdf";
import { ProgressBar } from "./progress.js?v=20261009-bar";
import { transcribePage, getFeedback, checkSynonym, detectOrientation } from "./api.js?v=20260911-audit";
import { buildFeedbackImage, saveFeedbackImage } from "./share-image.js?v=20261013-s3";

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
  stopSpeaking(); // a voice never carries over to another screen
  hideError(); // an old message must not sit over the next screen's buttons
  $("app").classList.toggle("review-wide", screenId === "screen-review");
  document.body.classList.toggle("on-feedback", screenId === "screen-feedback"); // lifts the error banner above the bottom bar
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
const loadBar = new ProgressBar($("loading-bar"));

// withBar: show the block bar (long AI waits) instead of the spinner (quick jobs).
function setLoading(visible, message, { withBar = false } = {}) {
  if (message) $("loading-msg").textContent = message;
  if (!visible) {
    loadBar.stop();
    $("loading-bar").hidden = true;
  } else if (withBar && $("loading-bar").hidden) loadBar.start(); // a message change mid-wait keeps the bar going
  if (visible) {
    hideError(); // a new attempt starts with a clean slate
    $("loading-bar").hidden = !withBar;
    $("loading").classList.toggle("with-bar", withBar);
  }
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

function hideError() {
  $("error-banner").hidden = true;
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

// Photos arrive one at a time from the camera, or several at once from the photo album.
// A PDF counts one page per PDF page. Extras past the two-page limit are ignored, and the
// child is told so.
async function addPages(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length || state.pages.length >= MAX_PAGES) return;
  let dropped = 0;
  let failedPhoto = 0;
  let failedPdf = 0;
  try {
    setLoading(true, files.length > 1 ? "Tidying up your pages…" : "Tidying up your page…");
    for (const file of files) {
      const room = MAX_PAGES - state.pages.length;
      if (room <= 0) {
        dropped++;
        continue;
      }
      try {
        // Every page keeps full size: each one is sent in its own request (see btn-read below).
        if (isPdf(file)) {
          const { canvases, totalPages } = await pdfPageCanvases(file, { maxPages: room, targetEdge: SCAN_MAX_EDGE });
          dropped += totalPages - canvases.length;
          for (const canvas of canvases) state.pages.push((await prepareScan(canvas)).dataUrl);
        } else {
          state.pages.push((await prepareScan(file)).dataUrl);
        }
      } catch {
        if (isPdf(file)) failedPdf++;
        else failedPhoto++;
      }
    }
    renderPages();
  } finally {
    setLoading(false);
  }
  if (failedPdf) showError("That PDF didn't open. Please try another one, or take a photo instead.");
  else if (failedPhoto) showError("That photo didn't work. Please try another one, or take it again.");
  else if (dropped > 0) showError(`Only ${MAX_PAGES} pages fit, so the extra pages were left out.`);
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
  const full = count >= MAX_PAGES;
  $("add-page").hidden = full;
  $("add-page-library").hidden = full;
  $("pages-title").textContent = count === 1 ? "Your page" : `Your ${count} pages`;
  resetIdle();
}

// A turn takes a moment, so taps on Rotate or Remove wait until it lands: a double tap would
// otherwise turn the same photo twice from its old state, or drop a page under a pending turn.
let pageBusy = false;
$("pages-list").addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn || pageBusy) return;
  const index = Number(btn.dataset.index);
  if (btn.dataset.action === "remove") state.pages.splice(index, 1);
  else {
    pageBusy = true;
    try {
      state.pages[index] = await rotate90(state.pages[index]);
    } finally {
      pageBusy = false;
    }
  }
  renderPages();
});

// Camera inputs (capture="environment") open the camera; the plain ones open the photo album.
for (const id of ["photo-input", "photo-add", "photo-library", "photo-add-library"]) {
  $(id).addEventListener("change", (e) => {
    addPages(e.target.files);
    e.target.value = "";
  });
}

// ---- step 1: pages -> transcript -> review screen ---------------------------

const UNCLEAR_NOTE = "Some writing was hard to read. Replace each [unclear] with the words or marks in your book. You can ask your teacher to help.";

// A page photographed sideways or upside down reads badly, so each page is checked with a small
// copy and turned upright. If the check fails, the page goes as it is (the Rotate button is still there).
async function straighten(dataUrl) {
  try {
    const { rotate } = await detectOrientation({ image: await thumbnail(dataUrl), yearLevel: state.yearLevel });
    return rotate ? await rotateBy(dataUrl, rotate) : dataUrl;
  } catch {
    return dataUrl;
  }
}

// Reading starts straight away, beside the which-way-up check: most pages are already upright, so
// the check costs no waiting. A page that needed turning is read again the right way up.
async function readPage(image) {
  const firstRead = transcribePage({ image, yearLevel: state.yearLevel });
  firstRead.catch(() => {}); // awaited below, or not needed at all
  const upright = await straighten(image);
  if (upright === image) return { image, page: await firstRead };
  return { image: upright, page: await transcribePage({ image: upright, yearLevel: state.yearLevel }) };
}

$("btn-read").addEventListener("click", async () => {
  if (!state.pages.length) return;
  const count = state.pages.length;
  let done = 0;
  try {
    setLoading(
      true,
      count === 1 ? "Your sidekick is reading your writing…" : `Your sidekick is reading all ${count} pages…`,
      { withBar: true },
    );
    loadBar.stage(0, 1, 7000); // a page takes about 10-15 seconds; each finished page fills its share
    // One request per page, read side by side, then joined in page order with a blank line
    // between pages. One big request for all pages used to trip the server's upload limit.
    const results = await Promise.all(
      state.pages.map((image) =>
        readPage(image).then((result) => {
          loadBar.reach(++done / count);
          return result;
        }),
      ),
    );
    state.pages = results.map((result) => result.image);
    renderPages();
    const pages = results.map((result) => result.page);
    await loadBar.finish();
    state.transcript = pages
      .map((page) => reflowTranscript(page.transcript).trim())
      .filter(Boolean)
      .join("\n\n");
    // Every year checks the typing, so any child can fix a word the app misread before the
    // feedback comes back. The note below only appears when the reading itself was doubtful.
    const needsCheck = pages.some((page) => page.verification === "unavailable") || /\[unclear\]/i.test(state.transcript);
    $("transcript-check-note").hidden = !needsCheck;
    $("transcript-check-note").textContent = /\[unclear\]/i.test(state.transcript)
      ? UNCLEAR_NOTE
      : "The extra photo check was unavailable. Compare this typing carefully with your book before continuing.";
    show("screen-review");
    showReview();
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
  // Once every [unclear] is replaced, the note asking for it has done its job.
  if (UNCLEAR_NOTE === $("transcript-check-note").textContent && !/\[unclear\]/i.test(state.transcript)) {
    $("transcript-check-note").hidden = true;
  }
});

function fullTranscript() {
  return state.transcript.trim();
}

// ---- step 2: the writing -> feedback ---------------------------------------

$("btn-confirm").addEventListener("click", () => submitWriting());

async function submitWriting() {
  const transcript = fullTranscript();
  if (!transcript) {
    showError("The typing box is empty. If the photo was too hard to read, try taking it again, or type your writing in.");
    return;
  }
  try {
    setLoading(true, "Your sidekick is thinking about your writing… This can take a minute or two.", { withBar: true });
    loadBar.stage(0, 1, 22000); // one long call, usually 35-50 seconds: about two thirds of the bar by 30
    state.feedback = await getFeedback({ transcript, yearLevel: state.yearLevel, genre: state.genre });
    await loadBar.finish();
    renderFeedback();
    show("screen-feedback");
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
}

const errorTotalLines = (feedback, yearLevel) => editingLines(feedback.errorTotals, yearLevel, { long: true });
const editingTask = EDITING_TASK;
const roughNote = ROUGH_NOTE;

function renderPractice() {
  $("practice-card").hidden = false;
  const list = $("practice-words");
  list.innerHTML = "";
  // Years 1-2 hunt only capitals and full stops, each with a how-to-hunt tip; Years 3-6 keep
  // spelling, punctuation and capitals.
  const items = editingItems(state.yearLevel);
  list.classList.toggle("editing-junior", items.some((item) => item.tip));
  let confirmed = 0;
  for (const item of items) {
    const value = editingCount(state.feedback.errorTotals, item.key);
    const valid = value !== null;
    if (valid) confirmed++;
    const li = document.createElement("li");
    li.className = valid && value === 0 ? "editing-clear" : "editing-find";
    const icon = document.createElement("span");
    icon.className = "editing-symbol";
    icon.textContent = item.symbol;
    icon.setAttribute("aria-hidden", "true");
    const title = document.createElement("strong");
    title.textContent = item.short;
    const ring = document.createElement("span");
    ring.className = "editing-ring";
    ring.textContent = valid ? value : "?";
    const caption = document.createElement("span");
    caption.className = "editing-caption";
    caption.textContent = editingCaption(value);
    li.append(icon, title, ring, caption);
    if (item.tip) li.appendChild(el("span", "editing-tip", item.tip));
    list.appendChild(li);
  }
  $("practice-tip").hidden = false;
  $("practice-tip").textContent = editingAdvice(confirmed, items.length);
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
    // "In your writing" is the child's own sentence, with the word being swapped in bold when it
    // can be found. "Like this" is a made-up sentence on another topic using a stronger word.
    const swapWord = (boost.swaps || []).map((swap) => swap.from).find((from) => wordRanges(boost.before, from).length);
    $("boost-before").replaceChildren(swapWord ? sentenceWithWord(boost.before, swapWord) : boost.before);
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
    const context = el("p", "challenge-context");
    if (sentence) {
      const quote = el("q", "");
      quote.appendChild(sentenceWithWord(sentence, word));
      context.append("In your writing: ", quote);
    }
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
    li.append(label);
    if (sentence) li.append(context);
    li.append(input, btn, result);
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

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// The three lines of a power-up as plain text, for the print-out: find the line, use the
// strategy (how, then before and after), do this.
export function powerUpLines(p) {
  const how = [
    p.move ? `Use the strategy: ${p.move.name}.` : p.rule || p.example ? "See an example." : "",
    p.rule,
    p.example && `${p.example.before} -> ${p.example.after}`,
  ].filter(Boolean).join(" ");
  return [
    p.why,
    p.yourLine && `1. Find this line in your book: ${p.yourLine}`,
    how && `2. ${how}`,
    p.nowYou && `3. Do this: ${p.nowYou}`,
  ].filter(Boolean);
}

// Emoji live in a span so the senior look (Years 5 and 6) can hide them; screen readers skip them.
function emoji(char) {
  const node = el("span", "h-emoji", `${char} `);
  node.setAttribute("aria-hidden", "true");
  return node;
}

// One numbered step of a power-up card: a label, then its content.
function step(label, nodes) {
  const li = el("li", "step");
  const body = el("div", "step-body");
  const heading = el("p", "step-label");
  heading.append(...(Array.isArray(label) ? label : [label]));
  body.append(heading, ...nodes);
  li.appendChild(body);
  return li;
}

// Each power-up is one line and one strategy, laid out in the order the child works:
// 1 find the line in your book, 2 the strategy (a one-line how-to, then before and after
// on a sentence LIKE theirs, never their own line rewritten), 3 the job. The strategy's
// explanation stays beside its worked model.
function renderPowerUps(powerUps) {
  const box = $("power-ups");
  box.innerHTML = "";
  powerIndex = 0;
  powerUps.forEach((p, index) => {
    const card = el("section", "power-card");
    card.id = `power-up-${index + 1}`;
    card.hidden = index !== 0; // one card at a time; setPower() moves between them
    const eyebrow = el("p", "power-eyebrow");
    // More than one power-up: this is the "Power-up 1 of 3" marker. A single one needs no count.
    eyebrow.append(emoji("⚡"), powerUps.length > 1 ? `Power-up ${index + 1} of ${powerUps.length}` : `Power-up ${index + 1}`);
    if (p.areaLabel) eyebrow.appendChild(el("span", "power-area", p.areaLabel));
    card.append(eyebrow, el("h3", "power-title", p.skill));
    const listenHost = el("div", "listen-slot");
    mountListen(listenHost, `power-up ${index + 1}`, () => powerUpSpoken(state.feedback?.powerUps?.[index], { sayAloud: state.yearLevel <= 3 }));
    card.appendChild(listenHost);
    if (p.why) card.appendChild(el("p", "power-why", p.why));
    const steps = el("ol", "power-steps");
    if (p.yourLine) steps.appendChild(step("Find this line in your book", [el("q", "step-line", p.yourLine)]));
    const how = [];
    if (p.rule) how.push(el("p", "step-rule", p.rule));
    if (p.example) {
      const example = el("p", "step-example");
      const arrow = el("span", "ex-arrow", "→");
      arrow.setAttribute("aria-hidden", "true");
      example.append(el("span", "ex-before", p.example.before), arrow, el("span", "sr-only", "becomes"), el("strong", "ex-after", p.example.after));
      how.push(example);
    }
    if (how.length) steps.appendChild(step(p.move ? ["Use the strategy: ", el("strong", "", p.move.name)] : "See an example", how));
    if (p.nowYou) {
      const task = [el("p", "step-task", p.nowYou)];
      // Younger writers say the new sentence to a partner before they write it.
      if (state.yearLevel <= 3) task.push(el("p", "step-say", SAY_ALOUD));
      steps.appendChild(step("Do this", task));
    }
    card.appendChild(steps);
    box.appendChild(card);
  });
}

const STATUS = {
  strength: { emoji: "⭐", label: "Strength", css: "is-strength" },
  steady: { emoji: "👍", label: "On track", css: "is-steady" },
  next_step: { emoji: "🚀", label: "Next step", css: "is-next" },
  not_assessed: { emoji: "", label: "Need more writing", css: "is-unassessed" },
};

// The ten-area check-up is no longer shown to the child; it goes into the teacher report
// (print and saved picture) with the highest-impact goal.

// The skill grid: one tappable chip per skill, coloured by how it went. A tap opens the
// explanation (what the skill means, in a child's words) with what the sidekick saw in their
// own writing. Years 5-6 only, behind the "See all your writing skills" button and closed to
// begin with. Years 1-4 never see it.
const isSenior = () => state.yearLevel >= 5;

function setSkillsOpen(open) {
  $("skills-card").hidden = !open;
  const toggle = $("btn-all-skills");
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  toggle.textContent = open ? "Hide your writing skills" : "See all your writing skills";
  if (!open) closeSkill();
}

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
  $("strength-summary").textContent = summary.summary;
  $("strength-summary").hidden = !summary.summary;
  for (const [id, label, key] of [["strength-key", summary.keyStrength, summary.keyStrengthKey], ["strength-focus", summary.focus, summary.focusKey]]) {
    const btn = $(id);
    btn.textContent = label;
    btn.dataset.key = key;
    btn.disabled = !key;
  }
  closeSkill();
  $("btn-all-skills").hidden = !isSenior();
  setSkillsOpen(false);
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
  const status = STATUS[area.status] || STATUS.not_assessed;
  const guide = skillExplanation(area.key);
  detail.dataset.key = key;
  detail.className = `skill-detail ${status.css}`;
  $("skill-detail-title").textContent = area.label;
  $("skill-detail-status").textContent = status.label;
  $("skill-detail-what").textContent = guide.what;
  $("skill-detail-how").textContent = guide.how;
  $("skill-detail-how").hidden = !guide.how || area.status === "not_assessed";
  $("skill-detail-note").textContent = area.assessmentNote || "";
  $("skill-detail-note").hidden = !area.assessmentNote;
  const strength = $("skill-detail-strength");
  strength.hidden = !area.strength;
  strength.lastElementChild.textContent = area.strength;
  const next = $("skill-detail-next");
  const nextText = area.powerUp ? `See Power-up ${area.powerUp} in the next section.` : area.nextStep;
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

// The child's own words inside a sentence of praise, picked out: quoted text becomes a <q>,
// which draws its own curly quotes, so the quotes stand out from the comment. Single quotes
// only count when they open after a space and close before a space or punctuation, so the
// apostrophes in can't and I'm are left alone. (No lookbehind: older iPads cannot parse one,
// so a single quote's opening space is matched, then skipped over.)
function withQuotes(text) {
  const frag = document.createDocumentFragment();
  const re = /“([^”]+)”|"([^"]+)"|‘([^’]+)’|(^|[\s(])'([^'\n]+?)'(?=[\s.,;:!?)]|$)/g;
  let last = 0;
  let match;
  while ((match = re.exec(text))) {
    const start = match.index + (match[5] !== undefined ? match[4].length : 0);
    if (start > last) frag.append(text.slice(last, start));
    frag.append(el("q", "quote", match[1] ?? match[2] ?? match[3] ?? match[5]));
    last = match.index + match[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}

// Where a whole word sits in a sentence (not inside a longer word), as [start, end] pairs.
// Plain scanning instead of a lookbehind, which older iPads cannot parse.
function wordRanges(sentence, word) {
  if (!word || !word.trim()) return [];
  const isLetter = (ch) => Boolean(ch) && /[\p{L}\p{N}]/u.test(ch);
  const re = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
  const ranges = [];
  let match;
  while ((match = re.exec(sentence))) {
    const end = match.index + match[0].length;
    if (!isLetter(sentence[match.index - 1]) && !isLetter(sentence[end])) ranges.push([match.index, end]);
  }
  return ranges;
}

// A sentence with the given word in bold wherever it stands alone, so the child can see the
// word being talked about (and think of a synonym that fits the way they used it).
function sentenceWithWord(sentence, word) {
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const [start, end] of wordRanges(sentence, word)) {
    if (start > last) frag.append(sentence.slice(last, start));
    frag.append(el("strong", "", sentence.slice(start, end)));
    last = end;
  }
  if (last < sentence.length) frag.append(sentence.slice(last));
  return frag;
}

// The first slide: what the child did well, quoting their writing (up to three). Years 1-4 have
// no skill grid, so their area chips are plain labels; Years 5-6 can tap a chip to open the
// grid at that skill.
function renderHeroPowers() {
  const powers = heroPowers(state.feedback.criteria);
  $("powers-card").hidden = false;
  $("powers-caption").hidden = powers.length === 0;
  $("powers-empty").hidden = powers.length > 0;
  const list = $("powers-list");
  list.innerHTML = "";
  for (const power of powers) {
    const li = el("li", "power-item");
    let chip;
    if (isSenior()) {
      chip = el("button", "power-area", power.label);
      chip.type = "button";
      chip.addEventListener("click", () => {
        setSkillsOpen(true);
        showSkill(power.key);
        $("skill-detail").scrollIntoView({ behavior: "smooth", block: "center" });
      });
    } else {
      chip = el("span", "power-area", power.label);
    }
    const text = el("p", "power-text");
    text.appendChild(withQuotes(power.text));
    li.append(chip, text);
    list.appendChild(li);
  }
}

// "Your next focus": power-up 1's skill title with a button to the power-up, or (no power-ups)
// the first next step's own words and no button.
function renderFocus() {
  const focus = nextFocus(state.feedback.criteria, state.feedback.powerUps || []);
  $("focus-card").hidden = !focus;
  $("focus-text").textContent = focus ? focus.text : "";
  $("btn-see-power").hidden = !focus || !focus.powerUp;
}

$("btn-see-power").addEventListener("click", () => {
  const at = activeSlides().findIndex((slide) => slide.key === "power");
  if (at >= 0) showSlide(at);
});

$("btn-all-skills").addEventListener("click", () => setSkillsOpen($("skills-card").hidden));

// ---- read aloud (Years 1 to 3 only) -----------------------------------------

// Puts a Listen button in a slot, or leaves it empty (Years 4 to 6, or nothing to read). The text
// is built when the button is tapped, from the feedback on screen at that moment.
function mountListen(host, what, text) {
  host.replaceChildren();
  if (!listensForYear(state.yearLevel)) return;
  host.appendChild(listenButton(text, { what }));
}

const textOf = (selector) => document.querySelector(selector)?.textContent || "";

function renderListens() {
  const fb = state.feedback;
  mountListen($("listen-strength"), "what you did well", () => strengthsSpoken(fb.criteria));
  if (!heroPowers(fb.criteria).length) $("listen-strength").replaceChildren();
  mountListen($("listen-focus"), "your next focus", () => focusSpoken(fb.criteria, fb.powerUps || []));
  if (!nextFocus(fb.criteria, fb.powerUps || [])) $("listen-focus").replaceChildren();
  mountListen($("listen-pencil"), "how to use your pencil", () =>
    staticSpoken("Pick up your pencil", textOf(".pencil-card > p:not(.pencil-title)"), ...[...document.querySelectorAll(".pencil-steps li")].map((li) => li.textContent)));
  mountListen($("listen-boost"), "word power", () => wordPowerSpoken(fb.wordBoost));
  const challenge = state.yearLevel >= 2 ? fb.wordBoost?.challenge || [] : [];
  mountListen($("listen-challenge"), "the synonym challenge", () => challengeSpoken(textOf(".challenge-lead"), challenge));
  if (!challenge.length) $("listen-challenge").replaceChildren();
  mountListen($("listen-editing"), "the editing counts", () => editingSpoken(fb.errorTotals, state.yearLevel));
  mountListen($("listen-mission"), "your mission", () => missionSpoken(fb, state.yearLevel));
}

function renderFeedback() {
  const { powerUps } = state.feedback;
  ticks.clear();
  renderStrength();
  renderHeroPowers();
  renderFocus();
  renderPractice();
  renderBoost();
  renderListens();
  rebuildShareImage();
  renderPowerUps(powerUps);
  showSlide(0);
  resetIdle();
}

// ---- feedback slides: one part at a time -----------------------------------

// The server's one-line headline is not shown: Nathan found it doubled up on the rest.
const SLIDES = [
  { key: "strength", label: "What you did well" },
  { key: "power", label: "Power-ups" },
  { key: "words", label: "Word lab" },
  { key: "finish", label: "Mission complete" },
];
let slideIndex = 0;
let powerIndex = 0; // which power-up is showing (0-based)
// Mission ticks live in memory only, like everything else: keys come from missionRows().
const ticks = new Set();
const powerCount = () => state.feedback?.powerUps?.length || 0;

// The words slide only exists when there is word power or spelling to show.
function activeSlides() {
  const fb = state.feedback;
  const hasWords = Boolean(fb);
  return SLIDES.filter((s) => (s.key !== "words" || hasWords) && (s.key !== "power" || fb?.powerUps?.length));
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

// The bottom bar: Back steps back through the power-ups first; Next reads "I did it! Next
// power-up" while more power-ups remain, then moves on to the next slide.
function updateNav() {
  const slides = activeSlides();
  const onPower = slides[slideIndex].key === "power";
  const morePowers = onPower && powerIndex < powerCount() - 1;
  const next = slides[slideIndex + 1];
  $("btn-slide-back").hidden = slideIndex === 0 && !(onPower && powerIndex > 0);
  $("btn-slide-next").hidden = !next && !morePowers;
  $("btn-slide-next").textContent = morePowers
    ? "I did it! Next power-up →"
    : next ? `${onPower && powerCount() ? "I did it! " : ""}Next: ${next.label} →` : "";
}

function setPower(index) {
  stopSpeaking();
  powerIndex = Math.max(0, Math.min(powerCount() - 1, index));
  document.querySelectorAll("#power-ups .power-card").forEach((card, i) => {
    card.hidden = i !== powerIndex;
  });
  updateNav();
}

function showSlide(index, { power = 0 } = {}) {
  stopSpeaking();
  const slides = activeSlides();
  slideIndex = Math.max(0, Math.min(slides.length - 1, index));
  const current = slides[slideIndex].key;
  document.querySelectorAll(".fb-slide").forEach((s) => s.classList.toggle("active", s.dataset.slide === current));
  if (current === "power") setPower(power);
  if (current === "finish") renderMission();
  playSlideClip(current);
  renderSteps(slides, slideIndex);
  updateNav();
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

// Mission complete: a tick list built from the feedback. Each row has a real checkbox the child
// can tick; "I did it! Next power-up" ticks that power-up's row too.
function renderMission() {
  const list = $("mission-list");
  list.replaceChildren();
  if (!state.feedback) return;
  for (const row of missionRows(state.feedback, state.yearLevel)) {
    const item = el("li", "mission-item");
    const label = el("label", "mission-row");
    const box = el("input");
    box.type = "checkbox";
    box.dataset.key = row.key;
    box.checked = ticks.has(row.key);
    box.addEventListener("change", () => {
      if (box.checked) ticks.add(row.key);
      else ticks.delete(row.key);
    });
    const text = el("span", "mission-text");
    text.appendChild(el("strong", "mission-label", row.label));
    if (row.line) {
      const line = el("span", "mission-part", "Find this line: ");
      line.appendChild(el("q", "mission-line", row.line));
      text.appendChild(line);
    }
    if (row.job) text.appendChild(el("span", "mission-part", row.key.startsWith("power-") ? `Do this: ${row.job}` : row.job));
    label.append(box, text);
    item.appendChild(label);
    list.appendChild(item);
  }
}

function focusPowerTitle() {
  window.scrollTo(0, 0);
  focusHeading(document.querySelector("#power-ups .power-card:not([hidden]) .power-title"));
}

$("btn-slide-back").addEventListener("click", () => {
  const onPower = activeSlides()[slideIndex].key === "power";
  if (onPower && powerIndex > 0) {
    setPower(powerIndex - 1);
    focusPowerTitle();
  } else {
    showSlide(slideIndex - 1, { power: Number.MAX_SAFE_INTEGER }); // coming back lands on the last power-up
  }
});
$("btn-slide-next").addEventListener("click", () => {
  const onPower = activeSlides()[slideIndex].key === "power";
  if (onPower) ticks.add(`power-${powerIndex}`); // "I did it!" ticks the mission row, the last one too
  if (onPower && powerIndex < powerCount() - 1) {
    setPower(powerIndex + 1);
    focusPowerTitle();
  } else {
    showSlide(slideIndex + 1);
  }
});

// The Back / Next / Finish bar is fixed to the bottom of the screen, so the slide leaves room for it.
const slideBar = document.querySelector(".slide-nav");
if (window.ResizeObserver) {
  new ResizeObserver(() => {
    if (slideBar.offsetHeight) document.documentElement.style.setProperty("--bar-h", `${slideBar.offsetHeight}px`);
  }).observe(slideBar);
}

// ---- save picture / print / restart ---------------------------------------

// The picture is pre-built so the save tap can share it instantly (Safari only allows
// sharing right after a tap). It is the child's feedback only: nothing for the teacher.
let shareCache = { key: "", blob: null };

// Photos of the writing only leave the app when the child ticks the box (off by default).
const includePhotos = () => $("include-photos").checked;

function shareImageInputs() {
  return { pages: includePhotos() ? state.pages : [], feedback: state.feedback, yearLevel: state.yearLevel };
}

function rebuildShareImage() {
  if (!state.feedback) return;
  const key = `photos:${includePhotos()}`;
  shareCache = { key, blob: null };
  buildFeedbackImage(shareImageInputs())
    .then((blob) => {
      if (shareCache.key === key) shareCache.blob = blob;
    })
    .catch(() => {});
}

$("include-photos").addEventListener("change", rebuildShareImage);

$("btn-save-pic").addEventListener("click", async () => {
  if (!state.feedback) return;
  try {
    const key = `photos:${includePhotos()}`;
    const blob = (shareCache.key === key && shareCache.blob) || (await buildFeedbackImage(shareImageInputs()));
    await saveFeedbackImage(blob);
  } catch {
    showError("Hmm, the picture didn't save. You can use Print instead, or try again.");
  }
});

$("btn-print").addEventListener("click", () => {
  const { criteria, powerUps } = state.feedback;
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
  $("print-strength").replaceChildren(...writingStrengthLines(criteria).map(line => el("p", "", line)));
  const powersBox = $("print-powers");
  powersBox.innerHTML = "";
  const powers = heroPowers(criteria);
  if (powers.length) {
    const h = document.createElement("h2");
    h.textContent = "What you did well";
    const ul = document.createElement("ul");
    for (const power of powers) {
      const li = document.createElement("li");
      li.textContent = `${power.label}: ${power.text}`;
      ul.appendChild(li);
    }
    powersBox.append(h, ul);
  }
  const powerBox = $("print-powerups");
  $("print-powerups-title").hidden = !powerUps.length;
  powerBox.innerHTML = "";
  powerUps.forEach((p, index) => {
    const h = document.createElement("h3");
    h.textContent = `Power-up ${index + 1}: ${p.skill}${p.areaLabel ? ` (${p.areaLabel})` : ""}`;
    powerBox.appendChild(h);
    for (const line of powerUpLines(p)) {
      const para = document.createElement("p");
      para.textContent = line;
      powerBox.appendChild(para);
    }
  });
  const practiceBox = $("print-practice");
  practiceBox.innerHTML = "";
  const h = document.createElement("h2");
  h.textContent = "Editing: errors to find";
  const ul = document.createElement("ul");
  for (const line of errorTotalLines(state.feedback, state.yearLevel)) {
    const li = document.createElement("li");
    li.textContent = line;
    ul.appendChild(li);
  }
  const task = document.createElement("p");
  task.textContent = editingTask;
  const note = document.createElement("p");
  note.textContent = roughNote;
  practiceBox.append(h, ul, task, note);
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
      p.textContent = `In your writing: ${boost.before} Like this: ${boost.after}`;
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
  clearSpeechCache(); // stops any voice and forgets the downloaded audio
  state.pages = [];
  state.transcript = "";
  state.feedback = null;
  ticks.clear();
  powerIndex = 0;
  shareCache = { key: "", blob: null };
  $("transcript").value = "";
  $("transcript-check-note").hidden = true;
  $("transcript-check-note").textContent = "";
  $("include-photos").checked = false;
  $("camera-title").textContent = "Photo time";
  for (const id of ["strength-bar", "powers-list", "power-ups", "practice-words", "mission-list", "boost-swaps", "challenge-list", "print-pages", "print-strength", "print-powers", "print-powerups", "print-practice", "print-boost", "listen-strength", "listen-focus", "listen-pencil", "listen-boost", "listen-challenge", "listen-editing", "listen-mission"]) {
    $(id).innerHTML = "";
  }
  for (const id of ["strength-summary", "strength-key", "strength-focus", "skill-detail-title", "skill-detail-what", "skill-detail-how", "skill-detail-note", "print-transcript"]) $(id).textContent = "";
  for (const id of ["skill-detail-strength", "skill-detail-next"]) $(id).lastElementChild.textContent = "";
  $("boost-before").textContent = "";
  $("boost-after").textContent = "";
  $("focus-text").textContent = "";
  $("focus-card").hidden = true;
  $("powers-empty").hidden = true;
  $("btn-all-skills").hidden = true;
  $("skills-card").hidden = true;
  $("powers-card").hidden = true;
  $("boost-challenge").hidden = true;
  closeSkill();
  renderPages();
  // The next child picks their own year and kind of writing; a leftover choice would quietly
  // set the wrong year's expectations and reading level.
  state.yearLevel = null;
  state.genre = "narrative";
  document.querySelectorAll(".year-btn").forEach((b) => markSelected(b, false));
  document.querySelectorAll(".chip").forEach((c) => markSelected(c, c.dataset.genre === "narrative"));
  setSeniorLook();
  refreshStartButton();
}

// Every "Finish and clear" button: a first tap arms it, a second tap within 4 seconds clears.
// A second tap sooner than half a second is a double tap, not a "yes", so it is ignored.
const FINISH_CONFIRM_GAP_MS = 500;
let armedFinish = null; // { button, label, timer, at }

function disarmFinish() {
  if (!armedFinish) return;
  clearTimeout(armedFinish.timer);
  armedFinish.button.textContent = armedFinish.label;
  armedFinish = null;
}

document.querySelectorAll(".btn-finish").forEach((button) => {
  button.addEventListener("click", () => {
    if (armedFinish && armedFinish.button === button) {
      if (Date.now() - armedFinish.at < FINISH_CONFIRM_GAP_MS) return;
      disarmFinish();
      clearEverything();
      show("screen-start");
      return;
    }
    disarmFinish();
    armedFinish = { button, label: button.textContent, timer: setTimeout(disarmFinish, 4000), at: Date.now() };
    button.textContent = "Sure? Tap again";
  });
});

// Left alone with work on screen, the iPad warns and then clears itself, so the next child cannot
// find the last one's writing: 9 minutes then 1 minute on the camera and typing screens; on the
// feedback screens (where a child reads and works from the slides) 20 minutes then 5. Any tap or
// key press starts the clock again. Nothing clears while the camera or another app is in front.
// (?idle=<seconds> shortens the wait for testing, on every screen.)
const IDLE_TEST_SECONDS = Number(new URLSearchParams(location.search).get("idle")) || 0;
const IDLE_WARN_MS = IDLE_TEST_SECONDS ? IDLE_TEST_SECONDS * 1000 : 9 * 60_000;
const IDLE_CLEAR_MS = IDLE_TEST_SECONDS ? 4_000 : 60_000;
const IDLE_FEEDBACK_WARN_MS = IDLE_TEST_SECONDS ? IDLE_TEST_SECONDS * 1000 : 20 * 60_000;
const IDLE_FEEDBACK_CLEAR_MS = IDLE_TEST_SECONDS ? 4_000 : 5 * 60_000;
let idleWarnTimer = null;
let idleClearTimer = null;

const hasWork = () => state.pages.length > 0 || state.transcript.length > 0 || state.feedback !== null;

function resetIdle() {
  clearTimeout(idleWarnTimer);
  clearTimeout(idleClearTimer);
  $("idle-banner").hidden = true;
  if (!hasWork()) return;
  // Feedback exists from the moment the slides are built, so this holds on every feedback slide.
  const onFeedback = state.feedback !== null;
  const warnMs = onFeedback ? IDLE_FEEDBACK_WARN_MS : IDLE_WARN_MS;
  const clearMs = onFeedback ? IDLE_FEEDBACK_CLEAR_MS : IDLE_CLEAR_MS;
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
    }, clearMs);
  }, warnMs);
}

for (const type of ["pointerdown", "keydown", "touchstart", "input"]) {
  document.addEventListener(type, resetIdle, { passive: true });
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopSpeaking();
  else resetIdle();
});


// ---- error banner ----------------------------------------------------------

// A Listen button that could not play raises this; it shows in the usual banner.
document.addEventListener("speech-error", (event) => showError(event.detail));

$("btn-error-close").addEventListener("click", () => {
  $("error-banner").hidden = true;
});



renderPages();

refreshStartButton();
