// Renders the feedback as one tall image so it can be saved to the camera roll.

const W = 1080;
const PAD = 56;
const INNER = W - PAD * 2;

const INK = "#1d2540";
const GREEN = "#b8ecc7";
const BLUE = "#bcdcff";
const YELLOW = "#ffe9a8";
const MUTED = "#4a5570";

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

function drawCard(ctx, y, lines, lineHeight, fill, title, titleFont, bodyFont) {
  const titleHeight = title ? lineHeight + 8 : 0;
  const height = titleHeight + lines.length * lineHeight + 44;
  roundedRect(ctx, PAD, y, INNER, height, 18);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = INK;
  let textY = y + 34 + lineHeight / 2;
  if (title) {
    ctx.font = titleFont;
    ctx.fillText(title, PAD + 28, textY);
    textY += lineHeight + 8;
  }
  ctx.font = bodyFont;
  for (const line of lines) {
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

export async function buildFeedbackImage({ scanDataUrl, feedback, yearLevel }) {
  const bodyFont = `30px Nunito, sans-serif`;
  const boldFont = `800 30px Nunito, sans-serif`;
  const titleFont = `800 34px Nunito, sans-serif`;
  const lineHeight = 42;

  const measure = document.createElement("canvas").getContext("2d");
  const sections = [];

  measure.font = bodyFont;
  for (const star of feedback.stars) {
    sections.push({ fill: GREEN, title: "", lines: wrapText(measure, `⭐ ${star}`, INNER - 56) });
  }
  sections.push({ fill: BLUE, title: "A wish for next time", lines: wrapText(measure, feedback.wish, INNER - 56) });
  if (feedback.practiceWords?.length) {
    const wordsText = feedback.practiceWords.map((w) => `${w.correct} (you wrote: ${w.wrote})`).join("   ");
    const lines = wrapText(measure, wordsText, INNER - 56);
    if (feedback.spellingTip) lines.push(...wrapText(measure, `Tip: ${feedback.spellingTip}`, INNER - 56));
    sections.push({ fill: YELLOW, title: "Spelling to practise", lines });
  }
  if (feedback.wordBoost) {
    const lines = feedback.wordBoost.swaps.map((s) => `${s.from} → ${s.to.join(", ")}`);
    if (feedback.wordBoost.before && feedback.wordBoost.after) {
      lines.push(...wrapText(measure, `Your sentence: ${feedback.wordBoost.before}`, INNER - 56));
      lines.push(...wrapText(measure, `With word power: ${feedback.wordBoost.after}`, INNER - 56));
    }
    sections.push({ fill: "#ffffff", title: "Word power", lines });
  }

  let scanImg = null;
  let scanHeight = 0;
  if (scanDataUrl) {
    scanImg = await loadImage(scanDataUrl);
    scanHeight = Math.min(560, Math.round((scanImg.height / scanImg.width) * INNER));
  }

  const sectionsHeight = sections.reduce(
    (sum, s) => sum + (s.title ? lineHeight + 8 : 0) + s.lines.length * lineHeight + 44 + 28,
    0,
  );
  const height = 170 + (scanHeight ? scanHeight + 40 : 0) + sectionsHeight + 90;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, height);
  ctx.textBaseline = "middle";

  ctx.fillStyle = INK;
  ctx.font = `900 54px Nunito, sans-serif`;
  ctx.fillText("Writing Sidekick", PAD, 78);
  ctx.font = `28px Nunito, sans-serif`;
  ctx.fillStyle = MUTED;
  const dateText = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  ctx.fillText(`Year ${yearLevel} · ${dateText}`, PAD, 126);

  let y = 170;
  if (scanImg) {
    roundedRect(ctx, PAD, y, INNER, scanHeight, 14);
    ctx.save();
    ctx.clip();
    ctx.drawImage(scanImg, PAD, y, INNER, scanHeight);
    ctx.restore();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    y += scanHeight + 40;
  }

  for (const section of sections) {
    y = drawCard(ctx, y, section.lines, lineHeight, section.fill, section.title, titleFont, section.title ? boldFont : bodyFont);
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
