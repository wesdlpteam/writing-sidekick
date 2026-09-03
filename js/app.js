import { prepareScan, rotate90 } from "./scan.js";
import { transcribePages, getFeedback } from "./api.js";
import { loadSettings, saveSettings } from "./settings.js";
import { buildFeedbackImage, saveFeedbackImage } from "./share-image.js";
import { listenButton, stopSpeaking, clearSpeechCache } from "./speech.js";

const MAX_PAGES = 4;

const state = {
  yearLevel: null,
  genre: "",
  pages: [], // cleaned-up page photos as data URLs, in order
  feedback: null,
};

const $ = (id) => document.getElementById(id);

function show(screenId) {
  stopSpeaking();
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === screenId));
  window.scrollTo(0, 0);
}

// Read-aloud (teacher setting). Set for each feedback render; renderers call mountListen.
let readAloud = true;

function mountListen(slot, text, options) {
  slot.innerHTML = "";
  if (readAloud) slot.appendChild(listenButton(text, options));
}

const joinOr = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}` : items[0]);

function setLoading(visible, message) {
  if (message) $("loading-msg").textContent = message;
  $("loading").hidden = !visible;
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
  document.querySelectorAll(".year-btn").forEach((b) => b.classList.toggle("selected", b === btn));
  setSeniorLook();
  refreshStartButton();
});

$("genre-chips").addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  state.genre = chip.dataset.genre;
  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("selected", c === chip));
});

$("btn-start").addEventListener("click", () => show("screen-camera"));
$("btn-back-start").addEventListener("click", () => show("screen-start"));
$("btn-back-camera").addEventListener("click", () => show("screen-camera"));

// ---- pages: photo -> cleaned scan, up to four pages -------------------------

async function addPage(file) {
  if (!file || state.pages.length >= MAX_PAGES) return;
  try {
    setLoading(true, "Tidying up your photo…");
    // Later pages are kept a little smaller so four pages still fit in one request.
    const { dataUrl } = await prepareScan(file, { maxEdge: state.pages.length < 2 ? 2000 : 1600 });
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
    for (const [action, text] of [
      ["rotate", "↻ Rotate"],
      ["remove", "✕ Remove"],
    ]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ghost small";
      btn.dataset.action = action;
      btn.dataset.index = index;
      btn.textContent = text;
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

function renderReviewPages() {
  const box = $("review-pages");
  box.innerHTML = "";
  state.pages.forEach((dataUrl, index) => {
    const img = document.createElement("img");
    img.src = dataUrl;
    img.alt = `Photo of page ${index + 1}`;
    box.appendChild(img);
  });
}

$("btn-read").addEventListener("click", async () => {
  if (!state.pages.length) return;
  try {
    setLoading(
      true,
      state.pages.length === 1
        ? "Your sidekick is reading your writing…"
        : `Your sidekick is reading all ${state.pages.length} pages…`,
    );
    const { transcript } = await transcribePages({ images: state.pages, yearLevel: state.yearLevel });
    $("transcript").value = transcript;
    renderReviewPages();
    show("screen-review");
    autosizeTranscript();
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
});

// ---- the typed copy: one document-style box that grows with the writing --------------

function autosizeTranscript() {
  const box = $("transcript");
  box.style.height = "auto";
  box.style.height = `${Math.max(320, box.scrollHeight + 4)}px`;
}

$("transcript").addEventListener("input", autosizeTranscript);

// ---- step 2: checked transcript -> feedback --------------------------------

$("btn-confirm").addEventListener("click", async () => {
  const transcript = $("transcript").value.trim();
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
});

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
  mountListen($("practice-listen"), () => `Spelling to practise: ${words.map((w) => w.correct).join(", ")}.${tip ? ` Tip: ${tip}` : ""}`);
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
  mountListen($("boost-listen"), () =>
    `Word power. ${boost.swaps.map((s) => `Instead of ${s.from}, try ${joinOr(s.to)}`).join(". ")}.${
      hasExample ? ` Your sentence: ${boost.before} With word power: ${boost.after}` : ""
    }`,
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

// A named sentence type: what it is called, the rule, and a fresh example, so the child can
// recognise the move and use it again.
function sentenceTypeNote(type) {
  const box = el("div", "sentence-type");
  const title = el("p", "st-title");
  title.append(emoji("✨"), "This is a ", el("strong", "", type.name), ".");
  const rule = el("p", "st-rule", type.rule);
  const example = el("p", "st-example");
  example.append("Another one: ", el("em", "", type.example));
  box.append(title, rule, example);
  return box;
}

// Emoji live in a span so the senior look (Years 5 and 6) can hide them.
function emoji(char) {
  return el("span", "h-emoji", `${char} `);
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
    head.appendChild(el("p", "power-title", `Power-up ${index + 1}: ${p.skill}`));
    if (p.areaLabel) head.appendChild(el("span", "power-area", p.areaLabel));
    if (readAloud) {
      const st = p.sentenceType;
      head.appendChild(
        listenButton(() =>
          [
            `Power-up ${index + 1}: ${p.skill}.`,
            p.why,
            p.yourLine && `Your line: ${p.yourLine}`,
            `Try this: ${p.tryThis}`,
            st && `This is a ${st.name}. ${st.rule} Another one: ${st.example}`,
            p.nowYou && `Now you: ${p.nowYou}`,
          ]
            .filter(Boolean)
            .join(" "),
        ),
      );
    }
    card.append(head, el("p", "power-why", p.why));
    if (p.yourLine) card.appendChild(labelledLine("Your line:", p.yourLine, "q"));
    card.appendChild(labelledLine("Try this:", p.tryThis, "strong"));
    if (p.sentenceType) card.appendChild(sentenceTypeNote(p.sentenceType));
    if (p.nowYou) {
      const task = el("p", "power-task");
      task.append(emoji("✍️"), el("strong", "", "Now you: "), p.nowYou);
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

// The check-up: one compact card per area writing markers look at, with a status, what the
// child did well and the next step (or a pointer to the power-up that covers it).
function renderCriteria(criteria) {
  const grid = $("criteria");
  grid.innerHTML = "";
  for (const c of criteria) {
    const status = STATUS[c.status] || STATUS.steady;
    const card = el("article", `crit-card ${status.css}`);
    const head = el("div", "crit-head");
    const names = el("div");
    names.append(el("p", "crit-label", c.label), el("p", "crit-sub", c.sub));
    const badge = el("span", "crit-status");
    badge.append(emoji(status.emoji), status.label);
    head.append(names, badge);
    card.appendChild(head);
    if (c.strength) {
      const line = el("p", "crit-line crit-strength");
      line.append(emoji("✅"), c.strength);
      card.appendChild(line);
    }
    if (c.powerUp) {
      const link = el("button", "crit-link");
      link.type = "button";
      link.append(emoji("⚡"), `See Power-up ${c.powerUp}`);
      link.addEventListener("click", () => $(`power-up-${c.powerUp}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
      card.appendChild(link);
    } else if (c.nextStep) {
      const line = el("p", "crit-line crit-next");
      line.append(emoji("➡️"), c.nextStep);
      card.appendChild(line);
    }
    if (readAloud) {
      const next = c.powerUp ? `See power-up ${c.powerUp}.` : c.nextStep;
      card.appendChild(listenButton(() => [`${c.label}: ${status.label}.`, c.strength, next].filter(Boolean).join(" "), { compact: true }));
    }
    grid.appendChild(card);
  }
}

function renderFeedback() {
  const { headline, criteria, powerUps } = state.feedback;
  readAloud = loadSettings().readAloud;
  clearSpeechCache();
  mountListen($("headline-actions"), headline);
  renderPractice();
  renderBoost();
  const showDetail = loadSettings().showDetail;
  $("save-detail-row").hidden = !showDetail;
  $("save-brief").checked = true;
  $("save-detail").checked = showDetail;
  rebuildShareImage();
  $("headline").textContent = headline;
  renderPowerUps(powerUps);
  renderCriteria(criteria);
  $("checkup").hidden = !showDetail;
}

// ---- save picture / print / restart ---------------------------------------

// The picture is pre-built for the ticked options so the save tap can share it instantly
// (Safari only allows sharing right after a tap).
let shareCache = { key: "", blob: null };

function shareOptions() {
  const detailAllowed = loadSettings().showDetail;
  return { brief: $("save-brief").checked, detail: detailAllowed && $("save-detail").checked };
}

function shareImageInputs(include) {
  return { pages: state.pages, feedback: state.feedback, yearLevel: state.yearLevel, include };
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
  const { headline, criteria, powerUps } = state.feedback;
  $("print-date").textContent = new Date().toLocaleDateString("en-AU", {
    day: "numeric", month: "long", year: "numeric",
  });
  const pagesBox = $("print-pages");
  pagesBox.innerHTML = "";
  state.pages.forEach((dataUrl, index) => {
    const img = document.createElement("img");
    img.src = dataUrl;
    img.alt = `Page ${index + 1}`;
    pagesBox.appendChild(img);
  });
  $("print-transcript").textContent = $("transcript").value;
  $("print-headline").textContent = headline;
  const powerBox = $("print-powerups");
  powerBox.innerHTML = "";
  powerUps.forEach((p, index) => {
    const h = document.createElement("h3");
    h.textContent = `Power-up ${index + 1}: ${p.skill}${p.areaLabel ? ` (${p.areaLabel})` : ""}`;
    powerBox.appendChild(h);
    const st = p.sentenceType;
    for (const line of [
      p.why,
      p.yourLine && `Your line: ${p.yourLine}`,
      `Try this: ${p.tryThis}`,
      st && `This is a ${st.name}. ${st.rule} Another one: ${st.example}`,
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
  if (loadSettings().showDetail) {
    const h = document.createElement("h2");
    h.textContent = "Writing check-up";
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

// First tap arms the button; only a second tap within 4s actually clears the work.
let restartArmed = false;
let restartTimer = null;

function disarmRestart() {
  restartArmed = false;
  clearTimeout(restartTimer);
  $("btn-restart").textContent = "Start again";
}

$("btn-restart").addEventListener("click", () => {
  if (!restartArmed) {
    restartArmed = true;
    $("btn-restart").textContent = "Sure? Tap again";
    restartTimer = setTimeout(disarmRestart, 4000);
    return;
  }
  disarmRestart();
  clearSpeechCache();
  state.pages = [];
  state.feedback = null;
  shareCache = { key: "", blob: null };
  $("transcript").value = "";
  $("review-pages").innerHTML = "";
  renderPages();
  show("screen-start");
});

// ---- error banner ----------------------------------------------------------

$("btn-error-close").addEventListener("click", () => {
  $("error-banner").hidden = true;
});

document.addEventListener("speech-error", (event) => showError(event.detail));

// ---- teacher settings ------------------------------------------------------

$("btn-settings").addEventListener("click", () => {
  const settings = loadSettings();
  $("setting-year").value = settings.defaultYear ?? "";
  $("setting-detail").checked = settings.showDetail;
  $("setting-readaloud").checked = settings.readAloud;
  $("settings-dialog").showModal();
});

$("btn-settings-done").addEventListener("click", () => {
  const yearValue = $("setting-year").value;
  saveSettings({
    defaultYear: yearValue ? Number(yearValue) : null,
    showDetail: $("setting-detail").checked,
    readAloud: $("setting-readaloud").checked,
  });
  $("settings-dialog").close();
  applyDefaultYear();
});

function applyDefaultYear() {
  const { defaultYear } = loadSettings();
  if (defaultYear && !state.yearLevel) {
    state.yearLevel = defaultYear;
    document.querySelectorAll(".year-btn").forEach((b) =>
      b.classList.toggle("selected", Number(b.dataset.year) === defaultYear),
    );
    setSeniorLook();
    refreshStartButton();
  }
}

applyDefaultYear();
renderPages();
