/**
 * 練習用的範例資料（第一次啟動、或 admin 按「重置練習資料」時用）
 * ------------------------------------------------------------
 * 帳號（密碼都是練習用的，寫在 README；正式上線前一定要換掉或停用）：
 *   平台管理員 admin@demo.local／專案經理 pm@demo.local／提案人 creator@demo.local／贊助人 backer1～backer6@demo.local
 * 計畫：五個宮廟募資範例，涵蓋各種狀態（募資中、已成功、未達標、訂閱式、審核中的草稿），新人每一種情境都練得到。
 * 名字、金額都是虛構的範例，不是真實訂單。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { hashPassword } from './security.js';
import { DAY, DEFAULT_SETTINGS, atmDeadline, COUNTRIES } from './rules.js';

export const DEMO_PASSWORD = 'Demo1234';

/** 固定亂數（每次重置得到一樣的範例，教學時大家看到同一份） */
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function seed(now = Date.now(), opts = { demo: true }) {
  const demo = !!opts.demo;
  const R = rng(20261126);
  const d = { meta: { seq: {}, version: 1, clockOffset: 0, seededAt: now }, settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) };
  const T = {};
  const id = (t) => { d.meta.seq[t] = (d.meta.seq[t] || 0) + 1; return d.meta.seq[t]; };
  const add = (t, row) => { (d[t] = d[t] || []).push(row); return row; };
  const tok = () => crypto.randomBytes(5).toString('hex').toUpperCase();
  const pw = hashPassword(DEMO_PASSWORD);

  // ---------- 帳號 ----------
  const user = (email, name, role = 'member', extra = {}) => add('users', { id: id('users'), email, name, realName: name, pass: pw, role, banned: false, createdAt: now - 200 * DAY, slug: email.split('@')[0], avatar: '', gender: '', birthday: '', from: '台灣', fb: '', ig: '', yt: '', web: '', bio: '', notify: true, newsletter: false, ...extra });
  const admin = user('admin@demo.local', '平台管理員', 'admin');
  const pm = user('pm@demo.local', '專案經理小陳', 'staff');
  const creator = user('creator@demo.local', '麥睿示範提案人', 'member', { bio: '宮廟募資示範帳號：所有範例計畫都是這個帳號提的。' });
  const backers = ['王小明', '林美玲', '陳志豪', '黃淑芬', '張家豪', '李雅婷'].map((n, i) => user(`backer${i + 1}@demo.local`, n));
  T.users = { admin, pm, creator, backers };

  // ---------- 計畫 ----------
  const steps = (all) => ({ biz: all, plan: all, contract: all, gateway: all, ready: all });
  const proj = (o) => add('projects', {
    id: id('projects'), ownerId: creator.id, managerId: pm.id, type: 'crowd', category: '社會', ageLimit: 0, origin: 'tw', cover: '', video: '',
    description: '', content: '', contact: '客服信箱：service@demo.local（練習用）', risk: '工程進度可能因天候延後，延後時會在計畫更新公告。', returns: '回饋品如有瑕疵，收到後 7 日內聯繫客服更換。',
    afteeNote: '', ga: '', pixel: '', gCat: '', invoiceFormat: 'none', bsmi: '', ncc: '', optionOrder: 'custom', featured: false, staffPick: false,
    paymentMethods: { credit: true, atm: true, aftee: false }, abandon: { subject: '', preheader: '', title: '', subtitle: '', cta: '', features: ['', '', ''], enabled: false, couponId: 0 },
    createdAt: now - 60 * DAY, stepNotes: {}, ...o });
  const P = {};
  P.moga = proj({ slug: 'demo-light-wall', title: '大北門媽祖・光明燈牆護持計畫（範例）', description: '為廟宇設置一面光明燈牆，邊募邊做，力拚農曆年前點亮。', goal: 600000, startAt: now - 10 * DAY, endAt: now + 50 * DAY, status: 'live', steps: steps('ok'), featured: false, staffPick: true,
    content: '## 為什麼要做光明燈牆\n廟裡的光明燈已經用了三十年，燈座老舊、電線外露。\n\n**這次募資**會把整面燈牆換成 LED，並刻上護持者的名字。\n\n### 經費怎麼用\n- 燈牆主體與 LED 燈具\n- 供電配線與安全檢查\n- 刻名牌面\n\n> 達標才收款，沒達標全額退回。' });
  P.burner = proj({ slug: 'demo-eco-burner', title: '義民廟環保金爐（範例）', description: '換一座環保金爐，燒金不再嗆鼻，也讓鄰居安心。', goal: 300000, startAt: now - 40 * DAY, endAt: now - 2 * DAY, status: 'success', steps: steps('ok'), category: '地方創生',
    content: '## 環保金爐\n傳統金爐黑煙多，新的環保金爐有集塵設備。\n\n- 集塵、降溫\n- 定期維護' });
  P.repair = proj({ slug: 'demo-roof-repair', title: '福興宮屋頂修繕（範例）', description: '兩百年老廟的屋頂漏水，需要大家一起來補。', goal: 2000000, startAt: now - 50 * DAY, endAt: now - 5 * DAY, status: 'failed', steps: steps('ok'), category: '空間',
    content: '## 屋頂漏水\n雨季一來，正殿就要擺臉盆接水。' });
  P.sub = proj({ slug: 'demo-monthly-lamp', title: '每月點一盞平安燈（訂閱式範例）', description: '每個月幫你和家人點一盞平安燈，廟方每月寄送祈福小卡。', goal: 30000, type: 'subscription', startAt: now - 20 * DAY, endAt: 0, status: 'live', steps: steps('ok'), category: '社會',
    content: '## 每月一盞燈\n訂閱後每個月自動扣款，可以隨時在「贊助紀錄」取消。' });
  P.preorder = proj({ slug: 'demo-paper-craft', title: '廟宇立體紙雕便箋（預購式範例）', description: '翻開便箋，廟就立起來。', goal: 100000, type: 'preorder', startAt: now - 5 * DAY, endAt: now + 30 * DAY, status: 'live', steps: steps('ok'), category: '設計', invoiceFormat: 'cloud',
    content: '## 立體紙雕\n每一本都是雷射切割，翻開就是一座廟。' });
  P.draft = proj({ slug: 'demo-draft-review', title: '我的第一個計畫（審核練習用）', description: '這是一個還在審核中的計畫，給新同事練習送審、審核。', goal: 200000, startAt: now + 14 * DAY, endAt: now + 54 * DAY, status: 'reviewing',
    steps: { biz: 'pending', plan: 'todo', contract: 'todo', gateway: 'todo', ready: 'todo' }, content: '## 計畫內容\n請練習把這裡寫完整。', managerId: pm.id });
  T.projects = P;

  // ---------- 回饋選項 ----------
  const ship = (tw = 0) => { const s = {}; for (const k of Object.keys(COUNTRIES)) s[k] = ''; s.TW = tw; s.TWI = tw + 100; s.HK = 300; s.MO = 300; return s; };
  const opt = (p, o) => add('options', { id: id('options'), projectId: p.id, name: '', seoName: '', price: 1000, retail: 0, limit: 0, addonOnly: false, atm: true, installment: 0, coupon: true, media: [], seoImage: '', description: '', shipMonth: '2027-03', hasNote: false, noteRequired: false, code: '', survey: [], shipping: ship(0), stores: ['711', 'family'], noteToBacker: '感謝護持！祈福名單會在結案後彙整。', sort: 0, createdAt: now - 30 * DAY, ...o });
  const O = {};
  O.m1 = opt(P.moga, { name: '隨喜功德', price: 1000, sort: 1, description: '心意用於光明燈牆。\n【護持加碼】祈福牆登錄＋祈福敲鐘 49 響', hasNote: true, survey: [{ q: '祈福姓名', type: 'text', required: true, choices: [] }, { q: '鐘別', type: 'choice', required: true, choices: ['平安', '好運', '光明'] }] });
  O.m2 = opt(P.moga, { name: '光明小夜燈', price: 1800, sort: 2, limit: 200, description: '把媽祖的光帶回家。\n● 光明小夜燈（過火祈福）', installment: 3 });
  O.m3 = opt(P.moga, { name: '大功德主', price: 30000, sort: 3, limit: 20, atm: false, installment: 6, description: '芳名永刻芳名錄 5 位・敬奉功德主', hasNote: true, noteRequired: true });
  O.m4 = opt(P.moga, { name: '加購・平安小卡', price: 200, sort: 4, addonOnly: true, description: '過火平安小卡一張' });
  O.m5 = opt(P.moga, { name: '親友限定・早鳥價', price: 800, sort: 5, code: 'VIP2027', limit: 30, description: '輸入隱藏密碼才看得到的方案' });
  O.b1 = opt(P.burner, { name: '環保金爐護持', price: 1500, sort: 1, description: '芳名刻在金爐旁' });
  O.b2 = opt(P.burner, { name: '金爐功德主', price: 10000, sort: 2, description: '金爐銘板列名' });
  O.r1 = opt(P.repair, { name: '補一片瓦', price: 600, sort: 1 });
  O.r2 = opt(P.repair, { name: '屋頂功德主', price: 50000, sort: 2 });
  O.s1 = opt(P.sub, { name: '每月平安燈', price: 300, sort: 1, description: '每月點燈一盞＋祈福小卡', stores: [] });
  O.p1 = opt(P.preorder, { name: '紙雕便箋單入', price: 590, retail: 790, sort: 1, limit: 500 });
  O.p2 = opt(P.preorder, { name: '紙雕便箋三入組', price: 1590, retail: 2370, sort: 2 });
  O.d1 = opt(P.draft, { name: '練習方案', price: 1000, sort: 1 });

  // ---------- FAQ、更新、折扣碼、推薦連結 ----------
  const faq = (p, q, a, priority) => add('faqs', { id: id('faqs'), projectId: p.id, q, a, priority, createdAt: now - 20 * DAY });
  faq(P.moga, '沒有達到募資目標會怎麼樣？', '達標才收款；沒達標全額退回。', 1);
  faq(P.moga, '可以開立捐款收據嗎？', '本計畫為回饋型募資，無法開立捐款收據。', 2);
  faq(P.moga, '更改、取消或退款？', '募資期間可在「贊助紀錄」自行取消；結束後請在贊助紀錄申請退款。', 3);
  add('updates', { id: id('updates'), projectId: P.moga.id, title: '感謝第一週的護持！', category: '進度報告', cover: '', notify: true, private: false, audience: [], content: '第一週就達成 30%，感謝大家！', status: 'published', publishedAt: now - 3 * DAY, createdAt: now - 3 * DAY });
  add('updates', { id: id('updates'), projectId: P.moga.id, title: '贊助人限定：燈牆設計圖', category: '其他', cover: '', notify: true, private: true, audience: [], content: '設計圖初稿出來了，只給贊助人先看。', status: 'published', publishedAt: now - DAY, createdAt: now - DAY });
  add('coupons', { id: id('coupons'), projectId: P.moga.id, code: 'LIGHT100', amount: 100, from: now - 10 * DAY, until: now + 40 * DAY, note: '粉專活動', promotional: true, createdAt: now - 10 * DAY });
  for (const [name, partner, aud] of [['FB 粉專貼文', '', 5000], ['LINE 群組', '', 800], ['合作 KOL', '某某部落客', 20000]]) add('referrers', { id: id('referrers'), projectId: P.moga.id, code: tok().toLowerCase(), name, partner, audience: aud, createdAt: now - 9 * DAY });

  // ---------- 訂單（範例）----------
  const refs = d.referrers;
  const order = (p, u, items, o = {}) => {
    const created = o.createdAt ?? now - Math.floor(R() * 9 + 1) * DAY;
    const sub = items.reduce((s, it) => s + it.price * it.qty, 0);
    const total = sub + (o.bonus || 0) + (o.shippingFee || 0) - (o.discount || 0);
    return add('orders', { id: id('orders'), token: tok(), projectId: p.id, userId: u.id, items, bonus: o.bonus || 0, coupon: o.coupon || '', discount: o.discount || 0, region: 'TW', delivery: 'home', shippingFee: o.shippingFee || 0, total,
      payMethod: o.payMethod || 'credit', installments: 0, status: o.status || 'paid', atmAccount: '', atmDeadline: 0,
      recipient: { name: u.name, phone: '0912345678', email: u.email, zip: '100', city: '台北市', district: '中正區', address: '練習路 1 號', country: 'TW' }, store: null,
      survey: o.survey || [], note: o.note || '', invoice: { type: 'cloud', carrier: '', ubn: '', title: '' }, referrer: o.referrer || '', createdAt: created, paidAt: (o.status || 'paid') === 'paid' ? created + 60_000 : 0, shipped: null, sub: o.sub || null });
  };
  const it = (opt, qty = 1) => ({ optionId: opt.id, name: opt.name, price: opt.price, qty });
  backers.forEach((u, i) => {
    order(P.moga, u, [it(O.m1, 1 + (i % 2))], { survey: [{ q: '祈福姓名', a: u.name }, { q: '鐘別', a: ['平安', '好運', '光明'][i % 3] }], referrer: refs[i % refs.length].code, payMethod: ['credit', 'atm', 'credit'][i % 3] });
    if (i < 3) order(P.moga, u, [it(O.m2)], { bonus: i * 100 });
    order(P.burner, u, [it(i % 2 ? O.b2 : O.b1)], { createdAt: now - (30 - i) * DAY });
    order(P.repair, u, [it(O.r1, 2)], { createdAt: now - (40 - i) * DAY, status: 'refunded' });
    if (i < 4) order(P.preorder, u, [it(i % 2 ? O.p2 : O.p1)], { createdAt: now - (4 - i) * DAY });
    if (i < 3) order(P.sub, u, [it(O.s1)], { createdAt: now - (15 - i) * DAY, sub: { active: true, period: 1, nextAt: now - (15 - i) * DAY + 30 * DAY } });
  });
  // 一筆還沒付款的 ATM 訂單（練習「待付款、逾期」）
  const atmOrder = order(P.moga, backers[5], [it(O.m1)], { status: 'pending', payMethod: 'atm', createdAt: now - 3_600_000 });
  atmOrder.atmAccount = '9910' + String(atmOrder.id).padStart(10, '0'); atmOrder.atmDeadline = atmDeadline(atmOrder.createdAt);
  // 一筆退款申請（練習審退款）
  const ro = d.orders.find((o) => o.projectId === P.burner.id);
  add('refunds', { id: id('refunds'), token: tok(), orderId: ro.id, reason: '重複下單，想退一筆。', status: 'pending', note: '', createdAt: now - DAY });

  // 撥款：不用先建，伺服器每次巡檢（tick）會幫「已成功、還沒排撥款」的計畫自動算好、排程

  // ---------- 留言、追蹤、站內訊息、檢舉 ----------
  add('comments', { id: id('comments'), projectId: P.moga.id, userId: backers[0].id, body: '已護持！希望年前就能點亮。', parentId: 0, hidden: false, createdAt: now - 4 * DAY });
  add('comments', { id: id('comments'), projectId: P.moga.id, userId: creator.id, body: '謝謝您！我們會在計畫更新報告進度。', parentId: d.comments[0].id, hidden: false, createdAt: now - 4 * DAY + 3_600_000 });
  add('comments', { id: id('comments'), projectId: P.moga.id, userId: backers[3].id, body: '請問可以寄到香港嗎？', parentId: 0, hidden: false, createdAt: now - DAY });
  for (const u of backers.slice(0, 4)) add('follows', { id: id('follows'), userId: u.id, projectId: P.moga.id, createdAt: now - 5 * DAY });
  add('messages', { id: id('messages'), fromId: backers[1].id, toId: creator.id, projectId: P.moga.id, body: '您好，請問小夜燈的尺寸是多大？', read: false, createdAt: now - 2 * DAY });
  add('reports', { id: id('reports'), kind: 'comment', targetId: d.comments[2].id, userId: backers[4].id, reason: '這則留言疑似廣告（練習用檢舉）', status: 'open', note: '', createdAt: now - DAY });

  // ---------- 嘖嘖真實計畫（KIRK：「前台，你直接把我們現在嘖嘖的前台，移植過去，包含照片文案等等的」）----------
  portZeczec({ d, now, R, id, add, tok, creator, pm, P, proj, opt, faq, it, steps });

  // ---------- 商業檔案、金流、合約 ----------
  for (const p of Object.values(P)) {
    const ok = p.status !== 'reviewing';
    add('businessProfiles', { id: id('businessProfiles'), projectId: p.id, kind: 'company', companyName: '麥睿示範股份有限公司', ubn: '12345675', capital: '1000000', incorporated: '2020-01-01', fullname: '王大明', firstnameEn: 'Da Ming', lastnameEn: 'Wang', birthday: '1980-01-01', mobile: '0912345678', idType: 'idcard', idNumber: 'A123456789', idIssued: '2015-01-01', idIssueKind: '換發', idPhoto: '有', idPlace: '北市', phone: '02-12345678', city: '台北市', district: '中正區', zip: '100', address: '練習路 1 號', regAddress: '練習路 1 號', bankName: '麥睿示範股份有限公司', bankCode: '812', bankBranch: '0012', bankAccount: '00012345678901', status: ok ? 'approved' : 'pending', note: '', createdAt: now - 50 * DAY });
    add('paymentApps', { id: id('paymentApps'), projectId: p.id, methods: { credit: true, atm: true, aftee: false }, providers: [{ name: '藍新金流', methods: '信用卡', status: ok ? 'approved' : 'draft' }, { name: '統一金流', methods: 'ATM 轉帳', status: ok ? 'approved' : 'draft' }, { name: 'AFTEE', methods: '先享後付', status: 'draft' }], createdAt: now - 50 * DAY });
    if (ok) add('contracts', { id: id('contracts'), projectId: p.id, file: '', status: 'approved', createdAt: now - 45 * DAY });
  }

  if (demo) add('notices', { id: id('notices'), title: '測試模式', body: '目前是測試模式：測試帳號、測試計畫、假金流。', createdAt: now });
  add('audit', { id: id('audit'), at: now, actorId: admin.id, action: 'seed', target: 'all', detail: '建立範例資料' });
  if (!demo) prodOnly(d, { admin, creator, opts, now });
  return d;
}

/**
 * 正式模式：只留從嘖嘖搬過來的真實計畫；測試計畫、測試帳號、測試訂單全部拿掉
 * - 管理員：帳號密碼來自環境變數（app.js 傳進來）
 * - 計畫擁有者：「人生地圖」帳號，沒有密碼（不能登入，計畫由平台人員管理）
 * - 虛構贊助人（fan*）留著，讓人數、金額跟嘖嘖公開頁一樣
 */
function prodOnly(d, { admin, creator, opts }) {
  const keep = new Set(d.projects.filter((p) => p.ported).map((p) => p.id));
  for (const t of ['options', 'faqs', 'updates', 'coupons', 'referrers', 'orders', 'comments', 'follows', 'messages', 'businessProfiles', 'paymentApps', 'contracts']) d[t] = (d[t] || []).filter((r) => keep.has(r.projectId));
  d.projects = d.projects.filter((p) => keep.has(p.id));
  const orderIds = new Set(d.orders.map((o) => o.id));
  d.refunds = (d.refunds || []).filter((r) => orderIds.has(r.orderId));
  d.reports = []; d.notices = []; d.emails = []; d.audit = [];
  d.settings.testPayment = true;   // KIRK：先用測試金流（不扣款）；真的金流串好前，管理員到「平台設定」關掉
  Object.assign(admin, { email: opts.adminEmail, name: '人生地圖管理員', realName: '', pass: hashPassword(opts.adminPassword), slug: 'admin', from: '' });
  Object.assign(creator, { email: 'lifemap@lifemap.local', name: '人生地圖', realName: '麥睿資訊股份有限公司', pass: '', slug: 'lifemap', from: '台灣', bio: '人生地圖：陪在地廟宇把香火與文化，帶給更多人。' });
  d.users = d.users.filter((u) => u === admin || u === creator || u.fake);
  for (const p of d.projects) p.managerId = admin.id;
  // 商業檔案：拿掉測試用的身分證、銀行帳號，只留公司名稱（真的資料由管理員在後台補）
  for (const b of d.businessProfiles) for (const k of Object.keys(b)) if (!['id', 'projectId', 'kind', 'status', 'createdAt', 'note'].includes(k)) b[k] = k === 'companyName' || k === 'bankName' ? '麥睿資訊股份有限公司' : '';
}

// =====================================================================
// 嘖嘖真實計畫移植
// ---------------------------------------------------------------------
// 內容（標題、文案、圖片、影片、回饋、FAQ）來自 lib/zeczec_projects.json（tools/convert_zeczec.mjs 從嘖嘖轉出）。
// 圖片直接用 assets.zeczec.com 的公開網址，不下載。
// 贊助人、訂單全部是「虛構」的：只讓前台看到的人數、金額、各回饋已認領數跟嘖嘖公開頁面對得上，沒有任何真實贊助人資料。
// 時間：以匯出那天（2026/11/26）為基準，平移到人生地圖募資「現在」——什麼時候重置，計畫都還是一樣的進度。
// =====================================================================
const ZZ_FILE = new URL('./zeczec_projects.json', import.meta.url);
const ZZ_REF = Date.UTC(2026, 10, 26, 6, 0);   // 2026/11/26 14:00（台灣）
const SURNAMES = '陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴周徐蘇葉莊呂江何蕭羅高';
const GIVEN = '志明,淑芬,家豪,雅婷,俊傑,怡君,冠宇,佳穎,承恩,宜蓁,建宏,美惠,宗翰,欣怡,柏翰,詩涵,文雄,秀英,振宇,佩珊,國華,麗華,子軒,思妤,明德,玉珍'.split(',');

function portZeczec({ d, now, R, id, add, tok, P, proj, opt, faq, steps }) {
  let src;
  try { src = JSON.parse(fs.readFileSync(ZZ_FILE, 'utf8')).projects; } catch { return; }   // 檔案不在（例如有人刪掉）就只用原本的範例
  if (!Array.isArray(src)) return;
  const shift = (t) => (t ? t - ZZ_REF + now : 0);
  const pick = (a) => a[Math.floor(R() * a.length)];

  // 虛構贊助人：fan1～fanN@demo.local，沒有密碼（pass 空字串＝永遠登入不了，只是用來撐人數）
  const fans = [];
  const fan = (i) => {
    while (fans.length <= i) {
      const n = fans.length + 1;
      fans.push(add('users', { id: id('users'), email: `fan${n}@demo.local`, name: pick(SURNAMES) + pick(GIVEN), realName: '', pass: '', role: 'member', banned: false, createdAt: now - 300 * DAY, slug: 'fan' + n,
        avatar: '', gender: '', birthday: '', from: '台灣', fb: '', ig: '', yt: '', web: '', bio: '', notify: false, newsletter: false, fake: true }));
    }
    return fans[i];
  };

  for (const z of src) {
    const sub = z.type === 'subscription';
    const startAt = shift(z.startAt), endAt = sub ? 0 : shift(z.endAt);
    const p = proj({
      slug: z.slug, title: z.title, description: z.description, content: z.content, cover: z.cover, video: z.video,
      goal: z.goal || 0, type: z.type, startAt, endAt, status: 'live', steps: steps('ok'), category: z.category || '社會',
      ageLimit: z.ageLimit || 0, origin: z.origin || 'none', contact: z.contact, risk: z.risk, returns: z.returns,
      ga: z.ga, pixel: z.pixel, invoiceFormat: z.invoiceFormat, bsmi: z.bsmi, ncc: z.ncc, optionOrder: z.optionOrder,
      featured: z.slug === 'moga' || z.slug === 'sihu', staffPick: true, createdAt: startAt - 30 * DAY, ported: 'zeczec',
      executor: { moga: '茅港尾天后宮', sihu: '四湖參天宮', hsu: '許厝福興宮', pray: '人生地圖・八間廟' }[z.slug] || '', executorUrl: '', stages: [],
      paymentMethods: { credit: true, atm: !sub, aftee: false },
    });
    P['zz_' + z.slug] = p;
    z.faqs.forEach((f, i) => faq(p, f.q, f.a, i + 1));

    // 回饋＋各回饋「已被認領幾份」對應的虛構訂單
    const want = [];
    for (const zo of z.options) {
      const { zeczecId, taken, ...fields } = zo;   // eslint-disable-line no-unused-vars
      const o = opt(p, { ...fields, createdAt: startAt - 10 * DAY });
      for (let k = 0; k < taken; k++) want.push(o);
    }
    // 打散順序，讓前面的訂單「一人一張」（湊到公開頁面的贊助人數），後面的再隨機分給這些人（同一人多張）
    for (let i = want.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [want[i], want[j]] = [want[j], want[i]]; }
    const people = Math.max(1, Math.min(want.length, z.publicStats.backers || want.length));
    // 下單時間：計畫開始～現在（訂閱式只放最近 29 天，免得一重置就連扣好幾期）
    const from = sub ? Math.max(startAt, now - 29 * DAY) : startAt, to = Math.min(now - 3_600_000, endAt || now);
    const orders = want.map((o, k) => {
      const u = fan(k < people ? k : Math.floor(R() * people));
      const created = Math.floor(from + R() * Math.max(1, to - from));
      const pay = !sub && o.atm && R() < 0.25 ? 'atm' : 'credit';
      const survey = o.survey.map((q) => ({ optionId: o.id, q: q.q, a: q.type === 'choice' ? pick(q.choices) : (q.required ? u.name : '') }));
      return add('orders', { id: id('orders'), token: tok(), projectId: p.id, userId: u.id, items: [{ optionId: o.id, name: o.name, price: o.price, qty: 1 }], bonus: 0, coupon: '', discount: 0,
        region: 'TW', delivery: 'home', shippingFee: 0, total: o.price, payMethod: pay, installments: 0, status: 'paid', atmAccount: '', atmDeadline: 0,
        recipient: { name: u.name, phone: '0912345678', email: u.email, zip: '100', city: '台北市', district: '中正區', address: `（對照嘖嘖人數的虛構資料 #${k + 1}）`, country: 'TW' }, store: null,
        survey, note: '', invoice: { type: p.invoiceFormat === 'cloud' ? 'cloud' : 'none', carrier: '', ubn: '', title: '' }, referrer: '',
        createdAt: created, paidAt: created + 60_000, shipped: null, sub: sub ? { active: true, period: 1, nextAt: created + 30 * DAY } : null, fake: true });
    });
    // 金額差（嘖嘖上有人加碼）：平均加到一部分訂單的「加碼」上，讓累計金額跟公開頁面一樣
    const sum = orders.reduce((s, o) => s + o.total, 0), diff = (z.publicStats.raised || 0) - sum;
    if (!sub && diff > 0 && orders.length) {
      const k = Math.max(1, Math.ceil(orders.length / 8)), each = Math.floor(diff / k);
      for (let i = 0; i < k; i++) { const o = orders[i]; const b = each + (i === 0 ? diff - each * k : 0); o.bonus += b; o.total += b; }
    }
  }
}
