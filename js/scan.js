// Image clean-up: downscale, grayscale, contrast stretch. Pure math kept exportable for tests.

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

// histogram: array of 256 counts. Returns levels at the 2nd/98th percentiles.
export function computeLevels(histogram) {
  const total = histogram.reduce((sum, n) => sum + n, 0);
  if (!total) return { lo: 0, hi: 255 };
  const loTarget = total * 0.02;
  const hiTarget = total * 0.98;
  let cumulative = 0;
  let lo = 0;
  let hi = 255;
  let loFound = false;
  for (let i = 0; i < 256; i++) {
    cumulative += histogram[i];
    if (!loFound && cumulative >= loTarget) {
      lo = i;
      loFound = true;
    }
    if (cumulative >= hiTarget) {
      hi = i;
      break;
    }
  }
  if (hi <= lo) {
    lo = Math.max(0, lo - 1);
    hi = Math.min(255, lo + 2);
  }
  return { lo, hi };
}

function enhance(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const px = imageData.data;
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < px.length; i += 4) {
    const gray = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
    px[i] = gray;
    histogram[gray]++;
  }
  const { lo, hi } = computeLevels(histogram);
  const scale = 255 / (hi - lo);
  for (let i = 0; i < px.length; i += 4) {
    const value = Math.max(0, Math.min(255, Math.round((px[i] - lo) * scale)));
    px[i] = px[i + 1] = px[i + 2] = value;
  }
  ctx.putImageData(imageData, 0, 0);
}

export async function prepareScan(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const ratio = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
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
