import { prepareScan, rotate90 } from "./scan.js";
import { getFeedback, regenerateFeedback } from "./api.js";
import { loadSettings, saveSettings } from "./settings.js";
import { buildFeedbackImage, saveFeedbackImage } from "./share-image.js";

const state = {
  yearLevel: null,
  genre: "",
  scanDataUrl: null,
  originalTranscript: "",
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

// ---- photo -> AI -> review -------------------------------------------------

async function handlePhoto(file) {
  if (!file) return;
  try {
    setLoading(true, "Tidying up your photo…");
    const { dataUrl } = await prepareScan(file);
    state.scanDataUrl = dataUrl;
    setLoading(true, "Reading your writing…");
    const feedback = await getFeedback({
      imageDataUrl: dataUrl,
      yearLevel: state.yearLevel,
      genre: state.genre,
    });
    state.feedback = feedback;
    state.originalTranscript = feedback.transcript;
    $("scan-image").src = dataUrl;
    $("transcript").value = feedback.transcript;
    show("screen-review");
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
}

$("photo-input").addEventListener("change", (e) => {
  handlePhoto(e.target.files[0]);
  e.target.value = "";
});
$("photo-retake").addEventListener("change", (e) => {
  handlePhoto(e.target.files[0]);
  e.target.value = "";
});

$("btn-rotate").addEventListener("click", async () => {
  if (!state.scanDataUrl) return;
  state.scanDataUrl = await rotate90(state.scanDataUrl);
  $("scan-image").src = state.scanDataUrl;
});

// ---- review -> feedback ----------------------------------------------------

$("btn-confirm").addEventListener("click", async () => {
  const edited = $("transcript").value.trim();
  if (!edited) {
    showError("The typing box is empty. If the photo was too hard to read, try taking it again.");
    return;
  }
  try {
    if (edited !== state.originalTranscript.trim()) {
      setLoading(true, "Updating your feedback…");
      state.feedback = await regenerateFeedback({
        transcript: edited,
        yearLevel: state.yearLevel,
        genre: state.genre,
      });
    }
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

function renderFeedback() {
  const { stars, wish, detail } = state.feedback;
  renderPractice();
  renderBoost();
  // Pre-build the share image so the save tap can use it instantly
  // (Safari only allows sharing right after a tap).
  state.shareBlob = null;
  buildFeedbackImage({
    scanDataUrl: state.scanDataUrl,
    feedback: state.feedback,
    yearLevel: state.yearLevel,
  })
    .then((blob) => {
      state.shareBlob = blob;
    })
    .catch(() => {});
  const starsBox = $("stars");
  starsBox.innerHTML = "";
  for (const star of stars) {
    const div = document.createElement("div");
    div.className = "star-item";
    div.textContent = star;
    starsBox.appendChild(div);
  }
  $("wish").textContent = wish;
  $("detail-ideas").textContent = detail.ideas;
  $("detail-structure").textContent = detail.structure;
  $("detail-vocabulary").textContent = detail.vocabulary;
  $("detail-spelling").textContent = detail.spelling;
  $("detail-box").open = false;
  $("detail-box").style.display = loadSettings().showDetail ? "" : "none";
}

// ---- save picture / print / restart ---------------------------------------

$("btn-save-pic").addEventListener("click", async () => {
  try {
    const blob =
      state.shareBlob ||
      (await buildFeedbackImage({
        scanDataUrl: state.scanDataUrl,
        feedback: state.feedback,
        yearLevel: state.yearLevel,
      }));
    await saveFeedbackImage(blob);
  } catch {
    showError("Hmm, the picture didn't save. You can use Print instead, or try again.");
  }
});

$("btn-print").addEventListener("click", () => {
  const { stars, wish, detail } = state.feedback;
  $("print-date").textContent = new Date().toLocaleDateString("en-AU", {
    day: "numeric", month: "long", year: "numeric",
  });
  $("print-scan").src = state.scanDataUrl || "";
  $("print-transcript").textContent = $("transcript").value;
  const ul = $("print-stars");
  ul.innerHTML = "";
  for (const star of stars) {
    const li = document.createElement("li");
    li.textContent = star;
    ul.appendChild(li);
  }
  $("print-wish").textContent = wish;
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
  state.scanDataUrl = null;
  state.originalTranscript = "";
  state.feedback = null;
  $("transcript").value = "";
  $("scan-image").src = "";
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
