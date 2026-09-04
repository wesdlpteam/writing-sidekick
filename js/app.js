import { prepareScan, rotate90 } from "./scan.js";
import { transcribePage, getFeedback, getLevelUp } from "./api.js";
import { buildFeedbackImage, saveFeedbackImage } from "./share-image.js";
import { listenButton, stopSpeaking, clearSpeechCache } from "./speech.js";

const MAX_PAGES = 4;

const state = {
  yearLevel: null,
  genre: "",
  pages: [], // cleaned-up page photos as data URLs, in order
  transcripts: [], // the typed copy of each page, kept up to date as the child edits
  reviewIndex: 0, // which page is open on the check-the-typing screen
  feedback: null,
  round: 1, // 2 once the child comes back with their revised writing
  original: null, // round 2: { transcript, feedback } from round 1
};

const $ = (id) => document.getElementById(id);

function show(screenId) {
  stopSpeaking();
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

// Read-aloud is always on (the app is student-only for now); renderers call mountListen.
const readAloud = true;

function mountListen(slot, text, options) {
  slot.innerHTML = "";
  if (readAloud) slot.appendChild(listenButton(text, options));
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
// In round 2 the camera's Back goes to the feedback, where the child came from.
$("btn-back-start").addEventListener("click", () => show(state.round === 2 ? "screen-feedback" : "screen-start"));
$("btn-back-camera").addEventListener("click", () => show("screen-camera"));

// ---- pages: photo -> cleaned scan, up to four pages -------------------------

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

$("btn-read").addEventListener("click", async () => {
  if (!state.pages.length) return;
  try {
    setLoading(
      true,
      state.pages.length === 1
        ? "Your sidekick is reading your writing…"
        : `Your sidekick is reading all ${state.pages.length} pages…`,
    );
    // One request per page, read side by side, then joined in page order with a blank line
    // between pages. One big request for all pages used to trip the server's upload limit.
    const pages = await Promise.all(state.pages.map((image) => transcribePage({ image, yearLevel: state.yearLevel })));
    state.transcripts = pages.map((page) => page.transcript.trim());
    state.reviewIndex = 0;
    // Years 1 to 3 do not check the typing: it is a lot of reading for a young writer, so the
    // feedback comes straight back. Year 4 and up still get to fix anything the app misread.
    // An unreadable photo always shows the typing screen, whatever the year, so the writing
    // can be typed in rather than the child being stuck.
    if (checksTyping() || !fullTranscript()) {
      show("screen-review");
      showReviewPage();
      return;
    }
    await submitWriting();
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
});

// ---- the typed copy: one page at a time in a document-style box that grows with the writing --

function autosizeTranscript() {
  const box = $("transcript");
  box.style.height = "auto";
  box.style.height = `${Math.max(320, box.scrollHeight + 4)}px`;
}

// The first measurement can be short if the writing font or the screen size arrives late,
// which used to leave a page of writing cut off halfway. Measure again when either changes.
document.fonts?.ready.then(autosizeTranscript).catch(() => {});
window.addEventListener("resize", autosizeTranscript);

// Shows the current page's typing. Next page moves through the pages; the feedback button
// only appears on the last page, so every page gets checked.
function showReviewPage() {
  const count = state.transcripts.length;
  const index = state.reviewIndex;
  const last = index >= count - 1;
  $("transcript").value = state.transcripts[index] || "";
  $("review-page-label").textContent = `Page ${index + 1} of ${count}`;
  $("review-page-label").hidden = count < 2;
  $("btn-prev-page").hidden = index === 0;
  $("btn-next-page").hidden = last;
  $("btn-confirm").hidden = !last;
  autosizeTranscript();
  window.scrollTo(0, 0);
  if (count > 1) focusHeading($("review-page-label"));
  resetIdle();
}

$("transcript").addEventListener("input", () => {
  state.transcripts[state.reviewIndex] = $("transcript").value;
  autosizeTranscript();
});

$("btn-prev-page").addEventListener("click", () => {
  state.reviewIndex = Math.max(0, state.reviewIndex - 1);
  showReviewPage();
});

$("btn-next-page").addEventListener("click", () => {
  state.reviewIndex = Math.min(state.transcripts.length - 1, state.reviewIndex + 1);
  showReviewPage();
});

// All pages joined in order, with a blank line between pages; empty pages are skipped.
function fullTranscript() {
  return state.transcripts
    .map((page) => page.trim())
    .filter(Boolean)
    .join("\n\n");
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
    if (state.round === 2 && state.original) {
      // Round 2: compare the new version with the first one and celebrate what changed.
      setLoading(true, "Your sidekick is checking what got better…");
      const fb = state.original.feedback;
      const reply = await getLevelUp({
        yearLevel: state.yearLevel,
        genre: state.genre,
        levelUp: {
          before: state.original.transcript,
          after: transcript,
          powerUps: fb.powerUps.map((p) => ({ skill: p.skill, area: p.areaLabel, tryThis: p.tryThis, nowYou: p.nowYou, move: p.move?.name || "" })),
          practiceWords: fb.practiceWords || [],
        },
      });
      renderLevelUp(reply);
      show("screen-levelup");
      return;
    }
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

function renderPractice() {
  const words = state.feedback.practiceWords || [];
  const tip = state.feedback.spellingTip || "";
  const card = $("practice-card");
  card.hidden = words.length === 0;
  if (!words.length) return;
  const list = $("practice-words");
  list.innerHTML = "";
  for (const { correct, wrote } of words) {
    const li = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = correct;
    const small = document.createElement("span");
    small.className = "wrote";
    small.textContent = `you wrote: ${wrote}`;
    li.append(strong, small);
    list.appendChild(li);
  }
  $("practice-tip").hidden = !tip;
  $("practice-tip").textContent = tip;
  mountListen($("practice-listen"), () => `Spelling to practise: ${words.map((w) => w.correct).join(", ")}.${tip ? ` Tip: ${tip}` : ""}`, {
    label: "Listen to spelling to practise",
  });
}

function renderBoost() {
  const boost = state.feedback.wordBoost;
  const card = $("boost-card");
  card.hidden = !boost;
  if (!boost) return;
  const list = $("boost-swaps");
  list.innerHTML = "";
  for (const { from, to } of boost.swaps) {
    const li = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = from;
    li.append(strong, ` → ${to.join(", ")}`);
    list.appendChild(li);
  }
  const hasExample = boost.before && boost.after;
  $("boost-example").hidden = !hasExample;
  if (hasExample) {
    $("boost-before").textContent = boost.before;
    $("boost-after").textContent = boost.after;
  }
  mountListen(
    $("boost-listen"),
    () =>
      `Word power. ${boost.swaps.map((s) => `Instead of ${s.from}, try ${joinOr(s.to)}`).join(". ")}.${
        hasExample ? ` Your sentence: ${boost.before} With word power: ${boost.after}` : ""
      }`,
    { label: "Listen to word power" },
  );
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

// A named writing move (the ones the school teaches): its name, the rule, and a fresh example,
// so the child can recognise the move and use it again.
function moveNote(move) {
  const box = el("div", "move-note");
  const title = el("p", "st-title");
  title.append(emoji("✨"), "Writing move: ", el("strong", "", move.name));
  const rule = el("p", "st-rule", move.rule);
  const example = el("p", "st-example");
  example.append("Another one: ", el("em", "", move.example));
  box.append(title, rule, example);
  return box;
}

const moveSpeech = (move) => (move ? `Writing move: ${move.name}. ${move.rule} Another one: ${move.example}` : "");

// Emoji live in a span so the senior look (Years 5 and 6) can hide them; screen readers skip them.
function emoji(char) {
  const node = el("span", "h-emoji", `${char} `);
  node.setAttribute("aria-hidden", "true");
  return node;
}

// Each power-up: the skill, why it matters here, the child's own line, that line done well
// (named as a sentence type when it is one), and a tiny task to do now.
function renderPowerUps(powerUps) {
  const box = $("power-ups");
  box.innerHTML = "";
  powerUps.forEach((p, index) => {
    const card = el("section", "power-card");
    card.id = `power-up-${index + 1}`;
    const head = el("div", "power-head");
    head.appendChild(el("h3", "power-title", `Power-up ${index + 1}: ${p.skill}`));
    if (p.areaLabel) head.appendChild(el("span", "power-area", p.areaLabel));
    if (readAloud) {
      head.appendChild(
        listenButton(
          () =>
            [
              `Power-up ${index + 1}: ${p.skill}.`,
              p.why,
              p.yourLine && `Your line: ${p.yourLine}`,
              `Try this: ${p.tryThis}`,
              moveSpeech(p.move),
              p.nowYou && `Now you: ${p.nowYou}`,
            ]
              .filter(Boolean)
              .join(" "),
          { label: `Listen to Power-up ${index + 1}` },
        ),
      );
    }
    card.append(head, el("p", "power-why", p.why));
    if (p.yourLine) card.appendChild(labelledLine("Your line:", p.yourLine, "q"));
    card.appendChild(labelledLine("Try this:", p.tryThis, "strong"));
    if (p.move) card.appendChild(moveNote(p.move));
    if (p.nowYou) {
      const task = el("p", "power-task");
      task.append(emoji("✍️"), el("strong", "", "Now you: "), p.nowYou);
      card.appendChild(task);
    }
    box.appendChild(card);
  });
}

// ---- level up: round 2 -------------------------------------------------------

// The child goes back to their book, revises, then photographs the new version. Round 1's
// typing and feedback are kept so the server can compare and name what improved.
function startLevelUp() {
  state.original = { transcript: fullTranscript(), feedback: state.feedback };
  state.round = 2;
  state.pages = [];
  state.transcripts = [];
  state.reviewIndex = 0;
  $("camera-title").textContent = "Photo time: round 2";
  $("round-note").hidden = false;
  renderPages();
  show("screen-camera");
}

$("btn-level-up").addEventListener("click", startLevelUp);

// Specific praise for what really changed: the wins (each quoting the new writing), the
// practice words now spelt right, and one gentle next tip.
function renderLevelUp(reply) {
  $("cheer").textContent = reply.cheer || "You went back and worked on your writing. That is what real writers do.";
  mountListen($("cheer-listen"), () => $("cheer").textContent, { label: "Listen to this message" });
  const wins = $("wins");
  wins.innerHTML = "";
  for (const w of reply.wins || []) {
    const li = el("li", "win");
    li.append(emoji("✅"), el("strong", "", w.what), el("q", "win-evidence", w.evidence));
    wins.appendChild(li);
  }
  if (!(reply.wins || []).length) {
    wins.appendChild(el("li", "win win-empty", "I could not spot a change yet. Every writer starts somewhere: try one power-up next time."));
  }
  const fixed = reply.spellingFixed || [];
  $("spelling-fixed-card").hidden = fixed.length === 0;
  const list = $("spelling-fixed");
  list.innerHTML = "";
  for (const word of fixed) list.appendChild(el("li", "", word));
  // The model sometimes opens with "Next time..." itself, so the label is not doubled up.
  const next = (reply.next || "").replace(/^next time[,:]?\s*/i, "");
  $("next-tip").hidden = !next;
  $("next-tip").textContent = next ? `Next time: ${next.charAt(0).toUpperCase()}${next.slice(1)}` : "";
  resetIdle();
}

const STATUS = {
  strength: { emoji: "⭐", label: "Strength", css: "is-strength" },
  steady: { emoji: "👍", label: "On track", css: "is-steady" },
  next_step: { emoji: "🚀", label: "Next step", css: "is-next" },
};

// The ten-area check-up is no longer shown to the child; it goes into the teacher report
// (print and saved picture) with the highest-impact goal.

function renderFeedback() {
  const { powerUps } = state.feedback;
  clearSpeechCache();
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
  { key: "levelup", label: "Level up" },
];
let slideIndex = 0;

// The words slide only exists when there is word power or spelling to show.
function activeSlides() {
  const fb = state.feedback;
  const hasWords = Boolean(fb && (fb.wordBoost || (fb.practiceWords || []).length));
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
  stopSpeaking();
  document.querySelectorAll(".fb-slide").forEach((s) => s.classList.toggle("active", s.dataset.slide === current));
  renderSteps(slides, slideIndex);
  const next = slides[slideIndex + 1];
  $("btn-slide-back").hidden = slideIndex === 0;
  $("btn-slide-next").hidden = !next;
  if (next) $("btn-slide-next").textContent = `Next: ${next.label} →`;
  window.scrollTo(0, 0);
  focusHeading(document.querySelector(`.fb-slide[data-slide="${current}"] .fb-heading`));
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
  const powerBox = $("print-powerups");
  powerBox.innerHTML = "";
  powerUps.forEach((p, index) => {
    const h = document.createElement("h3");
    h.textContent = `Power-up ${index + 1}: ${p.skill}${p.areaLabel ? ` (${p.areaLabel})` : ""}`;
    powerBox.appendChild(h);
    for (const line of [
      p.why,
      p.yourLine && `Your line: ${p.yourLine}`,
      `Try this: ${p.tryThis}`,
      moveSpeech(p.move),
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
  const practiceWords = state.feedback.practiceWords || [];
  if (practiceWords.length) {
    const h = document.createElement("h2");
    h.textContent = "Spelling to practise";
    const ul = document.createElement("ul");
    for (const { correct, wrote } of practiceWords) {
      const li = document.createElement("li");
      li.textContent = `${correct} (you wrote: ${wrote})`;
      ul.appendChild(li);
    }
    practiceBox.append(h, ul);
    if (state.feedback.spellingTip) {
      const p = document.createElement("p");
      p.textContent = `Tip: ${state.feedback.spellingTip}`;
      practiceBox.appendChild(p);
    }
  }
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
  }
  window.print();
});

// ---- finish and clear: shared iPads must not hand one child's work to the next ------------

// Everything the app holds about this piece of writing, gone: photos, typing, feedback,
// cached speech, the prepared share picture, and the copies drawn on screen.
function clearEverything() {
  clearSpeechCache();
  state.pages = [];
  state.transcripts = [];
  state.reviewIndex = 0;
  state.feedback = null;
  state.round = 1;
  state.original = null;
  shareCache = { key: "", blob: null };
  $("transcript").value = "";
  $("include-photos").checked = false;
  $("camera-title").textContent = "Photo time";
  $("round-note").hidden = true;
  for (const id of ["power-ups", "practice-words", "boost-swaps", "wins", "spelling-fixed", "print-pages", "print-powerups", "print-checkup", "print-practice", "print-boost"]) {
    $(id).innerHTML = "";
  }
  for (const id of ["print-transcript", "print-goal", "cheer", "next-tip"]) $(id).textContent = "";
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

const hasWork = () => state.pages.length > 0 || state.transcripts.length > 0 || state.feedback !== null;

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

// The camera screen's instructions and privacy line can be listened to as well as read.
mountListen(
  $("camera-listen"),
  () => `${[...document.querySelectorAll("#screen-camera .reminder li")].map((li) => li.textContent.trim()).join(". ")}. ${$("privacy-line").textContent.trim()}`,
  { label: "Listen to this screen" },
);

// ---- error banner ----------------------------------------------------------

$("btn-error-close").addEventListener("click", () => {
  $("error-banner").hidden = true;
});

document.addEventListener("speech-error", (event) => showError(event.detail));

renderPages();
