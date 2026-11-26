/**
 * 正式模式測試（沒有 DEMO=1）：對外募資平台該有的樣子
 * - 只有 4 個真實計畫；沒有測試帳號、測試計畫；任何 API 回應都不會出現「練習／模擬」
 * - 管理員帳號密碼來自環境變數；測試帳號 Demo1234 登不進去
 * - 測試金流：預設開（不扣款、只收卡號末四碼）；管理員關掉後付款 API 一律拒絕
 * - 免註冊結帳、訂單查詢、設定密碼、刪除帳號；一律廟方收據
 * - 時鐘快轉、重置在正式模式不存在（404）
 * - 管理員可以新增一般人員；一般人員看不到人員、撥款、設定；臨時密碼只回一次、伺服器只存雜湊
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
let pass = 0, fail = 0; const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 21000 + Math.floor(Math.random() * 20000), B = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fpp-prod-'));
const ADMIN = 'boss@lifemap.local', ADMIN_PW = 'Pr0d-' + Math.random().toString(36).slice(2, 12);   // 每次測試亂數，不寫死任何密碼
const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { PATH: process.env.PATH, PORT: String(PORT), DATA_DIR: dir, ADMIN_EMAIL: ADMIN, ADMIN_PASSWORD: ADMIN_PW }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function client() {
  let cookie = '', csrf = '';
  const c = {
    async req(method, p, body) {
      const headers = { ...(cookie ? { cookie } : {}) };
      if (method !== 'GET') { headers['x-csrf'] = csrf; headers['content-type'] = 'application/json'; }
      const r = await fetch(B + p, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
      const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      let j = null, t = ''; try { t = await r.text(); j = JSON.parse(t); } catch { /* */ }
      return { s: r.status, j, t };
    },
    async me() { const r = await c.req('GET', '/api/me'); csrf = r.j.csrf; return r.j; },
    get: (p) => c.req('GET', p), post: (p, b) => c.req('POST', p, b),
    async login(email, password) { await c.me(); const r = await c.post('/api/login', { email, password }); await c.me(); return r; },
  };
  return c;
}
const fresh = async () => { const c = client(); await c.me(); return c; };   // 先拿 CSRF 的新瀏覽器
try {
  for (let i = 0; i < 60; i++) { await wait(200); try { if ((await fetch(B + '/api/me')).ok) break; } catch { /* */ } }
  const anon = client(); const me0 = await anon.me();
  ok(me0.demo === false, '正式模式：/api/me 的 demo＝false');
  ok(!log.includes(ADMIN_PW), '有設 ADMIN_PASSWORD 時，啟動畫面不會印出密碼');
  // ---------- 只有真實計畫、沒有練習字樣 ----------
  const home = (await anon.get('/api/home')).t;
  const hj = JSON.parse(home);
  const slugs = [...hj.crowd, ...hj.subscription, ...hj.preorder].map((p) => p.slug).sort();
  ok(JSON.stringify(slugs) === JSON.stringify(['hsu', 'moga', 'pray', 'sihu']), '首頁只有 4 個真實計畫：' + slugs.join(','));
  ok(!/練習|模擬|範例|demo-/.test(home), '首頁資料沒有「練習／模擬／範例」');
  for (const s of ['moga', 'sihu', 'hsu', 'pray']) { const r = await anon.get('/api/p/' + s); ok(r.s === 200 && !/練習|模擬/.test(r.t) && r.j.owner === '人生地圖', `計畫 ${s}：提案人＝人生地圖、沒有練習字樣`); }
  ok((await anon.get('/api/p/demo-light-wall')).s === 404, '測試計畫在正式模式不存在');
  ok((await anon.get('/api/projects?q=' + encodeURIComponent('範例'))).j.total === 0, '搜尋「範例」找不到東西');
  // ---------- 帳號 ----------
  ok((await client().login('admin@demo.local', 'Demo1234')).s === 400, '測試帳號 admin@demo.local／Demo1234 登不進去');
  ok((await client().login('lifemap@lifemap.local', '')).s === 400, '計畫擁有者帳號（人生地圖）沒有密碼、登不進去');
  const ad = client(); ok((await ad.login(ADMIN, ADMIN_PW)).s === 200 && (await ad.me()).user.role === 'admin', '管理員用環境變數的帳密登入');
  // ---------- 付款關閉 ----------
  const bk = client(); await bk.me();
  ok((await bk.post('/api/register', { email: 'fan.real@example.com', name: '信眾', password: 'Abcd1234' })).s === 200, '一般人可以註冊');
  await bk.me();
  const p = (await bk.get('/api/p/moga')).j, o1 = p.options.find((o) => o.atm) || p.options[0];
  const order = await bk.post('/api/orders', { slug: 'moga', items: [{ optionId: o1.id, qty: 1 }], payMethod: 'credit', region: 'TW', delivery: 'home', recipient: { name: '信眾', phone: '0911222333', email: 'fan.real@example.com', zip: '100', city: '台北市', district: '中正區', address: '某路 1 號' }, survey: Object.fromEntries((o1.survey || []).map((q, i) => [`${o1.id}_${i}`, q.type === 'choice' ? q.choices[0] : '王小明'])), note: '平安', invoice: { type: 'member' } });
  ok(order.s === 200 && order.j.token, '下單：訂單可以建立（保留）' + (order.s !== 200 ? JSON.stringify(order.j) : ''));
  const tok = order.j && order.j.token;
  // ---------- 測試金流：預設開（不扣款）；管理員關掉後付款一律拒絕 ----------
  ok((await anon.get('/api/me')).j.payMode === 'test', '正式模式預設：測試金流開著');
  const ordA = (await bk.get('/api/my/orders')).j.find((x) => x.token === tok);
  ok(ordA.invoice && ordA.invoice.type === 'receipt' && ordA.invoice.title === '信眾', '一律廟方收據：抬頭空白＝收件人姓名（發票資料不收）');
  ok((await ad.post('/api/admin/settings', { ...(await ad.get('/api/admin/settings')).j, testPayment: false })).s === 200, '管理員關掉測試金流');
  ok((await anon.get('/api/me')).j.payMode === 'closed', '關掉後：payMode＝closed');
  const pay = await bk.post(`/api/orders/${tok}/pay`, { last4: '4242' });
  ok(pay.s === 400 && /尚未開放/.test(pay.j.error), '關掉後：信用卡付款拒絕（線上付款尚未開放）');
  ok((await bk.post(`/api/orders/${tok}/atm-paid`, {})).s === 400, '關掉後：ATM「我已轉帳」拒絕');
  ok((await bk.get('/api/my/orders')).j.find((x) => x.token === tok).status === 'pending', '關掉後：訂單維持待付款');
  await ad.post('/api/admin/settings', { ...(await ad.get('/api/admin/settings')).j, testPayment: true });
  ok((await bk.post(`/api/orders/${tok}/pay`, { last4: '0002' })).s === 400, '測試金流：卡號 …0002 模擬銀行拒絕');
  ok((await bk.post(`/api/orders/${tok}/pay`, { last4: '4242' })).s === 200 && (await bk.get('/api/my/orders')).j.find((x) => x.token === tok).status === 'paid', '測試金流：付款成功、訂單變已付款');
  ok((await (await fresh()).post(`/api/orders/${tok}/pay`, { last4: '4242', email: 'x@x.tw' })).s !== 200, '別人（Email 不對）不能付這張訂單');
  // ---------- 免註冊結帳 ----------
  const mkOrder = (c, email, extra = {}) => c.post('/api/orders', { slug: 'moga', items: [{ optionId: o1.id, qty: 1 }], payMethod: 'credit', region: 'TW', delivery: 'home', recipient: { name: '訪客', phone: '0922333444', email, zip: '100', city: '台北市', district: '中正區', address: '某路 2 號' }, survey: Object.fromEntries((o1.survey || []).map((q, i) => [`${o1.id}_${i}`, q.type === 'choice' ? q.choices[0] : '王小明'])), note: '平安', invoice: { title: '' }, ...extra });
  const g0 = client(); await g0.me();
  ok((await mkOrder(g0, 'guest1@example.com')).s === 400, '訪客：沒勾隱私權政策不能送');
  const g1 = await mkOrder(g0, 'guest1@example.com', { privacyOk: true });
  ok(g1.s === 200 && g1.j.guest === true && !g1.j.setPassword && (await g0.me()).user === null, '訪客下單成功：不用註冊、沒有被登入、不是會員');
  ok((await g0.post(`/api/orders/${g1.j.token}/view`, { email: 'guest1@example.com' })).j.token === g1.j.token, '訪客：用 Email 看自己的訂單');
  ok((await g0.post(`/api/orders/${g1.j.token}/pay`, { last4: '4242', email: 'guest1@example.com' })).s === 200, '訪客：測試金流付款成功');
  const lk = await (await fresh()).post('/api/lookup', { email: 'guest1@example.com', token: g1.j.token.toLowerCase() });
  ok(lk.s === 200 && lk.j.status === 'paid', '訂單查詢：Email＋訂單編號（大小寫都可以）');
  ok((await (await fresh()).post('/api/lookup', { email: 'other@example.com', token: g1.j.token })).s === 400, '訂單查詢：Email 不對查不到');
  ok((await g0.post('/api/login', { email: 'guest1@example.com', password: '' })).s === 400, '訪客紀錄不能登入');
  const g2c = client(); await g2c.me();
  const g2 = await mkOrder(g2c, 'guest1@example.com', { privacyOk: true, register: true });
  ok(g2.s === 200 && !g2.j.setPassword && (await g2c.me()).user === null, '有人拿別人用過的 Email 勾「建立會員」：訂單照收，但不會登入那個帳號（看不到別人的訂單）');
  const r1c = client(); await r1c.me();
  const r1 = await mkOrder(r1c, 'newmember@example.com', { privacyOk: true, register: true, newsletter: false });
  const me1 = await r1c.me();
  ok(r1.s === 200 && r1.j.setPassword && me1.user && me1.user.email === 'newmember@example.com', '勾建立會員：自動登入＋拿到設定密碼連結');
  ok((await r1c.post('/api/password/set', { token: r1.j.setPassword, password: 'short' })).s === 400, '設定密碼：太弱擋下');
  ok((await r1c.post('/api/password/set', { token: r1.j.setPassword, password: 'Newpass123' })).s === 200, '設定密碼成功');
  ok((await (await fresh()).post('/api/password/set', { token: r1.j.setPassword, password: 'Hack12345' })).s === 400, '設定密碼連結只能用一次');
  ok((await client().login('newmember@example.com', 'Newpass123')).s === 200, '之後可以用新密碼登入');
  const r3c = client(); await r3c.me();
  ok((await mkOrder(r3c, 'newmember@example.com', { privacyOk: true })).s === 409, '已經是會員的 Email：要先登入（409）');
  ok((await mkOrder(r3c, 'staff1x@lifemap.local', { privacyOk: true })).s === 200 && (await mkOrder(await fresh(), ADMIN, { privacyOk: true })).s === 409, '管理員 Email：一定要登入才能用');
  // ---------- 刪除帳號 ----------
  const dl = client(); await dl.login('newmember@example.com', 'Newpass123');
  ok((await dl.post('/api/settings/delete', { password: 'Newpass123', confirm: '不要' })).s === 400, '刪除帳號：沒輸入「刪除帳號」擋下');
  ok((await dl.post('/api/settings/delete', { password: 'Newpass123', confirm: '刪除帳號' })).s === 400, '刪除帳號：還有待付款的訂單要先取消');
  await dl.post(`/api/my/orders/${r1.j.token}/cancel`, {});
  ok((await dl.post('/api/settings/delete', { password: 'Newpass123', confirm: '刪除帳號' })).s === 200, '刪除帳號成功');
  ok((await client().login('newmember@example.com', 'Newpass123')).s === 400, '刪除後不能登入');
  await wait(1200);
  const dbx = JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'));
  const delOrder = dbx.orders.find((x) => x.token === r1.j.token);
  ok(!JSON.stringify(dbx).includes('newmember@example.com') && delOrder && delOrder.recipient.phone === '' && delOrder.total > 0, '刪除後：資料檔找不到 Email、收件資料清掉、交易金額保留');
  // ---------- 正式模式沒有時鐘、重置 ----------
  ok((await ad.post('/api/admin/clock', { hours: 24 })).s === 404 && (await ad.post('/api/admin/reset', { confirm: 'RESET' })).s === 404, '時鐘快轉、重置：正式模式 404');
  // ---------- 管理員 vs 一般人員 ----------
  const add = await ad.post('/api/admin/users', { email: 'staff1@lifemap.local', name: '小編', role: 'staff' });
  ok(add.s === 200 && typeof add.j.tempPassword === 'string' && add.j.tempPassword.length >= 8, '管理員新增一般人員：拿到臨時密碼');
  ok((await ad.post('/api/admin/users', { email: 'staff1@lifemap.local', name: '小編', role: 'staff' })).s === 400, '同一個 Email 不能新增兩次');
  ok((await ad.post('/api/admin/users', { email: 'x@lifemap.local', name: 'x', role: 'superuser' })).s === 400, '亂填角色：擋下');
  const st = client(); ok((await st.login('staff1@lifemap.local', add.j.tempPassword)).s === 200, '一般人員用臨時密碼登入');
  ok((await st.get('/api/admin/review')).s === 200 && (await st.get('/api/admin/orders')).s === 200, '一般人員：可以審核、看訂單');
  ok((await st.get('/api/admin/users')).s === 404 && (await st.get('/api/admin/payouts')).s === 404 && (await st.post('/api/admin/settings', {})).s === 404 && (await st.post('/api/admin/users', { email: 'y@x.tw', name: 'y', role: 'admin' })).s === 404, '一般人員：不能管人員、撥款、設定，也不能自己新增管理員');
  ok((await bk.post('/api/admin/users', { email: 'z@x.tw', name: 'z', role: 'admin' })).s === 404, '一般會員：新增人員 404');
  const sid = add.j.id;
  const rp = await ad.post(`/api/admin/users/${sid}`, { action: 'resetpw' });
  ok(rp.s === 200 && rp.j.tempPassword && rp.j.tempPassword !== add.j.tempPassword && rp.j.tempPassword !== 'Demo1234', '重設密碼：產生新的臨時密碼（不是固定的 Demo1234）');
  ok((await st.get('/api/admin/review')).s === 401, '重設密碼後，那個人原本的登入被登出（要重新登入）');
  // ---------- 公司自己經營（手手公益模式）----------
  ok((await bk.post('/api/start', { type: 'crowd', title: '我想提案' })).s === 404, '一般會員不能自己發起計畫（改走合作申請）');
  const inq = await anon.post('/api/inquiry', { org: '○○宮', name: '王主委', phone: '0912000111', content: '想募資修繕屋頂，大約一百萬。' });
  ok(inq.s === 200, '合作申請：任何人都能送');
  ok((await anon.post('/api/inquiry', { org: '', name: 'x', phone: '1', content: 'a' })).s === 400, '合作申請：亂填擋下');
  ok((await ad.get('/api/admin/inquiries')).j.some((q) => q.org === '○○宮'), '後台看得到合作申請');
  ok((await bk.get('/api/admin/inquiries')).s === 404, '一般會員看不到合作申請');
  const mk = await ad.post('/api/start', { type: 'crowd', title: '測試新計畫' });
  ok(mk.s === 200, '管理員可以新增計畫');
  const pid2 = mk.j.id;
  ok((await anon.get('/api/p/' + (await ad.get('/api/c/' + pid2)).j.project.slug)).s === 404, '新計畫還沒上架，前台看不到');
  ok((await ad.post(`/api/admin/projects/${pid2}`, { action: 'publish' })).s === 400, '沒有內容、方案不能上架');
  const home2 = (await anon.get('/api/home')).j;
  const moga = home2.live.find((x) => x.slug === 'moga');
  ok(moga && moga.executor === '茅港尾天后宮' && moga.stage && moga.stage.n === 1 && moga.stage.percent === Math.floor(moga.raised / moga.goal * 100), '首頁：執行人、第 1 階段達成率');
  const pm = (await ad.get('/api/c/' + moga.id)).j.project;
  ok((await ad.post(`/api/c/${moga.id}/project`, { ...pm, startAt: pm.startAt, endAt: pm.endAt, stages: [{ name: '基本工程', goal: 154000 }, { name: '全面完工', goal: 600000 }, { name: '<b>x</b>', goal: -5 }] })).s === 200, '設定階段目標（亂填的階段丟掉）');
  const m2 = (await anon.get('/api/p/moga')).j;
  ok(m2.stage.total === 2 && m2.stage.n === 2 && m2.stage.name === '全面完工' && m2.stage.list[0].done, '階段：第 1 階段達成後顯示第 2 階段');
  ok((await bk.post('/api/admin/site', { about: 'x' })).s === 404 && (await st.post('/api/admin/site', { about: 'x' })).s !== 200, '首頁內容只有管理員能改');
  await ad.post('/api/admin/site', { about: '初心', wall: [{ tag: '修廟', text: '很感動', who: '台南陳小姐' }, { text: '', who: '' }] });
  const h3 = (await anon.get('/api/home')).j; ok(h3.about === '初心' && h3.wall.length === 1, '首頁內容：初心、回饋牆（空的丟掉）');
  await wait(1300);
  const db = fs.readFileSync(path.join(dir, 'db.json'), 'utf8');
  ok(!db.includes(rp.j.tempPassword) && !db.includes(ADMIN_PW), '資料檔裡找不到任何明文密碼');
} catch (e) { fail++; console.log('  ✗ 測試中斷：' + (e && e.stack || e)); }
finally { srv.kill(); await wait(200); fs.rmSync(dir, { recursive: true, force: true }); }
console.log(`正式模式：通過 ${pass}、失敗 ${fail}`);
process.exit(fail ? 1 : 0);
