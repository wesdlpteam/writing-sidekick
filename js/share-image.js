// Renders the feedback as one tall image so it can be saved to the camera roll.

const W = 1080;
const PAD = 56;
const INNER = W - PAD * 2;
const TEXT_W = INNER - 56; // card padding either side

const INK = "#131a30";
const NIGHT = "#141433";
const GOLD = "#ffc233";
const VIOLET = "#c77dff";
const SKY_MUTED = "#aab6da";
const GREEN = "#b8ecc7";
const BLUE = "#e6d4f0";
const YELLOW = "#ffe9a8";
const DETAIL = "#f4f0fa";
const MUTED = "#4a5570";

const STATUS_LABEL = { strength: "Strength", steady: "On track", next_step: "Next step" };
const STATUS_FILL = { strength: GREEN, steady: YELLOW, next_step: BLUE };

// Breaks text into lines that fit maxWidth in the font currently set on ctx.
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const rawLine of String(text).split("\n")) {
    let line = "";
    for (const word of rawLine.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

function roundedRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }
}

function cardHeight(section, lineHeight) {
  const titleHeight = section.titleLines.length ? section.titleLines.length * lineHeight + 8 : 0;
  return titleHeight + section.lines.length * lineHeight + 44;
}

// Draws one card. Title lines and body lines were wrapped with the same fonts used here,
// so nothing runs past the border.
function drawCard(ctx, y, section, lineHeight, titleFont, bodyFont) {
  const height = cardHeight(section, lineHeight);
  roundedRect(ctx, PAD, y, INNER, height, 18);
  ctx.fillStyle = section.fill;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = INK;
  let textY = y + 34 + lineHeight / 2;
  if (section.titleLines.length) {
    ctx.font = titleFont;
    for (const line of section.titleLines) {
      ctx.fillText(line, PAD + 28, textY);
      textY += lineHeight;
    }
    textY += 8;
  }
  ctx.font = bodyFont;
  for (const line of section.lines) {
    ctx.fillText(line, PAD + 28, textY);
    textY += lineHeight;
  }
  return y + height + 28;
}

async function loadImage(src) {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = src;
  });
  return img;
}

// include.brief = the sidekick's message, power-ups, spelling and word power;
// include.detail = the writing check-up (one card per area).
export async function buildFeedbackImage({ pages = [], feedback, yearLevel, include = { brief: true, detail: false } }) {
  const bodyFont = `30px Nunito, sans-serif`;
  const titleFont = `800 34px Nunito, sans-serif`;
  const lineHeight = 42;

  const measure = document.createElement("canvas").getContext("2d");
  const wrap = (text, font) => {
    measure.font = font;
    return wrapText(measure, text, TEXT_W);
  };
  const sections = [];
  const addCard = (fill, title, bodyTexts) =>
    sections.push({
      fill,
      titleLines: title ? wrap(title, titleFont) : [],
      lines: bodyTexts.filter(Boolean).flatMap((t) => wrap(t, bodyFont)),
    });

  if (include.brief) {
    addCard(BLUE, "First, the big picture", [feedback.headline]);
    feedback.powerUps.forEach((p, index) => {
      const st = p.sentenceType;
      addCard("#ffffff", `⚡ Power-up ${index + 1}: ${p.skill}`, [
        p.why,
        p.yourLine && `Your line: ${p.yourLine}`,
        `Try this: ${p.tryThis}`,
        st && `This is a ${st.name}. ${st.rule} Another one: ${st.example}`,
        p.nowYou && `Now you: ${p.nowYou}`,
      ]);
    });
    if (feedback.practiceWords?.length) {
      addCard(YELLOW, "Spelling to practise", [
        feedback.practiceWords.map((w) => `${w.correct} (you wrote: ${w.wrote})`).join("   "),
        feedback.spellingTip && `Tip: ${feedback.spellingTip}`,
      ]);
    }
    if (feedback.wordBoost) {
      const boost = feedback.wordBoost;
      addCard(DETAIL, "Word power", [
        ...boost.swaps.map((s) => `${s.from} → ${s.to.join(", ")}`),
        boost.before && boost.after && `Your sentence: ${boost.before}`,
        boost.before && boost.after && `With word power: ${boost.after}`,
      ]);
    }
  }
  if (include.detail && Array.isArray(feedback.criteria)) {
    for (const c of feedback.criteria) {
      const next = c.powerUp ? `See Power-up ${c.powerUp}.` : c.nextStep;
      addCard(STATUS_FILL[c.status] || YELLOW, `${c.label}: ${STATUS_LABEL[c.status] || STATUS_LABEL.steady}`, [
        c.strength && `✅ ${c.strength}`,
        next && `➡️ ${next}`,
      ]);
    }
  }

  // Every page is shown at full width; tall pages are cropped at the bottom rather than squashed.
  const pageImages = [];
  for (const src of pages) pageImages.push(await loadImage(src));
  const pageMaxHeight = pageImages.length > 1 ? 400 : 560;
  const pageBoxes = pageImages.map((img) => {
    const natural = Math.round((img.height / img.width) * INNER);
    return { img, natural, height: Math.min(pageMaxHeight, natural) };
  });
  const pagesHeight = pageBoxes.reduce((sum, p) => sum + p.height + 40, 0);

  const sectionsHeight = sections.reduce((sum, s) => sum + cardHeight(s, lineHeight) + 28, 0);
  const height = 170 + pagesHeight + sectionsHeight + 90;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, height);
  ctx.textBaseline = "middle";

  // Night-sky header band, matching the app's Neo City look.
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, W, 150);
  ctx.fillStyle = VIOLET;
  ctx.fillRect(0, 146, W, 6);
  ctx.font = `64px Bangers, Impact, sans-serif`;
  ctx.fillStyle = INK;
  ctx.fillText("The Writing Sidekick", PAD + 3, 71);
  ctx.fillStyle = GOLD;
  ctx.fillText("The Writing Sidekick", PAD, 68);
  ctx.font = `28px Nunito, sans-serif`;
  ctx.fillStyle = SKY_MUTED;
  const dateText = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  ctx.fillText(`Year ${yearLevel} · ${dateText}`, PAD, 118);

  let y = 170;
  for (const page of pageBoxes) {
    roundedRect(ctx, PAD, y, INNER, page.height, 14);
    ctx.save();
    ctx.clip();
    ctx.drawImage(page.img, PAD, y, INNER, page.natural);
    ctx.restore();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    y += page.height + 40;
  }

  for (const section of sections) {
    y = drawCard(ctx, y, section, lineHeight, titleFont, bodyFont);
  }

  ctx.fillStyle = MUTED;
  ctx.font = `24px Nunito, sans-serif`;
  ctx.fillText("Made with Writing Sidekick · nothing is stored online", PAD, height - 44);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob;
}

export async function saveFeedbackImage(blob) {
  const file = new File([blob], "writing-sidekick-feedback.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (error) {
      if (error.name === "AbortError") return "cancelled";
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "writing-sidekick-feedback.png";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
