const LEVELS = {
  easy:   { n: 18, cell: 32, pieces: 8,  min: 3 },
  medium: { n: 21, cell: 27, pieces: 13, min: 2 },
  hard:   { n: 24, cell: 24, pieces: 20, min: 2, noSquares: true, dominoes: 2 },
  expert: { n: 27, cell: 22, pieces: 30, min: 2, noSquares: true, dominoes: 2 },
};
let N = 24;
let CELL = 24;

const $ = (id) => document.getElementById(id);
const board = $('board');
const tray = $('tray');

let pieces = [];
let drag = null; // { piece, ghost, preview, gx, gy, valid }
let startTime, timerId, solved;

// ---------- Puzzle-Erzeugung (rekursives Teilen, immer lösbar) ----------

// Seed-basierter Zufall (mulberry32), damit ein Link immer dasselbe Puzzle ergibt
let random = Math.random;
function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 3432918353), h = (h << 13) | (h >>> 19);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seed im URL-Hash: #<level>-<zufall>, z. B. #easy-k3j9x2
const newSeed = (level) => `${level}-${Math.random().toString(36).slice(2, 8)}`;
function parseSeed() {
  const seed = decodeURIComponent(location.hash.slice(1));
  return LEVELS[seed.split('-')[0]] && seed.includes('-') ? seed : null;
}

const rnd = (a, b) => a + Math.floor(random() * (b - a + 1));

// Teilt zufällig (nach Fläche gewichtet) so lange Rechtecke, bis die Zielanzahl erreicht ist.
// Ohne Quadrate: Rechtecke mit Mindestkante `min`; ein 2×2-Quadrat wird in zwei 1×2-Dominos geteilt,
// davon höchstens `dominoes` Paare. Die Teileanzahl bleibt immer genau `count`.
function generate(n, count, min, noSquares = false, dominoes = 0) {
  if (!noSquares) return split(n, count, min);
  for (;;) {
    const d = rnd(0, dominoes);
    const rects = split(n, count - d, min);
    const small = rects.filter((r) => r.w === 2 && r.h === 2);
    if (small.length !== d || rects.some((r) => r.w === r.h && r.w !== 2)) continue;
    return rects.flatMap((r) => {
      if (r.w !== 2 || r.h !== 2) return [r];
      return random() < 0.5
        ? [{ ...r, w: 1 }, { ...r, x: r.x + 1, w: 1 }]
        : [{ ...r, h: 1 }, { ...r, y: r.y + 1, h: 1 }];
    });
  }
}

function split(n, count, min) {
  const rects = [{ x: 0, y: 0, w: n, h: n }];
  while (rects.length < count) {
    const cand = rects.filter((r) => r.w >= 2 * min || r.h >= 2 * min);
    if (!cand.length) break;
    let t = random() * cand.reduce((s, r) => s + r.w * r.h, 0);
    const r = cand.find((q) => (t -= q.w * q.h) < 0) || cand[cand.length - 1];
    const canV = r.w >= 2 * min, canH = r.h >= 2 * min;
    const vertical = canV && (!canH || random() < r.w / (r.w + r.h));
    rects.splice(rects.indexOf(r), 1);
    if (vertical) {
      const c = rnd(min, r.w - min);
      rects.push({ ...r, w: c }, { ...r, x: r.x + c, w: r.w - c });
    } else {
      const c = rnd(min, r.h - min);
      rects.push({ ...r, h: c }, { ...r, y: r.y + c, h: r.h - c });
    }
  }
  return rects;
}

// Zellgröße an die Bildschirmbreite anpassen (Smartphones)
function fitCell() {
  const lv = LEVELS[$('level').value];
  const avail = document.documentElement.clientWidth - 24;
  CELL = Math.max(10, Math.min(lv.cell, Math.floor(avail / lv.n)));
  document.documentElement.style.setProperty('--n', lv.n);
  document.documentElement.style.setProperty('--c', CELL + 'px');
}

let seed;

// Neues Spiel; ohne Argument mit frischem Seed im gewählten Level
function newGame(sd = newSeed($('level').value)) {
  seed = sd;
  random = seeded(seed);
  $('level').value = seed.split('-')[0];
  history.replaceState(null, '', '#' + seed);
  const lv = LEVELS[$('level').value];
  N = lv.n;
  fitCell();
  const list = generate(N, lv.pieces, lv.min, lv.noSquares, lv.dominoes);
  list.sort((a, b) => b.w * b.h - a.w * a.h);
  pieces = list.map((r, i) => ({
    id: i, w: r.w, h: r.h, x: null, y: null,
    sol: { x: r.x, y: r.y, w: r.w, h: r.h },
    color: `hsl(${(i * 137.5) % 360} 65% ${60 + (i % 3) * 6}%)`,
  }));
  // zufällig drehen, damit nicht alle Teile gleich ausgerichtet sind
  pieces.forEach((p) => { if (random() < 0.5) [p.w, p.h] = [p.h, p.w]; });
  solved = false;
  $('msg').hidden = true;
  $('nameForm').hidden = true;
  pending = null;
  startTime = Date.now();
  clearInterval(timerId);
  timerId = setInterval(tick, 500);
  tick();
  render();
}

function reset() {
  if (drag || pending) return;
  for (const p of pieces) p.x = p.y = null;
  if (solved) {
    solved = false;
    $('msg').hidden = true;
    startTime = Date.now();
    timerId = setInterval(tick, 500);
  }
  render();
}

function solve() {
  if (drag || solved) return;
  for (const p of pieces) ({ x: p.x, y: p.y, w: p.w, h: p.h } = p.sol);
  solved = true;
  clearInterval(timerId);
  render();
}

function tick() {
  if (solved) return;
  const s = Math.floor((Date.now() - startTime) / 1000);
  $('timer').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// ---------- Darstellung ----------

function pieceEl(p) {
  const el = document.createElement('div');
  el.className = 'piece';
  el.style.setProperty('--w', p.w);
  el.style.setProperty('--h', p.h);
  el.style.background = p.color;
  el.textContent = `${p.w}×${p.h}`;
  return el;
}

function render() {
  board.innerHTML = '';
  tray.innerHTML = '';
  let placed = 0;
  for (const p of pieces) {
    if (p === drag?.piece) continue;
    const el = pieceEl(p);
    el.addEventListener('pointerdown', (e) => startDrag(e, p));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    if (p.x === null) {
      tray.appendChild(el);
    } else {
      el.style.setProperty('--x', p.x);
      el.style.setProperty('--y', p.y);
      board.appendChild(el);
      placed++;
    }
  }
  const clashes = overlaps();
  for (const r of clashes) {
    const el = document.createElement('div');
    el.className = 'hatch';
    for (const [k, v] of [['--x', r.x], ['--y', r.y], ['--w', r.w], ['--h', r.h]]) el.style.setProperty(k, v);
    board.appendChild(el);
  }
  if (drag) board.appendChild(drag.preview);
  const filled = pieces.reduce((s, p) => s + (p.x !== null ? p.w * p.h : 0), 0);
  $('info').textContent = `${placed}/${pieces.length} Teile · ${Math.round((filled / (N * N)) * 100)} % gefüllt`;
  $('fill').style.width = `${Math.round((filled / (N * N)) * 100)}%`;
  if (!drag) $('deadlock').hidden = !isDeadlocked();
  if (!drag && placed === pieces.length && !clashes.length && !solved) win();
}

const fmt = (ms) => {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

const LABELS = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer', expert: 'Sehr schwer' };
const MAX_SCORES = 5;
const esc = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function loadScores() {
  try {
    const all = JSON.parse(localStorage.getItem('puzzleScores')) || {};
    for (const k in all) all[k] = all[k].map((s) => (typeof s === 'number' ? { name: '–', ms: s } : s));
    return all;
  } catch { return {}; }
}

function renderScores(highlight) {
  const all = loadScores();
  $('scores').innerHTML = Object.keys(LABELS).map((k) => {
    const rows = (all[k] || []).map((s, i) =>
      `<li${highlight && k === highlight.level && i === highlight.index ? ' class="new"' : ''}>${esc(s.name)}<span>${fmt(s.ms)}</span></li>`).join('');
    return `<div><h3>${LABELS[k]}</h3><ol>${rows || '<li class="none">noch keine Einträge</li>'}</ol></div>`;
  }).join('');
}

function showScores(highlight) {
  renderScores(highlight);
  $('scoreModal').hidden = false;
}

let pending = null; // { level, ms } – Zeit, die noch mit Namen gespeichert werden kann

function win() {
  solved = true;
  clearInterval(timerId);
  const ms = Date.now() - startTime;
  const level = $('level').value;
  const list = loadScores()[level] || [];
  $('timer').textContent = fmt(ms);
  $('msgText').textContent = `Geschafft! Zeit: ${fmt(ms)}`;
  if (list.length < MAX_SCORES || ms < list[list.length - 1].ms) {
    pending = { level, ms };
    $('msgText').textContent += ' – Highscore! Trag deinen Namen ein:';
    $('name').value = localStorage.getItem('puzzleName') || '';
    $('nameForm').hidden = false;
  }
  $('msg').hidden = false;
  if (pending) $('name').focus();
}

function saveScore() {
  if (!pending) return;
  const name = $('name').value.trim() || 'Anonym';
  localStorage.setItem('puzzleName', name);
  const all = loadScores();
  const entry = { name, ms: pending.ms };
  const list = (all[pending.level] || []).concat(entry).sort((a, b) => a.ms - b.ms);
  all[pending.level] = list.slice(0, MAX_SCORES);
  localStorage.setItem('puzzleScores', JSON.stringify(all));
  const hl = { level: pending.level, index: list.indexOf(entry) };
  pending = null;
  $('nameForm').hidden = true;
  $('msgText').textContent += ' – gespeichert.';
  showScores(hl);
}

// ---------- Drag & Drop ----------

const inBounds = (p, x, y) => x >= 0 && y >= 0 && x + p.w <= N && y + p.h <= N;

// Überlappungsfläche zweier Rechtecke (oder null)
function intersect(a, b) {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x, h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

function overlaps() {
  const placed = pieces.filter((p) => p.x !== null);
  const out = [];
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++) {
      const r = intersect(placed[i], placed[j]);
      if (r) out.push(r);
    }
  return out;
}

// ---------- Deadlock-Erkennung ----------

const DEADLOCK_AT = 6; // ab so vielen übrigen Teilen wird auf Sackgassen geprüft

// Lässt sich die freie Fläche mit den Teilen `rest` (frei drehbar) exakt füllen?
// Die erste freie Zelle (zeilenweise) muss die obere linke Ecke eines Teils sein.
function canFill(occ, rest) {
  const i = occ.indexOf(0);
  if (i < 0) return !rest.length;
  const x = i % N, y = Math.floor(i / N);
  const seen = new Set();
  for (const p of rest) {
    if (seen.has(`${p.w}×${p.h}`)) continue;
    seen.add(`${p.w}×${p.h}`);
    const others = rest.filter((q) => q !== p);
    for (const [w, h] of p.w === p.h ? [[p.w, p.h]] : [[p.w, p.h], [p.h, p.w]]) {
      if (x + w > N || y + h > N) continue;
      let free = true;
      for (let dy = 0; free && dy < h; dy++)
        for (let dx = 0; dx < w; dx++) if (occ[i + dy * N + dx]) { free = false; break; }
      if (!free) continue;
      for (let dy = 0; dy < h; dy++) occ.fill(1, i + dy * N, i + dy * N + w);
      const ok = canFill(occ, others);
      for (let dy = 0; dy < h; dy++) occ.fill(0, i + dy * N, i + dy * N + w);
      if (ok) return true;
    }
  }
  return false;
}

// true, wenn nur noch wenige Teile übrig sind und das Feld mit ihnen nicht mehr lösbar ist
function isDeadlocked() {
  const rest = pieces.filter((p) => p.x === null);
  if (!rest.length || rest.length > DEADLOCK_AT || overlaps().length) return false;
  const occ = new Uint8Array(N * N);
  for (const p of pieces) {
    if (p.x === null) continue;
    for (let dy = 0; dy < p.h; dy++) occ.fill(1, (p.y + dy) * N + p.x, (p.y + dy) * N + p.x + p.w);
  }
  return !canFill(occ, rest);
}

function overlapsAt(p, x, y) {
  return pieces.some((q) => q !== p && q.x !== null && intersect({ x, y, w: p.w, h: p.h }, q));
}

function startDrag(e, p) {
  if (e.button === 2 || drag) return;
  e.preventDefault();
  const from = { x: p.x, y: p.y };
  p.x = p.y = null; // beim Anfassen vom Feld lösen
  const ghost = pieceEl(p);
  ghost.classList.add('ghost');
  document.body.appendChild(ghost);
  const preview = document.createElement('div');
  preview.className = 'preview';
  drag = {
    piece: p, ghost, preview, gx: 0, gy: 0, valid: false, cx: e.clientX, cy: e.clientY,
    id: e.pointerId, touch: e.pointerType !== 'mouse', from, sx: e.clientX, sy: e.clientY, moved: false,
  };
  render();
  moveDrag(e.clientX, e.clientY);
}

function moveDrag(cx, cy) {
  const d = drag, p = d.piece;
  d.cx = cx; d.cy = cy;
  if (Math.hypot(cx - d.sx, cy - d.sy) > 6) d.moved = true;
  const gw = p.w * CELL, gh = p.h * CELL;
  // Bei Touch das Teil oberhalb des Fingers halten, damit es sichtbar bleibt
  if (d.touch) cy -= gh / 2 + 28;
  d.ghost.style.setProperty('--w', p.w);
  d.ghost.style.setProperty('--h', p.h);
  d.ghost.textContent = `${p.w}×${p.h}`;
  d.ghost.style.left = cx - gw / 2 + 'px';
  d.ghost.style.top = cy - gh / 2 + 'px';
  const r = board.getBoundingClientRect();
  d.gx = Math.round((cx - gw / 2 - r.left) / CELL);
  d.gy = Math.round((cy - gh / 2 - r.top) / CELL);
  d.valid = inBounds(p, d.gx, d.gy);
  d.clash = d.valid && overlapsAt(p, d.gx, d.gy);
  const near = d.gx > -p.w && d.gy > -p.h && d.gx < N && d.gy < N;
  d.preview.style.display = near ? '' : 'none';
  d.preview.className = 'preview ' + (!d.valid ? 'bad' : d.clash ? 'warn' : 'ok');
  for (const [k, v] of [['--x', d.gx], ['--y', d.gy], ['--w', p.w], ['--h', p.h]]) d.preview.style.setProperty(k, v);
}

function rotate() {
  if (!drag) return;
  [drag.piece.w, drag.piece.h] = [drag.piece.h, drag.piece.w];
  moveDrag(drag.cx, drag.cy);
}

let audio, noise;
// Blue-Switch-Tastatur: scharfer "Click" (Schaltpunkt) gefolgt vom dumpferen "Clack" (Anschlag)
function playClick() {
  audio ||= new (window.AudioContext || window.webkitAudioContext)();
  if (!noise) {
    noise = audio.createBuffer(1, audio.sampleRate * 0.1, audio.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = audio.currentTime;
  const out = audio.createGain();
  out.gain.value = 0.8;
  out.connect(audio.destination);

  // gefilterter Rauschstoß mit schneller Hüllkurve
  const burst = (at, freq, q, peak, dur) => {
    const src = audio.createBufferSource();
    src.buffer = noise;
    const bp = audio.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq * (0.95 + Math.random() * 0.1);
    bp.Q.value = q;
    const g = audio.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(bp).connect(g).connect(out);
    src.start(at);
    src.stop(at + dur + 0.01);
  };
  // kurzer Ton (Resonanz des Gehäuses)
  const tone = (at, freq, peak, dur) => {
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, at);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.7, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + dur + 0.01);
  };

  // Click: hell und spitz
  burst(t, 4200, 2.5, 1.0, 0.012);
  tone(t, 2800, 0.25, 0.015);
  // Clack: Anschlag der Taste, ~25 ms später, tiefer und kräftiger
  burst(t + 0.025, 1800, 1.2, 0.9, 0.03);
  tone(t + 0.025, 220, 0.5, 0.05);
}

function endDrag() {
  const d = drag;
  if (!d) return;
  const p = d.piece;
  if (!d.moved) {
    // Antippen: Teil aus dem Vorrat drehen bzw. platziertes Teil zurücklegen
    if (d.from.x === null) [p.w, p.h] = [p.h, p.w];
    else { p.x = d.from.x; p.y = d.from.y; }
  } else if (d.valid) { d.piece.x = d.gx; d.piece.y = d.gy; playClick(); }
  d.ghost.remove();
  drag = null;
  render();
}

window.addEventListener('pointermove', (e) => drag && e.pointerId === drag.id && moveDrag(e.clientX, e.clientY));
window.addEventListener('pointerup', (e) => drag && e.pointerId === drag.id && endDrag());
window.addEventListener('pointercancel', (e) => drag && e.pointerId === drag.id && endDrag());
// zweiter Finger während des Ziehens dreht das Teil
window.addEventListener('pointerdown', (e) => { if (drag && e.pointerId !== drag.id && e.pointerType !== 'mouse') rotate(); });
window.addEventListener('resize', () => { if (!drag) { fitCell(); render(); } });
window.addEventListener('keydown', (e) => { if (e.key === 'r' || e.key === 'R') rotate(); });
window.addEventListener('contextmenu', (e) => { if (drag) { e.preventDefault(); rotate(); } });
window.addEventListener('wheel', (e) => { if (drag) rotate(); }, { passive: true });

$('newGame').addEventListener('click', () => newGame());
$('level').addEventListener('change', () => newGame());
window.addEventListener('hashchange', () => { const sd = parseSeed(); if (sd && sd !== seed) newGame(sd); });
$('share').addEventListener('click', async () => {
  const url = location.href;
  try {
    if (navigator.share) await navigator.share({ title: 'Rechteck-Puzzle', url });
    else { await navigator.clipboard.writeText(url); $('share').textContent = 'Kopiert!'; setTimeout(() => { $('share').textContent = 'Teilen'; }, 1500); }
  } catch {}
});
// Beim Ziehen keine Browser-Gesten (Pull-to-Refresh, Wischen) auslösen
window.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
$('reset').addEventListener('click', () => { if (confirm('Alle Teile vom Feld nehmen?')) reset(); });
$('solve').addEventListener('click', () => { if (confirm('Puzzle automatisch lösen?')) solve(); });
$('showScores').addEventListener('click', () => showScores());
$('closeScores').addEventListener('click', () => { $('scoreModal').hidden = true; });
$('saveScore').addEventListener('click', saveScore);
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveScore(); e.stopPropagation(); });
newGame(parseSeed() || undefined);
