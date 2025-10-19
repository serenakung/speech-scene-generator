// ====== Speech Scenes — main.js (Backgrounds restored + Sentence mode + Audit + Usage) ======

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
const useBgsEl     = document.getElementById('useBackgrounds');

let WORDS = null; // loaded from JSON
let BG_LIST = null; // loaded from backgrounds.json or fallback

// ---- Background list loader ----
// Prefer data/backgrounds.json (easy to edit); fall back to a hardcoded list.
// You can mix .png and .jpg — just make sure the paths are correct.
async function loadBackgroundList() {
  if (BG_LIST) return BG_LIST;
  // Try manifest first
  try {
    const res = await fetch('./data/backgrounds.json', { cache: 'no-store' });
    if (res.ok) {
      const j = await res.json();
      if (Array.isArray(j?.backgrounds) && j.backgrounds.length) {
        BG_LIST = j.backgrounds;
        console.log('[backgrounds] loaded manifest with', BG_LIST.length, 'items');
        return BG_LIST;
      }
    }
  } catch (e) {
    // ignore, use fallback
  }
  // Fallback (edit these if you don't want a manifest)
  BG_LIST = [
    "sprites/backgrounds/bg_beach.jpg",
    "sprites/backgrounds/bg_Castles.png",
    "sprites/backgrounds/bg_classroom.jpg",
    "sprites/backgrounds/bg_ColorDesert.png",
    "sprites/backgrounds/bg_park.jpg",
    "sprites/backgrounds/bg_ColorFall.png",
    "sprites/backgrounds/bg_ColorForest.jpg",
    "sprites/backgrounds/bg_ColorGrass.png",
    "sprites/backgrounds/bg_Desert.png",
    "sprites/backgrounds/bg_Empty.png",
    "sprites/backgrounds/bg_Forest.png",
    "sprites/backgrounds/bg_street.jpg"
  ];
  console.log('[backgrounds] using fallback list with', BG_LIST.length, 'items');
  return BG_LIST;
}

// ---- Word bank loader (tries words-library.json then words.json) ----
async function loadWords() {
  const tryFetch = async (path) => {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (!j?.nouns || !j?.verbs) throw new Error('missing "nouns"/"verbs" arrays');
      console.log('[words] loaded', path);
      return j;
    } catch (e) {
      console.warn('[words] failed', path, e.message);
      return null;
    }
  };
  WORDS = await tryFetch('./data/words-library.json') || await tryFetch('./data/words.json');
  if (!WORDS) throw new Error('Could not load word bank from ./data/');
}

// ---- Geometry helpers ----
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
const BLOCK_COLOR = "#EDEFF3";
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
function drawBlock(x, y, w, h, outline) {
  ctx.save();
  ctx.fillStyle = BLOCK_COLOR;
  ctx.fillRect(x, y, w, h);
  if (outline) { ctx.lineWidth = 4; ctx.strokeStyle = "#C8CEDA"; ctx.strokeRect(x, y, w, h); }
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
  for (const line of lines) { ctx.fillText(line, x + pad, ty); ty += 72; }
  ctx.restore();
}

// ---- Image cache & drawing ----
const imageCache = new Map();
function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (imageCache.has(src)) return imageCache.get(src);
  const p = new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { console.warn('[image] failed:', src); resolve(null); };
    img.src = src;
  });
  imageCache.set(src, p);
  return p;
}
function drawImageFit(img, x, y, w, h, pad = 16) {
  if (!img) return;
  const maxW = Math.max(1, w - pad*2);
  const maxH = Math.max(1, h - pad*2);
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const dw = Math.floor(img.width * scale);
  const dh = Math.floor(img.height * scale);
  const dx = Math.floor(x + (w - dw) / 2);
  const dy = Math.floor(y + (h - dh) / 2);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, dx, dy, dw, dh);
}

// ---- Background drawing: optional random background for SENTENCE only ----
async function drawBackground() {
  const scene = document.getElementById("sceneType").value;

  // If not a sentence scene → plain white background only
  if (scene !== "sentence" || !useBgsEl.checked) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    return;
  }

  // Otherwise: random background (only for "sentence")
  const list = await loadBackgroundList();
  if (!list || !list.length) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    return;
  }

  const bgPath = list[Math.floor(Math.random() * list.length)];
  const bg = await loadImage(bgPath);

  if (bg) {
    const scale = Math.max(CANVAS_W / bg.width, CANVAS_H / bg.height);
    const dw = bg.width * scale;
    const dh = bg.height * scale;
    const dx = (CANVAS_W - dw) / 2;
    const dy = (CANVAS_H - dh) / 2;
    ctx.drawImage(bg, dx, dy, dw, dh);
  } else {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
}


// ---- Draw an item: image if present, else placeholder block + label ----
async function drawItem({ item, rect, outline, showLabel }) {
  const img = await loadImage(item.image);
  if (img) {
    drawImageFit(img, rect.x, rect.y, rect.w, rect.h, 20);
  } else {
    drawBlock(rect.x, rect.y, rect.w, rect.h, outline);
  }
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

// ---- Usage log (localStorage) ----
function logUsage(event) {
  const key = 'sceneUsageLog';
  const list = JSON.parse(localStorage.getItem(key) || '[]');
  list.push({ ts: new Date().toISOString(), ...event });
  localStorage.setItem(key, JSON.stringify(list));
}
function exportUsageCSV() {
  const key = 'sceneUsageLog';
  const list = JSON.parse(localStorage.getItem(key) || '[]');
  const rows = [['timestamp','mode','verb','noun']];
  for (const r of list) rows.push([r.ts, r.mode || '', r.verb || '', r.noun || '']);
  const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'usage_log.csv'; a.click(); URL.revokeObjectURL(a.href);
}

// ---- Assets audit (which sprites are missing/broken) ----
async function auditAssets() {
  if (!WORDS) await loadWords();
  const missing = [];
  async function check(path, kind, word) {
    if (!path) { missing.push({ kind, word, reason: 'no image field' }); return; }
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) missing.push({ kind, word, reason: `HTTP ${res.status}` });
    } catch (e) {
      missing.push({ kind, word, reason: e.message });
    }
  }
  for (const n of (WORDS.nouns || [])) await check(n.image, 'noun', n.word);
  for (const v of (WORDS.verbs || [])) await check(v.image, 'verb', v.word);
  const blob = new Blob([JSON.stringify({ missing }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'assets_audit.json'; a.click(); URL.revokeObjectURL(a.href);
}

// ---- Verb→Object suggestion map (simple starter) ----
const VERB_OBJECT_SUGGESTIONS = {
  "sip": ["cup", "mug", "juice"],
  "slice": ["sandwich", "bread", "cake"],
  "stir": ["soup", "bowl", "spoon"],
  "sit": ["chair", "bench"],
  "skate": ["skateboard"],
  "sing": ["microphone"],
  "see": ["glasses", "binoculars"],
  "smile": ["mirror"]
};
function findNounByWord(word) {
  if (!word || !WORDS?.nouns) return null;
  const target = word.toLowerCase();
  return WORDS.nouns.find(n => n.word.toLowerCase() === target) || null;
}

// ---- Character placeholder ----
function drawCharacterPlaceholder(x, y, w, h, label="person") {
  drawBlock(x, y, w, h, true);
  drawLabelInRect(x, y, w, h, label);
}

// ---- Sentence scene ----
async function generateSentenceScene() {
  if (!WORDS) await loadWords();
  await drawBackground();

  const phonSel = phonemeChecks();
  const posSel  = positionChecks();
  if (!phonSel.length || !posSel.length) {
    targetsEl.innerHTML = `<p class="error">Select at least one phoneme and one position.</p>`;
    return;
  }

  const verbPool = pool('actions', phonSel, posSel);
  if (!verbPool.length) { targetsEl.innerHTML = `<p class="error">No verbs match your filters.</p>`; return; }
  const verb = sample(verbPool, 1)[0];

  let object = null;
  const suggestions = VERB_OBJECT_SUGGESTIONS[verb.word?.toLowerCase()] || [];
  for (const suggested of suggestions) {
    const candidate = findNounByWord(suggested);
    if (candidate) { object = candidate; break; }
  }
  if (!object) {
    const nounPool = pool('i-spy', phonSel, posSel);
    if (nounPool.length) object = sample(nounPool, 1)[0];
  }
  if (!object) { targetsEl.innerHTML = `<p class="error">No nouns available to pair with the verb.</p>`; return; }

  // Layout (verb & object adjacent)
  const margin = 160, gapTight = 32;
  const W = 520, H = 520;
  const y = Math.floor(CANVAS_H * 0.58);

  const xChar = margin;
  const xVerb = xChar + W + 80;
  const xObj  = xVerb + W + gapTight;

  drawCharacterPlaceholder(xChar, y, W, H, "person");

  const verbRect = { x: xVerb, y, w: W, h: H };
  const verbImg = await loadImage(verb.image);
  if (verbImg) drawImageFit(verbImg, verbRect.x, verbRect.y, verbRect.w, verbRect.h, 20);
  else drawBlock(verbRect.x, verbRect.y, verbRect.w, verbRect.h, outlineEl.checked);
  if (showLabelsEl.checked) drawLabelInRect(verbRect.x, verbRect.y, verbRect.w, verbRect.h, verb.word);

  const objRect = { x: xObj, y, w: W, h: H };
  const objImg = await loadImage(object.image);
  if (objImg) drawImageFit(objImg, objRect.x, objRect.y, objRect.w, objRect.h, 20);
  else drawBlock(objRect.x, objRect.y, objRect.w, objRect.h, outlineEl.checked);
  if (showLabelsEl.checked) drawLabelInRect(objRect.x, objRect.y, objRect.w, objRect.h, object.word);

  ctx.save();
  ctx.fillStyle = "#111";
  ctx.font = "bold 72px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const caption = `The person ${verb.word} the ${object.word}.`;
  ctx.fillText(caption, CANVAS_W / 2, y + H + 48, CANVAS_W - margin*2);
  ctx.restore();

  targetsEl.innerHTML = `
    <h3>Sentence:</h3>
    <ul>
      <li>Subject: person</li>
      <li>Verb: ${verb.word}</li>
      <li>Object: ${object.word}</li>
    </ul>`;

  logUsage({ mode: 'sentence', verb: verb.word, noun: object.word });
}

// ---- Other modes ----
async function generateIspyOrActionsOrMixed() {
  await drawBackground();

  const phonSel = phonemeChecks();
  const posSel  = positionChecks();
  const type = sceneTypeEl.value;
  const n = Math.max(1, Math.min(24, parseInt(countEl.value, 10) || 12));
  const showLabels = showLabelsEl.checked;
  const outline = outlineEl.checked;

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

  for (const item of selection) {
    const isVerb = item.kind === 'verb';
    const W = isVerb ? randBetween(280, 420) : randBetween(360, 560);
    const H = isVerb ? randBetween(180, 260) : randBetween(220, 320);
    const spot = findSpot(W, H, placed);
    if (!spot) continue;

    placed.push({ x: spot.x, y: spot.y, w: W, h: H });
    drawnTargets.push(`${item.word} (${isVerb ? 'verb' : 'noun'})`);

    tasks.push(drawItem({ item, rect: spot, outline, showLabel: showLabels }));
  }
  await Promise.all(tasks);

  targetsEl.innerHTML = selection.length
    ? `<h3>Targets in this picture:</h3><ul>${drawnTargets.map(t => `<li>${t}</li>`).join("")}</ul>`
    : `<p class="error">No items matched your selections. Add words to <code>data/words-library.json</code>.</p>`;
}

// ---- Main generate dispatcher ----
async function generate() {
  if (!WORDS) await loadWords();

  if (sceneTypeEl.value === 'sentence') {
    await generateSentenceScene();
    return;
  }
  await generateIspyOrActionsOrMixed();
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
document.getElementById('exportUsage').addEventListener('click', exportUsageCSV);
document.getElementById('auditAssets').addEventListener('click', auditAssets);

// Initial load
Promise.all([loadWords(), loadBackgroundList()])
  .then(generate)
  .catch(err => {
    console.error(err);
    targetsEl.innerHTML = `<p class="error">Startup error. Check that <code>data/words-library.json</code> (or words-library.json) and optional <code>data/backgrounds.json</code> exist, and that you're serving via <code>http://</code>.</p>`;
  });
