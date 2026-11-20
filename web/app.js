/* 影音库 — a media-wall front end for copyparty. Talks to the stock copyparty HTTP API only. */
(() => {
'use strict';

const ROOT = 'media';                       // volume holding the shared folder
const STATE_URL = '/.wallstate/state.json'; // favourites + playback positions, shared between devices
const PAGE = 90;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = p => p.split('/').map(encodeURIComponent).join('/');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const canHover = matchMedia('(hover: hover)').matches;

const VX = new Set('mp4 mkv webm mov m4v avi ts flv wmv mpg mpeg m2ts rmvb 3gp ogv'.split(' '));
const IX = new Set('jpg jpeg png gif webp bmp avif heic tif tiff'.split(' '));
const AX = new Set('mp3 flac m4a aac ogg opus wav wma ape'.split(' '));

/* ---------- icons ---------- */
const IC = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>',
  film: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M7.5 4.5v15M16.5 4.5v15M3 9.5h4.5M3 14.5h4.5M16.5 9.5H21M16.5 14.5H21"/>',
  image: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="m4 18 5.5-5 4 3.5 3-2.5 4 3.5"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.500 15.400 12 20 12 20z"/>',
  folder: '<path d="M3 7.500a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.500a7.600 7.600 0 0 0 0-3l1.900-1.500-2-3.400-2.300.9a7.600 7.600 0 0 0-2.600-1.500L14 2.500h-4l-.4 2.500a7.600 7.600 0 0 0-2.600 1.500l-2.300-.9-2 3.400 1.900 1.500a7.600 7.600 0 0 0 0 3l-1.900 1.500 2 3.400 2.300-.9a7.600 7.600 0 0 0 2.600 1.500l.4 2.500h4l.4-2.500a7.600 7.600 0 0 0 2.600-1.500l2.300.9 2-3.400z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.500-4.500L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.500 4.500L20 16"/><path d="M20 20v-4h-4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.500v.1"/>',
  check: '<path d="m5 12.500 4.500 4.500L19 7.500"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  chevl: '<path d="m15 6-6 6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  sort: '<path d="M7 5v14M7 19l-3-3M7 19l3-3M17 19V5M17 5l-3 3M17 5l3 3"/>',
  lock: '<rect x="5" y="10.500" width="14" height="9.500" rx="2.500"/><path d="M8 10.500V8a4 4 0 0 1 8 0v2.500"/>',
  eye: '<path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z"/><circle cx="12" cy="12" r="3"/>',
  out: '<path d="M15 4.500h3.500a1.500 1.500 0 0 1 1.500 1.500v12a1.500 1.500 0 0 1-1.500 1.500H15"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
  dl: '<path d="M12 4v11M7.500 11 12 15.500 16.500 11M5 19.500h14"/>',
  up: '<path d="M12 16V5M7.500 9 12 4.500 16.500 9M5 19.500h14"/>',
  trash: '<path d="M4.500 7h15M9.500 7V4.500h5V7M6.500 7l1 12.500h9l1-12.500"/>',
  mini: '<rect x="3.500" y="4.500" width="17" height="15" rx="2"/><rect x="12" y="12" width="6" height="5" rx="1" class="f"/>',
  max: '<rect x="4.500" y="4.500" width="15" height="15" rx="2"/>',
  fs: '<path d="M4.500 9.500v-5h5M19.500 9.500v-5h-5M4.500 14.500v5h5M19.500 14.500v5h-5"/>',
  tile: '<rect x="3.500" y="3.500" width="7.500" height="7.500" rx="1.500"/><rect x="13" y="3.500" width="7.500" height="7.500" rx="1.500"/><rect x="3.500" y="13" width="7.500" height="7.500" rx="1.500"/><rect x="13" y="13" width="7.500" height="7.500" rx="1.500"/>',
  vol: '<path d="M4 9.500v5h3.500L12 18.500v-13L7.500 9.500z"/><path d="M15.500 9a4.500 4.500 0 0 1 0 6M18 6.500a8 8 0 0 1 0 11"/>',
  pause: '<path d="M8 5.500v13M16 5.500v13"/>',
  playo: '<path d="M7.500 5.500v13l11-6.500z"/>',
  ext: '<path d="M14 4.500h5.500V10M19.500 4.500 11 13M17.500 13.500v5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1h5"/>',
  clock: '<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/>',
  file: '<path d="M6.500 3.500h7l4.500 4.500v12.500h-11.500z"/><path d="M13.500 3.500V8H18"/>',
  edit: '<path d="M4.500 19.500h4l10-10-4-4-10 10z"/><path d="m13 7 4 4"/>',
  move: '<path d="M3 7.500a2 2 0 0 1 2-2h4l2 2.500h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9.500 13.500h6M13 11l2.500 2.500L13 16"/>',
  copy: '<rect x="8.500" y="8.500" width="11" height="11" rx="2"/><path d="M15.500 8.500V6a1.500 1.500 0 0 0-1.500-1.500H6A1.500 1.500 0 0 0 4.500 6v8A1.500 1.500 0 0 0 6 15.500h2.500"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sel: '<rect x="4" y="4" width="16" height="16" rx="3.500"/><path d="m8 12.500 3 3 5-6"/>',
  zip: '<path d="M6.500 3.500h7l4.500 4.500v12.500h-11.500z"/><path d="M11 4v2M11 8v2M11 12v2M11 16v2"/>',
  more: '<circle cx="5.500" cy="12" r="1.300"/><circle cx="12" cy="12" r="1.300"/><circle cx="18.500" cy="12" r="1.300"/>',
};
const ico = (n, cls) => `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24">${IC[n] || ''}</svg>`;
const PLAY = '<svg viewBox="0 0 24 24"><path d="M7 4.500v15l13-7.500z"/></svg>';

/* ---------- formatting ---------- */
function fmtDur(s) {
  s = Math.max(0, Math.round(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
}
function fmtLong(s) {
  s = Math.round(s || 0);
  if (s < 60) return s + ' 秒';
  const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60);
  return h ? h + ' 小时' + (m ? ' ' + m + ' 分钟' : '') : m + ' 分钟';
}
function fmtSize(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (n >= 1024 && i < 4) { n /= 1024; i++; }
  return (n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)) + ' ' + u[i];
}
function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* ---------- settings + synced state ---------- */
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
const SET = Object.assign({ solo: true, hover: true, auto: true, poster: false, card: 240 }, lsGet('wall.set', {}));
const saveSet = () => lsSet('wall.set', SET);

const ST = lsGet('wall.state', { fav: {}, pos: {} });
ST.fav = ST.fav || {}; ST.pos = ST.pos || {};
let pushT = 0, syncOff = false, dirtyState = false;
const isFav = p => !!(ST.fav[p] && ST.fav[p].on);
const getPos = p => { const x = ST.pos[p]; return x && (x.t > 0 || x.done) ? x : null; };
function stOf(it) { const x = getPos(it.p); return !x ? 0 : x.done ? 2 : 1; }
function pct(it) { const x = getPos(it.p); return !x ? 0 : x.done ? 100 : x.d ? clamp(x.t / x.d * 100, 0, 100) : 0; }
function setFav(p, on) { const o = ST.fav[p] || {}; ST.fav[p] = { on: on ? 1 : 0, ts: Date.now(), id: o.id, sz: o.sz }; stateDirty(); if (on && !o.id) queueId(p); }
function setPos(p, t, d, done) { const o = ST.pos[p] || {}; ST.pos[p] = { t: Math.floor(t || 0), d: Math.floor(d || 0), done: done ? 1 : 0, ts: Date.now(), id: o.id, sz: o.sz }; stateDirty(); if (!o.id) queueId(p); }
const recOn = (k, r) => !!r && (k === 'fav' ? !!r.on : r.t > 0 || !!r.done);
function stateDirty() {
  lsSet('wall.state', ST); dirtyState = true;
  clearTimeout(pushT); pushT = setTimeout(pushState, 4000);
}
function cleanRec(k, r) {
  if (!r || typeof r !== 'object' || typeof r.ts !== 'number' || !isFinite(r.ts)) return null;
  const o = k === 'fav' ? { on: r.on ? 1 : 0, ts: r.ts } : { t: Math.max(0, Math.floor(+r.t || 0)), d: Math.max(0, Math.floor(+r.d || 0)), done: r.done ? 1 : 0, ts: r.ts };
  if (typeof r.id === 'string' && r.id.length < 80) o.id = r.id;
  if (typeof r.sz === 'number' && r.sz > 0) o.sz = r.sz;
  return o;
}
function mergeState(r) {
  let n = 0;
  if (!r || typeof r !== 'object') return n;
  for (const k of ['fav', 'pos']) {
    const a = r[k]; if (!a || typeof a !== 'object') continue;
    for (const p of Object.keys(a)) {
      if (p === '__proto__' || p.length > 2000) continue;
      const x = cleanRec(k, a[p]);
      if (x && (!ST[k][p] || x.ts > ST[k][p].ts)) { ST[k][p] = x; n++; }
    }
  }
  lsSet('wall.state', ST);
  return n;
}
async function pullState() {
  if (syncOff) return;
  try {
    const r = await fetch(STATE_URL + '?t=' + Date.now(), { credentials: 'same-origin', cache: 'no-store' });
    if (r.ok) mergeState(await r.json());
    else if (r.status === 403 || r.status === 401) syncOff = true;
  } catch (e) { /* offline: keep local copy */ }
}
async function pushState(quick) {
  if (syncOff || !dirtyState) return;
  dirtyState = false;
  if (!quick) await pullState();
  try {
    const r = await fetch(STATE_URL, { method: 'PUT', credentials: 'same-origin', keepalive: !!quick, headers: { Replace: '1', 'Content-Type': 'application/json' }, body: JSON.stringify(ST) });
    if (r.status === 403 || r.status === 401) syncOff = true;
  } catch (e) { dirtyState = true; }
}
addEventListener('pagehide', () => { WM.saveAll(); pushState(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { WM.saveAll(); pushState(true); } });

/* ---------- library ---------- */
const S = { items: [], map: new Map(), user: '', perms: [], indexing: false, q: '', view: '', dir: '', f: {}, sort: {}, tops: [], selMode: false, sel: new Set(), dirPerms: [], roots: [] };
const THIS_YEAR = new Date().getFullYear();

function mk(p, url, sz, ts, tags) {
  const name = p.slice(p.lastIndexOf('/') + 1), dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  const base = dot > 0 ? name.slice(0, dot) : name;
  const dir = p.slice(0, p.lastIndexOf('/'));
  const rel = dir.length > ROOT.length ? dir.slice(ROOT.length + 1) : '';
  const t = tags || {};
  let w = 0, h = 0;
  const rm = /^(\d+)x(\d+)/.exec(t.res || ''); if (rm) { w = +rm[1]; h = +rm[2]; }
  const ym = /(?:^|[^\d])((?:19|20)\d{2})(?![\dxXpP×])/.exec(base);
  const year = ym && +ym[1] <= THIS_YEAR + 1 ? +ym[1] : 0;
  return {
    p, url, name, base, ext, dir, rel, sz: sz || 0, ts: ts || 0,
    title: (/\s/.test(base) ? base : base.replace(/[._]+/g, ' ')).replace(/\s*[(（\[]\s*(?:19|20)\d{2}\s*[)）\]]\s*$/, '').trim() || name,
    kind: VX.has(ext) ? 'v' : IX.has(ext) ? 'i' : AX.has(ext) ? 'a' : 'o',
    top: rel ? rel.split('/')[0] : '', dur: +t['.dur'] || 0, w, h, year,
    vc: t.vc || '', ac: t.ac || '', fps: +t['.fps'] || 0, artist: t.artist || '', album: t.album || '', tt: t.title || '',
    lc: name.toLowerCase(), poster: '', hid: false,
  };
}
function resLabel(it) {
  const { w, h } = it;
  if (!w) return '';
  if (h >= 2000 || w >= 3800) return '4K';
  if (h >= 1400 || w >= 2500) return '2K';
  if (h >= 1000 || w >= 1900) return '1080P';
  if (h >= 700 || w >= 1260) return '720P';
  return 'SD';
}
const thumb = it => it.kind === 'v' ? (it.poster || it.url) + '?th=jf3' : it.kind === 'i' ? it.url + '?th=jf3' : '';

class AuthErr extends Error {}
async function ls(dirp) {
  const r = await fetch('/' + enc(dirp) + '/?ls', { credentials: 'same-origin', cache: 'no-store' });
  if (r.status === 403 || r.status === 401) throw new AuthErr('auth');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  if (!(r.headers.get('content-type') || '').includes('json')) throw new AuthErr('auth');
  return r.json();
}
function fromLs(dirp, e) {
  const href = e.href.split('?')[0];
  let nm; try { nm = decodeURIComponent(href); } catch (x) { nm = href; }
  return mk(dirp + '/' + nm, '/' + enc(dirp) + '/' + href, e.sz, e.ts, e.tags);
}
async function crawl() {
  const out = [], queue = [ROOT]; let seen = 0;
  const work = async () => {
    while (queue.length && seen < 500) {
      const d = queue.shift(); seen++;
      try {
        const j = await ls(d);
        for (const x of j.dirs || []) { try { queue.push(d + '/' + decodeURIComponent(x.href.replace(/\/$/, ''))); } catch (e) { /* skip */ } }
        for (const x of j.files || []) out.push(fromLs(d, x));
      } catch (e) { if (e instanceof AuthErr) throw e; }
    }
  };
  await Promise.all([work(), work(), work(), work()]);
  return out;
}
async function loadLib() {
  let items = null;
  try {
    const r = await fetch('/' + ROOT + '/?srch', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ q: 'name like *', n: 200000 }) });
    if (r.ok) {
      const j = await r.json(); items = [];
      for (const h of j.hits || []) {
        let p; try { p = decodeURIComponent(h.rp); } catch (e) { continue; }
        if (p.startsWith(ROOT + '/')) items.push(mk(p, '/' + h.rp, h.sz, h.ts, h.tags));
      }
    }
  } catch (e) { /* fall through to crawling */ }
  S.indexing = !items;
  if (!items) items = await crawl();

  // local artwork: "<video name>.jpg", "<video name>-poster.jpg", or poster/cover/folder.jpg next to a lone video
  const imgs = new Map(), vcount = new Map();
  for (const it of items) {
    if (it.kind === 'i') imgs.set(it.dir + '/' + it.base.toLowerCase(), it);
    else if (it.kind === 'v') vcount.set(it.dir, (vcount.get(it.dir) || 0) + 1);
  }
  for (const it of items) {
    if (it.kind !== 'v') continue;
    const b = it.dir + '/' + it.base.toLowerCase();
    let im = imgs.get(b) || imgs.get(b + '-poster') || imgs.get(b + '.poster') || imgs.get(b + '-thumb');
    if (!im && vcount.get(it.dir) === 1) im = imgs.get(it.dir + '/poster') || imgs.get(it.dir + '/cover') || imgs.get(it.dir + '/folder');
    if (im) { it.poster = im.url; im.hid = true; }
  }
  S.items = items;
  S.map = new Map(items.map(i => [i.p, i]));
  S.tops = Array.from(new Set(items.map(i => i.top).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh'));
}
function under(dirp, max) {
  const pre = dirp + '/', out = [];
  for (const it of S.items) {
    if ((it.kind === 'v' || (it.kind === 'i' && !it.hid)) && it.p.startsWith(pre)) { out.push(it); if (out.length >= max) break; }
  }
  return out;
}

/* ---------- file fingerprints: follow a file through renames and moves ---------- */
// SHA-256 in plain JS: crypto.subtle is unavailable on plain-http LAN addresses.
const SHA_K = (() => {
  const k = [], frac = x => ((x - Math.floor(x)) * 4294967296) >>> 0;
  for (let n = 2; k.length < 64; n++) { let pr = true; for (let i = 2; i * i <= n; i++) if (n % i === 0) { pr = false; break; } if (pr) k.push(frac(Math.cbrt(n))); }
  return new Uint32Array(k);
})();
function sha256(d) {
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const l = d.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n), dv = new DataView(m.buffer), w = new Uint32Array(64);
  m.set(d); m[l] = 0x80; dv.setUint32(n - 8, Math.floor(l / 0x20000000)); dv.setUint32(n - 4, (l << 3) >>> 0);
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const x = w[i - 15], y = w[i - 2]; w[i] = (w[i - 16] + ((x >>> 7 | x << 25) ^ (x >>> 18 | x << 14) ^ (x >>> 3)) + w[i - 7] + ((y >>> 17 | y << 15) ^ (y >>> 19 | y << 13) ^ (y >>> 10))) >>> 0; }
    let a = H[0], b = H[1], c = H[2], e0 = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const t1 = (h + ((e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7)) + ((e & f) ^ (~e & g)) + SHA_K[i] + w[i]) >>> 0;
      const t2 = (((a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (e0 + t1) >>> 0; e0 = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += e0; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return Array.from(H, x => x.toString(16).padStart(8, '0')).join('');
}
// Fingerprint = exact byte size + SHA-256 over the first, middle and last 64 KB (whole file when small).
const FP_CHUNK = 65536, FPC = lsGet('wall.fp', {});
async function fingerprint(it) {
  if (!it || !it.sz) return '';
  const key = it.p + '|' + it.sz + '|' + it.ts;
  if (FPC[key]) return FPC[key];
  const sz = it.sz, C = FP_CHUNK, mid = Math.floor(sz / 2) - C / 2;
  const ranges = sz <= C * 3 ? [[0, sz - 1]] : [[0, C - 1], [mid, mid + C - 1], [sz - C, sz - 1]];
  const parts = []; let total = 0;
  for (const [a, b] of ranges) {
    const r = await fetch(it.url, { credentials: 'same-origin', headers: { Range: 'bytes=' + a + '-' + b } });
    if (r.status !== 206 && !(r.status === 200 && ranges.length === 1)) { try { r.body && r.body.cancel(); } catch (e) { /* ignore */ } return ''; }
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length !== b - a + 1) return '';
    parts.push(buf); total += buf.length;
  }
  const all = new Uint8Array(total); let o = 0; for (const x of parts) { all.set(x, o); o += x.length; }
  const id = sz.toString(36) + '-' + sha256(all).slice(0, 32);
  const keys = Object.keys(FPC); if (keys.length > 4000) for (const k of keys.slice(0, 1000)) delete FPC[k];
  FPC[key] = id; lsSet('wall.fp', FPC);
  return id;
}
const idQueue = []; let idBusy = false;
function queueId(p) { if (!idQueue.includes(p)) idQueue.push(p); if (!idBusy) idWork(); }
async function idWork() {
  idBusy = true;
  while (idQueue.length) {
    const p = idQueue.shift(), it = S.map.get(p);
    if (!it) continue;
    let id = ''; try { id = await fingerprint(it); } catch (e) { /* offline or file gone */ }
    if (!id) continue;
    let ch = false;
    for (const k of ['fav', 'pos']) { const r = ST[k][p]; if (r && (r.id !== id || r.sz !== it.sz)) { r.id = id; r.sz = it.sz; r.ts += 1; ch = true; } }
    if (ch) stateDirty();
    const d = $('#drawer'); if (d && !d.hidden && d.dataset.p === p) showInfo(it);
  }
  idBusy = false;
}
function backfillIds() {
  let n = 0;
  for (const k of ['fav', 'pos']) for (const p in ST[k]) { if (n >= 400) return; const r = ST[k][p]; if (recOn(k, r) && !r.id && S.map.has(p)) { queueId(p); n++; } }
}
// Records whose file is no longer at the saved path: find the same file elsewhere and move the record there.
let rematching = false;
async function rematch(quiet) {
  if (rematching || S.indexing || !S.items.length) return 0;
  rematching = true;
  let moved = 0;
  try {
    const orphans = new Map();
    for (const k of ['fav', 'pos']) for (const p in ST[k]) if (recOn(k, ST[k][p]) && !S.map.has(p)) orphans.set(p, 1);
    if (!orphans.size) return 0;
    const bySize = new Map(), byName = new Map();
    for (const it of S.items) {
      if (!bySize.has(it.sz)) bySize.set(it.sz, []); bySize.get(it.sz).push(it);
      if (!byName.has(it.lc)) byName.set(it.lc, []); byName.get(it.lc).push(it);
    }
    for (const p of orphans.keys()) {
      const recs = ['fav', 'pos'].map(k => ST[k][p]).filter(Boolean), id = (recs.find(r => r.id) || {}).id, sz = (recs.find(r => r.sz) || {}).sz;
      let target = null;
      if (id && sz) {
        for (const c of bySize.get(sz) || []) { let cid = ''; try { cid = await fingerprint(c); } catch (e) { /* skip */ } if (cid === id) { target = c; break; } }
      } else {
        // records saved before fingerprints existed: same file name, and same size or same duration, with exactly one candidate
        const nm = p.slice(p.lastIndexOf('/') + 1).toLowerCase(), pr = ST.pos[p];
        const cs = (byName.get(nm) || []).filter(c => sz ? c.sz === sz : !!(pr && pr.d && c.dur && Math.abs(c.dur - pr.d) <= 1));
        if (cs.length === 1) target = cs[0];
      }
      if (!target) continue;
      const now = Date.now(); let did = false;
      for (const k of ['fav', 'pos']) {
        const r = ST[k][p]; if (!recOn(k, r)) continue;
        const ex = ST[k][target.p];
        if (!recOn(k, ex) || ex.ts < r.ts) { ST[k][target.p] = Object.assign({}, r, { ts: now, sz: target.sz }); if (!r.id) queueId(target.p); did = true; }
        ST[k][p] = k === 'fav' ? { on: 0, ts: now } : { t: 0, d: 0, done: 0, ts: now };
      }
      if (did) moved++;
    }
    if (moved) { stateDirty(); render(); if (!quiet) toast('已为 ' + moved + ' 个改名或移动过的文件找回播放记录'); }
  } finally { rematching = false; }
  return moved;
}
function afterLib() { backfillIds(); rematch().catch(() => {}); }

function exportState() {
  const n = { fav: 0, pos: 0 }, out = { app: 'yingyinku', v: 1, exported: new Date().toISOString(), fav: {}, pos: {} };
  for (const k of ['fav', 'pos']) for (const p in ST[k]) if (recOn(k, ST[k][p])) { out[k][p] = ST[k][p]; n[k]++; }
  const d = new Date(), stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = '影音库-播放记录-' + stamp + '.json';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('已导出 ' + n.pos + ' 条播放记录、' + n.fav + ' 个收藏');
}
async function importState(file) {
  let j;
  try { j = JSON.parse(await file.text()); } catch (e) { return toast('导入失败：这不是有效的播放记录文件', true); }
  if (!j || typeof j !== 'object' || (typeof j.fav !== 'object' && typeof j.pos !== 'object')) return toast('导入失败：文件里没有播放记录', true);
  const total = Object.keys(j.pos || {}).length + Object.keys(j.fav || {}).length;
  const n = mergeState(j);
  stateDirty();
  const m = await rematch(true).catch(() => 0);
  backfillIds(); render();
  toast('共 ' + total + ' 条，导入 ' + n + ' 条' + (total - n ? '，其余 ' + (total - n) + ' 条无效或比本机的旧，已跳过' : '') + (m ? '；有 ' + m + ' 个文件的记录自动匹配到了新位置' : ''));
}

/* ---------- toasts ---------- */
function toast(msg, err) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : ''); el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), err ? 5000 : 2600);
}

/* ---------- login ---------- */
let loginFails = 0;
function showLogin() {
  $('#boot').hidden = true; $('#app').hidden = true;
  const el = $('#login'); el.hidden = false;
  el.innerHTML = `
    <div class="aur"><i></i><i></i><i></i></div><div class="grid"></div>
    <form class="lcard" autocomplete="on">
      <div class="logo">${PLAY}</div>
      <h1>影音库</h1>
      <p>输入访问密码，进入你的私人影音墙</p>
      <div class="field">${ico('lock')}
        <input id="lpw" type="password" name="password" placeholder="访问密码" autocomplete="current-password" autofocus required>
        <button type="button" class="eye" data-act="eye" title="显示密码">${ico('eye')}</button>
      </div>
      <div class="lerr" id="lerr"></div>
      <button class="btn-main" type="submit">进 入</button>
      <div class="lfoot">文件服务由 copyparty 提供</div>
    </form>`;
  const form = $('form', el), pw = $('#lpw'), err = $('#lerr'), btn = $('.btn-main', el);
  setTimeout(() => pw.focus(), 50);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!pw.value || btn.disabled) return;
    btn.disabled = true; err.textContent = '';
    try {
      const fd = new FormData(); fd.append('act', 'login'); fd.append('cppwd', pw.value);
      await fetch('/', { method: 'POST', body: fd, credentials: 'same-origin' });
      const j = await ls(ROOT);
      el.hidden = true; el.innerHTML = '';
      startApp(j);
    } catch (x) {
      btn.disabled = false;
      if (x instanceof AuthErr) {
        loginFails++;
        err.textContent = '密码不正确' + (loginFails >= 3 ? '（连续输错多次会被服务器暂时封禁）' : '');
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
        pw.select();
      } else err.textContent = '无法连接服务器，请稍后再试';
    }
  });
}
async function logout() {
  WM.closeAll(); await pushState();
  try { const fd = new FormData(); fd.append('act', 'logout'); await fetch('/', { method: 'POST', body: fd, credentials: 'same-origin' }); } catch (e) { /* ignore */ }
  location.hash = ''; location.reload();
}

/* ---------- shell ---------- */
const NAV = [['home', '首页', 'home'], ['videos', '视频', 'film'], ['images', '图片', 'image'], ['music', '音乐', 'music'], ['fav', '收藏', 'heart'], ['files', '文件夹', 'folder']];
function renderSide() {
  const n = { videos: 0, images: 0, music: 0, fav: 0 };
  for (const it of S.items) {
    if (it.kind === 'v') n.videos++; else if (it.kind === 'i' && !it.hid) n.images++; else if (it.kind === 'a') n.music++;
    if (isFav(it.p)) n.fav++;
  }
  const cur = S.view === 'search' ? '' : S.view;
  $('#side').innerHTML = `
    <div class="brand"><div class="logo">${PLAY}</div>影音库</div>
    ${NAV.map(([k, l, i]) => `<a class="nav${cur === k && !(k === 'files' && S.dir) ? ' on' : ''}" href="#/${k}">${ico(i)}<span>${l}</span>${n[k] != null && n[k] ? `<span class="n">${n[k]}</span>` : ''}</a>`).join('')}
    ${S.tops.length ? `<div class="sep"></div><div class="lab">目录</div><div class="tops">${S.tops.map(t => `<a class="nav${S.view === 'files' && (S.dir === t || S.dir.startsWith(t + '/')) ? ' on' : ''}" href="#/files/${enc(t)}">${ico('folder')}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t)}</span></a>`).join('')}</div>` : ''}
    <div class="grow"></div>
    <div class="who"><div class="av">${esc((S.user || '?').slice(0, 1).toUpperCase())}</div><div class="nm">${esc(S.user)}</div><button class="icb" data-act="logout" title="退出登录">${ico('out')}</button></div>`;
}
function renderTop() {
  $('#top').innerHTML = `
    <div class="search">${ico('search')}<input id="q" type="search" placeholder="搜索影片、图片、音乐…" autocomplete="off" spellcheck="false"><button class="icb clr" data-act="clrq" title="清除" hidden>${ico('x')}</button></div>
    <div class="sp"></div>
    <button class="icb" data-act="reload" title="重新扫描媒体库">${ico('refresh')}</button>
    <button class="icb" data-act="settings" title="设置">${ico('gear')}</button>`;
  const q = $('#q'); let t = 0;
  q.addEventListener('input', () => {
    S.q = q.value.trim(); $('.clr', $('#top')).hidden = !q.value;
    clearTimeout(t); t = setTimeout(() => {
      if (S.q && !['videos', 'images', 'music', 'search'].includes(S.view)) go('#/search');
      else if (!S.q && S.view === 'search') go('#/home');
      else render();
    }, 160);
  });
}
function go(h) { if (location.hash === h) route(); else location.hash = h; }
function route() {
  const h = decodeURI(location.hash.replace(/^#\/?/, '')) || 'home';
  const i = h.indexOf('/');
  let v = i < 0 ? h : h.slice(0, i), rest = i < 0 ? '' : h.slice(i + 1);
  if (!['home', 'videos', 'images', 'music', 'fav', 'files', 'search'].includes(v)) v = 'home';
  try { rest = decodeURIComponent(rest); } catch (e) { /* keep */ }
  if (v === 'search' && !S.q) v = 'home';
  const changed = v !== S.view || rest !== S.dir;
  if (changed) { S.selMode = false; S.sel.clear(); }
  S.view = v; S.dir = v === 'files' ? rest.replace(/\/+$/, '') : '';
  closePop(); closeDrawer();
  render();
  if (changed) scrollTo(0, 0);
}
addEventListener('hashchange', route);
addEventListener('scroll', () => $('#top').classList.toggle('sc', scrollY > 8), { passive: true });

let gridIO = null;
function render() {
  if (gridIO) { gridIO.disconnect(); gridIO = null; }
  hoverStop();
  renderSide(); applyLook();
  const v = $('#view');
  v.classList.toggle('selecting', S.selMode && S.view === 'files');
  ({ home: viewHome, videos: () => viewWall('v'), images: () => viewWall('i'), music: () => viewWall('a'), fav: viewFav, files: viewFiles, search: viewSearch }[S.view] || viewHome)(v);
}

/* ---------- cards ---------- */
const IMG = (src, alt) => `<img loading="lazy" decoding="async" src="${esc(src)}" alt="${esc(alt || '')}" onload="this.classList.add('ld')" onerror="this.remove()">`;
function vcard(it, opt) {
  const pc = pct(it), st = stOf(it), rl = resLabel(it), fav = isFav(it.p), x = getPos(it.p);
  const sub = opt === 'cont' && x && x.d ? '剩余 ' + fmtLong(Math.max(0, x.d - x.t))
    : [it.year || '', it.rel || '', fmtSize(it.sz)].filter(Boolean).join(' · ');
  return `<article class="card v${fav ? ' isfav' : ''}${opt ? ' fix' : ''}" data-p="${esc(it.p)}" data-k="v" data-o="${opt || ''}">
    <div class="thumb"><div class="ph">${esc(it.ext)}</div>${IMG(thumb(it), it.title)}
      ${rl ? `<span class="bd res${rl === '4K' ? ' k4' : ''}">${rl}</span>` : ''}
      ${st === 2 ? `<span class="bd done">${ico('check')}已看完</span>` : ''}
      ${it.dur ? `<span class="bd dur">${fmtDur(it.dur)}</span>` : ''}
      ${st === 1 ? `<div class="prog"><i style="width:${pc.toFixed(1)}%"></i></div>` : ''}
      <div class="ov"><b>${PLAY}</b></div>
      <div class="cb"><button class="bi" data-act="info" title="详情">${ico('info')}</button><button class="bf" data-act="fav" title="${fav ? '取消收藏' : '收藏'}">${ico('heart')}</button></div>
    </div>
    <div class="meta"><div class="t" title="${esc(it.name)}">${esc(it.title)}</div><div class="s">${esc(sub)}</div></div>
  </article>`;
}
function icard(it) {
  const fav = isFav(it.p);
  return `<article class="card im${fav ? ' isfav' : ''}" data-p="${esc(it.p)}" data-k="i">
    <div class="thumb"><div class="ph">${esc(it.ext)}</div>${IMG(thumb(it), it.name)}
      <div class="cb"><button class="bi" data-act="info" title="详情">${ico('info')}</button><button class="bf" data-act="fav" title="${fav ? '取消收藏' : '收藏'}">${ico('heart')}</button></div>
    </div>
    <div class="meta"><div class="t">${esc(it.name)}</div></div>
  </article>`;
}
function frow(it) {
  const fav = isFav(it.p), au = it.kind === 'a';
  const sub = au ? [it.artist, it.album, it.dur ? fmtDur(it.dur) : ''].filter(Boolean).join(' · ') : it.rel;
  return `<div class="frow" data-p="${esc(it.p)}" data-k="${it.kind}">
    <div class="fx${au ? ' au' : ''}">${au ? ico('music') : esc(it.ext || '文件')}</div>
    <div class="fn"><div>${esc(au && it.tt ? it.tt : it.name)}</div><small>${esc(sub || (au ? it.rel : ''))}</small></div>
    <div class="fz">${fmtSize(it.sz)}</div>
    <button class="icb${fav ? ' fav-on' : ''}" data-act="fav" title="${fav ? '取消收藏' : '收藏'}">${ico('heart')}</button>
    <button class="icb" data-act="info" title="详情">${ico('info')}</button>
  </div>`;
}
function dcard(dirp, name, nfiles) {
  const th = under(dirp, 4), rel = dirp.slice(ROOT.length + 1);
  return `<article class="card dir fix" data-dir="${esc(rel)}">
    <div class="thumb">${th.length ? `<div class="mos n${th.length}">${th.map(t => `<img loading="lazy" decoding="async" src="${esc(thumb(t))}" alt="" onerror="this.style.visibility='hidden'">`).join('')}</div>` : `<div class="ph">${ico('folder')}</div>`}
      <span class="fic">${ico('folder')}${nfiles != null ? nfiles + ' 项' : ''}</span></div>
    <div class="meta"><div class="t">${esc(name)}</div></div>
  </article>`;
}
const cardOf = (it, opt) => it.kind === 'v' ? vcard(it, opt) : it.kind === 'i' ? icard(it) : frow(it);
function patchCards(p) {
  const it = S.map.get(p); if (!it) return;
  for (const el of $$('[data-p]', $('#view'))) {
    if (el.dataset.p !== p) continue;
    if (el.classList.contains('frow')) el.outerHTML = frow(it);
    else if (el.dataset.k === 'v') el.outerHTML = vcard(it, el.dataset.o);
    else if (el.dataset.k === 'i') el.outerHTML = icard(it);
  }
}
function fillGrid(el, list, fn) {
  el.innerHTML = ''; let n = 0;
  const sen = document.createElement('div'); sen.style.height = '1px';
  el.after(sen);
  const more = () => {
    const part = list.slice(n, n + PAGE); n += part.length;
    el.insertAdjacentHTML('beforeend', part.map(fn).join(''));
    if (n >= list.length) { io.disconnect(); sen.remove(); } else { io.unobserve(sen); io.observe(sen); }
  };
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) more(); }, { rootMargin: '900px' });
  gridIO = io;
  more();
}
const empty = (icon, a, b) => `<div class="empty"><div>${ico(icon)}<b>${esc(a)}</b>${esc(b || '')}</div></div>`;
const rowHtml = (cards, sq) => `<div class="rowwrap"><button class="ar l" data-act="rowl">${ico('chevl')}</button><div class="row${sq ? ' sq' : ''}">${cards}</div><button class="ar r" data-act="rowr">${ico('chev')}</button></div>`;
const matchQ = it => { if (!S.q) return true; const ts = S.q.toLowerCase().split(/\s+/); return ts.every(t => it.lc.includes(t) || it.rel.toLowerCase().includes(t)); };
const noteIdx = () => S.indexing ? `<div class="note">${ico('clock')}服务器正在建立媒体索引，暂时只显示部分内容；稍后点右上角的刷新按钮即可看到全部。</div>` : '';

/* ---------- home ---------- */
function viewHome(v) {
  const vids = S.items.filter(i => i.kind === 'v');
  const cont = vids.filter(i => stOf(i) === 1).sort((a, b) => ST.pos[b.p].ts - ST.pos[a.p].ts);
  const recent = vids.slice().sort((a, b) => b.ts - a.ts).slice(0, 24);
  const favs = S.items.filter(i => isFav(i.p) && i.kind !== 'o').sort((a, b) => ST.fav[b.p].ts - ST.fav[a.p].ts).slice(0, 24);
  const imgs = S.items.filter(i => i.kind === 'i' && !i.hid).sort((a, b) => b.ts - a.ts).slice(0, 24);
  const hero = cont[0] || recent[0];
  let h = noteIdx();
  if (hero) {
    const x = getPos(hero.p), rl = resLabel(hero), isC = stOf(hero) === 1;
    h += `<section class="hero" data-hero="${esc(hero.p)}">
      <div class="bg" style="background-image:url('${esc(thumb(hero).replace(/'/g, '%27'))}')"></div>
      <img class="pic" src="${esc(thumb(hero))}" alt="" onerror="this.remove()">
      <div class="in">
        <span class="tag">${isC ? ico('clock') + '继续观看' : '最新入库'}</span>
        <h1>${esc(hero.title)}</h1>
        <div class="m">${hero.year ? `<span>${hero.year}</span>` : ''}${rl ? `<span class="q">${rl}</span>` : ''}${hero.dur ? `<span>${fmtLong(hero.dur)}</span>` : ''}${hero.rel ? `<span>${esc(hero.rel)}</span>` : ''}</div>
        ${isC ? `<div class="hp"><i style="width:${pct(hero).toFixed(1)}%"></i></div>` : ''}
        <div class="acts">
          <button class="btn pri" data-act="play" data-p="${esc(hero.p)}">${ico('playo', 'f')}${isC ? '从 ' + fmtDur(x.t) + ' 继续' : '播放'}</button>
          <button class="btn" data-act="info" data-p="${esc(hero.p)}">${ico('info')}详情</button>
          <button class="btn sq${isFav(hero.p) ? ' on' : ''}" data-act="fav" data-p="${esc(hero.p)}" title="收藏">${ico('heart')}</button>
        </div>
      </div></section>`;
  }
  const sec = (title, n, link) => `<h2 class="sec">${title}${n ? `<span class="cnt">${n}</span>` : ''}${link ? `<a class="more" href="${link}">全部${ico('chev')}</a>` : ''}</h2>`;
  if (cont.length) h += sec('继续观看', cont.length) + rowHtml(cont.slice(0, 24).map(i => vcard(i, 'cont')).join(''));
  if (recent.length) h += sec('最近添加', 0, '#/videos') + rowHtml(recent.map(i => vcard(i, 'row')).join(''));
  if (favs.length) h += sec('我的收藏', 0, '#/fav') + rowHtml(favs.map(i => i.kind === 'v' ? vcard(i, 'row') : i.kind === 'i' ? icard(i) : '').join(''));
  if (S.tops.length) h += sec('目录', 0, '#/files') + rowHtml(S.tops.map(t => dcard(ROOT + '/' + t, t)).join(''));
  if (imgs.length) h += sec('最新图片', 0, '#/images') + rowHtml(imgs.map(icard).join(''), true);
  if (!S.items.length) h += empty('film', '媒体库是空的', '把视频、图片或音乐放进共享文件夹，再点右上角的刷新');
  else if (!hero && !imgs.length) h += `<div class="ptitle"><h1>欢迎</h1></div>` + empty('folder', '没有找到视频或图片', '可以在“文件夹”里浏览全部文件');
  v.innerHTML = h;
}

/* ---------- wall with filters ---------- */
const FD = {
  top: { l: '目录', g: i => i.top || '（根目录）' },
  res: { l: '清晰度', g: i => resLabel(i) || '未知', order: ['4K', '2K', '1080P', '720P', 'SD', '未知'] },
  len: { l: '时长', g: i => !i.dur ? '未知' : i.dur < 600 ? '10 分钟以内' : i.dur < 3600 ? '10–60 分钟' : '1 小时以上', order: ['10 分钟以内', '10–60 分钟', '1 小时以上', '未知'] },
  year: { l: '年份', g: i => i.year ? String(i.year) : '未知', desc: true },
  ext: { l: '格式', g: i => (i.ext || '无').toUpperCase() },
  st: { l: '观看状态', g: i => ['未观看', '观看中', '已看完'][stOf(i)], order: ['未观看', '观看中', '已看完'] },
};
const KF = { v: ['top', 'res', 'len', 'year', 'ext', 'st'], i: ['top', 'ext'], a: ['top', 'ext'] };
const SORTS = {
  new: ['最近添加', (a, b) => b.ts - a.ts], old: ['最早添加', (a, b) => a.ts - b.ts],
  name: ['名称', (a, b) => a.title.localeCompare(b.title, 'zh', { numeric: true })],
  size: ['文件大小', (a, b) => b.sz - a.sz], dur: ['时长', (a, b) => b.dur - a.dur],
  seen: ['最近观看', (a, b) => ((ST.pos[b.p] || {}).ts || 0) - ((ST.pos[a.p] || {}).ts || 0)],
};
const KS = { v: ['new', 'old', 'name', 'size', 'dur', 'seen'], i: ['new', 'old', 'name', 'size'], a: ['name', 'new', 'size', 'dur'] };
const KN = { v: ['视频', 'film', '部'], i: ['图片', 'image', '张'], a: ['音乐', 'music', '首'] };
const fof = k => (S.f[k] = S.f[k] || { fav: false });
function wallList(k) {
  const f = fof(k);
  let l = S.items.filter(i => i.kind === k && !i.hid && matchQ(i) && (!f.fav || isFav(i.p)));
  for (const fk of KF[k]) { const set = f[fk]; if (set && set.size) l = l.filter(i => set.has(FD[fk].g(i))); }
  const sk = S.sort[k] || KS[k][0];
  return l.sort(SORTS[sk][1]);
}
function viewWall(k) {
  const v = $('#view'), f = fof(k), list = wallList(k), sk = S.sort[k] || KS[k][0];
  const total = S.items.filter(i => i.kind === k && !i.hid).length;
  const nact = KF[k].reduce((n, fk) => n + (f[fk] ? f[fk].size : 0), 0) + (f.fav ? 1 : 0);
  S.cur = list;
  v.innerHTML = `${noteIdx()}
    <div class="ptitle"><h1>${KN[k][0]}</h1><span>${list.length === total ? total : list.length + ' / ' + total} ${KN[k][2]}</span></div>
    <div class="bar">
      ${KF[k].map(fk => { const n = f[fk] ? f[fk].size : 0; return `<button class="chip${n ? ' on' : ''}" data-act="filter" data-k="${k}" data-fk="${fk}">${FD[fk].l}${n ? ` <b>${n === 1 ? esc(Array.from(f[fk])[0]) : n}</b>` : ''}${ico('down')}</button>`; }).join('')}
      <button class="chip${f.fav ? ' on' : ''}" data-act="favonly" data-k="${k}">${ico('heart')}只看收藏</button>
      ${nact ? `<button class="chip" data-act="clearf" data-k="${k}">${ico('x')}清除筛选</button>` : ''}
      <div class="sp"></div>
      <button class="chip" data-act="sort" data-k="${k}">${ico('sort')}${SORTS[sk][0]}</button>
      ${k === 'v' ? `<div class="seg"><button data-act="shape" data-v="0" class="${SET.poster ? '' : 'on'}">横版</button><button data-act="shape" data-v="1" class="${SET.poster ? 'on' : ''}">海报</button></div>` : ''}
      ${k !== 'a' ? `<label class="rng" title="卡片大小">${ico('tile')}<input type="range" id="csz" min="150" max="400" step="10" value="${SET.card}"></label>` : ''}
    </div>
    ${list.length ? (k === 'a' ? '<div class="flist" id="grid"></div>' : `<div class="grid${k === 'i' ? ' sq' : ''}" id="grid"></div>`)
      : empty(KN[k][1], total ? '没有符合条件的' + KN[k][0] : '还没有' + KN[k][0], total ? '试试调整筛选条件或搜索词' : '')}`;
  if (list.length) fillGrid($('#grid'), list, k === 'v' ? i => vcard(i) : k === 'i' ? icard : frow);
  const r = $('#csz'); if (r) r.addEventListener('input', () => { SET.card = +r.value; applyLook(); saveSet(); });
}
function applyLook() {
  document.documentElement.style.setProperty('--card', (innerWidth <= 760 ? Math.min(SET.card, 170) : SET.card * clamp(innerWidth / 1700, 1, 1.6)) * (SET.poster && S.view === 'videos' ? .72 : 1) + 'px');
  document.documentElement.style.setProperty('--ar', SET.poster ? '2 / 3' : '16 / 9');
}
function filterPop(anchor, k, fk) {
  const d = FD[fk], f = fof(k);
  openPop(anchor, () => {
    const cnt = new Map();
    for (const i of S.items) if (i.kind === k && !i.hid) { const g = d.g(i); cnt.set(g, (cnt.get(g) || 0) + 1); }
    let keys = Array.from(cnt.keys());
    if (d.order) keys.sort((a, b) => d.order.indexOf(a) - d.order.indexOf(b));
    else keys.sort((a, b) => a === '未知' ? 1 : b === '未知' ? -1 : d.desc ? b.localeCompare(a) : a.localeCompare(b, 'zh', { numeric: true }));
    const set = f[fk] || new Set();
    return `<div class="ph">${d.l}（可多选）</div>` + keys.map(x => `<button class="${set.has(x) ? 'on' : ''}" data-v="${esc(x)}"><span class="ck">${ico('check')}</span><span class="lb">${esc(x)}</span><span class="n">${cnt.get(x)}</span></button>`).join('');
  }, b => {
    const set = f[fk] = f[fk] || new Set(), x = b.dataset.v;
    if (set.has(x)) set.delete(x); else set.add(x);
    render(); return $(`[data-act="filter"][data-fk="${fk}"]`);
  });
}

/* ---------- favourites / search / files ---------- */
function groupHtml(list, ctxName) {
  const vs = list.filter(i => i.kind === 'v'), is = list.filter(i => i.kind === 'i'), as = list.filter(i => i.kind === 'a'), os = list.filter(i => i.kind === 'o');
  let h = '';
  if (vs.length) h += `<h2 class="sec">视频<span class="cnt">${vs.length}</span></h2><div class="grid">${vs.slice(0, 300).map(i => vcard(i)).join('')}</div>`;
  if (is.length) h += `<h2 class="sec">图片<span class="cnt">${is.length}</span></h2><div class="grid sq">${is.slice(0, 400).map(icard).join('')}</div>`;
  if (as.length) h += `<h2 class="sec">音乐<span class="cnt">${as.length}</span></h2><div class="flist">${as.slice(0, 300).map(frow).join('')}</div>`;
  if (os.length) h += `<h2 class="sec">${ctxName || '其他文件'}<span class="cnt">${os.length}</span></h2><div class="flist">${os.slice(0, 300).map(frow).join('')}</div>`;
  return h;
}
function viewFav(v) {
  const l = S.items.filter(i => isFav(i.p)).sort((a, b) => ST.fav[b.p].ts - ST.fav[a.p].ts);
  v.innerHTML = `<div class="ptitle"><h1>收藏</h1><span>${l.length} 项</span></div>` +
    (l.length ? groupHtml(l) : empty('heart', '还没有收藏', '把鼠标移到任意卡片上，点心形按钮即可收藏'));
}
function viewSearch(v) {
  const l = S.items.filter(i => !i.hid && matchQ(i)).sort((a, b) => b.ts - a.ts);
  v.innerHTML = `<div class="ptitle"><h1>搜索</h1><span>“${esc(S.q)}” · ${l.length} 个结果</span></div>` +
    (l.length ? groupHtml(l) : empty('search', '没有找到相关内容', '换个关键词试试'));
}
let filesTok = 0;
async function viewFiles(v) {
  const tok = ++filesTok, dirp = S.dir ? ROOT + '/' + S.dir : ROOT, parts = S.dir ? S.dir.split('/') : [];
  const crumbs = `<nav class="crumbs"><a href="#/files">全部文件</a>${parts.map((p, i) => ico('chev') + `<a href="#/files/${enc(parts.slice(0, i + 1).join('/'))}">${esc(p)}</a>`).join('')}</nav>`;
  if (!$('.crumbs', v)) v.innerHTML = crumbs + '<div class="empty"><div class="spin"></div></div>';
  let j;
  try { j = await ls(dirp); } catch (e) {
    if (tok !== filesTok || S.view !== 'files') return;
    if (e instanceof AuthErr) return showLogin();
    v.innerHTML = crumbs + empty('folder', '无法打开这个文件夹', '它可能已被移动或删除'); return;
  }
  if (tok !== filesTok || S.view !== 'files') return;
  S.perms = j.perms || S.perms;
  const dirs = (j.dirs || []).map(d => { let n = d.href.replace(/\/$/, ''); try { n = decodeURIComponent(n); } catch (e) { /* keep */ } return { n, c: d.tags && d.tags['.files'] }; })
    .filter(d => !d.n.startsWith('.')).sort((a, b) => a.n.localeCompare(b.n, 'zh', { numeric: true }));
  const files = (j.files || []).map(e => { const t = fromLs(dirp, e); const ex = S.map.get(t.p); if (ex) return ex; S.map.set(t.p, t); return t; })
    .filter(i => !i.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name, 'zh', { numeric: true }));
  S.dirPerms = j.perms || [];
  if (!S.dir) S.roots = dirs.map(d => d.n);
  const canW = S.dirPerms.includes('write'), canM = S.dirPerms.includes('move'), canD = S.dirPerms.includes('delete');
  S.curDirs = dirs.map(d => d.n); S.curFiles = files;
  for (const k of Array.from(S.sel)) { const q = k.slice(2); if (k[0] === 'f' ? !files.some(f => f.p === q) : !dirs.some(d => dirp + '/' + d.n === q)) S.sel.delete(k); }
  const n = S.sel.size, one = n === 1;
  const bar = S.selMode ? `<div class="bar selbar">
      <b>已选 ${n} 项</b>
      <button class="chip" data-act="selall">${ico('sel')}${n && n === dirs.length + files.length ? '取消全选' : '全选'}</button>
      ${canM ? `<button class="chip" data-act="fm-rename"${one ? '' : ' disabled'}>${ico('edit')}重命名</button><button class="chip" data-act="fm-move"${n ? '' : ' disabled'}>${ico('move')}移动到</button>` : ''}
      <button class="chip" data-act="fm-copy"${n ? '' : ' disabled'}>${ico('copy')}复制到</button>
      <button class="chip" data-act="fm-dl"${n ? '' : ' disabled'}>${ico('dl')}下载</button>
      ${canD ? `<button class="chip danger" data-act="fm-del"${n ? '' : ' disabled'}>${ico('trash')}删除</button>` : ''}
      <div class="sp"></div><button class="chip on" data-act="selmode">${ico('check')}完成</button>
    </div>` : `<div class="bar">
      <span style="color:var(--fg3)">${dirs.length ? dirs.length + ' 个文件夹' : ''}${dirs.length && files.length ? '，' : ''}${files.length ? files.length + ' 个文件' : ''}</span><div class="sp"></div>
      ${canW ? `<button class="chip" data-act="mkdir">${ico('plus')}新建文件夹</button><button class="chip" data-act="upload">${ico('up')}上传</button>` : ''}
      ${dirs.length + files.length ? `<button class="chip" data-act="selmode">${ico('sel')}多选管理</button>` : ''}
      ${S.dir ? `<a class="chip" href="/${enc(dirp)}/?zip" download>${ico('zip')}打包下载</a>` : `<button class="chip" data-act="libs">${ico('folder')}媒体目录</button>`}
      <a class="chip" href="/${enc(dirp)}/" target="_blank" rel="noopener">${ico('ext')}经典界面</a>
    </div>`;
  v.innerHTML = crumbs + bar +
    (dirs.length || !S.dir ? `<div class="grid">${dirs.map(d => dcard(dirp + '/' + d.n, d.n, d.c)).join('')}${!S.dir ? `<article class="card addlib fix" data-act="libs"><div class="thumb"><div class="ph">${ico('plus')}</div></div><div class="meta"><div class="t">添加媒体目录</div></div></article>` : ''}</div>` : '') +
    (files.length ? groupHtml(files, '其他文件') : '') +
    (!dirs.length && !files.length && S.dir ? empty('folder', '这个文件夹是空的', canW ? '把文件拖到这里，或点“上传”' : '') : '');
  v.classList.toggle('selecting', S.selMode);
  paintSel();
}
function paintSel() {
  const v = $('#view');
  for (const el of $$('[data-p]', v)) el.classList.toggle('sel', S.sel.has('f:' + el.dataset.p));
  for (const el of $$('[data-dir]', v)) el.classList.toggle('sel', S.sel.has('d:' + ROOT + '/' + el.dataset.dir));
}

/* ---------- modals ---------- */
function modal(html, onClose) {
  const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="mbox">${html}</div>`;
  m.close = v => { if (!m.isConnected) return; m.remove(); if (onClose) onClose(v); };
  m.addEventListener('mousedown', e => { if (e.target === m) m.close(null); });
  document.body.appendChild(m);
  return m;
}
function askText(title, value, okLabel, hint) {
  return new Promise(res => {
    const m = modal(`<h3>${esc(title)}</h3><input class="minp" type="text" value="${esc(value || '')}" spellcheck="false" autocomplete="off">${hint ? `<p class="mhint">${esc(hint)}</p>` : ''}
      <div class="macts"><button class="btn sm" data-m="cancel">取消</button><button class="btn sm acc" data-m="ok">${esc(okLabel)}</button></div>`, res);
    const i = $('.minp', m);
    setTimeout(() => { i.focus(); const d = (value || '').lastIndexOf('.'); i.setSelectionRange(0, d > 0 ? d : i.value.length); }, 30);
    i.addEventListener('keydown', e => { if (e.key === 'Enter') m.close(i.value.trim()); });
    m.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) m.close(b.dataset.m === 'ok' ? i.value.trim() : null); });
  });
}
function askConfirm(title, text, okLabel) {
  return new Promise(res => {
    const m = modal(`<h3>${esc(title)}</h3><p class="mhint" style="margin-top:0">${esc(text)}</p>
      <div class="macts"><button class="btn sm" data-m="cancel">取消</button><button class="btn sm danger arm" data-m="ok">${esc(okLabel)}</button></div>`, v => res(!!v));
    m.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) m.close(b.dataset.m === 'ok'); });
  });
}
function pickFolder(title, start, okLabel) {
  return new Promise(res => {
    let cur = start || ROOT, tok = 0;
    const m = modal(`<h3>${esc(title)}</h3><nav class="crumbs pfc"></nav><div class="pfl"></div>
      <div class="macts"><button class="btn sm" data-m="cancel">取消</button><button class="btn sm acc" data-m="ok" disabled>${esc(okLabel)}</button></div>`, res);
    const load = async () => {
      const t = ++tok, parts = cur.split('/');
      $('.pfc', m).innerHTML = parts.map((p, i) => (i ? ico('chev') : '') + `<a href="#" data-go="${esc(parts.slice(0, i + 1).join('/'))}">${i ? esc(p) : '全部文件'}</a>`).join('');
      $('.pfl', m).innerHTML = '<div class="empty" style="padding:30px"><div class="spin"></div></div>';
      let j; try { j = await ls(cur); } catch (e) { if (t === tok) $('.pfl', m).innerHTML = '<p class="mhint">无法打开这个文件夹</p>'; return; }
      if (t !== tok) return;
      const ds = (j.dirs || []).map(d => { let n = d.href.replace(/\/$/, ''); try { n = decodeURIComponent(n); } catch (e) { /* keep */ } return n; }).filter(n => !n.startsWith('.')).sort((a, b) => a.localeCompare(b, 'zh', { numeric: true }));
      const w = (j.perms || []).includes('write');
      $('.pfl', m).innerHTML = (ds.length ? ds.map(n => `<button class="pfr" data-go="${esc(cur + '/' + n)}">${ico('folder')}<span>${esc(n)}</span>${ico('chev')}</button>`).join('') : '<p class="mhint">这里没有子文件夹</p>') + (w ? '' : '<p class="mhint">这一层不能存放文件，请进入下面的某个目录。</p>');
      $('[data-m="ok"]', m).disabled = !w;
    };
    m.addEventListener('click', e => {
      const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); cur = g.dataset.go; load(); return; }
      const b = e.target.closest('[data-m]'); if (b && !b.disabled) m.close(b.dataset.m === 'ok' ? cur : null);
    });
    load();
  });
}
function showLibs() {
  const m = modal(`<h3>媒体目录</h3>
    <p class="mhint" style="margin-top:0">影音库会扫描下面这些目录里的全部文件：</p>
    <div class="pfl">${(S.roots.length ? S.roots : ['（共享文件夹本身）']).map(n => `<div class="pfr" style="cursor:default">${ico('folder')}<span>${esc(n)}</span></div>`).join('')}</div>
    <p class="mhint"><b>添加或移除目录</b>要在运行服务的那台电脑上操作：双击 <b>Copyparty</b> 图标 → 选择「管理共享目录」→ 添加文件夹（可一次选多个）。服务会自动重启，新目录扫描完成后就出现在这里。</p>
    <p class="mhint">出于安全考虑，网页里不能直接添加电脑上的任意文件夹——否则任何知道密码的人都能把那台电脑上的私人文件夹共享出来。</p>
    <div class="macts"><button class="btn sm acc" data-m="ok">知道了</button></div>`);
  m.addEventListener('click', e => { if (e.target.closest('[data-m]')) m.close(null); });
}

/* ---------- file management ---------- */
const vurl = p => '/' + enc(p);
async function apiPost(url, body) {
  const r = await fetch(url, { method: 'POST', credentials: 'same-origin', body });
  if (!r.ok) {
    let t = ''; try { t = (await r.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140); } catch (e) { /* ignore */ }
    throw new Error(r.status === 403 ? '没有权限执行这个操作' : (t || 'HTTP ' + r.status));
  }
}
function moveRecs(oldP, newP) {
  const now = Date.now(); let ch = false;
  for (const k of ['fav', 'pos']) for (const key of Object.keys(ST[k])) {
    if (key !== oldP && !key.startsWith(oldP + '/')) continue;
    const r = ST[k][key]; if (!recOn(k, r)) continue;
    ST[k][newP + key.slice(oldP.length)] = Object.assign({}, r, { ts: now });
    ST[k][key] = k === 'fav' ? { on: 0, ts: now } : { t: 0, d: 0, done: 0, ts: now };
    ch = true;
  }
  if (ch) stateDirty();
}
let opT = 0;
function afterOp() { S.sel.clear(); closeDrawer(); render(); clearTimeout(opT); opT = setTimeout(() => reload(true), 900); }
const selTargets = () => Array.from(S.sel).map(k => { const p = k.slice(2); return { p, name: p.slice(p.lastIndexOf('/') + 1), isDir: k[0] === 'd' }; });
const tgtOf = (p, isDir) => ({ p, name: p.slice(p.lastIndexOf('/') + 1), isDir: !!isDir });
async function opMkdir() {
  const nm = await askText('新建文件夹', '', '创建'); if (!nm) return;
  if (/[\/\\]/.test(nm)) return toast('名称不能包含斜杠', true);
  try { const fd = new FormData(); fd.append('act', 'mkdir'); fd.append('name', nm); await apiPost(vurl(S.dir ? ROOT + '/' + S.dir : ROOT) + '/', fd); toast('已创建 ' + nm); afterOp(); }
  catch (e) { toast('创建失败：' + e.message, true); }
}
async function opRename(t) {
  const nn = await askText('重命名', t.name, '重命名'); if (!nn || nn === t.name) return;
  if (/[\/\\]/.test(nn)) return toast('名称不能包含斜杠', true);
  const dst = t.p.slice(0, t.p.lastIndexOf('/') + 1) + nn;
  try { await apiPost(vurl(t.p) + '?move=' + vurl(dst)); moveRecs(t.p, dst); const w = WM.wins.find(x => x.item.p === t.p); if (w) WM.close(w); toast('已重命名为 ' + nn); afterOp(); }
  catch (e) { toast('重命名失败：' + e.message, true); }
}
async function opMoveCopy(ts, copy) {
  if (!ts.length) return;
  const here = ts[0].p.slice(0, ts[0].p.lastIndexOf('/'));
  const dir = await pickFolder((copy ? '复制' : '移动') + (ts.length > 1 ? ' ' + ts.length + ' 项' : '「' + ts[0].name + '」') + '到…', here, copy ? '复制到这里' : '移动到这里');
  if (!dir) return;
  let ok = 0; const errs = [];
  for (const t of ts) {
    const dst = dir + '/' + t.name;
    if (dst === t.p) { if (!copy) continue; errs.push(t.name + '：已经在这个文件夹里'); continue; }
    if (t.isDir && (dir === t.p || dir.startsWith(t.p + '/'))) { errs.push(t.name + '：不能放进它自己里面'); continue; }
    try {
      await apiPost(vurl(t.p) + (copy ? '?copy=' : '?move=') + vurl(dst));
      if (!copy) { moveRecs(t.p, dst); WM.wins.filter(x => x.item.p === t.p || x.item.p.startsWith(t.p + '/')).forEach(x => WM.close(x)); }
      ok++;
    } catch (e) { errs.push(t.name + '：' + e.message); }
  }
  if (ok) toast((copy ? '已复制 ' : '已移动 ') + ok + ' 项');
  if (errs.length) toast(errs.slice(0, 3).join('；') + (errs.length > 3 ? ' 等 ' + errs.length + ' 项失败' : ''), true);
  afterOp();
}
async function opDelete(ts) {
  if (!ts.length) return;
  const nd = ts.filter(t => t.isDir).length;
  if (!await askConfirm('删除确认', '将永久删除' + (ts.length === 1 ? '「' + ts[0].name + '」' : ' ' + ts.length + ' 项') + (nd ? '（其中文件夹会连同里面的全部内容一起删除）' : '') + '。此操作无法撤销。', '删除')) return;
  let ok = 0; const errs = [];
  for (const t of ts) {
    try {
      await apiPost(vurl(t.p) + '?delete');
      WM.wins.filter(x => x.item.p === t.p || x.item.p.startsWith(t.p + '/')).forEach(x => WM.close(x));
      S.items = S.items.filter(x => x.p !== t.p && !x.p.startsWith(t.p + '/')); S.map.delete(t.p); ok++;
    } catch (e) { errs.push(t.name + '：' + e.message); }
  }
  if (ok) toast('已删除 ' + ok + ' 项');
  if (errs.length) toast(errs.slice(0, 3).join('；'), true);
  afterOp();
}
function opDownload(ts) {
  ts.forEach((t, i) => setTimeout(() => {
    const a = document.createElement('a'); a.href = t.isDir ? vurl(t.p) + '/?zip' : vurl(t.p); a.download = t.isDir ? t.name + '.zip' : t.name;
    document.body.appendChild(a); a.click(); a.remove();
  }, i * 450));
  if (ts.length > 1) toast('正在下载 ' + ts.length + ' 项，浏览器可能会询问是否允许下载多个文件');
}
function ctxMenu(x, y, t, it) {
  closePop();
  const el = document.createElement('div'); el.className = 'pop';
  const inFiles = S.view === 'files', canM = !inFiles || S.dirPerms.includes('move'), canD = !inFiles || S.dirPerms.includes('delete');
  const b = (k, ic, l, cls) => `<button data-c="${k}"${cls ? ` class="${cls}"` : ''}>${ico(ic)}<span class="lb">${l}</span></button>`;
  el.innerHTML = `<div class="ph">${esc(t.name)}</div>` + b('open', t.isDir ? 'folder' : 'playo', '打开') + (it ? b('info', 'info', '详情') + b('fav', 'heart', isFav(it.p) ? '取消收藏' : '收藏') : '') +
    b('dl', t.isDir ? 'zip' : 'dl', t.isDir ? '打包下载' : '下载') + '<div class="sep"></div>' +
    (canM ? b('rename', 'edit', '重命名') + b('move', 'move', '移动到…') : '') + b('copy', 'copy', '复制到…') + (!t.isDir ? b('reveal', 'folder', '打开所在文件夹') : '') +
    (canD ? '<div class="sep"></div>' + b('del', 'trash', '删除', 'dng') : '');
  document.body.appendChild(el);
  el.style.left = clamp(x + scrollX, scrollX + 8, scrollX + innerWidth - el.offsetWidth - 8) + 'px';
  el.style.top = clamp(y + scrollY, scrollY + 8, scrollY + innerHeight - el.offsetHeight - 8) + 'px';
  pop = { el, anchor: null };
  el.addEventListener('click', e => {
    const k = (e.target.closest('button') || {}).dataset; if (!k) return; closePop();
    const c = k.c;
    if (c === 'open') { if (t.isDir) go('#/files/' + enc(t.p.slice(ROOT.length + 1))); else if (it) openItem(it, null); }
    else if (c === 'info') showInfo(it); else if (c === 'fav') toggleFav(it.p); else if (c === 'dl') opDownload([t]);
    else if (c === 'rename') opRename(t); else if (c === 'move') opMoveCopy([t], false); else if (c === 'copy') opMoveCopy([t], true);
    else if (c === 'reveal') go('#/files/' + enc(it.rel)); else if (c === 'del') opDelete([t]);
  });
}
document.addEventListener('contextmenu', e => {
  if (e.target.closest('.win,.pop,.modal,input')) return;
  const v = $('#view'), c = e.target.closest('[data-p]'), d = e.target.closest('[data-dir]');
  if (c && v.contains(c)) { const it = S.map.get(c.dataset.p); if (it) { e.preventDefault(); ctxMenu(e.clientX, e.clientY, tgtOf(it.p, false), it); } }
  else if (d && v.contains(d) && S.view === 'files') { e.preventDefault(); ctxMenu(e.clientX, e.clientY, tgtOf(ROOT + '/' + d.dataset.dir, true), null); }
});
// drag files from the desktop onto the folder view to upload them
let dragN = 0;
const canDrop = e => S.view === 'files' && S.dirPerms.includes('write') && e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
document.addEventListener('dragenter', e => { if (!canDrop(e)) return; e.preventDefault(); dragN++; $('#view').classList.add('dropping'); });
document.addEventListener('dragover', e => { if (canDrop(e)) e.preventDefault(); });
document.addEventListener('dragleave', e => { if (!canDrop(e)) return; if (--dragN <= 0) { dragN = 0; $('#view').classList.remove('dropping'); } });
document.addEventListener('drop', e => { if (!canDrop(e)) return; e.preventDefault(); dragN = 0; $('#view').classList.remove('dropping'); const fs = Array.from(e.dataTransfer.files).filter(f => f.size || f.type); if (fs.length) uploadFiles(fs); else toast('不支持直接拖入文件夹，请拖入文件', true); });

/* ---------- popovers ---------- */
let pop = null;
function closePop() { if (pop) { pop.el.remove(); pop = null; } }
function openPop(anchor, build, onPick) {
  const same = pop && pop.anchor === anchor;
  closePop(); if (same || !anchor) return;
  const el = document.createElement('div'); el.className = 'pop'; el.innerHTML = build();
  document.body.appendChild(el);
  const place = a => {
    const r = a.getBoundingClientRect();
    el.style.top = r.bottom + scrollY + 6 + 'px';
    el.style.left = clamp(r.left + scrollX, 8, scrollX + innerWidth - el.offsetWidth - 8) + 'px';
  };
  place(anchor);
  pop = { el, anchor };
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const na = onPick(b);
    if (na === false) return closePop();
    if (na && na.isConnected) { pop.anchor = na; place(na); }
    el.innerHTML = build();
  });
}
document.addEventListener('pointerdown', e => { if (pop && !pop.el.contains(e.target) && !e.target.closest('[data-act="filter"],[data-act="sort"],[data-act="settings"]')) closePop(); }, true);

function settingsPop(anchor) {
  const tg = (k, l) => `<button class="${SET[k] ? 'on' : ''}" data-s="${k}"><span class="lb">${l}</span><span class="tg"></span></button>`;
  openPop(anchor, () => `<div class="ph">播放</div>
    ${tg('solo', '只让当前窗口出声')}${tg('auto', '自动播放下一集')}${tg('hover', '鼠标悬停时预览')}
    <div class="sep"></div>
    <div class="ph">播放记录</div>
    <button data-s="export">${ico('dl')}<span class="lb">导出播放记录和收藏</span></button>
    <button data-s="import">${ico('up')}<span class="lb">导入播放记录和收藏</span></button>
    <button data-s="clear">${ico('clock')}<span class="lb">清除观看记录</span></button>
    <div class="sep"></div>
    <button data-s="libs">${ico('folder')}<span class="lb">媒体目录（添加 / 移除）</span></button>
    <a href="/${ROOT}/" target="_blank" rel="noopener"><button type="button" data-s="classic">${ico('ext')}<span class="lb">经典界面（上传 / 管理）</span></button></a>
    <button data-s="logout">${ico('out')}<span class="lb">退出登录</span></button>`,
  b => {
    const k = b.dataset.s;
    if (k === 'logout') { logout(); return false; }
    if (k === 'classic') return false;
    if (k === 'export') { exportState(); return false; }
    if (k === 'libs') { showLibs(); return false; }
    if (k === 'import') { $('#impfile').click(); return false; }
    if (k === 'clear') {
      const now = Date.now(); for (const p in ST.pos) ST.pos[p] = { t: 0, d: 0, done: 0, ts: now };
      stateDirty(); render(); toast('观看记录已清除'); return false;
    }
    SET[k] = !SET[k]; saveSet(); WM.dock();
  });
}

/* ---------- drawer ---------- */
function closeDrawer() { const d = $('#drawer'); if (!d.hidden) { d.hidden = true; d.innerHTML = ''; } }
function showInfo(it) {
  const d = $('#drawer'), x = getPos(it.p), st = stOf(it), rl = resLabel(it), th = thumb(it);
  const rows = [['文件名', it.name], ['位置', '/' + (it.rel || '')], ['大小', fmtSize(it.sz)], ['修改时间', fmtDate(it.ts)],
    ['时长', it.dur ? fmtLong(it.dur) + '（' + fmtDur(it.dur) + '）' : ''], ['分辨率', it.w ? it.w + ' × ' + it.h : ''], ['视频编码', it.vc.toUpperCase()], ['音频编码', it.ac.toUpperCase()],
    ['帧率', it.fps ? (Math.round(it.fps * 100) / 100) + ' fps' : ''], ['标题', it.tt], ['艺术家', it.artist], ['专辑', it.album],
    ['文件指纹', ((ST.pos[it.p] || {}).id || (ST.fav[it.p] || {}).id || '').replace(/^[^-]*-/, '').slice(0, 16)]].filter(r => r[1]);
  const playable = it.kind !== 'o';
  d.innerHTML = `<aside class="dpanel">
    ${th ? `<div class="dimg"><img src="${esc(th)}" alt="" onerror="this.parentNode.style.display='none'"></div>` : '<div style="height:70px"></div>'}
    <button class="icb dx" data-act="closedrawer" title="关闭">${ico('x')}</button>
    <div class="din">
      <h2>${esc(it.title)}</h2>
      <div class="tags">${[it.year, rl, it.ext.toUpperCase(), it.dur ? fmtDur(it.dur) : '', st === 2 ? '已看完' : ''].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('')}</div>
      ${st === 1 ? `<div class="pg"><div class="pb"><i style="width:${pct(it).toFixed(1)}%"></i></div><small>已看到 ${fmtDur(x.t)}${x.d ? '，剩余 ' + fmtLong(x.d - x.t) : ''}</small></div>` : ''}
      <div class="acts">
        ${playable ? `<button class="btn acc" data-act="play" data-p="${esc(it.p)}">${ico('playo', 'f')}${it.kind === 'i' ? '查看' : st === 1 ? '继续播放' : '播放'}</button>` : ''}
        ${it.kind === 'v' && st ? `<button class="btn" data-act="restart" data-p="${esc(it.p)}">从头播放</button>` : ''}
        <button class="btn sq${isFav(it.p) ? ' on' : ''}" data-act="fav" data-p="${esc(it.p)}" title="收藏">${ico('heart')}</button>
        <a class="btn sq" href="${esc(it.url)}" download="${esc(it.name)}" title="下载">${ico('dl')}</a>
        <button class="btn sq" data-act="reveal" data-p="${esc(it.p)}" title="打开所在文件夹">${ico('folder')}</button>
        <button class="btn sq" data-act="ren" data-p="${esc(it.p)}" title="重命名">${ico('edit')}</button>
        <button class="btn sq" data-act="mv" data-p="${esc(it.p)}" title="移动到…">${ico('move')}</button>
        <button class="btn sq danger" data-act="del" data-p="${esc(it.p)}" title="删除文件">${ico('trash')}</button>
      </div>
      <dl class="kv">${rows.map(r => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>
    </div></aside>`;
  d.hidden = false; d.dataset.p = it.p;
}
$('#drawer').addEventListener('click', e => { if (e.target === e.currentTarget) closeDrawer(); });

/* ---------- hover preview ---------- */
const hv = { card: null, t: 0, v: null };
function hoverStop() {
  clearTimeout(hv.t); hv.card = null;
  if (hv.v) { const v = hv.v; hv.v = null; try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* ignore */ } v.remove(); }
}
if (canHover) document.addEventListener('mouseover', e => {
  const c = e.target.closest && e.target.closest('.card.v');
  if (c === hv.card) return;
  hoverStop();
  if (!c || !SET.hover || WM.dragging) return;
  hv.card = c;
  hv.t = setTimeout(() => {
    const it = S.map.get(c.dataset.p), box = $('.thumb', c); if (!it || !box || !c.isConnected) return;
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.disablePictureInPicture = true;
    v.addEventListener('loadedmetadata', () => { const x = getPos(it.p); try { v.currentTime = x && !x.done && x.t > 5 ? x.t : (v.duration || 0) * .12; } catch (er) { /* ignore */ } v.play().catch(() => {}); });
    v.addEventListener('playing', () => v.classList.add('on'));
    v.addEventListener('error', () => { if (hv.v === v) hoverStop(); });
    v.src = it.url; hv.v = v; box.appendChild(v);
  }, 750);
});

/* ---------- floating window manager ---------- */
const stage = $('#stage');
const WM = {
  wins: [], z: 10, act: null, seq: 0, dragging: false, saved: null,
  vp() { return { w: stage.clientWidth || innerWidth, h: stage.clientHeight || innerHeight }; },
  isFs() { return (document.fullscreenElement || document.webkitFullscreenElement) === stage; },

  open(it, ctx, restart) {
    const ex = this.wins.find(w => w.item.p === it.p);
    if (ex) { this.focus(ex); if (restart && ex.media) { ex.media.currentTime = 0; ex.media.play().catch(() => {}); } return ex; }
    const el = document.createElement('div'); el.className = 'win';
    el.innerHTML = `<div class="wbody"></div><div class="wshield"></div>
      <div class="wbar"><span class="wt"></span>
        <button class="opt" data-w="prev" title="上一个">${ico('chevl')}</button><button class="opt" data-w="next" title="下一个">${ico('chev')}</button>
        <button class="opt" data-w="info" title="详情">${ico('info')}</button>
        <button data-w="mini" title="缩小 / 还原">${ico('mini')}</button><button data-w="max" title="铺满页面 / 还原">${ico('max')}</button>
        <button data-w="fs" title="全屏">${ico('fs')}</button><button class="x" data-w="close" title="关闭">${ico('x')}</button>
      </div>${['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(d => `<div class="rs ${d}" data-d="${d}"></div>`).join('')}`;
    const w = { id: ++this.seq, el, body: $('.wbody', el), item: it, ctx: ctx && ctx.length ? ctx : [it], mode: 'n', back: null, ar: 16 / 9, sized: false, media: null, r: null, lastSave: 0 };
    stage.appendChild(el); this.wins.push(w);
    this.bind(w);
    this.load(w, it, restart);
    const v = this.vp();
    if (this.isFs()) this.tile();
    else if (v.w < 760) { w.r = this.fit(w.ar, { x: 6, y: 56 + (this.wins.length - 1) % 5 * 30, w: v.w - 12, h: v.h * .5 }, true); this.apply(w); }
    else { w.r = this.normalRect(w); this.apply(w); }
    this.focus(w); this.dock();
    return w;
  },
  normalRect(w) {
    const v = this.vp(), ar = w.ar, off = ((this.wins.indexOf(w) + 6) % 6) * 28 - 56;
    if (w.item.kind === 'a') return { x: (v.w - 400) / 2 + off, y: v.h - 280 + off / 2, w: 400, h: 150 };
    const W = Math.min(v.w * .74, 1280, v.h * .78 * ar), H = W / ar;
    return { x: (v.w - W) / 2 + off, y: Math.max(8, (v.h - H) / 2 - 20 + off), w: W, h: H };
  },
  fit(ar, box, top) {
    let W = box.w, H = W / ar; if (H > box.h) { H = box.h; W = H * ar; }
    return { x: box.x + (box.w - W) / 2, y: top ? box.y : box.y + (box.h - H) / 2, w: W, h: H };
  },
  apply(w, anim) {
    const s = w.el.style, r = w.r;
    w.el.classList.toggle('anim', !!anim);
    s.left = Math.round(r.x) + 'px'; s.top = Math.round(r.y) + 'px'; s.width = Math.round(r.w) + 'px'; s.height = Math.round(r.h) + 'px';
    w.el.classList.toggle('narrow', r.w < 330);
    w.el.classList.toggle('max', w.mode === 'max');
  },

  load(w, it, restart) {
    this.save(w);
    if (w.media) { try { w.media.pause(); w.media.removeAttribute('src'); w.media.load(); } catch (e) { /* ignore */ } }
    w.item = it; w.media = null; w.zoom = 1; w.pan = { x: 0, y: 0 };
    $('.wt', w.el).textContent = it.title;
    w.body.className = 'wbody'; w.body.innerHTML = '';
    $$('.werr,.wtoast', w.el).forEach(e => e.remove());
    const i = w.ctx.findIndex(c => c.p === it.p);
    $('[data-w="prev"]', w.el).disabled = i <= 0; $('[data-w="next"]', w.el).disabled = i < 0 || i >= w.ctx.length - 1;
    const refit = () => {
      if (w.mode === 'max' || this.isFs()) return;
      if (w.mode === 'mini') return this.minis();
      if (!w.r) return;
      const cx = w.r.x + w.r.w / 2, cy = w.r.y + w.r.h / 2, v = this.vp();
      let W = w.r.w, H = W / w.ar; const mh = v.h - 90; if (H > mh) { H = mh; W = H * w.ar; }
      w.r = { x: cx - W / 2, y: clamp(cy - H / 2, 0, Math.max(0, v.h - H)), w: W, h: H }; this.apply(w, true);
    };
    if (it.kind === 'v' || it.kind === 'a') {
      const m = document.createElement(it.kind === 'v' ? 'video' : 'audio');
      m.controls = true; m.autoplay = true; m.preload = 'auto';
      if (it.kind === 'v') { m.playsInline = true; m.setAttribute('playsinline', ''); if (it.poster) m.poster = it.poster + '?th=jf3'; }
      w.media = m;
      m.addEventListener('loadedmetadata', () => {
        if (it.kind === 'v' && m.videoWidth && m.videoHeight) { w.ar = m.videoWidth / m.videoHeight; refit(); }
        const x = getPos(it.p);
        if (!restart && it.kind === 'v' && x && !x.done && x.t > 5 && (!m.duration || x.t < m.duration - 8)) {
          try { m.currentTime = x.t; } catch (e) { /* ignore */ }
          this.wtoast(w, '已从 ' + fmtDur(x.t) + ' 继续播放', '从头播放', () => { m.currentTime = 0; m.play().catch(() => {}); });
        }
      });
      m.addEventListener('timeupdate', () => { const n = Date.now(); if (n - w.lastSave > 4000) this.save(w); });
      m.addEventListener('pause', () => { this.save(w); w.el.classList.add('idle0'); this.dock(); });
      m.addEventListener('play', () => { w.el.classList.remove('idle0'); this.dock(); });
      m.addEventListener('ended', () => {
        if (it.kind === 'v') { setPos(it.p, 0, m.duration, true); patchCards(it.p); }
        const nx = w.ctx[w.ctx.findIndex(c => c.p === it.p) + 1];
        if (nx && nx.kind === it.kind && (it.kind === 'a' || (SET.auto && nx.dir === it.dir))) this.load(w, nx);
      });
      m.addEventListener('error', () => this.err(w));
      if (it.kind === 'a') {
        w.body.classList.add('au');
        w.body.innerHTML = `<div class="ad"><div class="ai">${ico('music')}</div><div><b>${esc(it.tt || it.title)}</b><small>${esc([it.artist, it.album].filter(Boolean).join(' · ') || it.rel)}</small></div></div>`;
      }
      m.src = it.url; w.body.appendChild(m);
      if (SET.solo && this.act && this.act !== w) m.muted = false;
      m.play().catch(() => {});
    } else {
      const im = document.createElement('img'); im.className = 'pv'; im.alt = it.name; im.draggable = false;
      if (it.w && it.h) w.ar = it.w / it.h;
      im.addEventListener('load', () => { if (im.naturalWidth) { w.ar = im.naturalWidth / im.naturalHeight; refit(); } });
      im.addEventListener('error', () => this.err(w));
      im.src = it.url; w.body.appendChild(im); w.img = im;
    }
  },
  save(w) {
    const m = w.media, it = w.item;
    if (!m || it.kind !== 'v' || !m.duration || !isFinite(m.duration) || m.readyState < 1) return;
    w.lastSave = Date.now();
    const t = m.currentTime, d = m.duration;
    if (t < 3 && !getPos(it.p)) return;
    setPos(it.p, t, d, t / d > .95 || d - t < 6);
  },
  saveAll() { this.wins.forEach(w => this.save(w)); },
  err(w) {
    if ($('.werr', w.el)) return;
    const it = w.item, e = document.createElement('div'); e.className = 'werr';
    e.innerHTML = `<div><b>浏览器无法播放这个文件</b><p>${esc(it.name)}<br>${it.kind === 'i' ? '浏览器不支持这种图片格式。' : '浏览器不支持它的封装或编码格式（常见于 HEVC、AC3/DTS 音轨、AVI、RMVB 等）。可以下载后用本地播放器打开，或复制链接到 IINA / VLC / Infuse 中播放。'}</p>
      <div class="acts"><a class="btn sm acc" href="${esc(it.url)}" download="${esc(it.name)}">${ico('dl')}下载</a><button class="btn sm" data-w="copy">复制链接</button></div></div>`;
    w.el.appendChild(e);
  },
  wtoast(w, msg, btn, fn) {
    $$('.wtoast', w.el).forEach(e => e.remove());
    const t = document.createElement('div'); t.className = 'wtoast';
    t.innerHTML = `<span>${esc(msg)}</span>${btn ? `<button>${esc(btn)}</button>` : ''}`;
    if (btn) $('button', t).addEventListener('click', e => { e.stopPropagation(); fn(); t.remove(); });
    w.el.appendChild(t); setTimeout(() => t.remove(), 7000);
  },

  focus(w) {
    if (!w) return;
    w.el.style.zIndex = ++this.z;
    this.wins.forEach(o => o.el.classList.toggle('act', o === w));
    this.act = w;
    if (SET.solo && w.media) this.wins.forEach(o => { if (o.media) o.media.muted = o !== w; });
  },
  step(w, d) { const i = w.ctx.findIndex(c => c.p === w.item.p), nx = w.ctx[i + d]; if (nx) { this.load(w, nx); patchCards(w.item.p); } },
  close(w) {
    this.save(w);
    if (w.media) { try { w.media.pause(); w.media.removeAttribute('src'); w.media.load(); } catch (e) { /* ignore */ } }
    if (document.fullscreenElement === w.el) document.exitFullscreen().catch(() => {});
    w.el.remove(); this.wins.splice(this.wins.indexOf(w), 1);
    if (this.act === w) { this.act = null; const top = this.wins.slice().sort((a, b) => b.el.style.zIndex - a.el.style.zIndex)[0]; if (top) this.focus(top); }
    if (!this.wins.length && this.isFs()) this.exitFs();
    else if (this.isFs()) this.tile(); else this.minis();
    this.dock(); patchCards(w.item.p);
    if (!this.wins.length && S.view === 'home') render();
  },
  closeAll() { this.wins.slice().forEach(w => this.close(w)); },

  toggleMini(w) {
    if (this.isFs()) return;
    if (w.mode === 'mini') { w.mode = 'n'; w.r = this.clampR(w.back || this.normalRect(w)); this.apply(w, true); this.minis(); return; }
    if (w.mode === 'n') w.back = Object.assign({}, w.r);
    w.mode = 'mini'; this.minis();
  },
  minis() {
    const v = this.vp(), ms = this.wins.filter(w => w.mode === 'mini'); if (!ms.length) return;
    const bw = Math.min(380, Math.max(180, (v.w - 16 * 3) / 2)), bh = bw * 9 / 16, gap = 12;
    const per = Math.max(1, Math.floor((v.w - 16) / (bw + gap)));
    ms.forEach((w, i) => {
      const col = i % per, row = Math.floor(i / per);
      const box = { x: v.w - 16 - (col + 1) * bw - col * gap, y: v.h - 86 - (row + 1) * bh - row * gap, w: bw, h: bh };
      w.r = w.item.kind === 'a' ? box : this.fit(w.ar, box); this.apply(w, true);
    });
  },
  toggleMax(w) {
    if (this.isFs()) return;
    if (w.mode === 'max') { w.mode = 'n'; w.r = this.clampR(w.back || this.normalRect(w)); this.apply(w, true); return; }
    if (w.mode === 'n') w.back = Object.assign({}, w.r);
    const v = this.vp(); w.mode = 'max'; w.r = { x: 0, y: 0, w: v.w, h: v.h }; this.apply(w, true); this.focus(w); this.minis();
  },
  fsWin(w) {
    const d = document, cur = d.fullscreenElement || d.webkitFullscreenElement;
    if (cur === w.el) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
    const rq = w.el.requestFullscreen || w.el.webkitRequestFullscreen;
    if (rq) { const p = rq.call(w.el); if (p && p.catch) p.catch(() => {}); }
    else if (w.media && w.media.webkitEnterFullscreen) w.media.webkitEnterFullscreen();
    else toast('这个浏览器不支持全屏', true);
  },
  clampR(r) {
    const v = this.vp(); r = Object.assign({}, r);
    if (r.w > v.w) { r.h *= v.w / r.w; r.w = v.w; }
    if (r.h > v.h) { r.w *= v.h / r.h; r.h = v.h; }
    r.x = clamp(r.x, 80 - r.w, v.w - 80); r.y = clamp(r.y, 0, Math.max(0, v.h - 44));
    return r;
  },
  tile() {
    const ws = this.wins, n = ws.length; if (!n) return;
    const v = this.vp(), fs = this.isFs(), pad = fs ? 0 : 10, gap = fs ? 2 : 10;
    const area = { x: pad, y: pad, w: v.w - pad * 2, h: v.h - pad * 2 - (fs ? 0 : 70) };
    let best = 1, bs = 0;
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c), cw = (area.w - gap * (c - 1)) / c, ch = (area.h - gap * (r - 1)) / r, s = Math.min(cw, ch * 16 / 9);
      if (s > bs) { bs = s; best = c; }
    }
    const cols = best, rows = Math.ceil(n / cols);
    const tw = Math.min((area.w - gap * (cols - 1)) / cols, ((area.h - gap * (rows - 1)) / rows) * 16 / 9), th = tw * 9 / 16;
    const oy = (area.h - (rows * th + (rows - 1) * gap)) / 2;
    ws.forEach((w, i) => {
      const row = Math.floor(i / cols), inRow = row === rows - 1 ? n - cols * (rows - 1) : cols, col = i % cols;
      const ox = (area.w - (inRow * tw + (inRow - 1) * gap)) / 2;
      const box = { x: area.x + ox + col * (tw + gap), y: area.y + oy + row * (th + gap), w: tw, h: th };
      w.mode = 'n'; w.sized = true;
      w.r = w.item.kind === 'a' ? this.fit(400 / 150, box) : this.fit(w.ar, box);
      this.apply(w, true);
    });
  },
  allMini() { if (this.isFs()) return; this.wins.forEach(w => { if (w.mode !== 'mini') { if (w.mode === 'n') w.back = Object.assign({}, w.r); w.mode = 'mini'; } }); this.minis(); },
  stageFs() {
    if (this.isFs()) return this.exitFs();
    const rq = stage.requestFullscreen || stage.webkitRequestFullscreen;
    if (!rq) { this.tile(); toast('这个浏览器不支持多窗口全屏，已改为平铺'); return; }
    this.saved = this.wins.map(w => ({ w, r: Object.assign({}, w.r), mode: w.mode }));
    const p = rq.call(stage); if (p && p.catch) p.catch(() => { this.saved = null; this.tile(); });
  },
  exitFs() { const d = document; if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d); },
  onFs() {
    const on = this.isFs();
    stage.classList.toggle('fs', on);
    if (on) setTimeout(() => this.tile(), 60);
    else if (this.saved) {
      this.saved.forEach(s => { if (this.wins.includes(s.w)) { s.w.mode = s.mode; s.w.r = this.clampR(s.r); this.apply(s.w, true); } });
      this.saved = null; this.minis();
    }
    this.dock();
  },
  toggleAll() {
    const ms = this.wins.filter(w => w.media), anyPlaying = ms.some(w => !w.media.paused);
    ms.forEach(w => { if (anyPlaying) w.media.pause(); else w.media.play().catch(() => {}); });
  },
  dock() {
    let d = $('.dock', stage);
    if (!this.wins.length) { if (d) d.remove(); return; }
    if (!d) { d = document.createElement('div'); d.className = 'dock'; stage.appendChild(d); }
    const ms = this.wins.filter(w => w.media), playing = ms.some(w => !w.media.paused), fs = this.isFs();
    d.innerHTML = `<span class="cn">${this.wins.length} 个窗口</span>
      <button data-dk="tile" title="平铺所有窗口">${ico('tile')}<span>平铺</span></button>
      <button data-dk="mini" title="全部缩小到角落"${fs ? ' disabled style="opacity:.3"' : ''}>${ico('mini')}<span>全部缩小</span></button>
      <button data-dk="fs" class="${fs ? 'on' : ''}" title="所有窗口一起全屏播放">${ico('fs')}<span>${fs ? '退出全屏' : '多窗口全屏'}</span></button>
      <i class="dv"></i>
      <button data-dk="solo" class="${SET.solo ? 'on' : ''}" title="${SET.solo ? '当前：只有选中的窗口出声（点击切换为全部出声）' : '当前：所有窗口同时出声（点击切换）'}">${ico('vol')}<span>${SET.solo ? '单窗口出声' : '全部出声'}</span></button>
      ${ms.length ? `<button data-dk="pp" title="全部播放 / 暂停">${ico(playing ? 'pause' : 'playo')}<span>${playing ? '全部暂停' : '全部播放'}</span></button>` : ''}
      <i class="dv"></i>
      <button data-dk="close" class="x" title="关闭所有窗口">${ico('x')}</button>`;
  },

  bind(w) {
    const el = w.el;
    el.addEventListener('pointerdown', () => this.focus(w), true);
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-w]'); if (!b) return;
      e.stopPropagation();
      const a = b.dataset.w;
      if (a === 'close') this.close(w); else if (a === 'mini') this.toggleMini(w); else if (a === 'max') this.toggleMax(w);
      else if (a === 'fs') this.fsWin(w); else if (a === 'prev') this.step(w, -1); else if (a === 'next') this.step(w, 1);
      else if (a === 'info') { if (document.fullscreenElement) this.exitFs(); showInfo(w.item); }
      else if (a === 'copy') { const u = location.origin + w.item.url; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('链接已复制'), () => toast(u)); }
    });
    const bar = $('.wbar', el);
    bar.addEventListener('dblclick', e => { if (!e.target.closest('button')) this.toggleMax(w); });
    const startMove = e => {
      if (w.mode === 'max' || this.isFs() || document.fullscreenElement === el) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, r0 = Object.assign({}, w.r); let moved = false;
      const tgt = e.currentTarget; try { tgt.setPointerCapture(e.pointerId); } catch (x) { /* synthetic pointer */ }
      const mv = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        if (!moved) { moved = true; this.dragging = true; el.classList.add('drag'); el.classList.remove('anim'); if (w.mode === 'mini') w.mode = 'n'; }
        const v = this.vp();
        w.r.x = clamp(r0.x + dx, 80 - r0.w, v.w - 80); w.r.y = clamp(r0.y + dy, 0, v.h - 44);
        el.style.left = Math.round(w.r.x) + 'px'; el.style.top = Math.round(w.r.y) + 'px';
      };
      const up = () => { tgt.removeEventListener('pointermove', mv); tgt.removeEventListener('pointerup', up); tgt.removeEventListener('pointercancel', up); el.classList.remove('drag'); this.dragging = false; if (moved) w.justDragged = Date.now(); };
      tgt.addEventListener('pointermove', mv); tgt.addEventListener('pointerup', up); tgt.addEventListener('pointercancel', up);
    };
    bar.addEventListener('pointerdown', e => { if (!e.target.closest('button') && e.button === 0) startMove(e); });

    // images: drag moves the window (or pans when zoomed), wheel zooms, double-click toggles zoom
    w.body.addEventListener('pointerdown', e => {
      if (!w.img || e.target !== w.img || e.button !== 0) return;
      if (w.zoom <= 1) return startMove(e);
      e.preventDefault(); const sx = e.clientX, sy = e.clientY, p0 = Object.assign({}, w.pan);
      try { w.img.setPointerCapture(e.pointerId); } catch (x) { /* synthetic pointer */ }
      const mv = ev => { w.pan = { x: p0.x + ev.clientX - sx, y: p0.y + ev.clientY - sy }; this.zoomApply(w); };
      const up = () => { w.img.removeEventListener('pointermove', mv); w.img.removeEventListener('pointerup', up); w.img.removeEventListener('pointercancel', up); };
      w.img.addEventListener('pointermove', mv); w.img.addEventListener('pointerup', up); w.img.addEventListener('pointercancel', up);
    });
    w.body.addEventListener('wheel', e => {
      if (!w.img) return; e.preventDefault();
      w.zoom = clamp(w.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 1, 10); if (w.zoom === 1) w.pan = { x: 0, y: 0 };
      this.zoomApply(w);
    }, { passive: false });
    w.body.addEventListener('dblclick', e => { if (!w.img || e.target !== w.img) return; w.zoom = w.zoom > 1 ? 1 : 2.5; w.pan = { x: 0, y: 0 }; this.zoomApply(w); });

    $$('.rs', el).forEach(h => h.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const d = h.dataset.d, sx = e.clientX, sy = e.clientY, r0 = Object.assign({}, w.r);
      const lock = w.item.kind !== 'a' ? w.ar : 0, minW = w.item.kind === 'a' ? 260 : 200, minH = w.item.kind === 'a' ? 120 : 112;
      try { h.setPointerCapture(e.pointerId); } catch (x) { /* synthetic pointer */ } el.classList.add('drag'); el.classList.remove('anim'); this.dragging = true;
      if (w.mode === 'mini') w.mode = 'n';
      const mv = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        let W = r0.w, H = r0.h;
        if (d.includes('e')) W = r0.w + dx; if (d.includes('w')) W = r0.w - dx;
        if (d.includes('s')) H = r0.h + dy; if (d.includes('n')) H = r0.h - dy;
        W = Math.max(minW, W); H = Math.max(minH, H);
        if (lock) { if (d === 'n' || d === 's') W = H * lock; else H = W / lock; if (W < minW) { W = minW; H = W / lock; } }
        let x = d.includes('w') ? r0.x + r0.w - W : r0.x, y = d.includes('n') ? r0.y + r0.h - H : r0.y;
        if (lock && (d === 'n' || d === 's')) x = r0.x + (r0.w - W) / 2;
        w.r = { x, y, w: W, h: H }; w.sized = true; this.apply(w);
      };
      const up = () => { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); el.classList.remove('drag'); this.dragging = false; };
      h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    }));
  },
  zoomApply(w) { if (w.img) w.img.style.transform = w.zoom > 1 ? `translate(${w.pan.x}px, ${w.pan.y}px) scale(${w.zoom})` : ''; },
};
stage.addEventListener('click', e => {
  const b = e.target.closest('[data-dk]'); if (!b) return;
  const a = b.dataset.dk;
  if (a === 'tile') WM.tile(); else if (a === 'mini') WM.allMini(); else if (a === 'fs') WM.stageFs();
  else if (a === 'solo') { SET.solo = !SET.solo; saveSet(); if (SET.solo && WM.act) WM.focus(WM.act); else if (!SET.solo) WM.wins.forEach(w => { if (w.media) w.media.muted = false; }); toast(SET.solo ? '只有选中的窗口出声' : '所有窗口同时出声'); }
  else if (a === 'pp') WM.toggleAll(); else if (a === 'close') WM.closeAll();
  WM.dock();
});
let wakeT = 0;
stage.addEventListener('pointermove', () => { if (!stage.classList.contains('fs')) return; stage.classList.add('wake'); clearTimeout(wakeT); wakeT = setTimeout(() => stage.classList.remove('wake'), 2500); });
document.addEventListener('fullscreenchange', () => WM.onFs());
document.addEventListener('webkitfullscreenchange', () => WM.onFs());
let rzT = 0;
addEventListener('resize', () => {
  clearTimeout(rzT); rzT = setTimeout(() => {
    applyLook();
    if (WM.isFs()) return WM.tile();
    const v = WM.vp();
    WM.wins.forEach(w => { if (w.mode === 'max') w.r = { x: 0, y: 0, w: v.w, h: v.h }; else if (w.mode === 'n') w.r = WM.clampR(w.r); WM.apply(w); });
    WM.minis();
  }, 120);
});

/* ---------- actions ---------- */
function ctxOf(el, it) {
  const box = el.closest('.row,.grid,.flist');
  if (!box) return [it];
  const l = $$('[data-p]', box).map(x => S.map.get(x.dataset.p)).filter(x => x && x.kind === it.kind);
  if (S.cur && (S.view === 'videos' || S.view === 'images' || S.view === 'music') && S.cur.length > l.length && S.cur.includes(it)) return S.cur;
  return l.length ? l : [it];
}
function openItem(it, el, restart) {
  if (it.kind === 'o') { window.open(it.url, '_blank', 'noopener'); return; }
  hoverStop();
  WM.open(it, el ? ctxOf(el, it) : [it], restart);
}
function toggleFav(p) {
  const on = !isFav(p); setFav(p, on);
  toast(on ? '已加入收藏' : '已取消收藏');
  if (S.view === 'fav' || (S.view === 'home')) render(); else { patchCards(p); renderSide(); }
  const d = $('#drawer'); if (!d.hidden && d.dataset.p === p) showInfo(S.map.get(p));
}
async function reload(quiet) {
  const b = $('[data-act="reload"]'); if (b) b.style.animation = 'spin .8s linear infinite';
  try { await Promise.all([loadLib(), pullState()]); render(); afterLib(); if (!quiet) toast('媒体库已刷新，共 ' + S.items.length + ' 个文件'); }
  catch (e) { if (e instanceof AuthErr) showLogin(); else toast('刷新失败，请检查网络', true); }
  if (b) b.style.animation = '';
  if (S.indexing) { clearTimeout(idxT); idxT = setTimeout(() => reload(true), 20000); }
}
let idxT = 0;
function uploadFiles(files) {
  const dirp = S.dir ? ROOT + '/' + S.dir : ROOT, list = Array.from(files); if (!list.length) return;
  const bar = document.createElement('div'); bar.className = 'upbar'; bar.innerHTML = '<div></div><div class="pb"><i style="width:0"></i></div>';
  document.body.appendChild(bar);
  let i = 0, fail = 0;
  const next = () => {
    if (i >= list.length) {
      bar.remove(); toast(fail ? `上传完成，${fail} 个失败` : `已上传 ${list.length} 个文件`, !!fail);
      if (S.view === 'files') render(); setTimeout(() => reload(true), 1500); return;
    }
    const f = list[i++], x = new XMLHttpRequest();
    bar.firstChild.textContent = `正在上传 ${i} / ${list.length}：${f.name}`;
    x.open('PUT', '/' + enc(dirp) + '/' + encodeURIComponent(f.name));
    x.upload.onprogress = e => { if (e.lengthComputable) $('i', bar).style.width = (e.loaded / e.total * 100).toFixed(1) + '%'; };
    x.onload = () => { if (x.status >= 300) fail++; next(); };
    x.onerror = () => { fail++; next(); };
    x.send(f);
  };
  next();
}
$('#upfile').addEventListener('change', e => { uploadFiles(e.target.files); e.target.value = ''; });
$('#impfile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importState(f); });

document.addEventListener('click', e => {
  if (S.selMode && S.view === 'files' && !e.target.closest('.bar,.crumbs,.pop,.modal,.win,.dock,#side,#top,#drawer')) {
    const c = e.target.closest('[data-p]'), d = e.target.closest('[data-dir]'), v = $('#view');
    const k = c && v.contains(c) ? 'f:' + c.dataset.p : d && v.contains(d) ? 'd:' + ROOT + '/' + d.dataset.dir : '';
    if (k) { e.preventDefault(); if (S.sel.has(k)) S.sel.delete(k); else S.sel.add(k); render(); return; }
  }
  const a = e.target.closest('[data-act]');
  if (a) {
    const act = a.dataset.act, holder = a.dataset.p ? a : a.closest('[data-p]'), p = holder && holder.dataset.p, it = p && S.map.get(p);
    if (act === 'eye') { const i = $('#lpw'); i.type = i.type === 'password' ? 'text' : 'password'; i.focus(); return; }
    e.preventDefault();
    if (act === 'fav' && p) toggleFav(p);
    else if (act === 'info' && it) showInfo(it);
    else if (act === 'play' && it) { closeDrawer(); openItem(it, holder.closest('.card,.frow')); }
    else if (act === 'restart' && it) { closeDrawer(); openItem(it, null, true); }
    else if (act === 'reveal' && it) { closeDrawer(); go('#/files/' + enc(it.rel)); }
    else if (act === 'del' && it) opDelete([tgtOf(it.p)]);
    else if (act === 'closedrawer') closeDrawer();
    else if (act === 'filter') filterPop(a, a.dataset.k, a.dataset.fk);
    else if (act === 'favonly') { const f = fof(a.dataset.k); f.fav = !f.fav; render(); }
    else if (act === 'clearf') { S.f[a.dataset.k] = { fav: false }; render(); }
    else if (act === 'sort') { const k = a.dataset.k; openPop(a, () => '<div class="ph">排序方式</div>' + KS[k].map(s => `<button class="${(S.sort[k] || KS[k][0]) === s ? 'on' : ''}" data-v="${s}"><span class="lb">${SORTS[s][0]}</span>${(S.sort[k] || KS[k][0]) === s ? ico('check') : ''}</button>`).join(''), b => { S.sort[k] = b.dataset.v; render(); return false; }); }
    else if (act === 'shape') { SET.poster = a.dataset.v === '1'; saveSet(); applyLook(); render(); }
    else if (act === 'settings') settingsPop(a);
    else if (act === 'reload') reload();
    else if (act === 'logout') logout();
    else if (act === 'upload') $('#upfile').click();
    else if (act === 'mkdir') opMkdir();
    else if (act === 'libs') showLibs();
    else if (act === 'selmode') { S.selMode = !S.selMode; S.sel.clear(); render(); }
    else if (act === 'selall') { const dirp = S.dir ? ROOT + '/' + S.dir : ROOT, all = (S.curDirs || []).length + (S.curFiles || []).length; if (S.sel.size === all) S.sel.clear(); else { (S.curDirs || []).forEach(n => S.sel.add('d:' + dirp + '/' + n)); (S.curFiles || []).forEach(f => S.sel.add('f:' + f.p)); } render(); }
    else if (act === 'fm-rename') { const t = selTargets()[0]; if (t) opRename(t); }
    else if (act === 'fm-move') opMoveCopy(selTargets(), false);
    else if (act === 'fm-copy') opMoveCopy(selTargets(), true);
    else if (act === 'fm-dl') opDownload(selTargets());
    else if (act === 'fm-del') opDelete(selTargets());
    else if (act === 'ren' && it) opRename(tgtOf(it.p));
    else if (act === 'mv' && it) opMoveCopy([tgtOf(it.p)], false);
    else if (act === 'clrq') { const q = $('#q'); q.value = ''; q.dispatchEvent(new Event('input')); q.focus(); }
    else if (act === 'rowl' || act === 'rowr') { const r = $('.row', a.parentNode); r.scrollBy({ left: (act === 'rowl' ? -1 : 1) * r.clientWidth * .85, behavior: 'smooth' }); }
    return;
  }
  if (e.target.closest('a,button,input,.pop,.win,.dock,.modal')) return;
  const d = e.target.closest('[data-dir]');
  if (d) { go('#/files/' + enc(d.dataset.dir)); return; }
  const c = e.target.closest('[data-p]');
  if (c && $('#view').contains(c)) { const it = S.map.get(c.dataset.p); if (it) openItem(it, c); }
});
document.addEventListener('keydown', e => {
  const tg = e.target, typing = tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable);
  if (e.key === 'Escape') { const md = $('.modal'); if (md) md.close(null); else if (pop) closePop(); else if (!$('#drawer').hidden) closeDrawer(); else if (typing && tg.id === 'q') tg.blur(); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey || $('#app').hidden || $('.modal')) return;
  if (e.key === '/') { e.preventDefault(); const q = $('#q'); if (q) q.focus(); return; }
  const w = WM.act, m = w && w.media;
  if (!m || tg === m) return;
  if (e.key === ' ') { e.preventDefault(); if (m.paused) m.play().catch(() => {}); else m.pause(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); m.currentTime = Math.min((m.duration || 1e9), m.currentTime + 10); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); m.currentTime = Math.max(0, m.currentTime - 10); }
  else if (e.key === 'm' || e.key === 'M') m.muted = !m.muted;
  else if (e.key === 'f' || e.key === 'F') WM.fsWin(w);
});

/* ---------- boot ---------- */
async function startApp(j) {
  S.user = j.acct || ''; S.perms = j.perms || [];
  $('#boot').hidden = false;
  try { await Promise.all([loadLib(), pullState()]); }
  catch (e) { if (e instanceof AuthErr) return showLogin(); }
  $('#boot').hidden = true; $('#app').hidden = false;
  renderTop(); applyLook(); route(); afterLib();
  if (S.indexing) idxT = setTimeout(() => reload(true), 20000);
}
(async () => {
  try { startApp(await ls(ROOT)); }
  catch (e) {
    if (e instanceof AuthErr) showLogin();
    else { $('#boot').innerHTML = '<div class="empty"><div><b>无法连接服务器</b>请确认服务已启动，然后刷新页面</div></div>'; }
  }
})();
})();
