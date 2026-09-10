import { writingStrengthLines, heroPowers } from "./feedback-visuals.js?v=20260910-section3";

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
const YELLOW = "#ffe9a8";
const DETAIL = "#f4f0fa";
const MUTED = "#4a5570";

const PARA_GAP = 16; // extra space before each new part of a card

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
  const bodyHeight = section.lines.reduce((sum, line) => sum + lineHeight + line.gap, 0);
  return titleHeight + bodyHeight + 44;
}

// Draws one card. Every line was wrapped with the same font it is drawn in, so nothing runs
// past the border. Each part of the card starts after a gap, with its label in bold.
function drawCard(ctx, y, section, lineHeight, titleFont) {
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
  for (const line of section.lines) {
    textY += line.gap;
    ctx.font = line.font;
    ctx.fillText(line.text, PAD + 28, textY);
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

// The child's feedback as a picture: what they did well, the power-ups (as their three
// steps), word power and the editing counts. Nothing here is for the teacher.
export async function buildFeedbackImage({ pages = [], feedback, yearLevel }) {
  const bodyFont = `30px Nunito, sans-serif`;
  const labelFont = `800 30px Nunito, sans-serif`;
  const titleFont = `800 34px Nunito, sans-serif`;
  const lineHeight = 42;

  const measure = document.createElement("canvas").getContext("2d");
  const wrap = (text, font) => {
    measure.font = font;
    return wrapText(measure, text, TEXT_W);
  };
  const sections = [];
  // Each item is a paragraph: a plain string, or { label, text } with the label in bold on
  // its own line. Paragraphs are separated by a gap so the card does not read as one block.
  const addCard = (fill, title, items) => {
    const lines = [];
    for (const item of items.filter(Boolean)) {
      const { label, text } = typeof item === "string" ? { label: "", text: item } : item;
      let gap = lines.length ? PARA_GAP : 0;
      if (label) {
        for (const line of wrap(label, labelFont)) {
          lines.push({ text: line, font: labelFont, gap });
          gap = 0;
        }
      }
      if (text) {
        for (const line of wrap(text, bodyFont)) {
          lines.push({ text: line, font: bodyFont, gap });
          gap = 0;
        }
      }
    }
    sections.push({ fill, titleLines: title ? wrap(title, titleFont) : [], lines });
  };

  addCard("#ffffff", "Writing strengths", writingStrengthLines(feedback.criteria));
  const powers = heroPowers(feedback.criteria);
  if (powers.length) {
    addCard(GREEN, "🔥 What you did well", powers.map((c) => ({ label: c.label, text: c.text })));
  }
  feedback.powerUps.forEach((p, index) => {
    const how = [p.rule, p.example && `${p.example.before} → ${p.example.after}`].filter(Boolean).join("\n");
    addCard("#ffffff", `⚡ Power-up ${index + 1}: ${p.skill}`, [
      p.why,
      p.yourLine && { label: "1. Find this line in your book", text: `“${p.yourLine}”` },
      how && { label: p.move ? `2. Use the strategy: ${p.move.name}` : "2. See an example", text: how },
      p.nowYou && { label: "3. Do this", text: p.nowYou },
    ]);
  });
  if (feedback.wordBoost) {
    const boost = feedback.wordBoost;
    const challenge = (boost.challenge || []).map((c) => c.word);
    addCard(DETAIL, "💪 Word power", [
      { label: "Stronger words", text: boost.swaps.map((s) => `${s.from} → ${s.to.join(", ")}`).join("\n") },
      boost.before && boost.after && { label: "Your sentence", text: boost.before },
      boost.before && boost.after && { label: "With word power", text: boost.after },
      challenge.length && { label: "Synonym challenge", text: `Think of a synonym for: ${challenge.join(", ")}` },
    ]);
  }
  addCard(YELLOW, "📝 Editing: errors to find", [
    `Spelling: ${feedback.errorTotals?.spelling ?? "Not available"}\nPunctuation: ${feedback.errorTotals?.punctuation ?? "Not available"}\nCapital letters: ${feedback.errorTotals?.capital_letters ?? "Not available"}`,
    "Go back to your writing. Find and fix the errors, then read it again to check.",
  ]);

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
    y = drawCard(ctx, y, section, lineHeight, titleFont);
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
