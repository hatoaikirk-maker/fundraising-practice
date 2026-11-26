/**
 * 人生地圖募資：頁首（Logo、探索、發起計畫、搜尋、站內訊息、個人選單）、頁尾（幫助、關於、公司資訊）、公告列，然後依網址畫頁面
 */
import { h, link, go, api, state, loadMe, render, onRender, setNotFound, route, act, $ } from './core.js';
import './front.js';
import './creator.js';
import './admin.js';

/** Logo：紅色方塊裡一個圓（像一盞燈）＋「人生地圖募資」；不用任何別家平台的標誌 */
const logo = () => h('span', { class: 'logo' }, h('i', { 'aria-hidden': 'true' }), h('span', {}, '人生地圖'), h('em', {}, '募資'));
function header() {
  const me = state.me;
  const q = h('input', { type: 'search', placeholder: '搜尋計畫', 'aria-label': '搜尋計畫' });
  const menu = h('div', { class: 'menu hidden' });
  if (me) menu.append(
    link('/u/' + me.slug, '個人頁面'), link('/me/orders', '贊助紀錄'), link('/me/following', '追蹤計畫'), link('/me/mail', '通知信箱'), link('/me/settings', '帳號設定'), me.role !== 'member' ? link('/me/projects', '我管理的專案') : null,
    me.role !== 'member' ? link('/admin', me.role === 'admin' ? '平台管理後台（管理員）' : '平台管理後台（一般人員）', 'strong') : null,
    h('button', { class: 'linkbtn', on: { click: async () => { if (await act(() => api('/api/logout', {}), '已登出')) { await loadMe(); go('/'); } } } }, '登出'));
  const user = me ? h('button', { class: 'avatar-btn', 'aria-label': '個人選單', on: { click: (e) => { e.stopPropagation(); menu.classList.toggle('hidden'); } } }, me.avatar ? h('img', { src: me.avatar, alt: '' }) : me.name.slice(0, 1)) : h('span', { class: 'top-auth' }, link('/login?next=' + encodeURIComponent(location.pathname), '登入', 'btn sm ghost'), link('/register', '註冊', 'btn sm'));
  document.addEventListener('click', () => menu.classList.add('hidden'));
  // 手機：選單收進「☰」，點了展開、點連結後收起
  const nav = h('nav', { class: 'top-nav', on: { click: (e) => { if (e.target.closest('a')) nav.classList.remove('open'); } } }, link('/#story', '人生地圖初心'), link('/explore', '護持專案'), link('/explore?status=success', '歷年專案'), link('/inquiry', '合作申請'));
  const burger = h('button', { class: 'burger', 'aria-label': '選單', on: { click: (e) => { e.stopPropagation(); nav.classList.toggle('open'); } } }, '☰');
  document.addEventListener('click', () => nav.classList.remove('open'));
  return h('header', { class: 'top' }, h('div', { class: 'top-in' },
    link('/', logo(), null),
    burger, nav,
    h('form', { class: 'top-search', on: { submit: (e) => { e.preventDefault(); go('/explore?q=' + encodeURIComponent(q.value)); } } }, q),
    me ? link('/me/inbox', state.unread ? `訊息 (${state.unread})` : '訊息', 'top-msg') : null,
    h('div', { class: 'user' }, user, menu)));
}
const HELP = {
  faq: ['常見問答', '## 贊助\n- 計畫成功後，依你贊助的方案得到回饋與祈福。\n- 群眾集資計畫如果沒有達標，贊助金額會全額退回（虛擬帳號轉帳手續費不退）。\n- 募資期間可以在「贊助紀錄」自行取消；結束後可以申請退款，由提案團隊審核。\n## 提案\n- 想替你熟悉的廟宇發起計畫？到「發起計畫」建立草稿，我們的專案人員會跟你聯繫。\n- 計畫依序經過五個審核階段，全部通過才會上線。'],
  terms: ['使用條款', '歡迎使用人生地圖募資（以下稱本平台），由麥睿資訊股份有限公司經營。\n\n- 使用本平台即表示你同意本條款。\n- 贊助款項用於各計畫頁面所載的用途；回饋內容、出貨時程依各計畫頁面為準。\n- 請提供正確的聯絡與收件資料，資料錯誤導致無法寄送或祈福登錄，提案團隊恕不負責。\n- 本平台保留審核、下架計畫與停權帳號的權利。'],
  privacy: ['隱私權政策', '- 我們只收集提供服務所需的資料：Email、名稱、收件資料、回饋調查內容。\n- 收件資料只有該訂單的贊助人、計畫團隊與平台人員看得到；計畫頁的贊助人名單只顯示遮罩後的名字。\n- 密碼以 scrypt 加鹽雜湊保存，平台人員也看不到。\n- 除寄送所需的物流業者外，不會提供給第三方。'],
  antifraud: ['反詐騙宣導', '## 請注意\n- 人生地圖募資**只會在本網站收款**，不會用私訊、電話要求你轉帳、操作 ATM 或提供信用卡號。\n- 我們不會要求你「解除分期」「重新設定付款」。\n- 有人自稱我們的人員、要你匯款到個人帳戶，請不要理會，並撥打 **165 反詐騙專線**。\n- 對訂單有疑問，請在「贊助紀錄」查看，或透過專案頁「聯繫我們」詢問。'],
  payment: ['付款說明', '## 付款方式\n- **信用卡**：部分方案可分期（3 期、6 期）。\n- **ATM 虛擬帳號**：訂單成立隔天 23:59:59 前付款；逾期訂單取消、名額放回。\n- 線上付款開放前，訂單會先保留，開放後會另行通知。\n## 撥款\n- 群眾集資：專案完結後 28 個工作日內撥款給提案團隊。\n- 訂閱專案：次月 15 日撥款。'],
};
route('/help/:page', async ({ page }) => { const [t, c] = HELP[page] || HELP.faq; const { markup } = await import('./core.js'); return h('div', { class: 'narrow card' }, h('h1', {}, t), markup(c)); });
function footer() {
  return h('footer', { class: 'foot' },
    h('div', { class: 'foot-in' },
      h('div', {}, logo(), h('span', {}, '陪在地廟宇把香火與文化，帶給更多人。每一份護持，都會回到廟裡。')),
      h('div', {}, h('b', {}, '關於我們'), link('/#story', '人生地圖初心'), link('/help/privacy', '隱私及條款'), link('/inquiry', '宮廟合作申請'), link('/help/antifraud', '反詐騙宣導')),
      h('div', {}, h('b', {}, '幫助'), link('/explore', '護持專案'), link('/help/faq', '常見問答'), link('/help/payment', '付款說明'), link('/help/terms', '使用條款'))),
    h('div', { class: 'foot-copy' }, `© ${new Date().getFullYear()} 麥睿資訊股份有限公司・人生地圖募資`));
}
function frame() {
  const notices = (state.notices || []).slice(0, 1);
  document.body.replaceChildren(notices.length ? h('div', { class: 'notice' }, h('b', {}, notices[0].title), '　', notices[0].body) : '', header(), h('main', { id: 'view', class: 'wrap' }), footer());
}
setNotFound(() => h('div', { class: 'card center' }, h('h2', {}, '找不到這一頁'), link('/', '回首頁', 'btn')));
let lastUser = undefined;
onRender(() => { const id = state.me ? state.me.id : 0; if (id !== lastUser) { lastUser = id; const v = $('#view'), keep = v ? [...v.childNodes] : []; frame(); $('#view').replaceChildren(...keep); } });
(async () => { await loadMe(); lastUser = state.me ? state.me.id : 0; frame(); render(); })();
