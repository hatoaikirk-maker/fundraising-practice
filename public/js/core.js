/**
 * 前端共用工具：畫元素、呼叫 API、路由、提示、彈窗、格式、內容排版、上傳、簡單圖表
 * ------------------------------------------------------------
 * 資安：整個前端「不用 innerHTML」——所有文字都用 textContent／createTextNode，伺服器回來的東西就算有 <script> 也只會被當成字。
 * 網址只放 http(s) 或本站上傳的 /uploads/…（伺服器也檢查過一次）。
 */
export const $ = (sel, root = document) => root.querySelector(sel);
// 實看修正（結帳頁金額旁邊出現「null」）：append／replaceChildren 收到 null、undefined、false 時直接略過，不要變成字
if (typeof Element !== 'undefined') for (const k of ['append', 'replaceChildren']) { const orig = Element.prototype[k]; Element.prototype[k] = function (...kids) { return orig.apply(this, kids.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false)); }; }

/** 畫一個元素：h('div', { class: 'x', on: { click } }, '文字', 子元素…) */
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'style') Object.assign(el.style, v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'href' || k === 'src') { const s = String(v); if (/^(https?:|\/(?!\/)|#|data:image\/|blob:)/.test(s) || s === '') el.setAttribute(k, s); }   // 只收安全的網址（不收 javascript:、//別的網站）
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat(Infinity)) { if (c === null || c === undefined || c === false) continue; el.append(c instanceof Node ? c : document.createTextNode(String(c))); }
  return el;
}
/** 站內連結（不重新載入整頁） */
export const link = (href, text, cls = '') => h('a', { href, class: cls, on: { click: (e) => { if (e.ctrlKey || e.metaKey || e.button) return; e.preventDefault(); go(href); } } }, text);

// ---------- 狀態 ----------
export const state = { me: null, csrf: '', meta: {}, now: Date.now(), offset: 0 };
/** 伺服器時間（admin 快轉過的） */
export const serverNow = () => Date.now() + state.offset;

// ---------- API ----------
export async function api(path, body, { method } = {}) {
  const m = method || (body === undefined ? 'GET' : 'POST');
  const opt = { method: m, headers: {}, credentials: 'same-origin' };
  if (m !== 'GET') { opt.headers['X-CSRF'] = state.csrf; opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body || {}); }
  let r = await fetch(path, opt);
  if (r.status === 403 && m !== 'GET') { await loadMe(); opt.headers['X-CSRF'] = state.csrf; r = await fetch(path, opt); }   // CSRF 換過（例如登入）：重拿一次再試
  let j = null; try { j = await r.json(); } catch { j = null; }
  if (!r.ok) { const e = new Error((j && j.error) || '連線失敗，請稍後再試'); e.status = r.status; throw e; }
  return j;
}
export async function loadMe() {
  const j = await api('/api/me');
  state.me = j.user; state.csrf = j.csrf; state.meta = j.meta; state.offset = j.now - Date.now(); state.unread = j.unread; state.notices = j.notices; state.demo = j.demo; state.payMode = j.payMode;
  return j;
}
/** 上傳檔案（圖片、GIF、影片；kind=contract 可傳 PDF）→ { url, type } */
export async function upload(file, kind = '') {
  const fd = new FormData(); fd.append('file', file);
  const r = await fetch('/api/upload' + (kind ? '?kind=' + kind : ''), { method: 'POST', headers: { 'X-CSRF': state.csrf }, body: fd, credentials: 'same-origin' });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error((j && j.error) || '上傳失敗');
  return j;
}

// ---------- 路由 ----------
const routes = [];
let notFound = null;
export const route = (pattern, fn) => routes.push({ re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '/?$'), fn });
export const setNotFound = (fn) => { notFound = fn; };
let renderHook = null;
export const onRender = (fn) => { renderHook = fn; };
export function go(href, replace = false) { if (replace) history.replaceState(null, '', href); else history.pushState(null, '', href); render(); }
// 換頁後：網址有 #區塊（例如 /#story）就捲到那個區塊，不然回到最上面
export async function render() {
  const u = new URL(location.href);
  const q = Object.fromEntries(u.searchParams);
  for (const r of routes) { const m = r.re.exec(decodeURIComponent(u.pathname)); if (m) { const view = $('#view'); view.replaceChildren(h('div', { class: 'loading' }, '載入中…')); try { const out = await r.fn({ ...(m.groups || {}) }, q); view.replaceChildren(out); } catch (e) { view.replaceChildren(errorBox(e)); } if (renderHook) renderHook(u.pathname); const anchor = u.hash && document.getElementById(u.hash.slice(1)); if (anchor) anchor.scrollIntoView({ behavior: 'smooth' }); else window.scrollTo(0, 0); return; } }
  $('#view').replaceChildren(notFound ? notFound() : h('p', {}, '找不到'));
}
window.addEventListener('popstate', render);
export function errorBox(e) {
  if (e && e.status === 401) return h('div', { class: 'card center' }, h('h2', {}, '請先登入'), h('p', {}, '這個頁面要登入才能看。'), link('/login?next=' + encodeURIComponent(location.pathname + location.search), '前往登入', 'btn'));
  return h('div', { class: 'card center' }, h('h2', {}, '出了點問題'), h('p', {}, e && e.message ? e.message : String(e)), link('/', '回首頁', 'btn ghost'));
}

// ---------- 提示、彈窗 ----------
export function toast(msg, kind = 'ok') {
  const t = h('div', { class: 'toast ' + kind, role: 'status' }, msg);
  document.body.append(t); setTimeout(() => t.classList.add('show'), 10); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
}
/** 執行一個動作：成功顯示 okMsg、失敗顯示錯誤；回傳結果（失敗回 null） */
export async function act(fn, okMsg = '已儲存') { try { const r = await fn(); if (okMsg) toast(okMsg); return r ?? true; } catch (e) { toast(e.message, 'err'); return null; } }
export function modal(title, body, actions = []) {
  const close = () => wrap.remove();
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'x', 'aria-label': '關閉', on: { click: close } }, '✕')), h('div', { class: 'modal-body' }, body), h('div', { class: 'modal-foot' }, ...actions.map((a) => h('button', { class: 'btn ' + (a.cls || ''), on: { click: async () => { const r = await a.fn(); if (r !== false) close(); } } }, a.text)), h('button', { class: 'btn ghost', on: { click: close } }, '取消')));
  const wrap = h('div', { class: 'modal-wrap', on: { click: (e) => { if (e.target === wrap) close(); } } }, box);
  document.body.append(wrap);
  const f = box.querySelector('input,textarea,select'); if (f) f.focus();
  return { close };
}
/** 問一句話（輸入框） */
export function ask(title, label, { multiline = false, value = '' } = {}) {
  return new Promise((resolve) => {
    const inp = multiline ? h('textarea', { rows: 4 }) : h('input', { type: 'text' }); inp.value = value;
    modal(title, h('label', { class: 'field' }, h('span', {}, label), inp), [{ text: '確定', fn: () => resolve(inp.value.trim()) }]);
  });
}
export const confirmBox = (title, text) => new Promise((resolve) => { const m = modal(title, h('p', {}, text), [{ text: '確定', cls: 'danger', fn: () => resolve(true) }]); m; });

// ---------- 格式 ----------
export const money = (n) => 'NT$ ' + Number(n || 0).toLocaleString('zh-TW');
export const num = (n) => Number(n || 0).toLocaleString('zh-TW');
const pad = (n) => String(n).padStart(2, '0');
/** 台灣時間 YYYY/MM/DD HH:mm */
export function dt(t, withTime = true) { if (!t) return '—'; const d = new Date(t + 8 * 3_600_000); return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}` + (withTime ? ` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : ''); }
/** 給 <input> 用的台灣時間字串 YYYY-MM-DD HH:mm */
export function dtInput(t) { if (!t) return ''; const d = new Date(t + 8 * 3_600_000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; }
export function ago(t) { const s = Math.max(0, (serverNow() - t) / 1000); if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} 分鐘前`; if (s < 86400) return `${Math.floor(s / 3600)} 小時前`; return `${Math.floor(s / 86400)} 天前`; }

// ---------- 表單小元件 ----------
/** 一個欄位：標籤＋輸入框（type：text／number／textarea／select／checkbox） */
export function field(label, input, help = '') { return h('label', { class: 'field' + (input.type === 'checkbox' ? ' check' : '') }, input.type === 'checkbox' ? [input, h('span', {}, label)] : [h('span', {}, label), input], help ? h('small', { class: 'help' }, help) : null); }
export function inp(value = '', props = {}) { const e = h('input', { type: 'text', ...props }); e.value = value ?? ''; return e; }
export function area(value = '', rows = 4, props = {}) { const e = h('textarea', { rows, ...props }); e.value = value ?? ''; return e; }
export function sel(options, value, props = {}) { const e = h('select', props, ...Object.entries(options).map(([k, v]) => h('option', { value: k }, v))); e.value = value ?? ''; return e; }
export function chk(checked, props = {}) { return h('input', { type: 'checkbox', checked, ...props }); }
/** 下載文字檔（CSV） */
export function download(text, filename) { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })), download: filename }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }

// ---------- 內容排版（計畫內容、更新、選項說明共用的簡單語法）----------
// 大標「## 」、小標「### 」、項目「- 」、編號「1. 」、引言「> 」、分隔線「---」、置中「[center]」
// 行內：**粗體**、__底線__、{red}紅字{/red}（green、blue）、[連結文字](網址)、`程式碼`
// 獨立一行：![說明](圖片網址)、@[影片](YouTube／Vimeo／本站上傳的 mp4 網址)
const safeHref = (u) => /^(https?:\/\/|\/uploads\/)/.test(u) ? u : '';
function inline(text) {
  const out = []; const re = /\*\*(.+?)\*\*|__(.+?)__|\{(red|green|blue)\}(.+?)\{\/\3\}|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(h('strong', {}, inline(m[1])));
    else if (m[2]) out.push(h('u', {}, inline(m[2])));
    else if (m[3]) out.push(h('span', { class: 'c-' + m[3] }, inline(m[4])));
    else if (m[5]) { const u = safeHref(m[6]); out.push(u ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer nofollow' }, m[5]) : m[5]); }
    else if (m[7]) out.push(h('code', {}, m[7]));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
/** 影片網址 → 嵌入：YouTube、Vimeo 用官方嵌入；本站上傳的 mp4／webm 用 <video> */
export function videoEmbed(u) {
  const y = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/.exec(u || '');
  if (y) return h('div', { class: 'video' }, h('iframe', { src: `https://www.youtube-nocookie.com/embed/${y[1]}`, title: '影片', allow: 'encrypted-media; picture-in-picture', allowfullscreen: true, loading: 'lazy', referrerpolicy: 'strict-origin-when-cross-origin' }));
  // Vimeo：「不公開連結」的影片網址會帶 h=一串雜湊，少了它播不出來，所以一起帶過去（只收英數，防止塞奇怪參數）
  const v = /vimeo\.com\/(?:video\/)?(\d{5,12})(?:[/?](?:.*?[?&])?h=([a-f0-9]{6,20}))?/.exec(u || '');
  if (v) return h('div', { class: 'video' }, h('iframe', { src: `https://player.vimeo.com/video/${v[1]}${v[2] ? '?h=' + v[2] : ''}`, title: '影片', allowfullscreen: true, loading: 'lazy' }));
  if (/^\/uploads\/[a-f0-9]{32}\.(mp4|webm)$/.test(u || '')) return h('video', { src: u, controls: true, playsinline: true, preload: 'metadata', class: 'media' });
  return null;
}
/** 媒體（圖片／GIF／影片）：選項圖片可以放 GIF 或影片（KIRK：「回饋計畫的圖片，要能放 gif 或影片」） */
export function media(m, cls = 'media') {
  if (!m || !m.url) return null;
  if (m.type === 'video' || /\.(mp4|webm)$/.test(m.url)) return h('video', { src: m.url, class: cls, autoplay: true, muted: true, loop: true, playsinline: true, preload: 'metadata' });
  return h('img', { src: m.url, class: cls, alt: '', loading: 'lazy' });
}
export function markup(src) {
  const root = h('div', { class: 'rich' });
  const lines = String(src || '').split('\n');
  let list = null, code = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (code) { if (line.startsWith('```')) { root.append(h('pre', {}, code.join('\n'))); code = null; } else code.push(raw); continue; }
    if (line.startsWith('```')) { code = []; list = null; continue; }
    const ul = /^[-*] (.*)/.exec(line), ol = /^\d+\. (.*)/.exec(line);
    if (ul || ol) { const t = ul ? 'ul' : 'ol'; if (!list || list.tagName.toLowerCase() !== t) { list = h(t); root.append(list); } list.append(h('li', {}, inline((ul || ol)[1]))); continue; }
    list = null;
    if (!line.trim()) continue;
    let m;
    if ((m = /^### (.*)/.exec(line))) root.append(h('h4', {}, inline(m[1])));
    else if ((m = /^## (.*)/.exec(line))) root.append(h('h3', {}, inline(m[1])));
    else if ((m = /^> (.*)/.exec(line))) root.append(h('blockquote', {}, inline(m[1])));
    else if (line === '---') root.append(h('hr'));
    else if ((m = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(line))) { const u = safeHref(m[2]); if (u) root.append(/\.(mp4|webm)$/.test(u) ? media({ url: u, type: 'video' }) : h('img', { src: u, alt: m[1], loading: 'lazy', class: 'media' })); }
    else if ((m = /^@\[[^\]]*\]\(([^)\s]+)\)$/.exec(line))) { const v = videoEmbed(m[1]); if (v) root.append(v); }
    else if ((m = /^\[center\](.*)/.exec(line))) root.append(h('p', { class: 'tc' }, inline(m[1])));
    else root.append(h('p', {}, inline(line)));
  }
  return root;
}
/** 內容編輯器：工具列（大標、小標、紅綠藍、粗體、底線、清單、分隔線、引言、置中、連結、圖片、影片、程式碼）＋預覽 */
export function editor(value, { rows = 14 } = {}) {
  const ta = area(value, rows, { class: 'mono' });
  const wrapSel = (a, b = a) => { const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value; ta.value = v.slice(0, s) + a + v.slice(s, e) + b + v.slice(e); ta.focus(); ta.selectionStart = s + a.length; ta.selectionEnd = e + a.length; };
  const linePrefix = (p) => { const s = ta.selectionStart, v = ta.value, ls = v.lastIndexOf('\n', s - 1) + 1; ta.value = v.slice(0, ls) + p + v.slice(ls); ta.focus(); };
  const insertLine = (t) => { const s = ta.selectionStart, v = ta.value; ta.value = v.slice(0, s) + (s && v[s - 1] !== '\n' ? '\n' : '') + t + '\n' + v.slice(s); ta.focus(); };
  const preview = h('div', { class: 'preview hidden' });
  const B = (label, fn, title = label) => h('button', { type: 'button', class: 'tool', title, on: { click: fn } }, label);
  const fileIn = h('input', { type: 'file', accept: 'image/*,video/mp4,video/webm', class: 'hidden', on: { change: async () => { const f = fileIn.files[0]; if (!f) return; const r = await act(() => upload(f), '已上傳'); if (r) insertLine(r.type === 'video' ? `@[影片](${r.url})` : `![](${r.url})`); fileIn.value = ''; } } });
  const bar = h('div', { class: 'toolbar' },
    B('大標', () => linePrefix('## ')), B('小標', () => linePrefix('### ')), B('紅', () => wrapSel('{red}', '{/red}')), B('綠', () => wrapSel('{green}', '{/green}')), B('藍', () => wrapSel('{blue}', '{/blue}')),
    B('B', () => wrapSel('**'), '粗體'), B('U', () => wrapSel('__'), '底線'), B('• 清單', () => linePrefix('- ')), B('1. 清單', () => linePrefix('1. ')), B('HR', () => insertLine('---'), '分隔線'), B('引言', () => linePrefix('> ')), B('置中', () => linePrefix('[center]')),
    B('連結', async () => { const u = await ask('插入連結', '網址（https://）'); if (u) wrapSel('[', `](${u})`); }),
    B('圖片網址', async () => { const u = await ask('插入圖片', '圖片網址（https://）'); if (u) insertLine(`![](${u})`); }),
    B('上傳圖片／影片', () => fileIn.click()),
    B('影片', async () => { const u = await ask('插入影片', 'YouTube／Vimeo 網址'); if (u) insertLine(`@[影片](${u})`); }),
    B('程式碼', () => wrapSel('`')),
    B('預覽', () => { const on = preview.classList.toggle('hidden'); ta.classList.toggle('hidden', !on); if (!on) preview.replaceChildren(markup(ta.value)); }), fileIn);
  const el = h('div', { class: 'editor' }, bar, ta, preview);
  el.getValue = () => ta.value; el.textarea = ta;
  return el;
}
/** 單一媒體欄位（封面照、SEO 圖）：網址＋上傳鈕＋預覽 */
export function mediaInput(value, { accept = 'image/*' } = {}) {
  const url = inp(value, { placeholder: '/uploads/… 或 https://' });
  const pv = h('div', { class: 'mi-pv' });
  const show = () => pv.replaceChildren(url.value ? media({ url: url.value, type: /\.(mp4|webm)$/.test(url.value) ? 'video' : 'image' }, 'thumb') : '');
  const fileIn = h('input', { type: 'file', accept, on: { change: async () => { const f = fileIn.files[0]; if (!f) return; const r = await act(() => upload(f), '已上傳'); if (r) { url.value = r.url; show(); } } } });
  url.addEventListener('change', show); show();
  const el = h('div', { class: 'media-input' }, url, fileIn, pv); el.getValue = () => url.value.trim(); return el;
}

// ---------- 簡單圖表（純 DOM，不用外部套件）----------
export function bars(list, { unit = '' } = {}) {
  const max = Math.max(1, ...list.map((x) => x.n));
  return h('div', { class: 'bars' }, list.length ? list.map((x) => h('div', { class: 'bar-row' }, h('span', { class: 'bar-l' }, x.name), h('span', { class: 'bar-t' }, h('i', { style: { width: (x.n / max) * 100 + '%' } })), h('span', { class: 'bar-n' }, num(x.n) + unit))) : h('p', { class: 'muted' }, '還沒有資料'));
}
export function lineChart(points, key = 'cum') {
  if (!points.length) return h('p', { class: 'muted' }, '還沒有資料');
  const W = 600, H = 180, max = Math.max(1, ...points.map((p) => p[key]));
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H + 24}`); svg.setAttribute('class', 'chart');
  const xy = points.map((p, i) => [points.length === 1 ? W / 2 : (i / (points.length - 1)) * (W - 20) + 10, H - (p[key] / max) * (H - 20) + 10]);
  const path = document.createElementNS(ns, 'polyline'); path.setAttribute('points', xy.map((a) => a.join(',')).join(' ')); path.setAttribute('class', 'line'); svg.append(path);
  for (const [i, [x, y]] of xy.entries()) { const c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 3); const t = document.createElementNS(ns, 'title'); t.textContent = `${points[i].day}：${num(points[i][key])}`; c.append(t); svg.append(c); }
  const l0 = document.createElementNS(ns, 'text'); l0.setAttribute('x', 10); l0.setAttribute('y', H + 20); l0.textContent = points[0].day; svg.append(l0);
  const l1 = document.createElementNS(ns, 'text'); l1.setAttribute('x', W - 10); l1.setAttribute('y', H + 20); l1.setAttribute('text-anchor', 'end'); l1.textContent = points[points.length - 1].day; svg.append(l1);
  return svg;
}
/** 表格 */
export function table(head, rows, empty = '沒有資料') { return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, head.map((x) => h('th', {}, x)))), h('tbody', {}, rows.length ? rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, c)))) : h('tr', {}, h('td', { colspan: head.length, class: 'muted center' }, empty))))); }
export const badge = (text, kind = '') => h('span', { class: 'badge ' + kind }, text);
