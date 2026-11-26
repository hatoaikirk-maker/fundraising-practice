/**
 * 把「嘖嘖提案者後台」匯出的 4 個真實計畫，轉成練習平台的範例資料（lib/zeczec_projects.json）
 * ------------------------------------------------------------
 * 用法：node tools/convert_zeczec.mjs <zeczec_export.json 的路徑>
 *
 * 匯出檔的格式（KIRK 用 Chrome 在自己的提案者後台「只讀」抓下來的）：
 *   [{ slug, f: { 'project[title]': …, … },  content: 已轉好的練習平台文字格式, cover: 封面網址,
 *      opts: [{ id, img: 回饋圖片網址, taken: 已被認領數, f: { 'option[name]': …, … } }], pubFaq: [公開常見問答文字…], stats: [...] }]
 *   - 下拉選單的值是「顯示文字|值」，例如 '群眾集資|Sprint'
 *   - 勾選框沒勾是 '0' 或沒有這個欄位；有勾是 ['0','1']（Rails 的 hidden＋checkbox）或 '1'
 *
 * 轉出來的只有「計畫內容」（文案、圖片網址、回饋、FAQ），沒有任何贊助人的個資；
 * 人數、金額由 seed.js 用虛構的贊助人重新產生（只對得上公開頁面看得到的數字）。
 * 圖片不下載，直接用 assets.zeczec.com 的公開網址（CSP 的 img-src 已允許 https:）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) { console.error('用法：node tools/convert_zeczec.mjs <zeczec_export.json>'); process.exit(1); }
const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
if (!Array.isArray(raw)) throw new Error('格式不對：最外層要是陣列');

// ---------- 小工具 ----------
/** 下拉選單：「顯示文字|值」→ 取值（沒有 | 就整串） */
const val = (v) => { if (Array.isArray(v)) v = v[v.length - 1]; v = String(v ?? ''); const i = v.lastIndexOf('|'); return i >= 0 ? v.slice(i + 1) : v; };
/** 勾選框：['0','1'] 或 '1' 算有勾 */
const checked = (v) => Array.isArray(v) ? v.includes('1') : v === '1';
/** 正整數（不是數字回 0） */
const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
/** 只收 https 網址（防止匯出檔被動過手腳塞 javascript: 之類） */
const https = (u) => { try { const x = new URL(String(u || '')); return x.protocol === 'https:' ? x.href : ''; } catch { return ''; } };
/** 'YYYY-MM-DD HH:mm'（台灣時間）→ 毫秒 */
const twTime = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(String(s || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 8 * 3_600_000 : 0; };

// 嘖嘖的值 → 練習平台的值
const TYPE = { Sprint: 'crowd', Preorder: 'preorder', Subscription: 'subscription' };
const INVOICE = { einvoice: 'cloud', paper: 'paper' };
const ORDER = { desc: 'priceDesc', asc: 'priceAsc' };
const STORE = { '01': '711', '02': 'family', '03': 'hilife' };   // 嘖嘖超商代碼（01＝7-11）
const SLUG = { moga: 'moga', Sihu: 'sihu', Hsu: 'hsu', PRAY: 'pray' }; // 練習平台網址代稱只收小寫

/**
 * 內容清理：
 * - 拿掉 ![](null)（嘖嘖上傳失敗的空圖）、空的「## 」標題
 * - 拿掉 countdownmail 的倒數 GIF：那是第三方伺服器即時畫的「真實」倒數，跟練習平台的模擬時鐘對不上，而且每次載入都會打到外部服務
 * - 圖片／影片網址只留 https
 */
function cleanContent(c) {
  return String(c || '').split('\n').filter((l) => {
    if (/^!\[[^\]]*\]\(null\)\s*$/.test(l)) return false;
    if (/^#{2,3}\s*$/.test(l)) return false;
    if (/countdownmail\.com/.test(l)) return false;
    const m = /^[!@]\[[^\]]*\]\(([^)]*)\)\s*$/.exec(l);
    if (m && !https(m[1])) return false;
    return true;
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** 公開常見問答：「更新於 2026/11/13 13:34 (UTC+8) 修改 刪除 問題？ 答案」→ { q, a } */
function parseFaq(s) {
  const body = String(s).replace(/^更新於 .*?\(UTC\+8\)\s*(修改\s*刪除\s*)?/, '').trim();
  // 問題可能是兩句（「什麼是定期定額？我會被扣幾次款？」），所以取「第一個句號之前、最後一個問號」當分界
  const dot = body.search(/[。！]/), head = dot < 0 ? body : body.slice(0, dot);
  const i = Math.max(head.lastIndexOf('？'), head.lastIndexOf('?'));
  if (i < 0) return null;
  const q = body.slice(0, i + 1).trim(), a = body.slice(i + 1).trim();
  return q && a ? { q, a } : null;
}

/** 回饋調查：option[survey_questions_attributes][n][…] → [{ q, type, required, choices }]（依 n 排序） */
function parseSurvey(f) {
  const by = new Map();
  for (const [k, v] of Object.entries(f)) {
    const m = /^option\[survey_questions_attributes\]\[(\d+)\]\[(\w+)\](\[\])?$/.exec(k);
    if (!m) continue;
    const n = +m[1]; if (!by.has(n)) by.set(n, {});
    by.get(n)[m[2]] = v;
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([, x]) => {
    const type = val(x.question_type) === 'select' ? 'choice' : 'text';
    const choices = type === 'choice' ? [].concat(x.options || []).map((c) => String(c).trim().slice(0, 40)).filter(Boolean) : [];
    return { q: String(x.title || '').trim().slice(0, 100), type, required: checked(x.is_required), choices };
  }).filter((s) => s.q && (s.type === 'text' || s.choices.length >= 2));
}

/** 運費：25 國，空白＝不寄送 */
function parseShipping(f) {
  const s = {};
  for (const [k, v] of Object.entries(f)) { const m = /^option\[shipping_options\[([A-Z]+)\]\]$/.exec(k); if (m) s[m[1]] = v === '' ? '' : Number(v) || 0; }
  return s;
}

const out = raw.map((p) => {
  const F = p.f || {};
  const g = (k) => F[`project[${k}]`];
  const type = F['project[type]'] ? (TYPE[val(g('type'))] || 'crowd') : 'subscription';   // 訂閱式的後台沒有「類型」欄位
  const options = (p.opts || []).map((o, i) => {
    const f = o.f || {};
    const y = val(f['option[expected(1i)]']), mo = val(f['option[expected(2i)]']);
    const img = https(o.img);
    return {
      zeczecId: o.id, taken: num(o.taken),
      name: String(f['option[name]'] || '').trim(), seoName: String(f['option[seo_name]'] || ''),
      price: num(f['option[price_amount]']), retail: num(f['option[retail_price_amount]']), limit: num(f['option[limit]']),
      atm: checked(f['option[is_atmable]']), installment: [3, 6].includes(num(val(f['option[newebpay]']))) ? num(val(f['option[newebpay]'])) : 0,
      coupon: checked(f['option[coupon]']),
      media: img ? [{ url: img, type: /\.(mp4|webm)(\?|$)/.test(img) ? 'video' : 'image' }] : [],
      description: String(f['option[description]'] || ''),
      shipMonth: /^\d{4}$/.test(y) && /^\d{1,2}$/.test(mo) ? `${y}-${mo.padStart(2, '0')}` : '',
      hasNote: checked(f['option[has_note]']), noteRequired: checked(f['option[note_required]']), code: String(f['option[code]'] || ''),
      survey: parseSurvey(f), shipping: parseShipping(f),
      stores: [].concat(f['option[shippable_stores][]'] || []).map((s) => STORE[s]).filter(Boolean),
      noteToBacker: String(f['option[note_to_backer]'] || ''), sort: i + 1,
    };
  });
  // 公開頁面的數字（目標、累計、人數），seed 用來對齊虛構訂單
  const statTxt = (p.stats || []).join('\n');
  const pick = (re) => { const m = re.exec(statTxt); return m ? num(m[1]) : 0; };
  return {
    slug: SLUG[p.slug] || String(p.slug).toLowerCase(), zeczecSlug: p.slug, type,
    title: String(g('title') || ''), description: String(g('description') || ''), content: cleanContent(p.content),
    cover: https(p.cover), video: https(g('video_url')),
    goal: num(g('goal')), startAt: twTime(g('start_time')), endAt: twTime(g('end_time')),
    category: String(val(g('category_id')) && String(g('category_id')).split('|')[0] || '社會'),
    ageLimit: val(g('age_restriction')) ? 18 : 0, origin: 'none',
    contact: String(g('contact') || ''), risk: String(g('risk_description') || ''), returns: String(g('return_description') || ''),
    ga: String(g('ga_account') || ''), pixel: String(g('facebook_pixel_id') || ''),
    invoiceFormat: INVOICE[val(g('invoice_format'))] || 'none', bsmi: String(g('specs_bsmi') || ''), ncc: String(g('specs_ncc') || ''),
    optionOrder: ORDER[g('order_of_options')] || 'custom',
    faqs: (p.pubFaq || []).map(parseFaq).filter(Boolean),
    publicStats: { goal: pick(/目標 NT\$ ([\d,]+)/), raised: pick(/累計集資金額 NT\$ ([\d,]+)/), backers: pick(/(\d[\d,]*) 人/) },
    options,
  };
});

const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'zeczec_projects.json');
fs.writeFileSync(dest, JSON.stringify({ exportedAt: '2026-11-26', note: '從嘖嘖公開頁面與提案者後台（只讀）轉出的計畫內容；不含任何贊助人資料。', projects: out }, null, 1));
for (const p of out) console.log(`${p.slug}：${p.title}｜${p.type}｜回饋 ${p.options.length}｜FAQ ${p.faqs.length}｜內容 ${p.content.length} 字｜公開數字`, p.publicStats);
console.log('寫好了：', dest);
