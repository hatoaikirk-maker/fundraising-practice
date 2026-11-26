/**
 * 啟動：頁首（探索、提案、搜尋、站內訊息、個人選單）、頁尾（幫助、關於）、公告列，然後依網址畫頁面
 */
import { h, link, go, api, state, loadMe, render, onRender, setNotFound, route, act, $ } from './core.js';
import './front.js';
import './creator.js';
import './admin.js';

function header() {
  const me = state.me;
  const q = h('input', { type: 'search', placeholder: '搜尋計畫', 'aria-label': '搜尋計畫' });
  const menu = h('div', { class: 'menu hidden' });
  if (me) menu.append(
    link('/u/' + me.slug, '個人頁面'), link('/me/orders', '贊助紀錄'), link('/me/following', '追蹤計畫'), link('/me/projects', '提案紀錄'), link('/me/mail', '我的信箱（模擬）'), link('/me/settings', '帳號設定'), link('/me/team', '團隊設定'),
    me.role !== 'member' ? link('/admin', '平台管理後台', 'strong') : null,
    h('button', { class: 'linkbtn', on: { click: async () => { if (await act(() => api('/api/logout', {}), '已登出')) { await loadMe(); go('/'); } } } }, '登出'));
  const user = me ? h('button', { class: 'avatar-btn', 'aria-label': '個人選單', on: { click: (e) => { e.stopPropagation(); menu.classList.toggle('hidden'); } } }, me.avatar ? h('img', { src: me.avatar, alt: '' }) : me.name.slice(0, 1)) : h('span', {}, link('/login?next=' + encodeURIComponent(location.pathname), '登入'), ' ', link('/register', '註冊', 'btn sm'));
  document.addEventListener('click', () => menu.classList.add('hidden'));
  return h('header', { class: 'top' }, h('div', { class: 'top-in' },
    link('/', h('span', { class: 'logo' }, h('b', {}, '募資'), '練習平台')),
    h('nav', { class: 'top-nav' }, link('/explore', '探索'), link('/start', '提案')),
    h('form', { class: 'top-search', on: { submit: (e) => { e.preventDefault(); go('/explore?q=' + encodeURIComponent(q.value)); } } }, q),
    me ? link('/me/inbox', state.unread ? `訊息 (${state.unread})` : '訊息', 'top-msg') : null,
    h('div', { class: 'user' }, user, menu)));
}
const HELP = {
  faq: ['常見問答', '## 贊助\n- 計畫成功後，依你贊助的金額得到回饋。\n- 計畫如果失敗，贊助金額會退回（虛擬帳號轉帳手續費不退）。\n- 募資期間可以在「贊助紀錄」取消；結束後可以申請退款，由提案人或平台審核。\n## 提案\n- 發起不用錢，成功才收平台手續費＋金流費。\n- 提案後依序經過五個審核階段，全部通過才會上線。'],
  terms: ['使用條款（練習用）', '這是給新同事練習群眾募資作業的平台。\n\n- 所有金流都是模擬的，不會真的扣款或撥款。\n- 請不要輸入真實的身分證字號、銀行帳號、信用卡號。\n- 平台人員可能隨時重置練習資料。'],
  privacy: ['隱私權政策（練習用）', '- 練習平台只存你自己輸入的資料，存在架設這台電腦的 data 資料夾。\n- 收件資料只有該訂單的贊助人、計畫團隊、平台人員看得到；前台贊助人名單只顯示遮罩後的名字。\n- 密碼用 scrypt 加鹽雜湊保存，平台人員也看不到。'],
  payment: ['金流運作說明', '## 付款方式\n- **信用卡**：可設定分期（3 期、6 期）。練習用：卡號末四碼輸入 0002 會被拒絕，其他都會成功。\n- **ATM 虛擬帳號**：訂單成立隔天 23:59:59 前付款；逾期訂單取消、名額放回。\n- **AFTEE 先享後付**：模擬，按付款就成功。\n## 撥款\n- 群眾集資、預購式：專案完結後 28 個工作日內撥款。\n- 訂閱專案：次月 15 日撥款。\n- 撥款金額＝集資總額 − 金流服務費 − 平台手續費（預設合計 8%）。'],
};
route('/help/:page', async ({ page }) => { const [t, c] = HELP[page] || HELP.faq; const { markup } = await import('./core.js'); return h('div', { class: 'narrow card' }, h('h1', {}, t), markup(c)); });
function footer() {
  return h('footer', { class: 'foot' }, h('div', { class: 'foot-in' }, h('div', {}, h('b', {}, '幫助'), link('/help/faq', '常見問答'), link('/help/terms', '使用條款'), link('/help/privacy', '隱私權政策'), link('/help/payment', '金流運作說明')),
    h('div', {}, h('b', {}, '關於'), h('span', {}, '募資練習平台：給新同事練習用，流程參考台灣主流群眾募資平台的公開規則；不是任何平台的官方系統。'))));
}
function frame() {
  const notices = (state.notices || []).slice(0, 1);
  document.body.replaceChildren(h('div', { class: 'ribbon' }, '練習平台・所有金流都是模擬的，不會真的扣款'), notices.length ? h('div', { class: 'notice' }, h('b', {}, notices[0].title), '　', notices[0].body) : '', header(), h('main', { id: 'view', class: 'wrap' }), footer());
}
setNotFound(() => h('div', { class: 'card center' }, h('h2', {}, '找不到這一頁'), link('/', '回首頁', 'btn')));
let lastUser = undefined;
onRender(() => { const id = state.me ? state.me.id : 0; if (id !== lastUser) { lastUser = id; const v = $('#view'), keep = v ? [...v.childNodes] : []; frame(); $('#view').replaceChildren(...keep); } });
(async () => { await loadMe(); lastUser = state.me ? state.me.id : 0; frame(); render(); })();
