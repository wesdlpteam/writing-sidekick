import { prepareScan, rotate90 } from "./scan.js";
import { transcribePages, getFeedback } from "./api.js";
import { loadSettings, saveSettings } from "./settings.js";
import { buildFeedbackImage, saveFeedbackImage } from "./share-image.js";

const MAX_PAGES = 4;

const state = {
  yearLevel: null,
  genre: "",
  pages: [], // cleaned-up page photos as data URLs, in order
  feedback: null,
};

const $ = (id) => document.getElementById(id);

function show(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === screenId));
  window.scrollTo(0, 0);
}

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

// Each power-up: the skill, why it matters here, the child's own line, that line done well,
// and a tiny task to do now. The first one also fills the sidekick's speech bubble.
function renderPowerUps(powerUps) {
  const box = $("power-ups");
  box.innerHTML = "";
  powerUps.forEach((p, index) => {
    const card = document.createElement("section");
    card.className = "power-card";
    const title = document.createElement("p");
    title.className = "power-title";
    title.textContent = `⚡ Power-up ${index + 1}: ${p.skill}`;
    const why = document.createElement("p");
    why.className = "power-why";
    why.textContent = p.why;
    card.append(title, why);
    if (p.yourLine) card.appendChild(labelledLine("Your line:", p.yourLine, "q"));
    card.appendChild(labelledLine("Try this:", p.tryThis, "strong"));
    if (p.nowYou) {
      const task = document.createElement("p");
      task.className = "power-task";
      task.textContent = `✍️ Now you: ${p.nowYou}`;
      card.appendChild(task);
    }
    box.appendChild(card);
  });
}

function renderFeedback() {
  const { stars, powerUps, detail } = state.feedback;
  renderPractice();
  renderBoost();
  const showDetail = loadSettings().showDetail;
  $("save-detail-row").hidden = !showDetail;
  $("save-brief").checked = true;
  $("save-detail").checked = showDetail;
  rebuildShareImage();
  const starsBox = $("stars");
  starsBox.innerHTML = "";
  for (const star of stars) {
    const div = document.createElement("div");
    div.className = "star-item";
    if (star.quote) {
      const q = document.createElement("q");
      q.textContent = star.quote;
      div.append(q, " ");
    }
    div.append(star.skill);
    starsBox.appendChild(div);
  }
  const top = powerUps[0];
  $("wish").textContent = `${top.skill}. ${top.why}`;
  renderPowerUps(powerUps);
  $("detail-ideas").textContent = detail.ideas;
  $("detail-structure").textContent = detail.structure;
  $("detail-vocabulary").textContent = detail.vocabulary;
  $("detail-spelling").textContent = detail.spelling;
  $("detail-box").open = false;
  $("detail-box").style.display = showDetail ? "" : "none";
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
  const { stars, powerUps, detail } = state.feedback;
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
  const ul = $("print-stars");
  ul.innerHTML = "";
  for (const star of stars) {
    const li = document.createElement("li");
    li.textContent = star.quote ? `"${star.quote}" ${star.skill}` : star.skill;
    ul.appendChild(li);
  }
  const powerBox = $("print-powerups");
  powerBox.innerHTML = "";
  powerUps.forEach((p, index) => {
    const h = document.createElement("h3");
    h.textContent = `Power-up ${index + 1}: ${p.skill}`;
    powerBox.appendChild(h);
    for (const line of [p.why, p.yourLine && `Your line: ${p.yourLine}`, `Try this: ${p.tryThis}`, p.nowYou && `Now you: ${p.nowYou}`]) {
      if (!line) continue;
      const para = document.createElement("p");
      para.textContent = line;
      powerBox.appendChild(para);
    }
  });
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
  const detailBox = $("print-detail");
  detailBox.innerHTML = "";
  if (loadSettings().showDetail) {
    for (const [label, text] of [
      ["Ideas", detail.ideas],
      ["Structure", detail.structure],
      ["Words", detail.vocabulary],
      ["Spelling and punctuation", detail.spelling],
    ]) {
      const h = document.createElement("h2");
      h.textContent = label;
      const p = document.createElement("p");
      p.textContent = text;
      detailBox.append(h, p);
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

// ---- teacher settings ------------------------------------------------------

$("btn-settings").addEventListener("click", () => {
  const settings = loadSettings();
  $("setting-year").value = settings.defaultYear ?? "";
  $("setting-detail").checked = settings.showDetail;
  $("settings-dialog").showModal();
});

$("btn-settings-done").addEventListener("click", () => {
  const yearValue = $("setting-year").value;
  saveSettings({
    defaultYear: yearValue ? Number(yearValue) : null,
    showDetail: $("setting-detail").checked,
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
