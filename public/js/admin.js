/**
 * 平台管理後台：審核提案、管理計畫、會員、訂單、退款、撥款、檢舉、留言、公告、平台設定、寄信紀錄、操作紀錄
 * 兩種平台人員（KIRK：「管理人員要區分，admin，跟一般人員」）：
 *   - 管理員（admin）：全部功能，另外可以新增／管理人員、看撥款、改平台設定、看寄信與操作紀錄
 *   - 一般人員（staff）：日常作業——審核、計畫、訂單、退款、檢舉、留言、公告
 * 權限一律在伺服器再檢查一次；這裡只是把看不到的選單藏起來。
 * 測試模式（DEMO=1）才有「時鐘與重置」。
 */
import { h, link, go, api, state, loadMe, toast, act, modal, ask, money, num, dt, dtInput, ago, field, inp, area, sel, chk, table, badge, markup, route } from './core.js';

// [網址, 名稱, 只有管理員看得到, 只有測試模式才有]
// 正式模式拿掉：審核流程、檢舉、首頁公告（KIRK 指示）；只留在測試模式（m[3]＝true）給自動測試用
const MENU = [['', '總覽'], ['messages', '客服訊息'], ['report', '總體報表'], ['ai', 'AI 助理', true], ['projects', '計畫管理'], ['inquiries', '合作申請'], ['orders', '訂單管理'], ['refunds', '退款處理'], ['comments', '留言管理'],
  ['review', '審核流程', false, true], ['reports', '檢舉處理', false, true], ['notices', '首頁公告', false, true],
  ['users', '人員與會員', true], ['site', '首頁內容', true], ['payouts', '撥款結算', true], ['settings', '平台設定', true], ['emails', '寄信紀錄', true], ['audit', '操作紀錄', true], ['clock', '時鐘與重置（測試模式）', true, true]];
const ROLE_NAMES = { member: '一般會員', staff: '一般人員', admin: '管理員' };
async function shell(key, content) {
  // 後台只有一個入口：/admin（KIRK：「我要從哪裡登入」）——沒登入就直接在這裡登入，登入後回到這一頁
  if (!state.me) return adminLogin();
  if (state.me.role === 'member') return h('div', { class: 'card closed narrow' }, h('h2', {}, '這個帳號沒有後台權限'), h('p', { class: 'muted' }, '後台只給人生地圖的平台人員使用。'), link('/', '回首頁', 'btn'));
  const isAdmin = state.me && state.me.role === 'admin';
  const side = h('nav', { class: 'side admin' }, h('div', { class: 'side-h' }, h('b', {}, '募資上架後台'), h('div', { class: 'small muted' }, state.me ? state.me.name : ''), h('span', { class: 'role-tag' + (isAdmin ? '' : ' staff') }, isAdmin ? '管理員' : '一般人員')), MENU.filter((m) => (!m[2] || isAdmin) && (!m[3] || state.demo)).map(([k, label]) => link(`/admin${k ? '/' + k : ''}`, label, 'side-a' + (k === key ? ' on' : ''))));
  return h('div', { class: 'dash' }, side, h('div', { class: 'dash-main' }, await content()));
}
const reload = () => go(location.pathname + location.search, true);
/** 分頁列：上一頁／第 N／共 M 頁／下一頁（不要一次拉一長串） */
function pager(d, to) {
  const pages = Math.max(1, Math.ceil(d.total / d.per));
  if (pages <= 1) return h('p', { class: 'small muted' }, `共 ${num(d.total)} 筆`);
  return h('div', { class: 'pager' }, h('button', { class: 'btn sm ghost', disabled: d.page <= 1, on: { click: () => to(d.page - 1) } }, '‹ 上一頁'), h('span', { class: 'small muted' }, `第 ${d.page} / ${pages} 頁・共 ${num(d.total)} 筆`), h('button', { class: 'btn sm ghost', disabled: d.page >= pages, on: { click: () => to(d.page + 1) } }, '下一頁 ›'));
}
const qs = (o) => { const n = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== '' && v !== undefined && v !== null) n.set(k, v); return n.toString(); };
function adminLogin() {
  const em = inp('', { type: 'email', autocomplete: 'username' }), pw = inp('', { type: 'password', autocomplete: 'current-password' });
  return h('form', { class: 'card auth', on: { submit: async (e) => { e.preventDefault(); if (await act(() => api('/api/login', { email: em.value, password: pw.value }), '登入成功')) { await loadMe(); reload(); } } } },
    h('h1', {}, '募資上架後台'), h('p', { class: 'muted tc' }, '人生地圖平台人員登入'), field('Email', em), field('密碼', pw), h('button', { class: 'btn full big' }, '登入後台'));
}

route('/admin', async () => shell('', async () => {
  const d = await api('/api/admin/overview');
  // 儀表板：上面是錢，下面是「今天要處理的事」，點了直接到那一頁
  const todo = (n, label, href, hint) => link(href, [h('b', {}, num(n)), h('span', {}, label), hint ? h('small', {}, hint) : null], 'todo' + (n ? ' hot' : ''));
  const max7 = Math.max(1, ...d.last7.map((x) => x.amount));
  return h('div', {}, h('div', { class: 'row between' }, h('h1', {}, '總覽'), h('span', { class: 'small muted' }, dt(d.now))), d.clockOffset ? h('p', { class: 'warn' }, `時鐘已快轉 ${Math.round(d.clockOffset / 3_600_000)} 小時`) : null,
    h('div', { class: 'kpis' }, [['今日營業額', money(d.todayAmount), `${num(d.todayOrders)} 筆`], ['本月營業額', money(d.monthAmount)], ['累計', money(d.totalAmount)], ['會員', num(d.users)]].map(([k, v, s]) => h('div', { class: 'kpi' }, h('span', {}, k), h('b', {}, v), s ? h('span', {}, s) : null))),
    h('h2', { class: 'h2s' }, '待處理'),
    h('div', { class: 'todos' }, todo(d.messages, '客服訊息未讀', '/admin/messages', '信眾從「聯繫我們」寄來'), todo(d.refunds, '退款申請', '/admin/refunds?status=pending'), todo(d.inquiries, '新的合作申請', '/admin/inquiries'), todo(d.comments, '留言還沒回覆', '/admin/comments', '近 30 天'), todo(d.unshipped, '已付款未出貨', '/admin/orders?status=paid&real=1'), todo(d.pendingOrders, '待付款訂單', '/admin/orders?status=pending')),
    h('div', { class: 'grid2' },
      h('section', { class: 'card tight' }, h('h3', {}, '近 7 天營業額'), h('div', { class: 'bars' }, d.last7.map((x) => h('div', { class: 'bar-row' }, h('span', {}, x.day), h('div', { class: 'bar-t' }, h('i', { style: { width: (x.amount / max7 * 100) + '%' } })), h('span', { class: 'tr' }, money(x.amount)))))),
      h('section', { class: 'card tight' }, h('h3', {}, '7 天內結束的專案'), d.ending.length ? h('ul', { class: 'list' }, d.ending.map((p) => h('li', {}, link(`/c/${p.id}`, p.title), h('span', { class: 'muted small' }, '　' + dt(p.endAt, false))))) : h('p', { class: 'muted small' }, '沒有'))));
}));
// ---------- 客服訊息（信眾從專案頁「聯繫我們」寄來的）----------
route('/admin/messages', async () => shell('messages', async () => {
  const list = await api('/api/admin/messages');
  const item = (t) => { const box = area('', 3, { placeholder: '回覆內容' });
    return h('details', { class: 'acc', on: { toggle: (e) => { if (e.target.open && t.unread) api('/api/admin/messages', { userId: t.userId, action: 'read' }).catch(() => {}); } } },
      h('summary', {}, h('span', { class: 'acc-t' }, t.name, t.unread ? badge(`${t.unread} 則未讀`, 'red') : null), h('span', { class: 'acc-s' }, t.last.body.slice(0, 40)), h('span', { class: 'small muted' }, ago(t.last.at))),
      h('div', { class: 'acc-b' }, h('p', { class: 'small muted' }, t.email), h('div', { class: 'chat' }, t.list.map((m) => h('div', { class: 'msg ' + (m.mine ? 'mine' : '') }, m.project ? h('div', { class: 'small muted' }, '關於：' + m.project) : null, h('p', { class: 'pre' }, m.body), h('div', { class: 'small muted' }, dt(m.at))))),
        box, h('button', { class: 'btn sm', on: { click: async () => { if (await act(() => api('/api/admin/messages', { userId: t.userId, body: box.value }), '已回覆')) reload(); } } }, '回覆'))); };
  return h('div', {}, h('h1', {}, '客服訊息'), list.length ? list.map(item) : h('p', { class: 'muted' }, '還沒有訊息'));
}));

// ---------- 提案審核 ----------
route('/admin/review', async () => shell('review', async () => {
  const list = await api('/api/admin/review');
  const decide = async (p, step, decision) => {
    let note = '', startAt;
    if (decision === 'rejected') { note = await ask('退回：' + state.meta.steps.find((s) => s.key === step).name, '退回原因（提案人會收到）', { multiline: true }); if (!note) return; }
    if (step === 'ready' && decision === 'ok') { startAt = await ask('排定上線', '上線時間（YYYY-MM-DD HH:mm，台灣時間；空白＝照提案人填的）', { value: dtInput(p.startAt) }); if (startAt === undefined) return; }
    if (await act(() => api(`/api/admin/projects/${p.id}/step`, { step, decision, note, startAt }), decision === 'ok' ? '已通過' : '已退回')) reload();
  };
  const detail = (p) => modal('審核資料：' + p.title, h('div', {},
    h('h4', {}, '商業檔案'), p.business ? h('ul', { class: 'small' }, [['身分', p.business.kind === 'person' ? '自然人' : '法人'], ['名稱', p.business.companyName], ['統一編號', p.business.ubn], ['負責人', p.business.fullname], ['手機', p.business.mobile], ['銀行', `${p.business.bankCode}-${p.business.bankBranch} ${p.business.bankAccount}`], ['狀態', p.business.status]].map(([k, v]) => h('li', {}, `${k}：${v || '—'}`))) : h('p', { class: 'muted' }, '還沒填'),
    h('h4', {}, '金流帳號申請'), p.payment ? h('ul', { class: 'small' }, p.payment.providers.map((pv) => h('li', {}, `${pv.name}（${pv.methods}）：${pv.status}`)), h('li', {}, p.payment.submitted ? '已送出' : '還沒送出')) : h('p', { class: 'muted' }, '還沒申請'),
    h('h4', {}, '合約'), p.contract && p.contract.file ? h('a', { href: p.contract.file, target: '_blank', rel: 'noopener' }, '下載合約檔案') : h('p', { class: 'muted' }, '還沒上傳'),
    h('h4', {}, '計畫'), h('p', {}, `回饋選項 ${p.options} 個｜目標 ${money(p.goal)}｜${dt(p.startAt)} ～ ${dt(p.endAt)}`), link('/p/' + p.slug, '預覽計畫頁 ↗')));
  return h('div', {}, h('h1', {}, '提案審核'), h('p', { class: 'small muted' }, '五個階段依序審：商業檔案與金流帳號初審 → 方案與回饋 → 合約簽署與上傳 → 第三方金流單位審核→ 準備上線（排定時間，時間到自動上線）。退回一定要寫原因。'),
    list.length ? list.map((p) => h('section', { class: 'card' }, h('div', { class: 'row between' }, h('div', {}, h('b', {}, p.title), h('div', { class: 'small muted' }, `提案人 ${p.owner}｜專案經理 ${p.manager || '未指派'}｜${p.typeName}｜`, badge(p.statusName, p.status))), h('button', { class: 'btn sm ghost', on: { click: () => detail(p) } }, '看審核資料')),
      table(['階段', '狀態', '備註', '操作'], state.meta.steps.map((s) => [s.name, badge(state.meta.stepStates[p.steps[s.key]], p.steps[s.key]), (p.stepNotes || {})[s.key] || '', p.steps[s.key] === 'pending' ? h('div', { class: 'row' }, h('button', { class: 'btn sm', on: { click: () => decide(p, s.key, 'ok') } }, '通過'), h('button', { class: 'btn sm danger', on: { click: () => decide(p, s.key, 'rejected') } }, '退回')) : ''])))) : h('p', { class: 'muted' }, '沒有待審核的計畫'));
}));

// ---------- 計畫管理 ----------
route('/admin/projects', async (_, q) => shell('projects', async () => {
  const [list, staff] = await Promise.all([api('/api/admin/projects?' + new URLSearchParams(q).toString()), api('/api/admin/staff')]);
  const kw = inp(q.q || '', { type: 'search', placeholder: '計畫名稱或網址' }), st = sel({ '': '全部狀態', ...state.meta.projectStatus }, q.status || '');
  const doA = async (p, action, extra = {}) => { if (action === 'suspend') { extra.note = await ask('下架計畫', '原因（提案人會收到）', { multiline: true }); if (!extra.note) return; } if (await act(() => api(`/api/admin/projects/${p.id}`, { action, ...extra }))) reload(); };
  const sched = (p) => { const s = inp(dtInput(p.startAt)), e = inp(dtInput(p.endAt)); modal('調整時間：' + p.title, h('div', {}, field('開始 (UTC+8)', s), field('結束 (UTC+8)', e), h('p', { class: 'small muted' }, '延長募資、提前結束都在這裡；改成過去的時間＝下次巡檢就結束。')), [{ text: '儲存', fn: async () => { const ok = await act(() => api(`/api/admin/projects/${p.id}`, { action: 'schedule', startAt: s.value, endAt: e.value })); if (ok) reload(); return !!ok; } }]); };
  const mgr = (p) => { const s = sel(Object.fromEntries(staff.map((u) => [u.id, u.name])), String(p.managerId || '')); modal('指派專案經理', field('專案經理', s), [{ text: '指派', fn: async () => { const ok = await act(() => api(`/api/admin/projects/${p.id}`, { action: 'manager', managerId: Number(s.value) })); if (ok) reload(); return !!ok; } }]); };
  const create = async () => { const type = sel(state.meta.types, 'crowd'), title = inp(''); modal('新增計畫', h('div', {}, field('類型', type), field('計畫名稱', title), h('p', { class: 'small muted' }, '建好後進後台寫內容、方案，再回這裡按「上架」。')), [{ text: '建立', fn: async () => { const r = await act(() => api('/api/start', { type: type.value, title: title.value }), '已建立草稿'); if (r) go(`/c/${r.id}/edit`); return !!r; } }]); };
  return h('div', {}, h('div', { class: 'row between' }, h('h1', {}, '計畫管理'), h('button', { class: 'btn', on: { click: create } }, '＋ 新增計畫')), h('form', { class: 'filters', on: { submit: (e) => { e.preventDefault(); const n = new URLSearchParams(); if (kw.value) n.set('q', kw.value); if (st.value) n.set('status', st.value); go('/admin/projects?' + n.toString()); } } }, kw, st, h('button', { class: 'btn' }, '搜尋')),
    // KIRK：「右邊那一排按鈕放到案子下面，排成一行」→ 每個計畫一張卡：上面資料、下面一排按鈕
    list.length ? h('div', { class: 'plist' }, list.map((p) => h('article', { class: 'pitem' },
      h('div', { class: 'pitem-top' },
        p.cover ? h('img', { src: p.cover, alt: '', class: 'pitem-img' }) : null,
        h('div', { class: 'pitem-info' },
          h('div', { class: 'row' }, link('/p/' + p.slug, p.title, 'pitem-title'), badge(p.statusName, p.status), p.featured ? badge('主打') : null, p.staffPick ? badge('精選', 'gold') : null),
          h('div', { class: 'pitem-meta' }, h('span', {}, '執行人 ', h('b', {}, p.executor || p.owner)), h('span', {}, '負責 ', h('b', {}, p.manager || '—')), h('span', {}, '集資 ', h('b', {}, money(p.raised)), `（${p.percent}%）`), h('span', {}, `${dt(p.startAt, false)}～${p.endAt ? dt(p.endAt, false) : '長期'}`)))),
      h('div', { class: 'pitem-actions' },
        link(`/c/${p.id}`, '編輯內容', 'btn sm'),
        ['draft', 'reviewing'].includes(p.status) ? h('button', { class: 'btn sm', on: { click: () => doA(p, 'publish') } }, '上架') : null,
        h('button', { class: 'btn sm ghost', on: { click: () => doA(p, 'feature') } }, p.featured ? '取消主打' : '首頁主打'),
        h('button', { class: 'btn sm ghost', on: { click: () => doA(p, 'pick') } }, p.staffPick ? '取消精選' : '設為精選'),
        h('button', { class: 'btn sm ghost', on: { click: () => sched(p) } }, '調整時間'),
        h('button', { class: 'btn sm ghost', on: { click: () => mgr(p) } }, '指派負責人'),
        link('/p/' + p.slug, '看前台', 'btn sm ghost'),
        p.status === 'suspended' ? h('button', { class: 'btn sm', on: { click: () => doA(p, 'restore') } }, '恢復上架') : h('button', { class: 'btn sm danger', on: { click: () => doA(p, 'suspend') } }, '下架'),
        state.demo && state.me.role === 'admin' && p.steps && p.steps.plan === 'ok' ? h('button', { class: 'btn sm ghost', on: { click: () => doA(p, 'unlock') } }, '解鎖時間') : null)))) : h('p', { class: 'muted' }, '找不到計畫'));
}));

// ---------- 訂單管理 ----------
route('/admin/orders', async (_, q) => shell('orders', async () => {
  const [d, projects] = await Promise.all([api('/api/admin/orders?' + qs({ ...q, page: q.page || 1 })), api('/api/admin/projects')]);
  const f = sel({ token: '訂單編號', recipient: '收件人', email: '電子信箱', phone: '聯絡電話', backer: '贊助人' }, q.field || 'token'), kw = inp(q.q || '', { type: 'search', placeholder: '關鍵字' }), st = sel({ '': '全部狀態', ...state.meta.orderStatus }, q.status || '');
  const pj = sel({ '': '全部專案', ...Object.fromEntries(projects.map((p) => [p.id, p.title])) }, q.project || ''), real = chk(q.real === '1');
  const doA = async (o, action) => { let note = ''; if (action === 'refund' || action === 'cancel') { note = await ask(action === 'refund' ? '強制退款' : '取消訂單', '原因', { multiline: true }); if (!note) return; } if (await act(() => api(`/api/admin/orders/${o.token}`, { action, note }))) reload(); };
  const search = (page = 1) => go('/admin/orders?' + qs({ project: pj.value, status: st.value, field: kw.value ? f.value : '', q: kw.value, real: real.checked ? '1' : '', page }));
  for (const e of [pj, st]) e.addEventListener('change', () => search());
  real.addEventListener('change', () => search());
  // 一筆一列；點開才看收件資料、回饋調查、操作
  const row = (o) => h('details', { class: 'acc' }, h('summary', {}, h('span', { class: 'acc-t' }, badge(o.statusName, o.status), o.token, o.fake ? badge('虛構', 'gray') : null, o.testPay ? badge('測試付款', 'gold') : null), h('span', { class: 'acc-s' }, `${o.project}・${o.backer}`), h('b', {}, money(o.total))),
    h('div', { class: 'acc-b' }, h('div', { class: 'acc-grid' }, h('div', {}, h('div', { class: 'small muted' }, '回饋'), o.items.map((it) => h('div', {}, `${it.name} × ${it.qty}`)), o.bonus ? h('div', {}, '加碼 ' + money(o.bonus)) : null),
      h('div', {}, h('div', { class: 'small muted' }, '收件'), h('div', {}, `${o.recipient.name}　${o.recipient.phone}`), h('div', { class: 'small' }, o.recipient.email), h('div', { class: 'small' }, `${o.recipient.zip} ${o.recipient.city}${o.recipient.district}${o.recipient.address}`)),
      h('div', {}, h('div', { class: 'small muted' }, '付款'), h('div', {}, o.payName), h('div', { class: 'small' }, '建立 ' + dt(o.createdAt)), o.paidAt ? h('div', { class: 'small' }, '付款 ' + dt(o.paidAt)) : null)),
      o.survey.length ? h('div', { class: 'small' }, o.survey.map((x) => `${x.q}：${x.a}`).join('；')) : null, o.note ? h('div', { class: 'small' }, '備註：' + o.note) : null,
      h('div', { class: 'row' }, o.status === 'pending' ? [h('button', { class: 'btn sm', on: { click: () => doA(o, 'paid') } }, '標記已付款'), h('button', { class: 'btn sm ghost', on: { click: () => doA(o, 'cancel') } }, '取消')] : null, o.status === 'paid' ? h('button', { class: 'btn sm danger', on: { click: () => doA(o, 'refund') } }, '強制退款') : null)));
  return h('div', {}, h('h1', {}, '訂單管理'),
    h('form', { class: 'filters', on: { submit: (e) => { e.preventDefault(); search(); } } }, pj, st, f, kw, h('button', { class: 'btn' }, '查詢'), h('label', { class: 'field check' }, real, h('span', {}, '只看真實訂單'))),
    d.list.length ? h('div', { class: 'accs' }, d.list.map(row)) : h('p', { class: 'muted' }, '找不到訂單'), pager(d, search));
}));
route('/admin/refunds', async (_, q) => shell('refunds', async () => {
  const st = q.status ?? '', list = await api('/api/admin/refunds?status=' + encodeURIComponent(st));
  const decide = async (r, decision) => { const note = decision === 'reject' ? await ask('駁回退款', '原因', { multiline: true }) : ''; if (decision === 'reject' && !note) return; if (await act(() => api(`/api/admin/refunds/${r.id}`, { decision, note }))) reload(); };
  return h('div', {}, h('h1', {}, '退款處理'), h('div', { class: 'row' }, [['', '全部'], ['pending', '申請中'], ['approved', '已退款'], ['rejected', '已駁回']].map(([k, n]) => link('/admin/refunds?status=' + k, n, 'chip' + (st === k ? ' on' : '')))),
    table(['狀態', '計畫', '訂單', '收件人', '金額', '原因', '時間', ''], list.map((r) => [[badge(r.auto ? '已退款（自行取消）' : r.statusName, r.status)], r.project, r.order, r.recipient, money(r.total), r.reason, dt(r.createdAt), r.status === 'pending' ? h('div', { class: 'row' }, h('button', { class: 'btn sm', on: { click: () => decide(r, 'approve') } }, '同意退款'), h('button', { class: 'btn sm danger', on: { click: () => decide(r, 'reject') } }, '駁回')) : r.note]), '沒有退款申請'));
}));
route('/admin/reports', async () => shell('reports', async () => {
  const list = await api('/api/admin/reports');
  const doA = async (r, action) => { const note = await ask(action === 'resolve' ? '處理檢舉' : '駁回檢舉', '處理說明', { multiline: true }); if (note === undefined) return; const hide = action === 'resolve' && r.kind === 'comment' ? confirm('要隱藏這則留言嗎？') : false; if (await act(() => api(`/api/admin/reports/${r.id}`, { action, note, hide }))) reload(); };
  return h('div', {}, h('h1', {}, '檢舉處理'), table(['狀態', '類型', '檢舉內容', '原因', '檢舉人', '時間', ''], list.map((r) => [badge({ open: '待處理', resolved: '已處理', dismissed: '已駁回' }[r.status], r.status), r.kind === 'project' ? '計畫' : '留言', r.target, r.reason, r.by, dt(r.createdAt), r.status === 'open' ? h('div', { class: 'row' }, h('button', { class: 'btn sm', on: { click: () => doA(r, 'resolve') } }, '成立'), h('button', { class: 'btn sm ghost', on: { click: () => doA(r, 'dismiss') } }, '不成立')) : r.note]), '沒有檢舉'));
}));
route('/admin/comments', async () => shell('comments', async () => {
  const list = await api('/api/admin/comments');
  return h('div', {}, h('h1', {}, '留言管理'), list.length ? h('div', { class: 'accs' }, list.map((c) => h('details', { class: 'acc' }, h('summary', {}, h('span', { class: 'acc-t' }, c.name, c.hidden ? badge('已隱藏', 'gray') : null), h('span', { class: 'acc-s' }, `${c.project}｜${c.body.slice(0, 30)}`), h('span', { class: 'small muted' }, ago(c.createdAt))),
    h('div', { class: 'acc-b' }, h('p', { class: 'pre' }, c.body), h('div', { class: 'row' }, link('/p/' + (c.slug || '') + '?tab=comments', '到專案頁回覆', 'btn sm'), h('button', { class: 'btn sm ghost', on: { click: async () => { if (await act(() => api(`/api/admin/comments/${c.id}`, {}))) reload(); } } }, c.hidden ? '恢復顯示' : '隱藏')))))) : h('p', { class: 'muted' }, '還沒有留言'));
}));
route('/admin/notices', async () => shell('notices', async () => {
  const list = await api('/api/admin/notices'), t = inp(''), b = area('', 3);
  return h('div', {}, h('h1', {}, '首頁公告'), state.me.role === 'admin' ? h('section', { class: 'card' }, field('標題', t), field('內容', b), h('button', { class: 'btn', on: { click: async () => { if (await act(() => api('/api/admin/notices', { title: t.value, body: b.value }), '已發布')) reload(); } } }, '發布')) : null,
    table(['標題', '內容', '時間', ''], list.map((n) => [n.title, n.body, dt(n.createdAt), state.me.role === 'admin' ? h('button', { class: 'btn sm danger', on: { click: async () => { if (await act(() => api('/api/admin/notices', { action: 'delete', id: n.id }), '已刪除')) reload(); } } }, '刪除') : ''])));
}));

// ---------- admin 限定 ----------
route('/admin/users', async (_, q) => shell('users', async () => {
  const d = await api('/api/admin/users?' + qs({ q: q.q || '', page: q.page || 1 })), kw = inp(q.q || '', { type: 'search', placeholder: '找會員：Email 或名稱' });
  // 重設密碼、新增人員：伺服器產生臨時密碼，只在這裡顯示一次（伺服器只存雜湊，之後誰都看不到）
  const showTemp = (who, pw) => modal('臨時密碼', h('div', {}, h('p', {}, `${who} 的臨時密碼（只會顯示這一次，請直接交給本人，登入後到「帳號設定」改掉）：`), h('div', { class: 'secret' }, pw)), [{ text: '我記下來了', fn: () => { reload(); return true; } }]);
  const doA = async (u, action, extra = {}) => {
    if ((action === 'ban' && !u.banned) || action === 'resetpw') { if (!confirm(`${action === 'ban' ? '停權' : '重設密碼'}：${u.email}，確定？`)) return; }
    const r = await act(() => api(`/api/admin/users/${u.id}`, { action, ...extra }));
    if (r && r.tempPassword) showTemp(u.email, r.tempPassword); else if (r) reload();
  };
  const ROLE = { member: '一般會員', staff: '一般人員', admin: '管理員' };
  const row = (u) => { const r = sel(ROLE, u.role); r.addEventListener('change', () => doA(u, 'role', { role: r.value })); const me = u.id === state.me.id;
    return [u.name, u.email, me ? ROLE[u.role] + '（你）' : r, u.guest ? '訪客' : '會員', num(u.orders), dt(u.createdAt, false), u.banned ? badge('停權', 'red') : '正常', me ? '' : h('div', { class: 'row' }, h('button', { class: 'btn sm ' + (u.banned ? '' : 'danger'), on: { click: () => doA(u, 'ban') } }, u.banned ? '解除' : '停權'), h('button', { class: 'btn sm ghost', on: { click: () => doA(u, 'resetpw') } }, '重設密碼'))]; };
  const em = inp('', { type: 'email', placeholder: 'name@example.com' }), nm = inp('', { placeholder: '名稱' }), rl = sel({ staff: '一般人員', admin: '管理員' }, 'staff');
  const add = async () => { const r = await act(() => api('/api/admin/users', { email: em.value, name: nm.value, role: rl.value })); if (r) showTemp(em.value, r.tempPassword); };
  const cols = ['名稱', 'Email', '角色', '類型', '付款訂單', '加入', '狀態', '操作'];
  const search = (page = 1) => go('/admin/users?' + qs({ q: kw.value, page }));
  return h('div', {}, h('h1', {}, '人員與會員'),
    h('details', { class: 'acc' }, h('summary', {}, h('span', { class: 'acc-t' }, `平台人員（${d.staff.length}）`), h('span', { class: 'acc-s' }, '點開管理、新增人員')),
      h('div', { class: 'acc-b' }, table(cols, d.staff.map(row)), h('div', { class: 'row' }, em, nm, rl, h('button', { class: 'btn sm', on: { click: add } }, '新增並產生臨時密碼')), h('p', { class: 'small muted' }, '管理員：全部功能。一般人員：計畫、訂單、退款、留言、客服、報表。'))),
    h('div', { class: 'row between' }, h('h2', { class: 'h2s' }, '會員'), h('a', { href: '/api/admin/users.csv', class: 'btn sm ghost', download: '' }, '匯出 Excel（CSV）')),
    h('form', { class: 'filters', on: { submit: (e) => { e.preventDefault(); search(); } } }, kw, h('button', { class: 'btn' }, '搜尋')),
    table(cols, d.list.map(row), '找不到會員'), pager(d, search));
}));
// ---------- 總體報表 ----------
route('/admin/report', async (_, q) => shell('report', async () => {
  // 先選專案（可以複選），按「產生報表」才算；一開頁面不顯示全部（KIRK 指示）
  const base = await api('/api/admin/report'), chosen = new Set(String(q.ids || '').split(',').map(Number).filter(Boolean));
  const picks = base.projects.map((p) => { const c = chk(chosen.has(p.id)); c.dataset.id = p.id; return h('label', { class: 'pick' }, c, h('span', {}, p.title), h('small', {}, p.status)); });
  const runIt = () => { const ids = picks.map((l) => l.querySelector('input')).filter((c) => c.checked).map((c) => c.dataset.id); if (!ids.length) return toast('請至少選一個專案', 'err'); go('/admin/report?ids=' + ids.join(',')); };
  const chooser = h('section', { class: 'card tight' }, h('div', { class: 'row between' }, h('h3', {}, '選擇專案（可複選）'), h('div', { class: 'row' }, h('button', { class: 'btn sm ghost', on: { click: () => picks.forEach((l) => { l.querySelector('input').checked = true; }) } }, '全選'), h('button', { class: 'btn sm ghost', on: { click: () => picks.forEach((l) => { l.querySelector('input').checked = false; }) } }, '清除'), h('button', { class: 'btn sm', on: { click: runIt } }, '產生報表'))), h('div', { class: 'picks' }, picks));
  if (!chosen.size) return h('div', {}, h('h1', {}, '總體報表'), chooser);
  const d = await api('/api/admin/report?ids=' + [...chosen].join(',')), T = d.totals;
  const csv = () => { const rows = [['專案', '狀態', '執行人', '目標', '累計', '達成率', '訂單', '贊助人', '平均', '退款', '待付款', '測試付款'], ...d.byProject.map((p) => [p.title, p.status, p.executor, p.goal, p.raised, p.percent + '%', p.orders, p.backers, p.avg, p.refunded, p.pending, p.testPay])];
    const esc = (v) => { let x = String(v ?? ''); if (/^[=+\-@\t\r]/.test(x)) x = "'" + x; return '"' + x.replace(/"/g, '""') + '"'; };   // 防 CSV 公式注入
    const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv' })), download: `總體報表_${new Date().toISOString().slice(0, 10)}.csv` }); document.body.append(a); a.click(); a.remove(); };
  const k = (label, v, sub) => h('div', { class: 'kpi' }, h('span', {}, label), h('b', {}, v), sub ? h('span', {}, sub) : null);
  const maxM = Math.max(1, ...d.byMonth.map((m) => m.amount));
  return h('div', {}, h('div', { class: 'row between' }, h('h1', {}, '總體報表'), h('button', { class: 'btn ghost sm', on: { click: csv } }, '匯出 Excel（CSV）')), chooser,
    h('p', { class: 'small muted' }, `資料時間 ${dt(d.generatedAt)}。累計含「對照嘖嘖人數」的虛構贊助；測試金流的付款另外標示。`),
    h('div', { class: 'kpis' }, k('累計護持金額', money(T.raised)), k('付款成功訂單', num(T.orders)), k('贊助人數', num(T.backers)), k('平均每筆', money(T.avg)), k('加碼金額', money(T.bonus)), k('已退款', money(T.refundedAmount), `${num(T.refundedOrders)} 筆`), k('待付款訂單', num(T.pendingOrders)), k('進行中專案', num(T.liveProjects)), k('會員', num(T.members)), k('訪客下單', num(T.guests)), k('測試付款訂單', num(T.testPayOrders)), k('待處理合作申請', num(T.inquiriesOpen))),
    h('h2', { class: 'h2s' }, '各專案'), table(['專案', '狀態', '執行人', '目標', '累計', '達成率', '訂單', '贊助人', '退款', '待付款'], d.byProject.map((p) => [link('/p/' + p.slug, p.title), p.status, p.executor, money(p.goal), h('b', {}, money(p.raised)), p.percent + '%', num(p.orders), num(p.backers), money(p.refunded), num(p.pending)])),
    h('h2', { class: 'h2s' }, '近 12 個月'), h('div', { class: 'bars' }, d.byMonth.map((m) => h('div', { class: 'bar-row' }, h('span', {}, m.month), h('div', { class: 'bar-t' }, h('i', { style: { width: (m.amount / maxM * 100) + '%' } })), h('span', { class: 'tr' }, money(m.amount))))),
    h('details', { class: 'acc' }, h('summary', {}, h('span', { class: 'acc-t' }, '每月明細（點開）')), h('div', { class: 'acc-b' }, table(['月份', '金額', '訂單', '新會員'], d.byMonth.slice().reverse().map((m) => [m.month, money(m.amount), num(m.orders), num(m.members)])))),
    h('div', { class: 'grid2' }, h('div', {}, h('h2', {}, '付款方式'), table(['方式', '金額', '筆數'], d.byPay.map((x) => [x.method, money(x.amount), num(x.orders)]))),
      h('div', {}, h('h2', {}, '熱門方案 Top 10'), table(['方案', '專案', '份數', '金額'], d.topOptions.map((x) => [x.name, x.project, num(x.qty), money(x.amount)])))));
}));
// ---------- AI 助理 ----------
const aiHistory = [];   // 對話只放在這個分頁的記憶體裡，重新整理就清掉（不存 localStorage，避免個資留在電腦上）
route('/admin/ai', async () => shell('ai', async () => {
  const st = await api('/api/admin/ai/status');
  if (!st.enabled) return h('div', {}, h('h1', {}, 'AI 助理'), h('div', { class: 'card' }, h('h3', {}, 'AI 還沒啟用'), h('p', {}, '請到 Render → fundraising-practice → Environment，新增環境變數：'), h('p', { class: 'mono' }, 'ANTHROPIC_API_KEY ＝ 你的 Anthropic API 金鑰'), h('p', { class: 'small muted' }, '金鑰請自己貼在 Render，不要傳給任何人；設好後主機會自動重開。')));
  const box = h('div', { class: 'ai-chat' }), q = area('', 3, { placeholder: '例：這個月茅港尾賣最好的三個方案是哪些？／列出還沒付款的訂單／幫我寫一則參天宮的進度更新' });
  const bubble = (m) => h('div', { class: 'ai-msg ' + m.role }, m.role === 'assistant' ? markup(m.content) : h('p', { class: 'pre' }, m.content), m.tools && m.tools.length ? h('div', { class: 'small muted' }, '查了：' + [...new Set(m.tools)].join('、')) : null);
  const draw = () => { box.replaceChildren(...(aiHistory.length ? aiHistory.map(bubble) : [h('p', { class: 'muted' }, '可以問任何跟平台資料有關的事：營收、訂單、贊助人、退款、合作申請、留言，也可以請它寫文案、整理名單。AI 只能看資料，不能改資料。')])); box.scrollTop = box.scrollHeight; };
  const send = h('button', { class: 'btn', on: { click: async () => {
    const text = q.value.trim(); if (!text) return;
    aiHistory.push({ role: 'user', content: text }); q.value = ''; draw();
    send.disabled = true; send.textContent = '思考中…'; box.append(h('div', { class: 'ai-msg assistant muted' }, '查資料中…'));
    const r = await act(() => api('/api/admin/ai', { messages: aiHistory.map(({ role, content }) => ({ role, content })) }), '');
    send.disabled = false; send.textContent = '送出';
    if (r) aiHistory.push({ role: 'assistant', content: r.reply, tools: r.tools }); else aiHistory.pop();
    draw();
  } } }, '送出');
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send.click(); });
  draw();
  return h('div', {}, h('div', { class: 'row between' }, h('h1', {}, 'AI 助理'), h('button', { class: 'btn sm ghost', on: { click: () => { aiHistory.length = 0; draw(); } } }, '清除對話')),
    h('p', { class: 'small muted' }, `模型 ${st.model}・個資${st.fullPII ? '完整給 AI（可在平台設定關掉）' : '已遮蔽電話、地址、Email（可在平台設定打開）'}・對話不會存在伺服器`),
    box, h('div', { class: 'ai-input' }, q, h('div', { class: 'row between' }, h('span', { class: 'small muted' }, 'Ctrl＋Enter 送出'), send)));
}));
route('/admin/inquiries', async () => shell('inquiries', async () => {
  const list = await api('/api/admin/inquiries');
  const ST = { open: '新申請', contacted: '已聯繫', closed: '結案' };
  const set = async (q, status) => { const note = status === 'closed' ? await ask('結案', '備註（選填）', { value: q.note, multiline: true }) : q.note; if (note === undefined) return; if (await act(() => api(`/api/admin/inquiries/${q.id}`, { status, note }))) reload(); };
  return h('div', {}, h('h1', {}, '宮廟合作申請'), h('p', { class: 'small muted' }, '前台「合作申請」送進來的表單。聯絡過就按「已聯繫」，談完按「結案」。'),
    table(['時間', '宮廟（單位）', '聯絡人', '電話／Email／LINE', '內容', '狀態', ''], list.map((q) => [dt(q.createdAt), q.org, q.name, [q.phone, q.email, q.line].filter(Boolean).join('／'), h('details', {}, h('summary', {}, q.content.slice(0, 16) + (q.content.length > 16 ? '…' : '')), h('p', { class: 'pre small' }, q.content), q.note ? h('p', { class: 'small muted' }, '備註：' + q.note) : null), badge(ST[q.status], q.status === 'open' ? 'pending' : q.status === 'closed' ? 'gray' : 'ok'),
      h('div', { class: 'row' }, q.status === 'open' ? h('button', { class: 'btn sm', on: { click: () => set(q, 'contacted') } }, '已聯繫') : null, q.status !== 'closed' ? h('button', { class: 'btn sm ghost', on: { click: () => set(q, 'closed') } }, '結案') : null)]), '還沒有申請'));
}));
route('/admin/site', async () => shell('site', async () => {
  const s = await api('/api/admin/site');
  const about = area(s.about, 8, { placeholder: '首頁「人生地圖初心」的文字（可以用 **粗體**、[連結](網址)）；空白就用預設文字' });
  const rows = h('div'); const wall = (s.wall || []).slice();
  const draw = () => rows.replaceChildren(...wall.map((w, i) => { const t = inp(w.tag, { placeholder: '分類（例：修廟）' }), x = inp(w.text, { placeholder: '回饋內容（真實的留言，120 字內）' }), who = inp(w.who, { placeholder: '署名（例：台南陳小姐）' }); for (const [e, k] of [[t, 'tag'], [x, 'text'], [who, 'who']]) e.addEventListener('input', () => { wall[i][k] = e.value; }); return h('div', { class: 'grid3' }, t, x, h('div', { class: 'row' }, who, h('button', { class: 'btn sm danger', on: { click: () => { wall.splice(i, 1); draw(); } } }, '刪除'))); }));
  draw();
  return h('div', {}, h('h1', {}, '首頁內容'), h('section', { class: 'card' }, h('h3', {}, '人生地圖初心'), about),
    h('section', { class: 'card' }, h('h3', {}, '愛心回饋牆（最多 12 則；請放真實的信眾回饋，沒有就留空，首頁不會顯示這區）'), rows, h('button', { class: 'btn ghost', on: { click: () => { if (wall.length < 12) { wall.push({ tag: '', text: '', who: '' }); draw(); } } } }, '＋ 新增一則')),
    h('button', { class: 'btn big', on: { click: () => act(() => api('/api/admin/site', { about: about.value, wall }), '已儲存') } }, '儲存'));
}));
route('/admin/payouts', async () => shell('payouts', async () => {
  const list = await api('/api/admin/payouts');
  return h('div', {}, h('h1', {}, '撥款結算'), h('p', { class: 'small muted' }, '一次性專案：完結後 28 個工作日內撥款；訂閱專案：次月 15 日撥款。撥款金額＝集資總額 − 金流服務費（依付款方式）− 平台手續費。'),
    table(['計畫', '期別', '集資總額', '金流服務費', '平台手續費', '撥款金額', '撥款帳戶', '應撥日', '狀態', ''], list.map((x) => [x.project, x.period || '一次性', money(x.gross), money(x.paymentFee), money(x.platformFee), h('b', {}, money(x.net)), x.bank, dt(x.dueAt, false), x.status === 'paid' ? badge('已撥款 ' + dt(x.paidAt, false), 'ok') : badge('待撥款'), x.status === 'scheduled' ? h('button', { class: 'btn sm', on: { click: async () => { if (await act(() => api(`/api/admin/payouts/${x.id}`, {}), '已標記撥款並通知提案人')) reload(); } } }, '標記已撥款') : '']), '還沒有撥款'));
}));
route('/admin/settings', async () => shell('settings', async () => {
  const s = await api('/api/admin/settings');
  const F = { platformFee: inp(s.platformFee, { type: 'number', step: '0.001' }), credit: inp(s.paymentFee.credit, { type: 'number', step: '0.001' }), atm: inp(s.paymentFee.atm, { type: 'number', step: '0.001' }), aftee: inp(s.paymentFee.aftee, { type: 'number', step: '0.001' }),
    personLimit30d: inp(s.personLimit30d, { type: 'number' }), companyLimit: inp(s.companyLimit, { type: 'number' }), payoutWorkdays: inp(s.payoutWorkdays, { type: 'number' }), subscriptionPayoutDay: inp(s.subscriptionPayoutDay, { type: 'number' }), minDays: inp(s.minDays, { type: 'number' }), maxDays: inp(s.maxDays, { type: 'number' }), atmRefundFee: inp(s.atmRefundFee, { type: 'number' }),
    aonCrowd: chk(s.allOrNothing.crowd), aonPre: chk(s.allOrNothing.preorder), aonCoop: chk(s.allOrNothing.coop), testPayment: chk(!!s.testPayment), aiFullPII: chk(!!s.aiFullPII), categories: area(s.categories.join('\n'), 8) };
  const save = () => act(() => api('/api/admin/settings', { platformFee: Number(F.platformFee.value), paymentFee: { credit: Number(F.credit.value), atm: Number(F.atm.value), aftee: Number(F.aftee.value) }, personLimit30d: Number(F.personLimit30d.value), companyLimit: Number(F.companyLimit.value), payoutWorkdays: Number(F.payoutWorkdays.value), subscriptionPayoutDay: Number(F.subscriptionPayoutDay.value), minDays: Number(F.minDays.value), maxDays: Number(F.maxDays.value), atmRefundFee: Number(F.atmRefundFee.value), allOrNothing: { crowd: F.aonCrowd.checked, preorder: F.aonPre.checked, coop: F.aonCoop.checked }, testPayment: F.testPayment.checked, aiFullPII: F.aiFullPII.checked, categories: F.categories.value.split('\n') }));
  return h('div', {}, h('h1', {}, '平台設定'), h('section', { class: 'card' }, h('h3', {}, '手續費（小數：0.055＝5.5%）'), h('div', { class: 'grid3' }, field('平台手續費', F.platformFee), field('金流費：信用卡', F.credit), field('金流費：ATM', F.atm), field('金流費：AFTEE', F.aftee), field('ATM 退款轉帳手續費（元）', F.atmRefundFee))),
    h('section', { class: 'card' }, h('h3', {}, '集資上限與時程'), h('div', { class: 'grid3' }, field('自然人 30 天上限', F.personLimit30d), field('法人第一階段上限', F.companyLimit), field('最短天數', F.minDays), field('最長天數', F.maxDays), field('撥款：完結後幾個工作日', F.payoutWorkdays), field('訂閱撥款：次月幾號', F.subscriptionPayoutDay))),
    h('section', { class: 'card' }, h('h3', {}, '沒達標就全部退款（全有或全無）'), field('群眾集資', F.aonCrowd), field('預購式專案', F.aonPre), field('合作式專案', F.aonCoop)),
    h('section', { class: 'card' }, h('h3', {}, '測試金流'), field('開啟測試金流（付款頁可以操作，但不會真的扣款；訂單標記為測試付款）', F.testPayment), h('p', { class: 'small muted' }, '串好真的金流前，對外正式收單時請關掉：關掉後付款頁會顯示「線上付款尚未開放」。')),
    h('section', { class: 'card' }, h('h3', {}, 'AI 助理'), field('讓 AI 看到完整個資（電話、地址、Email）', F.aiFullPII), h('p', { class: 'small muted' }, '預設關：給 AI 的資料會把電話、地址、Email 遮一半。打開代表把信眾個資交給 AI 服務商（Anthropic）處理，隱私權政策要寫清楚。')),
    h('section', { class: 'card' }, h('h3', {}, '分類（一行一個）'), F.categories), h('button', { class: 'btn big', on: { click: save } }, '儲存設定'));
}));
route('/admin/emails', async () => shell('emails', async () => { const list = await api('/api/admin/emails'); return h('div', {}, h('h1', {}, '寄信紀錄'), table(['時間', '收件人', '類型', '主旨', '內容'], list.map((m) => [dt(m.at), m.to, m.kind, m.subject, h('details', {}, h('summary', {}, '展開'), h('p', { class: 'pre small' }, m.body))]))); }));
route('/admin/audit', async () => shell('audit', async () => { const list = await api('/api/admin/audit'); return h('div', {}, h('h1', {}, '操作紀錄'), table(['時間', '誰', '動作', '對象', '說明'], list.map((a) => [dt(a.at), a.actor, a.action, a.target, a.detail]))); }));
route('/admin/clock', async () => shell('clock', async () => {
  const d = await api('/api/admin/overview');
  const ff = (hours) => act(async () => { await api('/api/admin/clock', { hours }); reload(); }, `已快轉 ${hours} 小時`);
  const confirmIn = inp('', { placeholder: '輸入 RESET' });
  return h('div', {}, h('h1', {}, '時鐘與重置（測試模式）'), h('section', { class: 'card' }, h('h3', {}, '時鐘快轉'), h('p', {}, `平台現在時間：${dt(d.now)}（快轉 ${Math.round(d.clockOffset / 3_600_000)} 小時）`), h('p', { class: 'small muted' }, '測試要等很久的事：ATM 逾期、募資結束（成功／失敗自動退款）、訂閱每月扣款、撥款到期、EDM 提醒。'),
    h('div', { class: 'row wrap' }, [1, 24, 24 * 7, 24 * 30].map((hh) => h('button', { class: 'btn ghost', on: { click: () => ff(hh) } }, `快轉 ${hh >= 24 ? hh / 24 + ' 天' : hh + ' 小時'}`)), h('button', { class: 'btn', on: { click: () => act(async () => { await api('/api/admin/clock', { reset: true }); reload(); }, '已回到真實時間') } }, '回到真實時間'))),
    h('section', { class: 'card' }, h('h3', {}, '重置測試資料'), h('p', { class: 'small muted' }, '全部回到測試資料（所有帳號、計畫、訂單都會重來；上傳的檔案保留）。'), h('div', { class: 'row' }, confirmIn, h('button', { class: 'btn danger', on: { click: async () => { if (await act(() => api('/api/admin/reset', { confirm: confirmIn.value }), '已重置，請重新登入')) { location.href = '/login'; } } } }, '重置'))));
}));
