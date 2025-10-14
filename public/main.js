// ---- Constants & UI refs ----
const CANVAS_W = 2480, CANVAS_H = 3508; // A4 @ 300dpi
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');

const phonemeChecks = () => [...document.querySelectorAll('input[name="phoneme"]:checked')].map(c => c.value);
const positionChecks = () => [...document.querySelectorAll('input[name="position"]:checked')].map(c => c.value);

const sceneTypeEl  = document.getElementById('sceneType');
const countEl      = document.getElementById('count');
const targetsEl    = document.getElementById('targets');
const showLabelsEl = document.getElementById('showLabels');
const outlineEl    = document.getElementById('outline');

let WORDS = null; // loaded from JSON

// ---- Data loading ----
async function loadWords() {
  const res = await fetch('./data/words.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load ./data/words.json');
  const json = await res.json();
  if (!json?.nouns || !json?.verbs) {
    throw new Error('words.json missing "nouns" or "verbs" arrays');
  }
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

function findSpot(w, h, placed, tries = 160) {
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

function drawBlock(x, y, w, h, label, fill, outline, showLabel) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (outline) { ctx.lineWidth = 6; ctx.strokeStyle = "#333"; ctx.strokeRect(x, y, w, h); }
  if (showLabel) {
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
  }
  ctx.restore();
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

// ---- Filtering & selection ----
function pool(type, phonemes, positions) {
  const list = (type === 'actions') ? WORDS.verbs : WORDS.nouns;
  // Keep items whose position is in selected positions AND whose phoneme array intersects selected phonemes
  return list.filter(item =>
    positions.includes(item.position) &&
    item.phonemes?.some(p => phonemes.includes(p))
  );
}

function sample(list, n) {
  const shuffled = [...list].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randBetween(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

// ---- Main generation ----
async function generate() {
  if (!WORDS) await loadWords();

  drawBackground();

  const phonSel = phonemeChecks();
  const posSel  = positionChecks();

  const type = sceneTypeEl.value;
  const n    = Math.max(4, Math.min(24, parseInt(countEl.value, 10) || 12));
  const showLabels = showLabelsEl.checked;
  const outline    = outlineEl.checked;

  if (phonSel.length === 0 || posSel.length === 0) {
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
  const drawnTargets = [];
  let colorIndex = 0;

  for (const item of selection) {
    const isVerb = item.kind === 'verb';
    const W = isVerb ? randBetween(280, 420) : randBetween(360, 560);
    const H = isVerb ? randBetween(180, 260) : randBetween(220, 320);
    const spot = findSpot(W, H, placed);
    if (!spot) continue;

    // Label with phoneme + word for clarity, e.g., "/s/ sip" (optional)
    const label = `/${item.phonemes?.[0] ?? '?'} / ${item.word}`;
    drawBlock(spot.x, spot.y, W, H, label, pickColor(colorIndex++), outline, showLabels);
    placed.push({ x: spot.x, y: spot.y, w: W, h: H });
    drawnTargets.push(`${item.word} (${isVerb ? 'verb' : 'noun'}) /${(item.phonemes||[]).join(',')}/`);
  }

  if (drawnTargets.length === 0) {
    targetsEl.innerHTML = `<p class="error">No items found for the selected phoneme(s) and position(s). Add words to <code>data/words.json</code>.</p>`;
    return;
  }

  targetsEl.innerHTML = `<h3>Targets in this picture:</h3><ul>${
    drawnTargets.map(t => `<li>${t}</li>`).join("")
  }</ul>`;
}

// ---- Export & Events ----
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
    targetsEl.innerHTML = `<p class="error">Couldn’t load word bank. Ensure <code>public/data/words.json</code> exists and you’re serving the folder via <code>http://</code>.</p>`;
  });
