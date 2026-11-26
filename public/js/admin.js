/**
 * 平台管理後台（admin）：給「平台方」練習用——審核提案、管理計畫、會員、訂單、退款、撥款、檢舉、留言、公告、平台設定、寄信紀錄、操作紀錄、模擬時鐘、重置練習資料
 * 平台官方內部系統不公開，這一頁照公開規則（審核五階段、手續費、撥款時間、退款）設計，畫面上有標示。
 * staff（專案經理）看得到大部分；admin 才有：會員權限、撥款、平台設定、寄信紀錄、操作紀錄、時鐘、重置。
 */
import { h, link, go, api, state, toast, act, modal, ask, money, num, dt, dtInput, ago, field, inp, area, sel, chk, table, badge, markup, route } from './core.js';

const MENU = [['', '總覽'], ['review', '提案審核'], ['projects', '計畫管理'], ['orders', '訂單管理'], ['refunds', '退款處理'], ['reports', '檢舉處理'], ['comments', '留言管理'], ['notices', '首頁公告'],
  ['users', '會員管理', true], ['payouts', '撥款結算', true], ['settings', '平台設定', true], ['emails', '寄信紀錄', true], ['audit', '操作紀錄', true], ['clock', '模擬時鐘與重置', true]];
async function shell(key, content) {
  const isAdmin = state.me && state.me.role === 'admin';
  const side = h('nav', { class: 'side admin' }, h('div', { class: 'side-h' }, h('b', {}, '平台管理後台'), h('div', { class: 'small muted' }, isAdmin ? '管理員' : '專案經理')), MENU.filter((m) => !m[2] || isAdmin).map(([k, label]) => link(`/admin${k ? '/' + k : ''}`, label, 'side-a' + (k === key ? ' on' : ''))));
  return h('div', { class: 'dash' }, side, h('div', { class: 'dash-main' }, await content()));
}
const reload = () => go(location.pathname + location.search, true);

route('/admin', async () => shell('', async () => {
  const d = await api('/api/admin/overview');
  return h('div', {}, h('h1', {}, '總覽'), d.clockOffset ? h('p', { class: 'warn' }, `模擬時鐘已快轉 ${Math.round(d.clockOffset / 3_600_000)} 小時：平台現在是 ${dt(d.now)}`) : null,
    h('div', { class: 'kpis' }, [['今日集資', money(d.todayAmount)], ['今日訂單', num(d.todayOrders)], ['累計集資', money(d.totalAmount)], ['會員數', num(d.users)], ['待審核', num(d.reviewQueue)], ['待處理退款', num(d.refunds)], ['待處理檢舉', num(d.reports)], ['7 天內到期撥款', num(d.payoutsDue)]].map(([k, v]) => h('div', { class: 'kpi' }, h('span', {}, k), h('b', {}, v)))),
    h('h2', {}, '計畫狀態'), table(Object.values(state.meta.projectStatus), [Object.keys(state.meta.projectStatus).map((k) => num(d.projects[k]))]));
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
  return h('div', {}, h('h1', {}, '提案審核'), h('p', { class: 'small muted' }, '五個階段依序審：商業檔案與金流帳號初審 → 方案與回饋 → 合約簽署與上傳 → 第三方金流單位審核（模擬外部金流回覆）→ 準備上線（排定時間，時間到自動上線）。退回一定要寫原因。'),
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
  return h('div', {}, h('h1', {}, '計畫管理'), h('form', { class: 'filters', on: { submit: (e) => { e.preventDefault(); const n = new URLSearchParams(); if (kw.value) n.set('q', kw.value); if (st.value) n.set('status', st.value); go('/admin/projects?' + n.toString()); } } }, kw, st, h('button', { class: 'btn' }, '搜尋')),
    table(['計畫', '提案人', '專案經理', '狀態', '集資', '時間', '首頁', '操作'], list.map((p) => [link('/p/' + p.slug, p.title), p.owner, p.manager || '—', badge(p.statusName, p.status), `${money(p.raised)}（${p.percent}%）`, `${dt(p.startAt, false)}～${dt(p.endAt, false)}`, [p.featured ? badge('主打') : '', p.staffPick ? badge('精選', 'gold') : ''],
      h('div', { class: 'row wrap' }, h('button', { class: 'btn sm ghost', on: { click: () => doA(p, 'feature') } }, p.featured ? '取消主打' : '首頁主打'), h('button', { class: 'btn sm ghost', on: { click: () => doA(p, 'pick') } }, p.staffPick ? '取消精選' : '編輯精選'), h('button', { class: 'btn sm ghost', on: { click: () => sched(p) } }, '調整時間'), h('button', { class: 'btn sm ghost', on: { click: () => mgr(p) } }, '指派經理'), link(`/c/${p.id}`, '進後台', 'btn sm ghost'),
        p.status === 'suspended' ? h('button', { class: 'btn sm', on: { click: () => doA(p, 'restore') } }, '恢復上架') : h('button', { class: 'btn sm danger', on: { click: () => doA(p, 'suspend') } }, '下架'), state.me.role === 'admin' && p.steps && p.steps.plan === 'ok' ? h('button', { class: 'btn sm ghost', on: { click: () => doA(p, 'unlock') } }, '解鎖時間') : null)])));
}));

// ---------- 訂單管理 ----------
route('/admin/orders', async (_, q) => shell('orders', async () => {
  const list = await api('/api/admin/orders?' + new URLSearchParams(q).toString());
  const f = sel({ token: '訂單編號', recipient: '收件人', email: '電子信箱', phone: '聯絡電話', backer: '贊助人' }, q.field || 'token'), kw = inp(q.q || '', { type: 'search' }), st = sel({ '': '全部狀態', ...state.meta.orderStatus }, q.status || '');
  const doA = async (o, action) => { let note = ''; if (action === 'refund' || action === 'cancel') { note = await ask(action === 'refund' ? '強制退款' : '取消訂單', '原因', { multiline: true }); if (!note) return; } if (await act(() => api(`/api/admin/orders/${o.token}`, { action, note }))) reload(); };
  return h('div', {}, h('h1', {}, '訂單管理'), h('form', { class: 'filters', on: { submit: (e) => { e.preventDefault(); const n = new URLSearchParams(); n.set('field', f.value); if (kw.value) n.set('q', kw.value); if (st.value) n.set('status', st.value); go('/admin/orders?' + n.toString()); } } }, f, kw, st, h('button', { class: 'btn' }, '查詢')),
    table(['狀態', '訂單', '計畫', '贊助人', '金額', '付款', '時間', '操作'], list.map((o) => [badge(o.statusName, o.status), o.token, o.project, o.backer, money(o.total), o.payName, dt(o.createdAt), h('div', { class: 'row' }, o.status === 'pending' ? [h('button', { class: 'btn sm', on: { click: () => doA(o, 'paid') } }, '標記已付款'), h('button', { class: 'btn sm ghost', on: { click: () => doA(o, 'cancel') } }, '取消')] : null, o.status === 'paid' ? h('button', { class: 'btn sm danger', on: { click: () => doA(o, 'refund') } }, '強制退款') : null)]), '找不到訂單'));
}));
route('/admin/refunds', async (_, q) => shell('refunds', async () => {
  const st = q.status ?? 'pending', list = await api('/api/admin/refunds?status=' + encodeURIComponent(st));
  const decide = async (r, decision) => { const note = decision === 'reject' ? await ask('駁回退款', '原因', { multiline: true }) : ''; if (decision === 'reject' && !note) return; if (await act(() => api(`/api/admin/refunds/${r.id}`, { decision, note }))) reload(); };
  return h('div', {}, h('h1', {}, '退款處理'), h('div', { class: 'row' }, [['pending', '申請中'], ['approved', '申請通過'], ['rejected', '申請駁回'], ['', '全部']].map(([k, n]) => link('/admin/refunds?status=' + k, n, 'chip' + (st === k ? ' on' : '')))),
    table(['狀態', '計畫', '訂單', '收件人', '金額', '原因', '時間', ''], list.map((r) => [badge(r.statusName, r.status), r.project, r.order, r.recipient, money(r.total), r.reason, dt(r.createdAt), r.status === 'pending' ? h('div', { class: 'row' }, h('button', { class: 'btn sm', on: { click: () => decide(r, 'approve') } }, '同意退款'), h('button', { class: 'btn sm danger', on: { click: () => decide(r, 'reject') } }, '駁回')) : r.note]), '沒有退款申請'));
}));
route('/admin/reports', async () => shell('reports', async () => {
  const list = await api('/api/admin/reports');
  const doA = async (r, action) => { const note = await ask(action === 'resolve' ? '處理檢舉' : '駁回檢舉', '處理說明', { multiline: true }); if (note === undefined) return; const hide = action === 'resolve' && r.kind === 'comment' ? confirm('要隱藏這則留言嗎？') : false; if (await act(() => api(`/api/admin/reports/${r.id}`, { action, note, hide }))) reload(); };
  return h('div', {}, h('h1', {}, '檢舉處理'), table(['狀態', '類型', '檢舉內容', '原因', '檢舉人', '時間', ''], list.map((r) => [badge({ open: '待處理', resolved: '已處理', dismissed: '已駁回' }[r.status], r.status), r.kind === 'project' ? '計畫' : '留言', r.target, r.reason, r.by, dt(r.createdAt), r.status === 'open' ? h('div', { class: 'row' }, h('button', { class: 'btn sm', on: { click: () => doA(r, 'resolve') } }, '成立'), h('button', { class: 'btn sm ghost', on: { click: () => doA(r, 'dismiss') } }, '不成立')) : r.note]), '沒有檢舉'));
}));
route('/admin/comments', async () => shell('comments', async () => {
  const list = await api('/api/admin/comments');
  return h('div', {}, h('h1', {}, '留言管理'), table(['計畫', '留言者', '內容', '時間', '狀態', ''], list.map((c) => [c.project, c.name, c.body, dt(c.createdAt), c.hidden ? badge('已隱藏', 'gray') : '顯示中', h('button', { class: 'btn sm ghost', on: { click: async () => { if (await act(() => api(`/api/admin/comments/${c.id}`, {}))) reload(); } } }, c.hidden ? '恢復顯示' : '隱藏')])));
}));
route('/admin/notices', async () => shell('notices', async () => {
  const list = await api('/api/admin/notices'), t = inp(''), b = area('', 3);
  return h('div', {}, h('h1', {}, '首頁公告'), state.me.role === 'admin' ? h('section', { class: 'card' }, field('標題', t), field('內容', b), h('button', { class: 'btn', on: { click: async () => { if (await act(() => api('/api/admin/notices', { title: t.value, body: b.value }), '已發布')) reload(); } } }, '發布')) : null,
    table(['標題', '內容', '時間', ''], list.map((n) => [n.title, n.body, dt(n.createdAt), state.me.role === 'admin' ? h('button', { class: 'btn sm danger', on: { click: async () => { if (await act(() => api('/api/admin/notices', { action: 'delete', id: n.id }), '已刪除')) reload(); } } }, '刪除') : ''])));
}));

// ---------- admin 限定 ----------
route('/admin/users', async (_, q) => shell('users', async () => {
  const list = await api('/api/admin/users?q=' + encodeURIComponent(q.q || '')), kw = inp(q.q || '', { type: 'search', placeholder: 'Email 或名稱' });
  const doA = async (u, action, extra = {}) => { if (await act(() => api(`/api/admin/users/${u.id}`, { action, ...extra }))) reload(); };
  return h('div', {}, h('h1', {}, '會員管理'), h('form', { class: 'filters', on: { submit: (e) => { e.preventDefault(); go('/admin/users?q=' + encodeURIComponent(kw.value)); } } }, kw, h('button', { class: 'btn' }, '搜尋')),
    table(['Email', '名稱', '角色', '贊助', '提案', '註冊', '狀態', '操作'], list.map((u) => { const r = sel({ member: '一般會員', staff: '專案經理', admin: '管理員' }, u.role); r.addEventListener('change', () => doA(u, 'role', { role: r.value })); return [u.email, u.name, u.id === state.me.id ? '管理員（你）' : r, num(u.orders), num(u.projects), dt(u.createdAt, false), u.banned ? badge('停權', 'red') : '正常', u.id === state.me.id ? '' : h('div', { class: 'row' }, h('button', { class: 'btn sm ' + (u.banned ? '' : 'danger'), on: { click: () => doA(u, 'ban') } }, u.banned ? '解除停權' : '停權'), h('button', { class: 'btn sm ghost', on: { click: () => doA(u, 'resetpw') } }, '重設密碼為 Demo1234'))]; })));
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
    aonCrowd: chk(s.allOrNothing.crowd), aonPre: chk(s.allOrNothing.preorder), aonCoop: chk(s.allOrNothing.coop), categories: area(s.categories.join('\n'), 8) };
  const save = () => act(() => api('/api/admin/settings', { platformFee: Number(F.platformFee.value), paymentFee: { credit: Number(F.credit.value), atm: Number(F.atm.value), aftee: Number(F.aftee.value) }, personLimit30d: Number(F.personLimit30d.value), companyLimit: Number(F.companyLimit.value), payoutWorkdays: Number(F.payoutWorkdays.value), subscriptionPayoutDay: Number(F.subscriptionPayoutDay.value), minDays: Number(F.minDays.value), maxDays: Number(F.maxDays.value), atmRefundFee: Number(F.atmRefundFee.value), allOrNothing: { crowd: F.aonCrowd.checked, preorder: F.aonPre.checked, coop: F.aonCoop.checked }, categories: F.categories.value.split('\n') }));
  return h('div', {}, h('h1', {}, '平台設定'), h('section', { class: 'card' }, h('h3', {}, '手續費（小數：0.055＝5.5%）'), h('div', { class: 'grid3' }, field('平台手續費', F.platformFee), field('金流費：信用卡', F.credit), field('金流費：ATM', F.atm), field('金流費：AFTEE', F.aftee), field('ATM 退款轉帳手續費（元）', F.atmRefundFee))),
    h('section', { class: 'card' }, h('h3', {}, '集資上限與時程'), h('div', { class: 'grid3' }, field('自然人 30 天上限', F.personLimit30d), field('法人第一階段上限', F.companyLimit), field('最短天數', F.minDays), field('最長天數', F.maxDays), field('撥款：完結後幾個工作日', F.payoutWorkdays), field('訂閱撥款：次月幾號', F.subscriptionPayoutDay))),
    h('section', { class: 'card' }, h('h3', {}, '沒達標就全部退款（全有或全無）'), field('群眾集資', F.aonCrowd), field('預購式專案', F.aonPre), field('合作式專案', F.aonCoop)),
    h('section', { class: 'card' }, h('h3', {}, '分類（一行一個）'), F.categories), h('button', { class: 'btn big', on: { click: save } }, '儲存設定'));
}));
route('/admin/emails', async () => shell('emails', async () => { const list = await api('/api/admin/emails'); return h('div', {}, h('h1', {}, '寄信紀錄（模擬）'), table(['時間', '收件人', '類型', '主旨', '內容'], list.map((m) => [dt(m.at), m.to, m.kind, m.subject, h('details', {}, h('summary', {}, '展開'), h('p', { class: 'pre small' }, m.body))]))); }));
route('/admin/audit', async () => shell('audit', async () => { const list = await api('/api/admin/audit'); return h('div', {}, h('h1', {}, '操作紀錄'), table(['時間', '誰', '動作', '對象', '說明'], list.map((a) => [dt(a.at), a.actor, a.action, a.target, a.detail]))); }));
route('/admin/clock', async () => shell('clock', async () => {
  const d = await api('/api/admin/overview');
  const ff = (hours) => act(async () => { await api('/api/admin/clock', { hours }); reload(); }, `已快轉 ${hours} 小時`);
  const confirmIn = inp('', { placeholder: '輸入 RESET' });
  return h('div', {}, h('h1', {}, '模擬時鐘與重置'), h('section', { class: 'card' }, h('h3', {}, '模擬時鐘'), h('p', {}, `平台現在時間：${dt(d.now)}（快轉 ${Math.round(d.clockOffset / 3_600_000)} 小時）`), h('p', { class: 'small muted' }, '用來練習要等很久的事：ATM 逾期、募資結束（成功／失敗自動退款）、訂閱每月扣款、撥款到期、EDM 提醒。'),
    h('div', { class: 'row wrap' }, [1, 24, 24 * 7, 24 * 30].map((hh) => h('button', { class: 'btn ghost', on: { click: () => ff(hh) } }, `快轉 ${hh >= 24 ? hh / 24 + ' 天' : hh + ' 小時'}`)), h('button', { class: 'btn', on: { click: () => act(async () => { await api('/api/admin/clock', { reset: true }); reload(); }, '已回到真實時間') } }, '回到真實時間'))),
    h('section', { class: 'card' }, h('h3', {}, '重置練習資料'), h('p', { class: 'small muted' }, '全部回到範例資料（所有帳號、計畫、訂單都會重來；上傳的檔案保留）。上完一堂課可以按一次。'), h('div', { class: 'row' }, confirmIn, h('button', { class: 'btn danger', on: { click: async () => { if (await act(() => api('/api/admin/reset', { confirm: confirmIn.value }), '已重置，請重新登入')) { location.href = '/login'; } } } }, '重置'))));
}));
