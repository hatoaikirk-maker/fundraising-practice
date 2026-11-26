/**
 * 畫面測試：真的開伺服器，用 jsdom（假的瀏覽器）把前端程式跑起來，一頁一頁點過去，確認每一頁都畫得出來、按鈕會動、沒有出錯
 * （jsdom 沒有排版，畫面好不好看要另外用真的瀏覽器看；這支測的是「功能都接上、不會壞」）
 * 跑法：npm install（裝 jsdom，只有測試用）→ node test/ui_test.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
let JSDOM; try { ({ JSDOM } = await import('jsdom')); } catch { console.log('畫面測試：沒有安裝 jsdom（npm install 之後再跑），略過'); process.exit(0); }
let pass = 0, fail = 0; const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 21000 + Math.floor(Math.random() * 20000), B = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fpp-ui-'));
const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { PATH: process.env.PATH, PORT: String(PORT), DATA_DIR: dir }, stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { await wait(200); try { if ((await fetch(B + '/api/me')).ok) break; } catch { /* */ } }

// ---------- 假的瀏覽器 ----------
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: B + '/', pretendToBeVisual: true });
const W = dom.window;
let cookie = '';
const realFetch = globalThis.fetch;
const errors = [];
Object.assign(globalThis, { Element: W.Element, window: W, document: W.document, history: W.history, location: W.location, Node: W.Node, sessionStorage: W.sessionStorage, localStorage: W.localStorage, FormData: W.FormData, Blob: W.Blob, URL: W.URL, URLSearchParams: W.URLSearchParams, HTMLElement: W.HTMLElement, confirm: () => true, scrollTo: () => {} });
W.scrollTo = () => {};
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async () => {} } }, configurable: true });
globalThis.fetch = async (u, opt = {}) => {
  const url = String(u).startsWith('http') ? u : B + u;
  const headers = { ...(opt.headers || {}), ...(cookie ? { cookie } : {}) };
  const r = await realFetch(url, { ...opt, headers });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return r;
};
W.addEventListener('error', (e) => errors.push(e.message));
process.on('unhandledRejection', (e) => errors.push(String(e && e.stack || e)));
const view = () => W.document.getElementById('view');
const text = () => (view() ? view().textContent : '');
const until = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(40); } return false; };
const core = await import(pathToFileURL(path.join(ROOT, 'public/js/core.js')).href);
await import(pathToFileURL(path.join(ROOT, 'public/js/main.js')).href);
const visit = async (href, expect) => { core.go(href); const good = await until(() => !text().includes('載入中') && (typeof expect === 'function' ? expect() : text().includes(expect))); ok(good, `${href}：${typeof expect === 'string' ? '看到「' + expect + '」' : '畫得出來'}${good ? '' : '（實際：' + text().slice(0, 120) + '）'}`); return good; };
const click = (sel, txt) => { const el = [...W.document.querySelectorAll(sel)].find((e) => !txt || e.textContent.includes(txt)); if (!el) return false; el.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); return true; };
const login = async (email) => { await core.api('/api/login', { email, password: 'Demo1234' }); await core.loadMe(); };

try {
  await until(() => view());
  // ---------- 前台（沒登入）----------
  await visit('/', '群眾集資');
  ok(W.document.querySelector('.ribbon').textContent.includes('模擬'), '頁首：練習平台提示');
  await visit('/explore', '探索');
  await visit('/explore?type=subscription', '每月點一盞平安燈');
  // 嘖嘖移植的計畫：圖片、GIF、Vimeo（不公開連結要帶 h=）、回饋圖片
  await visit('/p/moga', '全台唯一・大北門媽祖');
  ok(W.document.querySelectorAll('.rich img[src^="https://assets.zeczec.com/"]').length >= 20 && W.document.querySelectorAll('.ocard').length === 8, '茅港尾：內容圖片、8 個回饋都在');
  await visit('/p/sihu', '參天宮');
  ok([...W.document.querySelectorAll('.rich iframe')].some((f) => /^https:\/\/player\.vimeo\.com\/video\/\d+\?h=[a-f0-9]+$/.test(f.src)), '參天宮：Vimeo 不公開影片帶 h 參數、其他參數不帶');
  await visit('/p/hsu', '福興宮'); await visit('/p/pray', '八間廟');
  await visit('/p/demo-light-wall', '光明燈牆');
  ok(W.document.querySelectorAll('.ocard').length === 3, '計畫頁：三張回饋卡');
  ok(!!W.document.querySelector('.rich h3') && !W.document.querySelector('script:not([src])'), '計畫內容：大標變成標題、沒有被塞 script');
  await visit('/p/demo-light-wall?tab=updates', '贊助人限定');
  ok(text().includes('只有特定回饋的贊助人看得到'), '贊助人限定的更新：鎖住');
  await visit('/p/demo-light-wall?tab=comments', '已護持');
  await visit('/p/demo-light-wall?tab=faqs', '沒有達到募資目標');
  await visit('/p/demo-light-wall?tab=backers', '贊助人');
  await visit('/p/demo-light-wall?code=VIP2027', '親友限定');
  await visit('/start', '群眾集資');
  await visit('/help/payment', '撥款');
  await visit('/u/creator', '麥睿示範提案人');
  await visit('/me/orders', '請先登入');
  await visit('/login', '練習帳號');
  // ---------- 贊助人：結帳 ----------
  await login('backer3@demo.local');
  const p = await core.api('/api/p/demo-light-wall');
  await visit(`/p/demo-light-wall/checkout?option=${p.options[0].id}`, '1. 回饋與數量');
  await until(() => text().includes('總金額'));   // 金額試算是非同步的，等它算完
  ok(text().includes('2. 收件資料') && text().includes('4. 付款方式') && text().includes('總金額'), '結帳頁：數量、收件、付款、金額試算都在');
  await wait(300); ok(!/\bnull\b|undefined/.test(text()), '結帳頁：沒有出現 null／undefined 字樣（實看抓到的）');
  const surveyInputs = [...W.document.querySelectorAll('.checkout input[type=text], .checkout select')];
  ok(surveyInputs.length > 5, '結帳頁：輸入欄位都有');
  // 填表下單（直接用畫面的欄位）
  const setVal = (label, v) => { const lab = [...W.document.querySelectorAll('label.field')].find((l) => l.querySelector('span') && l.querySelector('span').textContent.startsWith(label)); const e = lab && lab.querySelector('input,select,textarea'); if (!e) return false; e.value = v; e.dispatchEvent(new W.Event('change', { bubbles: true })); e.dispatchEvent(new W.Event('input', { bubbles: true })); return true; };
  ok(setVal('電話', '0912345678') && setVal('街道與門牌', '練習路 3 號'), '結帳頁：填收件資料');
  setVal(`${p.options[0].name}｜祈福姓名`, '陳志豪'); setVal(`${p.options[0].name}｜鐘別`, '光明');
  const payRadio = [...W.document.querySelectorAll('input[name=pay]')][0]; payRadio.checked = true; payRadio.dispatchEvent(new W.Event('change', { bubbles: true }));
  click('button', '確認並前往付款');
  ok(await until(() => text().includes('信用卡付款')), '下單後：到付款頁');
  setVal('卡號末四碼', '4242'); click('button.big', '付款');
  ok(await until(() => text().includes('贊助成功')), '付款後：贊助成功');
  await visit('/me/orders', '付款成功');
  ok(W.document.querySelectorAll('.order').length >= 2, '贊助紀錄：列出訂單');
  await visit('/me/following', '追蹤計畫');
  await visit('/me/mail', '贊助成功');
  await visit('/me/settings', '帳號設定');
  await visit('/me/team', '團隊設定');
  await visit('/me/inbox', '站內訊息');
  // ---------- 提案人後台：每一頁 ----------
  await login('creator@demo.local');
  const pid = p.id;
  await visit('/me/projects', '提案紀錄');
  for (const [k, word] of [['', '控制中心'], ['/edit', '專案時程與目標'], ['/faqs', '管理常見問答'], ['/options', '計畫回饋'], ['/options/new', '回饋調查'], ['/reorder', '自訂回饋順序'], ['/coupons', '管理折扣碼'], ['/referrers', '計畫推薦連結列表'], ['/edm', '未結帳 EDM 再行銷設定'], ['/updates', '計畫更新'], ['/updates/new', '更新計畫動態'], ['/metrics', '募得金額成長表'], ['/backers', '贊助名單下載'], ['/orders', '訂單總覽'], ['/refunds', '退款申請總覽'], ['/comments', '留言管理'], ['/business', '銀行帳戶資訊'], ['/payment', '合作金流商店']]) await visit(`/c/${pid}${k}`, word);
  ok(W.document.querySelectorAll('.side .side-a').length === 16, '後台左邊選單：16 項');
  await visit(`/c/${pid}/options/${p.options[0].id}`, '已經有');
  ok(text().includes('上傳圖片／GIF／影片'), '回饋圖片：可以放 GIF 或影片');
  await visit(`/c/${pid}/edit`, '計畫內容');
  ok(W.document.querySelectorAll('.toolbar .tool').length >= 15, '內容編輯器：工具列（大標、小標、顏色、連結、圖片、影片…）');
  click('.tool', '預覽'); ok(!!W.document.querySelector('.preview .rich'), '編輯器：預覽畫得出來');
  // ---------- 平台後台：每一頁 ----------
  await login('admin@demo.local');
  for (const [k, word] of [['', '總覽'], ['/review', '提案審核'], ['/projects', '計畫管理'], ['/orders', '訂單管理'], ['/refunds', '退款處理'], ['/reports', '檢舉處理'], ['/comments', '留言管理'], ['/notices', '首頁公告'], ['/users', '會員管理'], ['/payouts', '撥款結算'], ['/settings', '平台設定'], ['/emails', '寄信紀錄'], ['/audit', '操作紀錄'], ['/clock', '模擬時鐘']]) await visit('/admin' + k, word);
  ok(text().includes('快轉 1 天'), '模擬時鐘：快轉按鈕');
  // 專案經理看不到 admin 限定的選單
  await login('pm@demo.local'); await visit('/admin', '總覽');
  ok(![...W.document.querySelectorAll('.side-a')].some((a) => a.textContent === '撥款結算'), '專案經理：看不到撥款、設定這些選單');
  // XSS：留言放 HTML，畫面只會顯示成字
  await login('backer1@demo.local');
  await core.api('/api/p/demo-light-wall/comments', { body: '<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>' });
  await visit('/p/demo-light-wall?tab=comments', '<img src=x');
  await wait(200);
  ok(!W.__xss && !W.document.querySelector('.cmt img') && !W.document.querySelector('.cmt script'), 'XSS：留言裡的 HTML 只會顯示成文字');
  ok(errors.length === 0, '整個過程沒有 JavaScript 錯誤' + (errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''));
} catch (e) { fail++; console.log('  ✗ 測試中斷：' + (e && e.stack || e)); }
finally { srv.kill(); await wait(200); fs.rmSync(dir, { recursive: true, force: true }); }
console.log(`畫面：通過 ${pass}、失敗 ${fail}`);
process.exit(fail ? 1 : 0);
