// ====== Speech Scenes — main.js (images + fallback to blocks) ======

// ---- Constants & UI refs ----
const CANVAS_W = 2480, CANVAS_H = 3508; // A4 @ 300dpi
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');

// From index.html controls:
const phonemeChecks = () => [...document.querySelectorAll('input[name="phoneme"]:checked')].map(c => c.value);
const positionChecks = () => [...document.querySelectorAll('input[name="position"]:checked')].map(c => c.value);

const sceneTypeEl  = document.getElementById('sceneType');
const countEl      = document.getElementById('count');
const targetsEl    = document.getElementById('targets');
const showLabelsEl = document.getElementById('showLabels');
const outlineEl    = document.getElementById('outline');

let WORDS = null; // loaded from JSON

// ---- Word bank loader ----
async function loadWords() {
  const res = await fetch('./data/words-library.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load ./data/words.json');
  const json = await res.json();
  if (!json?.nouns || !json?.verbs) throw new Error('words.json must include "nouns"[] and "verbs"[]');
  WORDS = json;
}

// ---- Placement helpers ----
function rectsOverlap(a, b, pad = 8) {
  return !(
    a.x + a.w + pad < b.x ||
    a.x > b.x + b.w + pad ||
    a.y + a.h + pad < b.y ||
    a.y > b.y + b.h + pad
  );
}
function findSpot(w, h, placed, tries = 200) {
  for (let i = 0; i < tries; i++) {
    const x = Math.floor(Math.random() * (CANVAS_W - w));
    const y = Math.floor(Math.random() * (CANVAS_H - h));
    const candidate = { x, y, w, h };
    if (!placed.some(r => rectsOverlap(candidate, r))) return candidate;
  }
  return null;
}

// ---- Visual helpers ----
const PALETTE = ["#3C91E6","#F5D547","#43C465","#E64C3C","#A47551","#8E5A30","#E1E1E1","#9C27B0","#FF9800"];
function pickColor(i){ return PALETTE[i % PALETTE.length]; }

function drawBackground() {
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
  ctx.fillStyle = "#F3F6FA"; ctx.fillRect(0,0,CANVAS_W,Math.floor(CANVAS_H*0.28));
  ctx.fillStyle = "#EAF5EA"; ctx.fillRect(0,Math.floor(CANVAS_H*0.28),CANVAS_W,Math.floor(CANVAS_H*0.12));
}

function wrapText(ctx, text, maxWidth) {
  const words = (text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = cur + " " + words[i];
    if (ctx.measureText(test).width < maxWidth) cur = test;
    else { lines.push(cur); cur = words[i]; }
  }
  lines.push(cur);
  return lines;
}

// ---- Image cache & drawing ----
const imageCache = new Map(); // src -> Promise<HTMLImageElement|null>

function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (imageCache.has(src)) return imageCache.get(src);
  const p = new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // fail soft → fallback to block
    img.src = src;
  });
  imageCache.set(src, p);
  return p;
}

// Draw image centered & fitted within the rect (with padding). If no image, do nothing.
function drawImageFit(img, x, y, w, h, pad = 16) {
  if (!img) return;
  const maxW = Math.max(1, w - pad*2);
  const maxH = Math.max(1, h - pad*2);
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const dw = Math.max(1, Math.floor(img.width * scale));
  const dh = Math.max(1, Math.floor(img.height * scale));
  const dx = Math.floor(x + (w - dw) / 2);
  const dy = Math.floor(y + (h - dh) / 2);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, dx, dy, dw, dh);
}

// ---- Drawers (block, label, and combined) ----
function drawBlock(x, y, w, h, fill, outline) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (outline) { ctx.lineWidth = 6; ctx.strokeStyle = "#333"; ctx.strokeRect(x, y, w, h); }
  ctx.restore();
}

function drawLabelInRect(x, y, w, h, label) {
  ctx.save();
  ctx.fillStyle = "#111";
  ctx.font = "bold 64px system-ui, sans-serif";
  ctx.textBaseline = "top";
  const pad = 16;
  const maxWidth = w - pad*2;
  const lines = wrapText(ctx, label, maxWidth);
  let ty = y + pad;
  for (const line of lines) {
    ctx.fillText(line, x + pad, ty);
    ty += 72;
  }
  ctx.restore();
}

async function drawItem({ item, rect, color, outline, showLabel }) {
  // Always draw the colour block as a background
  drawBlock(rect.x, rect.y, rect.w, rect.h, color, outline);

  // If item has an image, try to draw it; otherwise skip (block acts as placeholder)
  const img = await loadImage(item.image);
  if (img) drawImageFit(img, rect.x, rect.y, rect.w, rect.h, 20);

  // Optional label on top
  if (showLabel) drawLabelInRect(rect.x, rect.y, rect.w, rect.h, item.word);
}

// ---- Filtering & selection ----
function pool(type, phonemes, positions) {
  const list = (type === 'actions') ? WORDS.verbs : WORDS.nouns;
  return list.filter(item =>
    positions.includes(item.position) &&
    (Array.isArray(item.phonemes) ? item.phonemes.some(p => phonemes.includes(p)) : true)
  );
}
function sample(list, n) { return [...list].sort(() => Math.random() - 0.5).slice(0, n); }
function randBetween(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

// ---- Main generation ----
async function generate() {
  if (!WORDS) await loadWords();

  drawBackground();

  const phonSel = phonemeChecks();
  const posSel  = positionChecks();
  const type = sceneTypeEl.value;
  const n = Math.max(4, Math.min(24, parseInt(countEl.value, 10) || 12));
  const showLabels = showLabelsEl.checked;
  const outline    = outlineEl.checked;

  if (!phonSel.length || !posSel.length) {
    targetsEl.innerHTML = `<p class="error">Select at least one phoneme and one position.</p>`;
    return;
  }

  let selection = [];
  if (type === 'mixed') {
    const nouns = sample(pool('i-spy', phonSel, posSel), Math.ceil(n * 0.6)).map(x => ({...x, kind:'noun'}));
    const verbs = sample(pool('actions', phonSel, posSel), Math.floor(n * 0.4)).map(x => ({...x, kind:'verb'}));
    selection = [...nouns, ...verbs];
  } else {
    selection = sample(pool(type, phonSel, posSel), n).map(x => ({...x, kind: type === 'actions' ? 'verb' : 'noun'}));
  }

  const placed = [];
  const tasks = [];
  const drawnTargets = [];
  let colorIndex = 0;

  for (const item of selection) {
    const isVerb = item.kind === 'verb';
    const W = isVerb ? randBetween(280, 420) : randBetween(360, 560);
    const H = isVerb ? randBetween(180, 260) : randBetween(220, 320);
    const spot = findSpot(W, H, placed);
    if (!spot) continue;

    placed.push({ x: spot.x, y: spot.y, w: W, h: H });
    drawnTargets.push(`${item.word} (${isVerb ? 'verb' : 'noun'})`);
    const color = pickColor(colorIndex++);
    tasks.push(drawItem({ item, rect: spot, color, outline, showLabel: showLabels }));
  }

  // Wait for any images to load and be drawn
  await Promise.all(tasks);

  // Targets list
  targetsEl.innerHTML = selection.length
    ? `<h3>Targets in this picture:</h3><ul>${drawnTargets.map(t => `<li>${t}</li>`).join("")}</ul>`
    : `<p class="error">No items matched your selections. Add words to <code>data/words.json</code>.</p>`;
}

// ---- Export & events ----
function exportPNG() {
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `speech-scene-${sceneTypeEl.value}.png`;
  a.click();
}

document.getElementById('generate').addEventListener('click', generate);
document.getElementById('exportPng').addEventListener('click', exportPNG);

// Initial load
loadWords()
  .then(generate)
  .catch(err => {
    console.error(err);
    targetsEl.innerHTML = `<p class="error">Couldn’t load word bank. Ensure <code>public/data/words.json</code> exists and you’re serving via <code>http://</code>.</p>`;
  });
