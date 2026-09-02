// Image clean-up: downscale, grayscale, then flatten uneven lighting so the paper reads white
// and the ink reads dark, like a phone's document-scan mode. Pure maths kept exportable for tests.

// The AI reads the page at this resolution (image detail "original"), so keep it generous:
// small marks like apostrophes survive at 2000px that vanish at 1000px.
const DEFAULT_MAX_EDGE = 2000;
const JPEG_QUALITY = 0.85;
// Background window as a fraction of the longer edge: wide enough to span handwriting strokes,
// narrow enough to follow a shadow across the page.
const BACKGROUND_RADIUS_FRACTION = 1 / 30;
const PAPER_RATIO = 0.96; // at or above this share of the local background = white paper
const INK_RATIO = 0.45; // at or below = solid black
const INK_GAMMA = 1.6; // pushes mid-greys (pencil strokes) darker

function integralImage(width, height, valueAt) {
  const stride = width + 1;
  const integral = new Uint32Array(stride * (height + 1));
  for (let y = 1; y <= height; y++) {
    let rowSum = 0;
    for (let x = 1; x <= width; x++) {
      rowSum += valueAt((y - 1) * width + (x - 1));
      integral[y * stride + x] = integral[(y - 1) * stride + x] + rowSum;
    }
  }
  return integral;
}

function boxSum(integral, stride, x0, y0, x1, y1) {
  return (
    integral[y1 * stride + x1] -
    integral[y0 * stride + x1] -
    integral[y1 * stride + x0] +
    integral[y0 * stride + x0]
  );
}

// Local paper brightness for every pixel. First pass: plain box mean. Second pass: mean of only
// the pixels that are not clearly darker than that first estimate, so ink strokes stop dragging
// the background down.
export function estimateBackground(gray, width, height, radius) {
  const stride = width + 1;
  const first = integralImage(width, height, (i) => gray[i]);
  const rough = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      rough[y * width + x] = boxSum(first, stride, x0, y0, x1, y1) / ((y1 - y0) * (x1 - x0));
    }
  }
  const isPaper = (i) => gray[i] >= rough[i] * 0.9;
  const paperSum = integralImage(width, height, (i) => (isPaper(i) ? gray[i] : 0));
  const paperCount = integralImage(width, height, (i) => (isPaper(i) ? 1 : 0));
  const bg = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const count = boxSum(paperCount, stride, x0, y0, x1, y1);
      const i = y * width + x;
      bg[i] = count ? boxSum(paperSum, stride, x0, y0, x1, y1) / count : rough[i];
    }
  }
  return bg;
}

// ratio = pixel brightness / local background. Paper goes white, ink goes black, pencil in between.
export function scanCurve(ratio) {
  if (ratio >= PAPER_RATIO) return 255;
  if (ratio <= INK_RATIO) return 0;
  const t = (ratio - INK_RATIO) / (PAPER_RATIO - INK_RATIO);
  return Math.round(255 * Math.pow(t, INK_GAMMA));
}

export function flattenToScan(gray, width, height) {
  const radius = Math.max(4, Math.round(Math.max(width, height) * BACKGROUND_RADIUS_FRACTION));
  const bg = estimateBackground(gray, width, height, radius);
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0; i < out.length; i++) {
    out[i] = scanCurve(gray[i] / Math.max(1, bg[i]));
  }
  return out;
}

function enhance(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const px = imageData.data;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2];
  }
  const scan = flattenToScan(gray, width, height);
  for (let i = 0, p = 0; i < scan.length; i++, p += 4) {
    px[p] = px[p + 1] = px[p + 2] = scan[i];
  }
  ctx.putImageData(imageData, 0, 0);
}

export async function prepareScan(file, { maxEdge = DEFAULT_MAX_EDGE } = {}) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * ratio);
  const height = Math.round(bitmap.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  enhance(ctx, width, height);
  return { dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY), width, height };
}

export async function rotate90(dataUrl) {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.height;
  canvas.height = img.width;
  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}
