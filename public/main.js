// ====== Speech Scenes — main.js (final merged) ======

// === PHONEME & CLUSTER MASTER LISTS ===
// IPA consonant phonemes commonly used in (GenAm/BrE) English.
const PHONEMES_IPA = [
  "p","b","t","d","k","g",
  "f","v","θ","ð","s","z","ʃ","ʒ","h",
  "tʃ","dʒ",
  "m","n","ŋ",
  "l","r","j","w"
];

// Onset clusters (2-letter)
const CLUSTERS_2 = [
  "bl","br","cl","cr","dr","fl","fr","gl","gr","pl","pr","sc","sk","sl","sm","sn","sp","st","sw","tr","tw"
];

// Common 3-letter clusters
const CLUSTERS_3 = ["scr","spl","spr","squ","str"];

// Build a single list for UI
const PHONEME_GROUPS = [
  { label: "Single phonemes (IPA)", type: "phoneme", items: PHONEMES_IPA },
  { label: "Clusters (2-letter)",   type: "cluster", items: CLUSTERS_2 },
  { label: "Clusters (3-letter)",   type: "cluster", items: CLUSTERS_3 }
];


function renderPhonemeChecklist() {
    console.log("[phonemes] renderPhonemeChecklist() called");
  const container = document.getElementById("phonemeFilters");
  if (!container) return;

  container.innerHTML = "";
  PHONEME_GROUPS.forEach(group => {
    const groupEl = document.createElement("div");
    groupEl.className = "phoneme-group";

    const h4 = document.createElement("h4");
    h4.textContent = group.label;
    groupEl.appendChild(h4);

    const list = document.createElement("div");
    list.className = "phoneme-list";

    group.items.forEach(item => {
      const id = `ph_${group.type}_${item.replace(/[^a-zʃʒθð]+/gi,"-")}`;
      const wrap = document.createElement("label");
      wrap.className = "phoneme-chip";
      wrap.setAttribute("title", item);

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = item;
      cb.name = "phoneme";  
      cb.dataset.kind = group.type;
      cb.id = id;

      const span = document.createElement("span");
      span.textContent = `/${item}/`;

      wrap.appendChild(cb);
      wrap.appendChild(span);
      list.appendChild(wrap);
    });

    groupEl.appendChild(list);
    container.appendChild(groupEl);
  });

  // Select/Clear handlers
  const btnAll = document.getElementById("btnSelectAllPhonemes");
  const btnClear = document.getElementById("btnClearPhonemes");
  if (btnAll) btnAll.onclick = () => setAllPhonemeChecks(true);
  if (btnClear) btnClear.onclick = () => setAllPhonemeChecks(false);
}

function setAllPhonemeChecks(val) {
  document.querySelectorAll("#phonemeFilters input[type=checkbox]").forEach(cb => {
    cb.checked = val;
  });
  // If your app regenerates on change, trigger it here (optional)
  // generateScene();
}

function getSelectedPhonemeFilters() {
  const selected = { phonemes: new Set(), clusters: new Set() };
  document.querySelectorAll("#phonemeFilters input[type=checkbox]:checked").forEach(cb => {
    const kind = cb.dataset.kind;
    const val = cb.value.toLowerCase();
    if (kind === "phoneme") selected.phonemes.add(val);
    else if (kind === "cluster") selected.clusters.add(val);
  });
  return selected;
}

// Returns true if a word matches any selected IPA phoneme or any selected cluster
function matchesPhonemeOrCluster(wordEntry, selected) {
  // 1) Match IPA phoneme tags if present on the entry
  if (selected.phonemes.size > 0 && Array.isArray(wordEntry.phonemes)) {
    const tagHit = wordEntry.phonemes.some(p => selected.phonemes.has(p.toLowerCase()));
    if (tagHit) return true;
  }

  // 2) Match clusters orthographically (simple heuristic)
  if (selected.clusters.size > 0) {
    const w = (wordEntry.word || "").toLowerCase();

    // check anywhere in word; if you want ONSET-only, use: w.startsWith(cl)
    for (const cl of selected.clusters) {
      if (w.includes(cl)) return true;
    }
  }

  // If nothing selected, treat as pass-through (handled by caller)
  return selected.phonemes.size === 0 && selected.clusters.size === 0;
}


// ---- Constants & UI refs ----
const CANVAS_W = 2480, CANVAS_H = 3508; // A4 @ 300dpi
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');

const phonemeChecks  = () => [...document.querySelectorAll('input[name="phoneme"]:checked')].map(c => c.value);
const positionChecks = () => [...document.querySelectorAll('input[name="position"]:checked')].map(c => c.value);
const syllableChecks = () => [...document.querySelectorAll('input[name="syllables"]:checked')].map(c => c.value);

const sceneTypeEl  = document.getElementById('sceneType');
const countEl      = document.getElementById('count');
const countLabelEl = document.getElementById('countLabel');
const targetsEl    = document.getElementById('targets');
const showLabelsEl = document.getElementById('showLabels');
const outlineEl    = document.getElementById('outline');
const useBgsEl     = document.getElementById('useBackgrounds');

let WORDS = null;   // loaded from JSON
let BG_LIST = null; // backgrounds manifest or fallback


// ---- Error modal helpers ----
const errorModal = document.getElementById('errorModal');
const errorText  = document.getElementById('errorText');
const errorClose = document.getElementById('errorClose');

function showError(message) {
  if (errorText) errorText.textContent = message || 'Your current filters returned no words.';
  if (errorModal) errorModal.classList.remove('hidden');
}
function hideError() { if (errorModal) errorModal.classList.add('hidden'); }
if (errorClose) errorClose.addEventListener('click', hideError);
if (errorModal) {
  errorModal.addEventListener('click', e => { if (e.target === errorModal) hideError(); });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideError(); });

function filterSummary() {
  const phon = phonemeChecks();
  const pos  = positionChecks();
  const syl  = syllableChecks();
  const sylText = syl.length ? syl.map(s => (s === '4plus' ? '4+' : s)).join(', ') : 'any';
  return `phonemes: ${phon.length ? phon.join(' · ') : 'any'}, positions: ${pos.join(' · ')}, syllables: ${sylText}`;
}

// ---- UI nicety: update Count label/max when mode changes ----
function refreshCountLabel() {
  if (sceneTypeEl.value === 'sentence') {
    countLabelEl.firstChild.textContent = ' Sentences: ';
    countEl.min = 1; countEl.max = 6;
    if (parseInt(countEl.value,10) > 6) countEl.value = 6;
  } else {
    countLabelEl.firstChild.textContent = ' Count: ';
    countEl.min = 1; countEl.max = 24;
    if (parseInt(countEl.value,10) > 24) countEl.value = 12;
  }
}
sceneTypeEl.addEventListener('change', refreshCountLabel);
refreshCountLabel();

// ---- Background list loader ----
async function loadBackgroundList() {
  if (BG_LIST) return BG_LIST;
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
  } catch (e) { /* ignore; fall back below */ }
  BG_LIST = [
    "sprites/backgrounds/bg_classroom.jpg",
    "sprites/backgrounds/bg_classroom.png",
    "sprites/backgrounds/bg_kitchen.jpg",
    "sprites/backgrounds/bg_kitchen.png",
    "sprites/backgrounds/bg_park.jpg",
    "sprites/backgrounds/bg_park.png",
    "sprites/backgrounds/bg_playground.jpg",
    "sprites/backgrounds/bg_playground.png"
  ];
  console.log('[backgrounds] using fallback list with', BG_LIST.length, 'items');
  return BG_LIST;
}

// ---- Word bank loader ----
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
function findSpot(w, h, placed, margin = 80, tries = 300) {
  const minX = margin, maxX = CANVAS_W - margin - w;
  const minY = margin, maxY = CANVAS_H - margin - h;
  if (maxX < minX || maxY < minY) return null;
  for (let i = 0; i < tries; i++) {
    const x = Math.floor(Math.random() * (maxX - minX + 1)) + minX;
    const y = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
    const candidate = { x, y, w, h };
    if (!placed.some(r => rectsOverlap(candidate, r, 16))) return candidate;
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
  ctx.font = "bold 56px system-ui, sans-serif";
  ctx.textBaseline = "top";
  const pad = 16;
  const maxWidth = w - pad*2;
  const lines = wrapText(ctx, label, maxWidth);
  let ty = y + pad;
  for (const line of lines) { ctx.fillText(line, x + pad, ty); ty += 64; }
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

// ---- Background drawing: random ONLY for Sentence; plain white for others ----
async function drawBackground() {
  const scene = sceneTypeEl.value;
  if (scene !== "sentence" || !useBgsEl.checked) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    return;
  }
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
    drawImageFit(img, rect.x, rect.y, rect.w, rect.h, 16);
  } else {
    drawBlock(rect.x, rect.y, rect.w, rect.h, outline);
  }
  if (showLabel) drawLabelInRect(rect.x, rect.y, rect.w, rect.h, item.word);
}

// ---- Syllable filter ----
function matchesSyllables(item, sel) {
  if (!sel.length) return true; // no restriction
  const s = Number(item.syllables || 0);
  const wants4plus = sel.includes('4plus');
  const nums = sel.filter(v => v !== '4plus').map(v => Number(v));
  if (wants4plus && s >= 4) return true;
  return nums.includes(s);
}

// ---- Filtering & selection (now includes syllables) ----
/**
 * type: 'actions' for verbs; anything else for nouns
 * phonemes: array of IPA symbols
 * positions: ['initial','medial','final']
 * syllablesSel: ['1','2','3','4plus']
 */
function passesPhonemeFilters(item, legacyPhonemes) {
  const sel = getSelectedPhonemeFilters(); // { phonemes:Set, clusters:Set }

  // If nothing selected in the new UI, fall back to legacy checkbox behavior
  if (sel.phonemes.size === 0 && sel.clusters.size === 0) {
    return Array.isArray(item.phonemes)
      ? item.phonemes.some(p => legacyPhonemes.includes(p))
      : true;
  }

  // Otherwise use the new IPA/cluster matcher
  return matchesPhonemeOrCluster(item, sel);
}

function pool(type, phonemes, positions, syllablesSel) {
  const list = (type === 'actions') ? WORDS.verbs : WORDS.nouns;
  return list.filter(item =>
    positions.includes(item.position) &&
    matchesSyllables(item, syllablesSel || []) &&
    passesPhonemeFilters(item, phonemes)
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

// ---- Assets audit ----
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

// ---- Verb→Object suggestion map ----
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

// ---- Layout helpers for sentence vignettes ----
function sentenceBlockMetrics(nSentences) {
  if (nSentences <= 2) return { W: 520, H: 520, gapVerbObj: 28, gapCharVerb: 80 };
  if (nSentences <= 4) return { W: 420, H: 420, gapVerbObj: 24, gapCharVerb: 72 };
  return { W: 320, H: 320, gapVerbObj: 20, gapCharVerb: 64 }; // 5–6 sentences
}
function groupSize(metrics) {
  const { W, gapVerbObj, gapCharVerb } = metrics;
  return { Gw: W + gapCharVerb + W + gapVerbObj + W, Gh: metrics.H };
}

// ---- Sentence scene (multi) ----
async function generateSentenceScene() {
  if (!WORDS) await loadWords();
  await drawBackground();

  const phonSel = phonemeChecks();
  const posSel  = positionChecks();
  const sylSel  = syllableChecks();

  if (!phonSel.length || !posSel.length) {
    const msg = !phonSel.length ? 'Select at least one phoneme.' : 'Select at least one position.';
    showError(msg);
    targetsEl.innerHTML = `<p class="error">${msg}</p>`;
    return;
  }

  const nSentences = Math.max(1, Math.min(6, parseInt(countEl.value, 10) || 1));
  const metrics = sentenceBlockMetrics(nSentences);
  const { W, H, gapVerbObj, gapCharVerb } = metrics;
  const { Gw, Gh } = groupSize(metrics);

  const sentences = [];
  for (let s = 0; s < nSentences; s++) {
    const verbPool = pool('actions', phonSel, posSel, sylSel);
    if (!verbPool.length) {
      const msg = `No VERBS match your filters (${filterSummary()}). Try changing phonemes/syllables.`;
      showError(msg);
      targetsEl.innerHTML = `<p class="error">${msg}</p>`;
      break;
    }
    const verb = sample(verbPool, 1)[0];

    let object = null;
    const suggestions = VERB_OBJECT_SUGGESTIONS[verb.word?.toLowerCase()] || [];
    for (const suggested of suggestions) {
      const candidate = findNounByWord(suggested);
      if (candidate && matchesSyllables(candidate, sylSel) && posSel.includes(candidate.position)) { object = candidate; break; }
    }
    if (!object) {
      const nounPool = pool('i-spy', phonSel, posSel, sylSel);
      if (!nounPool.length) {
        const msg = `No NOUNS match your filters (${filterSummary()}). Try changing phonemes/syllables.`;
        showError(msg);
        targetsEl.innerHTML = `<p class="error">${msg}</p>`;
        break;
      }
      object = sample(nounPool, 1)[0];
    }

    sentences.push({ verb, object });
  }
  if (!sentences.length) return;

  const placedGroups = [];
  const margin = 80;
  for (const { verb, object } of sentences) {
    const spot = findSpot(Gw, Gh, placedGroups, margin, 500);
    if (!spot) continue;
    placedGroups.push(spot);

    const xChar = spot.x;
    const y = spot.y;
    const xVerb = xChar + W + gapCharVerb;
    const xObj  = xVerb + W + gapVerbObj;

    drawCharacterPlaceholder(xChar, y, W, H, "person");

    const verbRect = { x: xVerb, y, w: W, h: H };
    const verbImg = await loadImage(verb.image);
    if (verbImg) drawImageFit(verbImg, verbRect.x, verbRect.y, verbRect.w, verbRect.h, 16);
    else drawBlock(verbRect.x, verbRect.y, verbRect.w, verbRect.h, outlineEl.checked);
    if (showLabelsEl.checked) drawLabelInRect(verbRect.x, verbRect.y, verbRect.w, verbRect.h, verb.word);

    const objRect = { x: xObj, y, w: W, h: H };
    const objImg = await loadImage(object.image);
    if (objImg) drawImageFit(objImg, objRect.x, objRect.y, objRect.w, objRect.h, 16);
    else drawBlock(objRect.x, objRect.y, objRect.w, objRect.h, outlineEl.checked);
    if (showLabelsEl.checked) drawLabelInRect(objRect.x, objRect.y, objRect.w, objRect.h, object.word);

    logUsage({ mode: `sentence-${nSentences}`, verb: verb.word, noun: object.word });
  }

  const lines = placedGroups.length
    ? sentences.slice(0, placedGroups.length).map(({verb,object}) => `<li>The person <strong>${verb.word}</strong> the <strong>${object.word}</strong>.</li>`)
    : [];
  targetsEl.innerHTML = placedGroups.length
    ? `<h3>Sentences on this page (${placedGroups.length}):</h3><ul>${lines.join("")}</ul>`
    : `<p class="error">Couldn’t fit any sentences. Try reducing the number or widen margins/sizes.</p>`;
}

// ---- Other modes (I-spy / Actions / Mixed) ----
async function generateIspyOrActionsOrMixed() {
  await drawBackground();

  const phonSel = phonemeChecks();
  const posSel  = positionChecks();
  const sylSel  = syllableChecks();
  const type = sceneTypeEl.value;
  const n = Math.max(1, Math.min(24, parseInt(countEl.value, 10) || 12));
  const showLabels = showLabelsEl.checked;
  const outline = outlineEl.checked;

  if (!phonSel.length || !posSel.length) {
    const msg = !phonSel.length ? 'Select at least one phoneme.' : 'Select at least one position.';
    showError(msg);
    targetsEl.innerHTML = `<p class="error">${msg}</p>`;
    return;
  }

  // Pre-check pools for zero results caused by filters
  if (type === 'i-spy') {
    const nounsPool = pool('i-spy', phonSel, posSel, sylSel);
    if (!nounsPool.length) {
      const msg = `No NOUNS match your filters (${filterSummary()}). Try changing phonemes/syllables.`;
      showError(msg);
      targetsEl.innerHTML = `<p class="error">${msg}</p>`;
      return;
    }
  } else if (type === 'actions') {
    const verbsPool = pool('actions', phonSel, posSel, sylSel);
    if (!verbsPool.length) {
      const msg = `No VERBS match your filters (${filterSummary()}). Try changing phonemes/syllables.`;
      showError(msg);
      targetsEl.innerHTML = `<p class="error">${msg}</p>`;
      return;
    }
  } else if (type === 'mixed') {
    const nounsPool = pool('i-spy', phonSel, posSel, sylSel);
    const verbsPool = pool('actions', phonSel, posSel, sylSel);
    if (!nounsPool.length && !verbsPool.length) {
      const msg = `No NOUNS or VERBS match your filters (${filterSummary()}). Try changing phonemes/syllables.`;
      showError(msg);
      targetsEl.innerHTML = `<p class="error">${msg}</p>`;
      return;
    }
  }

  let selection = [];
  if (type === 'mixed') {
    const nouns = sample(pool('i-spy', phonSel, posSel, sylSel), Math.ceil(n * 0.6)).map(x => ({...x, kind:'noun'}));
    const verbs = sample(pool('actions', phonSel, posSel, sylSel), Math.floor(n * 0.4)).map(x => ({...x, kind:'verb'}));
    selection = [...nouns, ...verbs];
  } else {
    selection = sample(pool(type, phonSel, posSel, sylSel), n)
      .map(x => ({...x, kind: type === 'actions' ? 'verb' : 'noun'}));
  }

  const placed = [];
  const tasks = [];
  const drawnTargets = [];

  for (const item of selection) {
    const isVerb = item.kind === 'verb';
    const W = isVerb ? randBetween(280, 420) : randBetween(360, 560);
    const H = isVerb ? randBetween(180, 260) : randBetween(220, 320);
    const spot = findSpot(W, H, placed, 60, 200);
    if (!spot) continue;

    placed.push({ x: spot.x, y: spot.y, w: W, h: H });
    drawnTargets.push(`${item.word} (${isVerb ? 'verb' : 'noun'})`);

    tasks.push(drawItem({ item, rect: spot, outline, showLabel: showLabels }));
  }
  await Promise.all(tasks);

  targetsEl.innerHTML = selection.length
    ? `<h3>Targets in this picture:</h3><ul>${drawnTargets.map(t => `<li>${t}</li>`).join("")}</ul>`
    : `<p class="error">No items matched your selections. Add words to <code>data/words.json</code>.</p>`;
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
    targetsEl.innerHTML = `<p class="error">Startup error. Check that <code>data/words.json</code> (or words-library.json) and optional <code>data/backgrounds.json</code> exist, and that you're serving via <code>http://</code>.</p>`;
  });

  document.addEventListener("DOMContentLoaded", () => {
  renderPhonemeChecklist();
});

if (document.readyState !== 'loading') {
  renderPhonemeChecklist();
} else {
  document.addEventListener('DOMContentLoaded', renderPhonemeChecklist);
}