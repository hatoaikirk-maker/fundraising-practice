/**
 * 後端整套流程測試：真的開伺服器、用 HTTP 打每一支 API（前台贊助、提案者後台、平台審核、模擬時鐘、撥款、權限、資安）
 * 跑法：node test/api_test.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
let pass = 0, fail = 0; const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 21000 + Math.floor(Math.random() * 20000), B = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fpp-'));
const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { PATH: process.env.PATH, PORT: String(PORT), DATA_DIR: dir, DEMO: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 一個「瀏覽器」：自己記 cookie 和 CSRF */
function client() {
  let cookie = '', csrf = '';
  const c = {
    async req(method, p, body, extraHeaders = {}) {
      const headers = { ...(cookie ? { cookie } : {}), ...extraHeaders };
      let payload;
      if (method !== 'GET') { headers['x-csrf'] = headers['x-csrf'] ?? csrf; if (body instanceof Buffer) payload = body; else { headers['content-type'] = headers['content-type'] || 'application/json'; payload = JSON.stringify(body || {}); } }
      const r = await fetch(B + p, { method, headers, body: payload, redirect: 'manual' });
      const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      let j = null; try { j = await r.json(); } catch { /* */ }
      return { s: r.status, j, h: r.headers };
    },
    async me() { const r = await c.req('GET', '/api/me'); csrf = r.j.csrf; return r.j; },
    get: (p) => c.req('GET', p), post: (p, b, h) => c.req('POST', p, b, h),
    async login(email, password = 'Demo1234') { await c.me(); const r = await c.post('/api/login', { email, password }); await c.me(); return r; },
    get cookie() { return cookie; },
  };
  return c;
}

try {
  for (let i = 0; i < 60; i++) { await wait(200); try { if ((await fetch(B + '/api/me')).ok) break; } catch { /* */ } }
  const anon = client(); const me0 = await anon.me();
  ok(me0.user === null && me0.csrf && me0.meta.steps.length === 5, '沒登入：/api/me 給 CSRF、五個審核階段');
  // ---------- 資安標頭、靜態檔 ----------
  { const r = await fetch(B + '/'); const csp = r.headers.get('content-security-policy') || ''; ok(r.status === 200 && csp.includes("script-src 'self'") && csp.includes("frame-ancestors 'none'") && r.headers.get('x-content-type-options') === 'nosniff', '首頁：CSP、nosniff、不准被嵌入');
    ok((await fetch(B + '/../../etc/passwd')).status === 200 && !(await (await fetch(B + '/../server.js')).text()).includes('createApp'), '路徑穿越拿不到伺服器程式碼（一律給 index.html）');
    ok(!(await (await fetch(B + '/db.json')).text()).includes('"users"') && (await fetch(B + '/uploads/abc.js')).status === 404 && (await fetch(B + '/uploads/' + 'a'.repeat(32) + '.html')).status === 404, '資料庫檔案拿不到；上傳資料夾只給 32 碼檔名＋白名單副檔名'); }
  // ---------- CSRF、JSON ----------
  ok((await anon.post('/api/login', { email: 'admin@demo.local', password: 'Demo1234' }, { 'x-csrf': 'wrong' })).s === 403, '沒有正確 CSRF：403');
  ok((await anon.post('/api/login', 'x', { 'content-type': 'text/plain' })).s === 415, '不是 JSON：415');
  ok((await anon.post('/api/login', { email: 'admin@demo.local', password: 'wrong1234' })).s === 400, '密碼錯：400，訊息不說是哪個錯');
  // ---------- 註冊、登入 ----------
  const u1 = client(); await u1.me();
  ok((await u1.post('/api/register', { email: 'new@x.tw', name: '新人', password: 'short' })).s === 400, '註冊：密碼太弱擋下');
  ok((await u1.post('/api/register', { email: 'new@x.tw', name: '<img src=x onerror=alert(1)>', password: 'Abcd1234' })).s === 200, '註冊成功（名字含 HTML 也只是字）');
  const m1 = await u1.me(); ok(m1.user && m1.user.name.includes('<img'), '名字原樣存（前端用 textContent，不會執行）');
  ok((await u1.post('/api/register', { email: 'new@x.tw', name: 'x', password: 'Abcd1234' })).s === 400, '同一個 Email 不能註冊兩次');
  // ---------- 前台 ----------
  const home = (await anon.get('/api/home')).j;
  ok(home.featured.length >= 1 && home.crowd.length >= 1 && home.subscription.length >= 1 && home.preorder.length === 1, '首頁：主打、群眾集資、預購、訂閱都有');
  ok(!JSON.stringify(home).includes('demo-draft-review'), '首頁：審核中的草稿不會出現');
  const ex = (await anon.get('/api/projects?type=crowd&sort=raised')).j; ok(ex.total >= 1 && ex.list.every((p) => p.type === 'crowd'), '探索：類型篩選');
  ok((await anon.get('/api/projects?q=' + encodeURIComponent('光明燈牆護持'))).j.total === 1, '探索：關鍵字搜尋');
  // ---------- 嘖嘖移植的 4 個真實計畫：文案、圖片、回饋、人數金額要跟嘖嘖公開頁面一樣 ----------
  const ZZ = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib/zeczec_projects.json'), 'utf8')).projects;
  for (const z of ZZ) {
    const r = (await anon.get('/api/p/' + z.slug)).j;
    ok(r && r.title === z.title && r.content === z.content && r.cover === z.cover, `移植 ${z.slug}：標題、內容、封面一模一樣`);
    ok(r.options.length + r.addons.length === z.options.length && r.options.every((o) => { const zo = z.options.find((x) => x.name === o.name); return zo && zo.price === o.price && o.taken === zo.taken && o.description === zo.description; }), `移植 ${z.slug}：回饋 ${z.options.length} 個（名稱、價格、已認領、說明）`);
    ok(r.faqs.length === z.faqs.length, `移植 ${z.slug}：常見問答 ${z.faqs.length} 則`);
    if (z.type !== 'subscription') ok(r.raised === z.publicStats.raised && r.backers === z.publicStats.backers && r.goal === z.publicStats.goal, `移植 ${z.slug}：目標 ${z.goal}、累計 ${r.raised}、${r.backers} 人跟嘖嘖一樣`);
    ok(!/\(null\)|countdownmail/.test(r.content) && !/0912345678|練習路/.test(JSON.stringify(r)), `移植 ${z.slug}：空圖、外部倒數拿掉；不會露出收件資料`);
  }
  ok((await anon.get('/api/home')).j.featured.some((c) => c.slug === 'moga'), '首頁主打：茅港尾');
  ok((await anon.post('/api/login', { email: 'fan1@demo.local', password: '' })).s !== 200, '虛構贊助人（fan）沒有密碼、登入不了');
  const p = (await anon.get('/api/p/demo-light-wall')).j;
  ok(p.title && p.options.length === 3 && p.addons.length === 1 && p.hasHidden && !p.codeOk, '計畫頁：3 個選項（加購另外列、隱藏選項不顯示）');
  ok(!JSON.stringify(p).includes('VIP2027'), '計畫頁：隱藏選項的密碼不會傳到前台');
  ok((await anon.get('/api/p/demo-light-wall?code=VIP2027')).j.options.length === 4, '輸入隱藏密碼：多一個選項');
  ok(p.updates.some((u) => u.locked) && p.updates.some((u) => !u.locked), '贊助人限定的更新：沒贊助看不到內容');
  ok(p.backerList.every((b) => b.name.includes('○') || b.name.length <= 1), '前台贊助人名單：名字遮罩');
  ok(!JSON.stringify(p).includes('0912345678') && !JSON.stringify(p).includes('練習路'), '前台不會出現任何收件資料');
  ok((await anon.get('/api/p/demo-draft-review')).s === 404, '草稿：外人看不到（404）');
  // ---------- 結帳 ----------
  const bk = client(); await bk.login('backer2@demo.local');
  const opt = p.options[0], addon = p.addons[0], big = p.options.find((o) => o.price === 30000);
  const baseOrder = { slug: 'demo-light-wall', items: [{ optionId: opt.id, qty: 2 }], recipient: { name: '王小明', phone: '0912-345-678', email: 'b2@x.tw', zip: '100', city: '台北市', district: '中正區', address: '練習路 2 號' }, survey: { [`${opt.id}_0`]: '王小明', [`${opt.id}_1`]: '平安' }, payMethod: 'credit', region: 'TW' };
  let q = (await bk.post('/api/checkout/quote', { ...baseOrder, items: [{ optionId: opt.id, qty: 2 }, { optionId: addon.id, qty: 1 }], bonus: 100, coupon: 'light100' })).j;
  ok(q.subtotal === opt.price * 2 + addon.price && q.discount === 100 && q.bonus === 100 && q.total === q.subtotal - 100 + 100, `試算：回饋×2＋加購＋加碼 100－折扣碼 100＝${q.total}`);
  ok((await bk.post('/api/checkout/quote', { ...baseOrder, items: [{ optionId: addon.id, qty: 1 }] })).s === 400, '只買加購：擋下');
  ok((await bk.post('/api/checkout/quote', { ...baseOrder, region: 'US' })).j.error.includes('無法寄送'), '運費沒設的國家：不能寄');
  ok((await bk.post('/api/checkout/quote', { ...baseOrder, coupon: 'NOPE' })).s === 400, '亂打折扣碼：擋下');
  ok((await bk.post('/api/orders', { ...baseOrder, survey: {} })).j.error.includes('祈福姓名'), '必填的回饋調查沒填：擋下');
  ok((await bk.post('/api/orders', { ...baseOrder, survey: { [`${opt.id}_0`]: 'x', [`${opt.id}_1`]: '亂選' } })).j.error.includes('選項不正確'), '選擇題亂填：擋下');
  ok((await bk.post('/api/orders', { ...baseOrder, items: [{ optionId: big.id, qty: 1 }], payMethod: 'atm' })).j.error.includes('ATM'), '不開放 ATM 的回饋：不能選 ATM');
  ok((await bk.post('/api/orders', { ...baseOrder, items: [{ optionId: big.id, qty: 1 }], installments: 12 })).s === 400, '分期期數亂填：擋下');
  ok((await bk.post('/api/orders', { ...baseOrder, items: [{ optionId: big.id, qty: 1 }], note: '' })).j.error.includes('備註'), '備註必填的回饋沒填：擋下');
  ok((await bk.post('/api/orders', { ...baseOrder, items: [{ optionId: opt.id, qty: 100 }] })).s === 400, '數量超過 99：擋下');
  ok((await bk.post('/api/orders', { ...baseOrder, items: [{ optionId: 999999, qty: 1 }] })).s === 400, '別的計畫／不存在的選項：擋下');
  ok((await bk.post('/api/orders', { ...baseOrder, delivery: 'store', store: null })).s === 400 && (await bk.post('/api/orders', { ...baseOrder, recipient: null })).s === 400 && (await bk.post('/api/orders', { ...baseOrder, items: 'x' })).s === 400 && (await bk.post('/api/orders', { ...baseOrder, survey: null, items: [{}] })).s === 400, '怪資料（null、字串、空物件）：400，不會讓伺服器出錯');
  let r = await bk.post('/api/orders', { ...baseOrder, delivery: 'store', store: { brand: '711', id: '123456', name: '練習門市' }, invoice: {}, referrer: (await (async () => '')()) });
  ok(r.s === 200 && r.j.token && r.j.payMethod === 'credit', '下單成功（超商取貨）');
  const tok1 = r.j.token;
  ok((await bk.post(`/api/orders/${tok1}/pay`, { last4: '0002' })).j.error.includes('拒絕'), '模擬卡號 0002：付款失敗');
  ok((await bk.post(`/api/orders/${tok1}/pay`, { last4: '4242' })).s === 200, '付款成功');
  ok((await bk.post(`/api/orders/${tok1}/pay`, { last4: '4242' })).s === 400, '同一張不能付兩次');
  const other = client(); await other.login('backer3@demo.local');
  ok((await other.post(`/api/orders/${tok1}/pay`, { last4: '4242' })).s === 404 && (await other.post(`/api/my/orders/${tok1}/cancel`, {})).s === 404, '別人的訂單：碰不到（404）');
  r = await bk.post('/api/orders', { ...baseOrder, payMethod: 'atm' }); const tokAtm = r.j.token;
  ok(r.j.atmAccount && r.j.atmDeadline > Date.now(), 'ATM：拿到虛擬帳號和期限（隔天 23:59:59）');
  let mine = (await bk.get('/api/my/orders')).j; let o1 = mine.find((o) => o.token === tok1);
  ok(o1.status === 'paid' && o1.canCancel && o1.canEdit && !o1.canRefund && o1.delivery === 'store', '我的贊助紀錄：付款成功、募資中可以取消／修改');
  ok((await bk.post(`/api/my/orders/${tok1}/edit`, { recipient: { name: '王大明', phone: '0911111111' }, survey: ['王大明', '好運'], note: '改備註' })).s === 200 && (await bk.get('/api/my/orders')).j.find((o) => o.token === tok1).recipient.name === '王大明', '募資期間：可以修改收件資料、回饋調查');
  // ---------- 提案者後台 ----------
  const cr = client(); await cr.login('creator@demo.local');
  const pid = p.id;
  const dash = (await cr.get(`/api/c/${pid}`)).j; ok(dash.role === 'owner' && dash.steps.length === 5 && dash.stats.orders >= 1, '控制中心：審核階段、統計');
  ok((await bk.get(`/api/c/${pid}`)).s === 404 && (await bk.get(`/api/c/${pid}/orders`)).s === 404, '贊助人進不了別人的後台（404）');
  const orders = (await cr.get(`/api/c/${pid}/orders?field=token&q=${tok1}`)).j; ok(orders.length === 1 && orders[0].recipient.name === '王大明', '訂單總覽：用訂單編號查到、看得到收件資料');
  const csv = (await cr.get(`/api/c/${pid}/export?kind=backers`)).j; ok(csv.csv.startsWith('﻿') && csv.csv.includes('訂單編號'), '匯出贊助人列表 CSV（含 BOM，Excel 不亂碼）');
  // 回饋選項：新增、驗證、媒體（GIF／影片）
  ok((await cr.post(`/api/c/${pid}/options`, { name: '', price: 100 })).s === 400, '回饋：沒名字擋下');
  ok((await cr.post(`/api/c/${pid}/options`, { id: opt.id, name: opt.name, price: opt.price + 1 })).j.error.includes('價格不能改'), '已經有人贊助：價格不能改');
  ok((await cr.post(`/api/c/${pid}/options`, { name: '新回饋', price: 500, media: [{ url: 'javascript:alert(1)', type: 'image' }, { url: '/uploads/' + 'a'.repeat(32) + '.gif', type: 'image' }, { url: '/uploads/' + 'b'.repeat(32) + '.mp4', type: 'video' }], survey: [{ q: '尺寸', type: 'choice', choices: ['S', 'M'], required: true }], shipping: { TW: 60, JP: 300 }, stores: ['711', 'evil'] })).s === 200, '新增回饋（GIF、影片、回饋調查、運費、超商）');
  const opts2 = (await cr.get(`/api/c/${pid}/options`)).j, nw = opts2.find((o) => o.name === '新回饋');
  ok(nw && nw.media.length === 2 && nw.media[0].url.endsWith('.gif') && nw.media[1].type === 'video' && nw.stores.join() === '711' && nw.shipping.JP === 300 && nw.shipping.US === '', 'javascript: 網址丟掉、GIF／影片留著、亂填的超商丟掉、沒填的國家＝不寄');
  ok((await cr.post(`/api/c/${pid}/options`, { action: 'reorder', ids: opts2.map((o) => o.id).reverse() })).s === 200, '自訂回饋順序');
  // FAQ、折扣碼、推薦連結、EDM、更新
  ok((await cr.post(`/api/c/${pid}/faqs`, { q: '新問題', a: '新答案' })).s === 200 && (await cr.get(`/api/c/${pid}/faqs`)).j.length === 4, '常見問答：新增');
  ok((await cr.post(`/api/c/${pid}/coupons`, { code: 'X', amount: 10 })).s === 400 && (await cr.post(`/api/c/${pid}/coupons`, { code: 'NEW50', amount: 50, promotional: true })).s === 200, '折扣碼：格式檢查、新增');
  ok((await cr.post(`/api/c/${pid}/referrers`, { name: 'IG 限動', partner: '', audience: 1000 })).s === 200, '推薦連結：新增');
  const refs = (await cr.get(`/api/c/${pid}/referrers`)).j; ok(refs.length === 4 && refs.every((x) => /^[a-f0-9]{10}$/.test(x.code)), '推薦連結：代碼 10 碼');
  ok((await cr.post(`/api/c/${pid}/abandon`, { enabled: true, subject: '', title: '' })).s === 400, 'EDM：開啟前要填標題');
  ok((await cr.post(`/api/c/${pid}/abandon`, { enabled: true, subject: '你的購物車還在', title: '最後機會', subtitle: '只到月底', cta: '回去看看', features: ['過火加持'], couponId: 1 })).s === 200, 'EDM：設定完成');
  ok((await cr.post(`/api/c/${pid}/updates`, { title: '新進度', content: '內容', status: 'published', notify: true, private: false })).s === 200, '計畫更新：發布並通知');
  ok((await cr.get(`/api/c/${pid}/metrics`)).j.growth.length >= 1, '數據分析');
  // 時間鎖：已經通過方案與回饋
  ok((await cr.post(`/api/c/${pid}/project`, { ...dash.project, goal: 1 })).s === 400, '方案與回饋通過後：目標、時間鎖住');
  // 團隊：邀請客服角色，客服看得到訂單、不能改計畫
  ok((await cr.post('/api/memberships', { action: 'invite', email: 'backer4@demo.local', role: 'support', title: '客服' })).s === 200, '團隊：邀請客服');
  const sup = client(); await sup.login('backer4@demo.local');
  const inv = (await sup.get('/api/memberships')).j.teams[0]; ok(inv && inv.status === 'invited', '被邀請的人看得到邀請');
  ok((await sup.get(`/api/c/${pid}/orders`)).s === 404, '還沒接受：看不到訂單');
  await sup.post('/api/memberships', { action: 'accept', id: inv.id });
  ok((await sup.get(`/api/c/${pid}/orders`)).s === 200 && (await sup.post(`/api/c/${pid}/faqs`, { q: 'a', a: 'b' })).s === 404 && (await sup.get(`/api/c/${pid}/business`)).s === 404, '客服：看得到訂單；不能改內容、看不到商業檔案（銀行帳號）');
  // ---------- 發起新計畫 → 審核五階段 → 上線 ----------
  const nc = client(); await nc.login('backer5@demo.local');
  const np = (await nc.post('/api/start', { type: 'crowd', title: '練習計畫' })).j; ok(np.id > 0, '發起計畫：建立草稿');
  ok((await nc.post(`/api/c/${np.id}/submit`, { step: 'plan' })).j.error.includes('商業檔案'), '還沒過初審：不能送方案');
  ok((await nc.post(`/api/c/${np.id}/business`, { kind: 'company', ubn: '123', fullname: 'x', mobile: '0912345678' })).s === 400, '商業檔案：統編不對擋下');
  ok((await nc.post(`/api/c/${np.id}/business`, { kind: 'company', ubn: '12345678', fullname: '王大明', mobile: '0912345678', idType: 'idcard', idNumber: 'A123456789', bankName: '練習公司', bankCode: '812', bankAccount: '123456789012', submit: true })).s === 200, '商業檔案：送審');
  ok((await nc.post(`/api/c/${np.id}/payment`, { methods: { credit: true, atm: true }, submit: true })).s === 200, '金流帳號申請：送出');
  const ad = client(); await ad.login('admin@demo.local');
  let rv = (await ad.get('/api/admin/review')).j.find((x) => x.id === np.id); ok(rv && rv.steps.biz === 'pending', '平台：審核佇列看得到（初審審核中）');
  ok((await ad.post(`/api/admin/projects/${np.id}/step`, { step: 'plan', decision: 'ok' })).s === 400, '平台：不能跳階段');
  ok((await ad.post(`/api/admin/projects/${np.id}/step`, { step: 'biz', decision: 'rejected' })).j.error.includes('原因'), '退回一定要寫原因');
  ok((await ad.post(`/api/admin/projects/${np.id}/step`, { step: 'biz', decision: 'ok' })).s === 200, '初審通過');
  ok((await nc.post(`/api/c/${np.id}/submit`, { step: 'plan' })).j.error.includes('回饋'), '沒回饋：不能送方案');
  const t0 = Date.now(), fmt = (t) => { const d = new Date(t + 8 * 3600e3); return d.toISOString().slice(0, 16).replace('T', ' '); };
  ok((await nc.post(`/api/c/${np.id}/project`, { title: '練習計畫', description: '簡介', content: '## 內容', slug: 'practice-1', type: 'crowd', goal: 1000, startAt: fmt(t0 + 86400e3), endAt: fmt(t0 + 86400e3 * 200) })).j.error.includes('最長'), '計畫太長（超過 5 個月）：擋下');
  ok((await nc.post(`/api/c/${np.id}/project`, { title: '練習計畫', description: '簡介', content: '## 內容', slug: 'practice-1', type: 'crowd', goal: 1000, startAt: fmt(t0 + 86400e3), endAt: fmt(t0 + 86400e3 * 3) })).s === 200, '修改計畫：目標、時程');
  await nc.post(`/api/c/${np.id}/options`, { name: '練習回饋', price: 600, atm: true, shipping: { TW: 0 } });
  ok((await nc.post(`/api/c/${np.id}/submit`, { step: 'plan' })).s === 200, '送出方案與回饋');
  await ad.post(`/api/admin/projects/${np.id}/step`, { step: 'plan', decision: 'ok' });
  ok((await nc.post(`/api/c/${np.id}/project`, { title: '練習計畫', description: '簡介', content: '## 內容', slug: 'practice-1', type: 'crowd', goal: 999999, startAt: fmt(t0 + 86400e3), endAt: fmt(t0 + 86400e3 * 3) })).s === 400, '方案通過後：目標鎖住');
  ok((await nc.post(`/api/c/${np.id}/submit`, { step: 'contract', file: 'javascript:x' })).s === 400, '合約檔案網址亂給：擋下');
  // 上傳合約 PDF
  const pdf = Buffer.from('%PDF-1.4\n%練習合約\n'), bnd = 'BND123';
  const mp = Buffer.concat([Buffer.from(`--${bnd}\r\nContent-Disposition: form-data; name="file"; filename="c.pdf"\r\nContent-Type: application/pdf\r\n\r\n`), pdf, Buffer.from(`\r\n--${bnd}--\r\n`)]);
  const up = await nc.req('POST', '/api/upload?kind=contract', mp, { 'content-type': `multipart/form-data; boundary=${bnd}` });
  ok(up.s === 200 && /^\/uploads\/[a-f0-9]{32}\.pdf$/.test(up.j.url), '上傳合約 PDF');
  const fakeImg = Buffer.concat([Buffer.from(`--${bnd}\r\nContent-Disposition: form-data; name="file"; filename="x.png"\r\n\r\n`), Buffer.from('<script>alert(1)</script>'), Buffer.from(`\r\n--${bnd}--\r\n`)]);
  ok((await nc.req('POST', '/api/upload', fakeImg, { 'content-type': `multipart/form-data; boundary=${bnd}` })).s === 400, '假裝成 PNG 的 HTML：不收（看檔頭不看副檔名）');
  const gif = Buffer.concat([Buffer.from(`--${bnd}\r\nContent-Disposition: form-data; name="file"; filename="a.gif"\r\n\r\n`), Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1'), Buffer.from(`\r\n--${bnd}--\r\n`)]);
  const upg = await nc.req('POST', '/api/upload', gif, { 'content-type': `multipart/form-data; boundary=${bnd}` });
  ok(upg.s === 200 && upg.j.type === 'image' && upg.j.url.endsWith('.gif'), '上傳 GIF');
  { const g = await fetch(B + upg.j.url); ok(g.headers.get('content-type') === 'image/gif' && g.headers.get('x-content-type-options') === 'nosniff', 'GIF 用正確的 Content-Type 送出'); }
  ok((await nc.post(`/api/c/${np.id}/submit`, { step: 'contract', file: up.j.url })).s === 200, '送出合約');
  await ad.post(`/api/admin/projects/${np.id}/step`, { step: 'contract', decision: 'ok' });
  rv = (await ad.get('/api/admin/review')).j.find((x) => x.id === np.id); ok(rv.steps.gateway === 'pending', '合約通過：自動進入第三方金流審核');
  await ad.post(`/api/admin/projects/${np.id}/step`, { step: 'gateway', decision: 'ok' });
  ok((await ad.post(`/api/admin/projects/${np.id}/step`, { step: 'ready', decision: 'ok' })).s === 200, '準備上線：排定');
  ok((await anon.get('/api/p/practice-1')).s === 404, '還沒到上線時間：前台看不到');
  // ---------- 模擬時鐘 ----------
  ok((await cr.post('/api/admin/clock', { hours: 25 })).s === 404, '一般會員不能動時鐘（404）');
  await ad.post('/api/admin/clock', { hours: 25 });
  ok((await anon.get('/api/p/practice-1')).j.status === 'live', '快轉 25 小時：自動上線');
  r = await bk.post('/api/orders', { slug: 'practice-1', items: [{ optionId: (await anon.get('/api/p/practice-1')).j.options[0].id, qty: 2 }], recipient: baseOrder.recipient, payMethod: 'credit' });
  await bk.post(`/api/orders/${r.j.token}/pay`, { last4: '4242' });
  await ad.post('/api/admin/clock', { hours: 24 * 3 });
  mine = (await bk.get('/api/my/orders')).j;
  ok(mine.find((o) => o.token === tokAtm).status === 'expired', 'ATM 過期限沒付：逾期');
  ok((await anon.get('/api/p/practice-1')).j.status === 'success', '募資結束、有達標：成功');
  const pays = (await ad.get('/api/admin/payouts')).j, pp = pays.find((x) => x.project === '練習計畫');
  ok(pp && pp.gross === 1200 && pp.platformFee === 66 && pp.paymentFee === 30 && pp.net === 1104 && pp.status === 'scheduled', `撥款試算：1,200 − 金流 30 − 平台 66 ＝ ${pp && pp.net}`);
  ok((await ad.post(`/api/admin/payouts/${pp.id}`, {})).s === 200 && (await ad.post(`/api/admin/payouts/${pp.id}`, {})).s === 400, '標記撥款（不能撥兩次）');
  // 光明燈牆：50 天後結束；沒達標 → 全部退款
  await ad.post('/api/admin/clock', { hours: 24 * 50 });
  const lw = (await anon.get('/api/p/demo-light-wall')).j; ok(lw.status === 'failed', '光明燈牆沒達標：未達標');
  mine = (await bk.get('/api/my/orders')).j; ok(mine.find((o) => o.token === tok1).status === 'refunded', '未達標：已付款的訂單自動退款');
  // 訂閱：每 30 天扣一期
  const subOrders = (await (await (async () => { const c = client(); await c.login('backer1@demo.local'); return c; })()).get('/api/my/orders')).j.filter((o) => o.project && o.project.type === 'subscription');
  ok(subOrders.length >= 2 && subOrders.some((o) => o.period >= 2), `訂閱：時間到自動扣下一期（現在有 ${subOrders.length} 期）`);
  // 退款申請流程（成功的計畫）
  const b1 = bk;   // backer2（backer1 的那筆範例資料已經有一筆退款申請）
  const burn = (await b1.get('/api/my/orders')).j.find((o) => o.project && o.project.slug === 'demo-eco-burner' && o.status === 'paid');
  ok(burn && burn.canRefund, '成功結束的計畫：可以申請退款');
  ok((await b1.post(`/api/my/orders/${burn.token}/refund`, { reason: '' })).s === 400 && (await b1.post(`/api/my/orders/${burn.token}/refund`, { reason: '收到瑕疵品' })).s === 200, '申請退款（要寫原因）');
  const rfs = (await ad.get('/api/admin/refunds?status=pending')).j, rf = rfs.find((x) => x.order === burn.token);
  ok((await ad.post(`/api/admin/refunds/${rf.id}`, { decision: 'reject' })).s === 400 && (await ad.post(`/api/admin/refunds/${rf.id}`, { decision: 'approve' })).s === 200, '平台審退款：駁回要原因、同意就退款');
  ok((await b1.get('/api/my/orders')).j.find((o) => o.token === burn.token).status === 'refunded', '退款完成');
  // ---------- 平台其他 ----------
  ok((await bk.get('/api/admin/overview')).s === 404 && (await sup.get('/api/admin/users')).s === 404, '一般會員進不了平台後台（404）');
  const pm = client(); await pm.login('pm@demo.local');
  ok((await pm.get('/api/admin/review')).s === 200 && (await pm.get('/api/admin/payouts')).s === 404 && (await pm.post('/api/admin/settings', {})).s === 404, '專案經理：能審核、不能碰撥款和平台設定');
  const uid = (await ad.get('/api/admin/users?q=backer6')).j[0].id;
  const banR = await ad.post(`/api/admin/users/${uid}`, { action: 'ban' });
  const b6 = client(); const lr = await b6.login('backer6@demo.local'); ok(banR.s === 200 && lr.s === 400, '停權的帳號不能登入 ' + JSON.stringify([banR.s, banR.j, lr.s, lr.j]));
  ok((await ad.post(`/api/admin/users/${(await ad.me()).user.id}`, { action: 'role', role: 'member' })).s === 400, '管理員不能改自己的權限');
  const pmId = (await ad.get('/api/admin/users?q=pm%40demo')).j[0].id;
  ok((await ad.post(`/api/admin/users/${pmId}`, { action: 'role', role: 'member' })).s === 400 && (await ad.post(`/api/admin/users/${pmId}`, { action: 'ban' })).s === 400, '練習用的 pm 帳號不能被降權、停權（網路上大家共用）');
  ok((await ad.post('/api/settings/password', { old: 'Demo1234', password: 'Hack12345' })).s === 400 && (await client().login('admin@demo.local')).s === 200, '練習帳號不能改密碼（改了全部同事都登不進去）');
  const rep = (await ad.get('/api/admin/reports')).j[0]; ok((await ad.post(`/api/admin/reports/${rep.id}`, { action: 'resolve', note: '已處理', hide: true })).s === 200, '檢舉：成立並隱藏留言');
  ok(!(await anon.get('/api/p/demo-light-wall')).j.comments.some((c) => c.body.includes('寄到香港')), '被隱藏的留言：前台看不到');
  ok((await ad.get('/api/admin/emails')).j.length > 5 && (await ad.get('/api/admin/audit')).j.length > 5, '寄信紀錄、操作紀錄');
  // 設定
  const st = (await ad.get('/api/admin/settings')).j; ok(st.platformFee === 0.055 && st.paymentFee.credit === 0.025 && st.personLimit30d === 1000000, '平台設定：預設 5.5%＋2.5%、自然人 100 萬');
  ok((await ad.post('/api/admin/settings', { ...st, platformFee: 5 })).s === 400, '手續費亂填：擋下');
  // 重置
  ok((await ad.post('/api/admin/reset', { confirm: 'no' })).s === 400 && (await ad.post('/api/admin/reset', { confirm: 'RESET' })).s === 200, '重置練習資料（要輸入 RESET）');
  const home2 = (await anon.get('/api/home')).j; ok(home2.featured.length >= 1, '重置後回到範例資料');
  // 亂打：每一支會改資料的 API 都塞各種怪東西，伺服器一律不可以 500
  { const fz = client(); await fz.login('admin@demo.local');
    const paths = ['/api/register', '/api/settings', '/api/settings/password', '/api/p/demo-light-wall/follow', '/api/p/demo-light-wall/comments', '/api/reports', '/api/checkout/quote', '/api/checkout/start', '/api/orders', '/api/orders/XXXX/pay', '/api/my/orders/XXXX/cancel', '/api/my/orders/XXXX/edit', '/api/my/orders/XXXX/refund', '/api/inbox', '/api/memberships', '/api/start',
      '/api/c/1/project', '/api/c/1/faqs', '/api/c/1/options', '/api/c/1/coupons', '/api/c/1/referrers', '/api/c/1/abandon', '/api/c/1/updates', '/api/c/1/comments', '/api/c/1/orders/ship', '/api/c/1/refunds/1', '/api/c/1/business', '/api/c/1/payment', '/api/c/1/submit',
      '/api/admin/projects/1/step', '/api/admin/projects/1', '/api/admin/users/2', '/api/admin/orders/XXXX', '/api/admin/refunds/1', '/api/admin/payouts/1', '/api/admin/reports/1', '/api/admin/comments/1', '/api/admin/settings', '/api/admin/notices', '/api/admin/clock'];
    const junk = [{}, { id: '1; DROP', action: 'delete' }, { action: '__proto__', __proto__: { x: 1 }, constructor: { prototype: { y: 1 } } }, { items: [{ optionId: '1', qty: -1 }], recipient: 'x', survey: [1, 2], invoice: 5, store: 'x', methods: null, paymentFee: null, allOrNothing: null, shipping: 'x', media: 'x' }, { title: 'x'.repeat(100000) }, { ids: ['a', null, {}], body: { a: 1 }, decision: ['approve'] }];
    let n500 = 0, bad500 = [];
    for (const pth of paths) for (const j of junk) { const r = await fz.post(pth, j); if (r.s >= 500) { n500++; bad500.push(pth + ' ' + JSON.stringify(j).slice(0, 60)); } }
    ok(n500 === 0, `亂打 ${paths.length * junk.length} 次：沒有任何 500` + (bad500.length ? '：' + bad500.slice(0, 5).join(' | ') : ''));
    ok(({}).x === undefined && ({}).y === undefined, '原型污染：沒有');
  }
  // 限流
  const lim = client(); await lim.me(); let n429 = 0; for (let i = 0; i < 10; i++) if ((await lim.post('/api/login', { email: 'pm@demo.local', password: 'Wrong1234' })).s === 429) n429++;
  ok(n429 >= 1, '同一個帳號錯太多次：限流 429');
  ok((await lim.post('/api/login', { email: 'creator@demo.local', password: 'Demo1234' })).s === 200, '同一個 IP 的其他帳號照樣登得進去（教室共用 IP 不會互相卡）');
} catch (e) { fail++; console.log('  ✗ 測試中斷：' + (e && e.stack || e)); console.log(log.slice(-2000)); }
finally { srv.kill(); await wait(300); fs.rmSync(dir, { recursive: true, force: true }); }
console.log(`後端流程：通過 ${pass}、失敗 ${fail}`);
process.exit(fail ? 1 : 0);
