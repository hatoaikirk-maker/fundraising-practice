/**
 * 提案者後台（管理計畫後台）：左邊選單跟嘖嘖提案者後台同一個順序
 *   控制中心、修改計畫、常見問答、計畫回饋、自訂回饋順序、折扣碼、計畫推薦連結、EDM 再行銷、計畫更新、數據分析、
 *   贊助名單下載、訂單總覽、退款申請總覽、商業檔案設定、金流帳號申請（＋留言管理）
 * 權限：伺服器依團隊角色判斷（提案人、管理者、編輯、客服、檢視）；畫面只是把做不了的按鈕藏起來。
 */
import { h, link, go, api, state, toast, act, modal, ask, money, num, dt, dtInput, ago, field, inp, area, sel, chk, editor, mediaInput, media, upload, bars, lineChart, table, badge, download, serverNow, route } from './core.js';

const MENU = [
  ['', '控制中心'], ['edit', '修改計畫'], ['faqs', '常見問答'], ['options', '計畫回饋'], ['reorder', '自訂回饋順序'], ['coupons', '折扣碼'], ['referrers', '計畫推薦連結'], ['edm', 'EDM 再行銷'],
  ['updates', '計畫更新'], ['metrics', '數據分析'], ['backers', '贊助名單下載'], ['orders', '訂單總覽'], ['refunds', '退款申請總覽'], ['comments', '留言管理'], ['business', '商業檔案設定'], ['payment', '金流帳號申請'],
];
/** 外框：左邊選單＋右邊內容 */
async function shell(pid, key, content) {
  const d = await api(`/api/c/${pid}`), p = d.project;
  const side = h('nav', { class: 'side' }, h('div', { class: 'side-h' }, badge(p.typeName), h('b', {}, p.title), h('div', { class: 'muted small' }, `#${p.id}　`, link('/p/' + p.slug, '前台頁面 ↗'))),
    MENU.map(([k, label]) => link(`/c/${pid}${k ? '/' + k : ''}`, label, 'side-a' + (k === key ? ' on' : ''))));
  return h('div', { class: 'dash' }, side, h('div', { class: 'dash-main' }, await content(d)));
}
const pidOf = (x) => Number(x.pid);

// ---------- 控制中心 ----------
route('/c/:pid', async (x) => shell(pidOf(x), '', (d) => {
  const p = d.project, pid = p.id;
  const stepRow = (s, i) => {
    const btns = [];
    if (s.key === 'biz' && (s.state === 'todo' || s.state === 'rejected')) btns.push(link(`/c/${pid}/business`, '填寫商業檔案', 'btn sm'), ' ', link(`/c/${pid}/payment`, '金流帳號申請', 'btn sm ghost'));
    if (s.key === 'plan' && (s.state === 'todo' || s.state === 'rejected')) btns.push(h('button', { class: 'btn sm', on: { click: async () => { if (await act(() => api(`/api/c/${pid}/submit`, { step: 'plan' }), '已通知平台工作人員')) go(`/c/${pid}`, true); } } }, '完成，通知工作人員'));
    if (s.key === 'contract' && (s.state === 'todo' || s.state === 'rejected')) { const f = h('input', { type: 'file', accept: 'application/pdf,image/*', on: { change: async () => { const file = f.files[0]; if (!file) return; const up = await act(() => upload(file, 'contract'), '已上傳'); if (up && await act(() => api(`/api/c/${pid}/submit`, { step: 'contract', file: up.url }), '已送出合約')) go(`/c/${pid}`, true); } } }); btns.push(h('label', { class: 'btn sm' }, '上傳已簽署合約', f)); }
    return h('li', { class: 'step ' + s.state }, h('span', { class: 'step-n' }, s.state === 'ok' ? '✓' : String(i + 1)), h('div', {}, h('b', {}, s.name), ' ', badge(s.stateName, s.state), h('div', { class: 'small muted' }, s.desc), s.note ? h('div', { class: 'small ' + (s.state === 'rejected' ? 'err' : 'muted') }, '平台備註：' + s.note) : null, h('div', {}, btns)));
  };
  const st = d.stats;
  return h('div', {}, h('h1', {}, '控制中心'),
    h('section', { class: 'card' }, h('h3', {}, '提案審核'), d.manager ? h('p', { class: 'small muted' }, '專屬專案經理：' + d.manager) : null, h('ol', { class: 'steps' }, d.steps.map(stepRow)),
      h('p', { class: 'small muted' }, `準備度：回饋 ${d.ready.options ? '✓' : '✗'}　內容 ${d.ready.content ? '✓' : '✗'}　時程 ${d.ready.schedule ? '✓' : '✗'}`), d.timeLocked ? h('p', { class: 'small' }, '🔒 方案與回饋已通過：網址、目標、類型、時間已鎖定，要改請聯繫專案經理') : null),
    h('section', { class: 'card' }, h('h3', {}, '專案執行期間'), h('p', {}, h('b', {}, d.left), p.type === 'subscription' ? '' : `　至 ${dt(p.endAt)} (UTC+8)`), h('p', {}, '狀態：', badge(p.statusName, p.status)),
      h('div', { class: 'kpis' }, [['累計集資總額', money(st.raised)], [p.type === 'subscription' ? '本月贊助' : '目標', p.type === 'subscription' ? money(d.monthly) : money(p.goal)], ['達成率', d.percent + '%'], ['累計訂單數', num(st.orders)], ['平均贊助金額', money(st.avg)], ['加碼總額', money(st.bonus)], ['累計退款總額', money(st.refunded)]].map(([k, v]) => h('div', { class: 'kpi' }, h('span', {}, k), h('b', {}, v))))),
    h('div', { class: 'grid2' }, h('section', { class: 'card' }, h('h3', {}, '最近贊助'), d.recent.length ? h('ul', { class: 'list' }, d.recent.map((r) => h('li', {}, h('span', { class: 'muted' }, ago(r.at) + '　'), `${r.name} 贊助了 ${money(r.amount)}`))) : h('p', { class: 'muted' }, '還沒有贊助')),
      h('section', { class: 'card' }, h('h3', {}, '最近留言'), d.comments.length ? h('ul', { class: 'list' }, d.comments.map((c) => h('li', {}, h('b', {}, c.name), '：', c.body.slice(0, 40), h('span', { class: 'muted small' }, '　' + ago(c.at))))) : h('p', { class: 'muted' }, '還沒有留言'))));
}));

// ---------- 修改計畫 ----------
route('/c/:pid/edit', async (x) => shell(pidOf(x), 'edit', (d) => {
  const p = d.project, L = d.timeLocked, cats = Object.fromEntries(state.meta.categories.map((c) => [c, c]));
  const F = { cover: mediaInput(p.cover, { accept: 'image/*,video/mp4,video/webm' }), title: inp(p.title, { maxlength: 60 }), description: area(p.description, 3, { maxlength: 200 }), content: editor(p.content),
    goal: inp(p.goal, { type: 'number', disabled: L }), startAt: inp(dtInput(p.startAt), { placeholder: 'YYYY-MM-DD HH:mm', disabled: L }), endAt: inp(dtInput(p.endAt), { placeholder: 'YYYY-MM-DD HH:mm', disabled: L }),
    type: sel(state.meta.types, p.type, { disabled: L }), ageLimit: sel({ 0: '無', 18: '18' }, String(p.ageLimit)), category: sel(cats, p.category), origin: sel(state.meta.origins, p.origin), slug: inp(p.slug, { disabled: L }), video: inp(p.video, { placeholder: 'YouTube／Vimeo 網址' }),
    contact: area(p.contact, 3), risk: area(p.risk, 4), returns: area(p.returns, 4), afteeNote: area(p.afteeNote, 3), ga: inp(p.ga, { placeholder: 'G-A1BCDEGHI2' }), pixel: inp(p.pixel, { placeholder: '1274632934827378' }), gCat: inp(p.gCat, { placeholder: '例：藝術與娛樂 > 嗜好與創意藝術' }),
    invoiceFormat: sel(state.meta.invoiceFormats, p.invoiceFormat), bsmi: inp(p.bsmi, { placeholder: '(R、D、T、M、Q + 5 個英數字)' }), ncc: inp(p.ncc, { placeholder: '(CCXXxxYYyyyZzW 共 14 碼)' }), optionOrder: sel({ custom: '自訂順序', priceDesc: '價格高到低', priceAsc: '價格低到高' }, p.optionOrder) };
  const save = h('button', { class: 'btn big', on: { click: async () => {
    const b = {}; for (const [k, e] of Object.entries(F)) b[k] = e.getValue ? e.getValue() : e.value;
    b.goal = Number(b.goal); b.ageLimit = Number(b.ageLimit);
    if (await act(() => api(`/api/c/${p.id}/project`, b), '計畫已儲存')) go(`/c/${p.id}/edit`, true);
  } } }, '儲存');
  return h('div', {}, h('h1', {}, '修改計畫'),
    h('section', { class: 'card' }, h('h2', {}, '封面照片'), field('封面照片（圖片、GIF 或短影片）', F.cover)),
    h('section', { class: 'card' }, h('h2', {}, '標題與內容'), field('計畫名稱', F.title), field('計畫簡介', F.description), field('計畫內容', F.content)),
    h('section', { class: 'card' }, h('h2', {}, '專案時程與目標'), L ? h('p', { class: 'warn' }, '方案與回饋已通過審核：目標、時間已鎖定') : null, h('div', { class: 'grid3' }, field('計畫目標', F.goal), field('預計開始時間 (UTC+8)', F.startAt), field('預計結束時間 (UTC+8)', F.endAt)), h('p', { class: 'small muted' }, '一次性計畫最短 1 天、最長 5 個月；訂閱式可以不填結束時間。')),
    h('section', { class: 'card' }, h('h2', {}, '分類與網址'), h('div', { class: 'grid3' }, field('集資種類', F.type), field('年齡限制', F.ageLimit), field('分類', F.category), field('品牌發源地', F.origin), field('專案網址', F.slug, '/p/這個網址'))),
    h('section', { class: 'card' }, h('h2', {}, '影片與連結'), field('影片網址', F.video)),
    h('section', { class: 'card' }, h('h2', {}, '承諾與告示'), field('客服聯絡方式', F.contact), field('風險與挑戰', F.risk), field('退換貨規則', F.returns), field('AFTEE 支付相關宣告', F.afteeNote)),
    h('section', { class: 'card' }, h('h2', {}, '廣告與追蹤'), field('Google Analytics Tracking ID', F.ga), field('Facebook pixel', F.pixel), field('Google 商品分類', F.gCat)),
    h('section', { class: 'card' }, h('h2', {}, '其他設定'), h('div', { class: 'grid3' }, field('發票格式', F.invoiceFormat), field('BSMI 字號', F.bsmi), field('NCC 字號', F.ncc)), field('回饋選項順序', F.optionOrder)), save);
}));

// ---------- 常見問答 ----------
route('/c/:pid/faqs', async (x) => shell(pidOf(x), 'faqs', async (d) => {
  const pid = d.project.id, list = await api(`/api/c/${pid}/faqs`), refresh = () => go(`/c/${pid}/faqs`, true);
  const q = inp(''), a = area('', 3);
  const edit = (f) => { const q2 = inp(f.q), a2 = area(f.a, 4); modal('編輯問答', h('div', {}, field('問題', q2), field('答案', a2)), [{ text: '儲存', fn: async () => { const ok = await act(() => api(`/api/c/${pid}/faqs`, { id: f.id, q: q2.value, a: a2.value })); if (ok) refresh(); return !!ok; } }]); };
  const move = async (i, dir) => { const ids = list.map((f) => f.id); const j = i + dir; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; if (await act(() => api(`/api/c/${pid}/faqs`, { action: 'reorder', ids }), '')) refresh(); };
  return h('div', {}, h('h1', {}, '管理常見問答'), h('section', { class: 'card' }, h('h3', {}, '新增問答'), field('問題', q), field('答案', a), h('button', { class: 'btn', on: { click: async () => { if (await act(() => api(`/api/c/${pid}/faqs`, { q: q.value, a: a.value }), '已新增')) refresh(); } } }, '新增')),
    list.map((f, i) => h('div', { class: 'card row between' }, h('div', {}, h('b', {}, `${i + 1}. ${f.q}`), h('p', { class: 'pre small' }, f.a)), h('div', { class: 'row' }, h('button', { class: 'btn sm ghost', on: { click: () => move(i, -1) } }, '↑'), h('button', { class: 'btn sm ghost', on: { click: () => move(i, 1) } }, '↓'), h('button', { class: 'btn sm ghost', on: { click: () => edit(f) } }, '編輯'), h('button', { class: 'btn sm danger', on: { click: async () => { if (await act(() => api(`/api/c/${pid}/faqs`, { action: 'delete', id: f.id }), '已刪除')) refresh(); } } }, '刪除')))));
}));

// ---------- 計畫回饋 ----------
route('/c/:pid/options', async (x) => shell(pidOf(x), 'options', async (d) => {
  const pid = d.project.id, list = await api(`/api/c/${pid}/options`);
  return h('div', {}, h('div', { class: 'row between' }, h('h1', {}, '計畫回饋'), link(`/c/${pid}/options/new`, '＋ 增加贊助選項', 'btn')),
    table(['', '回饋方案名稱', '價格', '限量', '已贊助', '標記', ''], list.map((o) => [o.media && o.media[0] ? media(o.media[0], 'thumb') : '', o.name, money(o.price), o.limit || '不限', num(o.taken), [o.addonOnly ? badge('加購') : '', o.code ? badge('隱藏', 'gold') : '', o.atm ? badge('ATM') : '', o.installment ? badge(`分 ${o.installment} 期`) : ''], link(`/c/${pid}/options/${o.id}`, '編輯', 'btn sm ghost')]), '還沒有回饋選項'));
}));
async function optionForm(pid, oid) {
  const list = await api(`/api/c/${pid}/options`), o = oid ? list.find((y) => y.id === oid) : null;
  if (oid && !o) throw new Error('找不到這個回饋');
  const v = o || { name: '', seoName: '', price: '', retail: '', limit: 0, addonOnly: false, atm: true, installment: 0, coupon: true, media: [], seoImage: '', description: '', shipMonth: '', hasNote: false, noteRequired: false, code: '', survey: [], shipping: { TW: 0 }, stores: [], noteToBacker: '' };
  const F = { name: inp(v.name, { placeholder: '超早鳥單入組' }), seoName: inp(v.seoName), price: inp(v.price, { type: 'number', placeholder: '500' }), retail: inp(v.retail, { type: 'number', placeholder: '500' }), limit: inp(v.limit, { type: 'number', placeholder: '0' }),
    addonOnly: chk(v.addonOnly), atm: chk(v.atm), installment: sel({ 0: '- 選擇分期期數 -', 3: '3', 6: '6' }, String(v.installment)), coupon: chk(v.coupon), seoImage: mediaInput(v.seoImage), description: editor(v.description, { rows: 8 }), shipMonth: inp(v.shipMonth, { type: 'month' }),
    hasNote: chk(v.hasNote), noteRequired: chk(v.noteRequired), code: inp(v.code), noteToBacker: area(v.noteToBacker, 4) };
  // 圖片（可以多張、可以放 GIF 或影片）
  let mediaList = (v.media || []).slice();
  const mediaBox = h('div', { class: 'media-list' });
  const drawMedia = () => mediaBox.replaceChildren(...mediaList.map((m, i) => h('div', { class: 'mitem' }, media(m, 'thumb'), h('button', { class: 'x', title: '移除', on: { click: () => { mediaList.splice(i, 1); drawMedia(); } } }, '✕'))),
    h('label', { class: 'btn sm ghost' }, '＋ 上傳圖片／GIF／影片', h('input', { type: 'file', accept: 'image/*,video/mp4,video/webm', class: 'hidden', on: { change: async (e) => { const f = e.target.files[0]; if (!f) return; const r = await act(() => upload(f), '已上傳'); if (r) { mediaList.push({ url: r.url, type: r.type }); drawMedia(); } } } })));
  drawMedia();
  // 回饋調查
  let survey = (v.survey || []).map((s) => ({ ...s, choices: (s.choices || []).join('、') }));
  const surveyBox = h('div');
  const drawSurvey = () => surveyBox.replaceChildren(...survey.map((s, i) => { const q = inp(s.q, { placeholder: '題目' }), t = sel({ text: '簡答', choice: '選擇題' }, s.type), c = inp(s.choices, { placeholder: '選項用「、」分開' }), r = chk(s.required); for (const [e, k] of [[q, 'q'], [t, 'type'], [c, 'choices']]) e.addEventListener('input', () => { s[k] = e.value; }); r.addEventListener('change', () => { s.required = r.checked; }); return h('div', { class: 'row card' }, q, t, c, h('label', {}, r, '必填'), h('button', { class: 'btn sm danger', on: { click: () => { survey.splice(i, 1); drawSurvey(); } } }, '刪除')); }),
    h('button', { class: 'btn sm ghost', on: { click: () => { survey.push({ q: '', type: 'text', choices: '', required: false }); drawSurvey(); } } }, '＋ 新增題目'));
  drawSurvey();
  // 運費（25 個國家地區；留空＝不寄送）
  const ship = {};
  const shipTbl = table(['國家', '運費'], Object.entries(state.meta.countries).map(([k, name]) => { ship[k] = inp(v.shipping && v.shipping[k] !== '' && v.shipping[k] !== undefined ? v.shipping[k] : '', { type: 'number', min: 0, class: 'sm' }); return [name, ship[k]]; }));
  const stores = {}; for (const [k, n] of Object.entries(state.meta.stores)) stores[k] = chk((v.stores || []).includes(k));
  const save = async (next) => {
    const b = { id: oid || 0, media: mediaList, survey: survey.map((s) => ({ q: s.q, type: s.type, required: !!s.required, choices: String(s.choices || '').split(/[、,，]/).map((c) => c.trim()).filter(Boolean) })), shipping: Object.fromEntries(Object.entries(ship).map(([k, e]) => [k, e.value === '' ? '' : Number(e.value)])), stores: Object.keys(stores).filter((k) => stores[k].checked) };
    for (const [k, e] of Object.entries(F)) b[k] = e.getValue ? e.getValue() : e.type === 'checkbox' ? e.checked : e.value;
    for (const k of ['price', 'retail', 'limit', 'installment']) b[k] = Number(b[k]) || 0;
    if (await act(() => api(`/api/c/${pid}/options`, b), '回饋已儲存')) go(next ? `/c/${pid}/options/new` : `/c/${pid}/options`);
  };
  return h('div', {}, h('h1', {}, oid ? '編輯贊助選項' : '增加贊助選項'), o && o.taken ? h('p', { class: 'warn' }, `已經有 ${o.taken} 份贊助：價格不能改、不能刪除`) : null,
    h('section', { class: 'card' }, field('回饋方案名稱', F.name), field('商品名稱（用於 SEO）', F.seoName), h('div', { class: 'grid3' }, field('價格', F.price), field('預定售價', F.retail), field('限量（0＝不限）', F.limit)),
      field('加購選項，不顯示於計畫頁面', F.addonOnly), field('可以使用虛擬帳號轉帳或臨櫃繳款', F.atm, '轉帳付款在訂單成立當日隔一天的 23:59:59 之前付款皆可過單，因此限量產品建議不開放。'), field('可使用信用卡分期付款', F.installment), field('可以使用折扣碼', F.coupon)),
    h('section', { class: 'card' }, h('h3', {}, '圖片（可以放 GIF 或影片，第一個當主圖）'), mediaBox, field('商品主圖（用於 SEO）', F.seoImage)),
    h('section', { class: 'card' }, field('選項內容', F.description), field('預計出貨日期', F.shipMonth)),
    h('section', { class: 'card' }, h('h3', {}, '使用者備註'), field('開啟備註欄', F.hasNote), field('將備註欄設定為必填', F.noteRequired), field('隱藏選項密碼（填了就只有輸入密碼的人看得到）', F.code)),
    h('section', { class: 'card' }, h('h3', {}, '回饋調查'), h('p', { class: 'small muted' }, '非必填欄位。計畫結束前，贊助者可以在贊助紀錄隨時修改答案。'), surveyBox),
    h('section', { class: 'card' }, h('h3', {}, '運費設定'), h('p', { class: 'small muted' }, '不另外設定運費時，回饋選項的金額即為含運價格。無法寄送的國家、地區，運費請留空。'), shipTbl),
    h('section', { class: 'card' }, h('h3', {}, '開放超商取貨？'), h('p', { class: 'small muted' }, '超商取貨同時支援本島與外島；贊助人沒填超商資料或門市不收件時以宅配出貨；包裹材積限制依超商而異。'), h('div', { class: 'row' }, Object.entries(state.meta.stores).map(([k, n]) => h('label', {}, stores[k], ' ' + n)))),
    h('section', { class: 'card' }, h('h3', {}, '給贊助人的話'), h('p', { class: 'small muted' }, '成功付款後贊助人可以看到的文字。'), F.noteToBacker),
    h('div', { class: 'row' }, h('button', { class: 'btn big', on: { click: () => save(false) } }, '儲存'), oid ? null : h('button', { class: 'btn big ghost', on: { click: () => save(true) } }, '儲存並新增下一個'),
      oid ? h('button', { class: 'btn danger', on: { click: async () => { if (await act(() => api(`/api/c/${pid}/options`, { action: 'delete', id: oid }), '已刪除')) go(`/c/${pid}/options`); } } }, '刪除這個回饋') : null));
}
route('/c/:pid/options/new', async (x) => shell(pidOf(x), 'options', () => optionForm(pidOf(x), 0)));
route('/c/:pid/options/:oid', async (x) => shell(pidOf(x), 'options', () => optionForm(pidOf(x), Number(x.oid))));
route('/c/:pid/reorder', async (x) => shell(pidOf(x), 'reorder', async (d) => {
  const pid = d.project.id; let list = await api(`/api/c/${pid}/options`);
  const box = h('ol', { class: 'reorder' });
  const draw = () => box.replaceChildren(...list.map((o, i) => h('li', { class: 'card row between' }, h('span', {}, `${o.name}　${money(o.price)}`), h('span', {}, h('button', { class: 'btn sm ghost', on: { click: () => { if (i) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; draw(); } } } }, '↑'), h('button', { class: 'btn sm ghost', on: { click: () => { if (i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; draw(); } } } }, '↓')))));
  draw();
  return h('div', {}, h('h1', {}, '自訂回饋順序'), h('p', { class: 'small muted' }, `目前計畫頁的排序方式：${{ custom: '自訂順序', priceDesc: '價格高到低', priceAsc: '價格低到高' }[d.project.optionOrder]}（在「修改計畫 > 其他設定」改）`), box, h('button', { class: 'btn', on: { click: () => act(() => api(`/api/c/${pid}/options`, { action: 'reorder', ids: list.map((o) => o.id) }), '順序已儲存') } }, '儲存順序'));
}));

// ---------- 折扣碼 ----------
route('/c/:pid/coupons', async (x) => shell(pidOf(x), 'coupons', async (d) => {
  const pid = d.project.id, list = await api(`/api/c/${pid}/coupons`), refresh = () => go(`/c/${pid}/coupons`, true);
  const F = { code: inp(''), amount: inp('', { type: 'number' }), from: inp('', { placeholder: 'YYYY-MM-DD HH:mm' }), until: inp('', { placeholder: 'YYYY-MM-DD HH:mm' }), note: inp(''), promotional: chk(false) };
  return h('div', {}, h('h1', {}, '管理折扣碼'),
    table(['折扣碼', '金額', '期間', '備註', 'EDM', '已使用', ''], list.map((c) => [h('b', { class: 'mono' }, c.code), money(c.amount), `${dt(c.from)} ～ ${dt(c.until)}`, c.note, c.promotional ? '✓' : '', num(c.used), h('button', { class: 'btn sm danger', on: { click: async () => { if (await act(() => api(`/api/c/${pid}/coupons`, { action: 'delete', id: c.id }), '已刪除')) refresh(); } } }, '刪除')]), '尚未建立折扣碼'),
    h('section', { class: 'card' }, h('h2', {}, '新增折扣碼'), h('div', { class: 'grid3' }, field('折扣碼', F.code), field('金額', F.amount), field('備註', F.note), field('開始時間 (UTC+8)', F.from), field('結束時間 (UTC+8)', F.until)), field('可用於未結帳 EDM', F.promotional),
      h('button', { class: 'btn', on: { click: async () => { const b = Object.fromEntries(Object.entries(F).map(([k, e]) => [k, e.type === 'checkbox' ? e.checked : e.value])); b.amount = Number(b.amount); if (await act(() => api(`/api/c/${pid}/coupons`, b), '已新增')) refresh(); } } }, '建立')));
}));

// ---------- 計畫推薦連結 ----------
route('/c/:pid/referrers', async (x) => shell(pidOf(x), 'referrers', async (d) => {
  const pid = d.project.id, list = await api(`/api/c/${pid}/referrers`), refresh = () => go(`/c/${pid}/referrers`, true);
  const name = inp(''), partner = inp(''), aud = inp('', { type: 'number' });
  const urlOf = (r) => `${location.origin}/p/${d.project.slug}?r=${r.code}`;
  const copy = (t) => navigator.clipboard.writeText(t).then(() => toast('已複製'), () => toast('複製失敗', 'err'));
  return h('div', {}, h('h1', {}, '計畫推薦連結列表'), h('p', { class: 'small muted' }, '每個宣傳管道給一條連結，就看得出哪個管道帶來多少訂單和金額。'),
    table(['代碼／建立時間', '計畫推薦連結', '推播名稱', '合作廠商', '預估受眾數', '訂單數量', '金額', ''], list.map((r) => [h('div', {}, h('b', { class: 'mono' }, r.code), h('div', { class: 'small muted' }, dt(r.createdAt))), h('div', { class: 'row' }, inp(urlOf(r), { readonly: true, class: 'sm' }), h('button', { class: 'btn sm ghost', on: { click: () => copy(urlOf(r)) } }, '複製')), r.name, r.partner, num(r.audience), num(r.orders), money(r.amount),
      h('div', { class: 'row' }, h('button', { class: 'btn sm ghost', on: { click: () => { const n2 = inp(r.name), p2 = inp(r.partner), a2 = inp(r.audience, { type: 'number' }); modal('編輯推薦連結', h('div', {}, field('推播名稱', n2), field('合作廠商', p2), field('預估受眾數', a2)), [{ text: '儲存', fn: async () => { const ok = await act(() => api(`/api/c/${pid}/referrers`, { id: r.id, name: n2.value, partner: p2.value, audience: Number(a2.value) })); if (ok) refresh(); return !!ok; } }]); } } }, '編輯'), h('button', { class: 'btn sm danger', on: { click: async () => { if (await act(() => api(`/api/c/${pid}/referrers`, { action: 'delete', id: r.id }), '已刪除')) refresh(); } } }, '刪除'))])),
    h('section', { class: 'card' }, h('h3', {}, '新增推薦連結'), h('div', { class: 'grid3' }, field('推播名稱', name), field('合作廠商', partner), field('預估受眾數', aud)), h('button', { class: 'btn', on: { click: async () => { if (await act(() => api(`/api/c/${pid}/referrers`, { name: name.value, partner: partner.value, audience: Number(aud.value) }), '已建立')) refresh(); } } }, '建立')));
}));

// ---------- EDM 再行銷 ----------
route('/c/:pid/edm', async (x) => shell(pidOf(x), 'edm', async (d) => {
  const pid = d.project.id, a = await api(`/api/c/${pid}/abandon`);
  const F = { subject: inp(a.subject), preheader: inp(a.preheader), title: area(a.title, 2, { maxlength: 30, placeholder: '老闆喊話 **64折** 優惠就這次（最多 30 字）' }), subtitle: area(a.subtitle, 2, { maxlength: 25, placeholder: '現省 $2,090，只到 11/28（最多 25 字）' }), cta: inp(a.cta, { maxlength: 8, placeholder: '馬上帶回家（最多 8 個字）' }) };
  const feats = [0, 1, 2].map((i) => inp((a.features || [])[i] || '', { placeholder: '產品特色 ' + (i + 1) }));
  const coupon = sel({ 0: '不附折扣碼', ...Object.fromEntries(a.coupons.map((c) => [c.id, `${c.code}（折 ${c.amount}）`])) }, String(a.couponId || 0));
  const enabled = chk(a.enabled);
  const preview = h('div', { class: 'card mail-pv' });
  const drawPv = () => preview.replaceChildren(h('div', { class: 'small muted' }, '預覽'), h('b', {}, F.subject.value || '（信件標題）'), h('div', { class: 'small muted' }, F.preheader.value), h('h3', {}, F.title.value), h('p', {}, F.subtitle.value), h('ul', {}, feats.filter((f) => f.value).map((f) => h('li', {}, f.value))), coupon.value !== '0' ? h('p', {}, '折扣碼：' + coupon.selectedOptions[0].textContent) : null, h('span', { class: 'btn' }, F.cta.value || '回去看看'));
  for (const e of [...Object.values(F), ...feats, coupon]) e.addEventListener('input', drawPv); drawPv();
  return h('div', {}, h('h1', {}, '未結帳 EDM 再行銷設定'), h('p', { class: 'small muted' }, `進到結帳頁但沒有完成贊助的人，1 小時後自動寄一封提醒信（收件人在「通知信箱」看得到）。目前：開始結帳 ${a.stats.started} 人、已轉換 ${a.stats.converted} 人、已寄提醒 ${a.stats.reminded} 封。`),
    h('div', { class: 'grid2' }, h('section', { class: 'card' }, h('h2', {}, '信件標題'), field('信件標題', F.subject), field('預覽文字', F.preheader), h('h2', {}, '信件內容'), field('主標題', F.title), field('副標題', F.subtitle), field('行動呼籲', F.cta), h('h2', {}, '產品特色'), feats, h('h2', {}, '折扣碼'), a.coupons.length ? coupon : h('p', { class: 'small muted' }, '沒有有效的自動化行銷用折扣碼（建立折扣碼時勾「可用於未結帳 EDM」）'), h('h2', {}, '啟用'), field('每日自動寄送', enabled),
      h('button', { class: 'btn', on: { click: () => act(() => api(`/api/c/${pid}/abandon`, { ...Object.fromEntries(Object.entries(F).map(([k, e]) => [k, e.value])), features: feats.map((f) => f.value), couponId: Number(coupon.value), enabled: enabled.checked })) } }, '儲存')), preview));
}));

// ---------- 計畫更新 ----------
route('/c/:pid/updates', async (x) => shell(pidOf(x), 'updates', async (d) => {
  const pid = d.project.id, list = await api(`/api/c/${pid}/updates`);
  return h('div', {}, h('div', { class: 'row between' }, h('h1', {}, '計畫更新'), link(`/c/${pid}/updates/new`, '＋ 更新計畫動態', 'btn')),
    table(['標題', '分類', '對象', '狀態', '時間', ''], list.map((u) => [u.title, u.category, u.private ? (u.audience.length ? '特定回饋贊助人' : '贊助人限定') : '公開', u.status === 'published' ? badge('已發布', 'ok') : badge('草稿', 'gray'), dt(u.publishedAt || u.createdAt), link(`/c/${pid}/updates/${u.id}`, '編輯', 'btn sm ghost')]), '還沒有更新'));
}));
async function updateForm(pid, uid) {
  const [list, opts] = await Promise.all([api(`/api/c/${pid}/updates`), api(`/api/c/${pid}/options`)]);
  const u = uid ? list.find((y) => y.id === uid) : null; if (uid && !u) throw new Error('找不到這則更新');
  const v = u || { title: '', category: '進度報告', cover: '', notify: true, private: false, audience: [], content: '', status: 'draft' };
  const status = sel({ draft: '草稿', published: '發布' }, v.status), title = inp(v.title, { placeholder: '電子報標題' }), cat = sel(Object.fromEntries(state.meta.updateCategories.map((c) => [c, c])), v.category), cover = mediaInput(v.cover), notify = chk(v.notify), content = editor(v.content);
  const isPriv = chk(v.private), aud = {}; const audBox = h('div', { class: v.private ? '' : 'hidden' }, h('p', { class: 'small muted' }, '只給這些回饋的贊助人看（都不勾＝所有贊助人）：'), opts.map((o) => { aud[o.id] = chk(v.audience.includes(o.id)); return h('label', { class: 'field check' }, aud[o.id], h('span', {}, `${money(o.price)}　${o.taken} 人（含加購）　${o.name}`)); }));
  isPriv.addEventListener('change', () => audBox.classList.toggle('hidden', !isPriv.checked));
  return h('div', {}, h('h1', {}, '更新計畫動態'), h('section', { class: 'card' }, field('狀態', status), field('標題', title), field('分類', cat), field('封面照片', cover), field('同步寄送給更新對象（寄信通知）', notify), field('贊助人限定（不勾＝公開）', isPriv), audBox, field('內容', content)),
    h('div', { class: 'row' }, h('button', { class: 'btn big', on: { click: async () => { const r = await act(() => api(`/api/c/${pid}/updates`, { id: uid || 0, status: status.value, title: title.value, category: cat.value, cover: cover.getValue(), notify: notify.checked, private: isPriv.checked, audience: Object.keys(aud).filter((k) => aud[k].checked).map(Number), content: content.getValue() }), '已儲存'); if (r) go(`/c/${pid}/updates`); } } }, '儲存'),
      uid ? h('button', { class: 'btn danger', on: { click: async () => { if (await act(() => api(`/api/c/${pid}/updates`, { action: 'delete', id: uid }), '已刪除')) go(`/c/${pid}/updates`); } } }, '刪除') : null));
}
route('/c/:pid/updates/new', async (x) => shell(pidOf(x), 'updates', () => updateForm(pidOf(x), 0)));
route('/c/:pid/updates/:uid', async (x) => shell(pidOf(x), 'updates', () => updateForm(pidOf(x), Number(x.uid))));

// ---------- 數據分析 ----------
route('/c/:pid/metrics', async (x) => shell(pidOf(x), 'metrics', async (d) => {
  const m = await api(`/api/c/${d.project.id}/metrics`);
  return h('div', {}, h('h1', {}, '數據分析'), h('section', { class: 'card' }, h('h3', {}, '募得金額成長表'), lineChart(m.growth, 'cum')), h('section', { class: 'card' }, h('h3', {}, '每日訂單數'), bars(m.growth.map((g) => ({ name: g.day.slice(5), n: g.orders })), { unit: ' 筆' })),
    h('div', { class: 'grid2' }, h('section', { class: 'card' }, h('h3', {}, '贊助選項分布'), bars(m.optDist, { unit: ' 份' })), h('section', { class: 'card' }, h('h3', {}, '付款方式'), bars(m.payDist, { unit: ' 筆' })), h('section', { class: 'card' }, h('h3', {}, '一般／被推薦贊助數量'), bars(m.referred, { unit: ' 筆' })), h('section', { class: 'card' }, h('h3', {}, '使用折扣碼贊助數量'), bars(m.coupon, { unit: ' 筆' })), h('section', { class: 'card' }, h('h3', {}, '支持者贊助過的計畫數量'), bars(m.backedCount, { unit: ' 人' }))));
}));

// ---------- 贊助名單下載（贊助人列表、出貨列表）----------
route('/c/:pid/backers', async (x) => shell(pidOf(x), 'backers', async (d) => {
  const pid = d.project.id, list = (await api(`/api/c/${pid}/orders?status=paid`));
  const pick = {}; const carrier = inp('', { placeholder: '物流公司' }), trackNo = inp('', { placeholder: '物流單號' });
  const dl = async (kind) => { const r = await act(() => api(`/api/c/${pid}/export?kind=${kind}`), '已匯出'); if (r) download(r.csv, r.filename); };
  return h('div', {}, h('h1', {}, '贊助名單下載'), h('div', { class: 'row' }, h('button', { class: 'btn', on: { click: () => dl('backers') } }, '下載贊助人列表（CSV）'), h('button', { class: 'btn ghost', on: { click: () => dl('shipping') } }, '下載出貨列表（CSV）')),
    h('h2', {}, '出貨列表'), h('div', { class: 'row card' }, carrier, trackNo, h('button', { class: 'btn', on: { click: async () => { const ids = Object.keys(pick).filter((k) => pick[k].checked).map(Number); if (!ids.length) return toast('請勾選訂單', 'err'); if (await act(() => api(`/api/c/${pid}/orders/ship`, { ids, carrier: carrier.value, trackNo: trackNo.value }), '已標記出貨並通知贊助人')) go(`/c/${pid}/backers`, true); } } }, '標記已出貨')),
    table(['', '訂單', '收件人', '回饋', '取貨', '出貨'], list.map((o) => { pick[o.id] = chk(false); return [pick[o.id], o.token, o.recipient.name, o.items.map((it) => `${it.name}×${it.qty}`).join('、'), o.delivery === 'store' ? `超商 ${o.store ? o.store.name : ''}` : `${o.recipient.city}${o.recipient.district}`, o.shipped ? `✓ ${o.shipped.trackNo}` : '未出貨']; }), '還沒有付款成功的訂單'));
}));

// ---------- 訂單總覽 ----------
route('/c/:pid/orders', async (x, q) => shell(pidOf(x), 'orders', async (d) => {
  const pid = d.project.id, qs = new URLSearchParams(q);
  const list = await api(`/api/c/${pid}/orders?` + qs.toString());
  const field2 = sel({ token: '訂單編號', recipient: '收件人', email: '電子信箱', phone: '聯絡電話', backer: '贊助人' }, q.field || 'token'), kw = inp(q.q || '', { type: 'search', placeholder: '查詢' }), status = sel({ '': '全部狀態', ...state.meta.orderStatus }, q.status || '');
  const detail = (o) => modal('訂單 ' + o.token, h('div', {}, h('p', {}, '狀態：', o.statusName), h('p', {}, `贊助人：${o.backer}（${o.email}）`), h('ul', {}, o.items.map((it) => h('li', {}, `${it.name}×${it.qty}　${money(it.price * it.qty)}`))), h('p', {}, `加碼 ${money(o.bonus)}｜折扣碼 ${o.coupon || '無'}｜總金額 ${money(o.total)}`), h('p', {}, `付款：${o.payName}${o.installments ? ` 分 ${o.installments} 期` : ''}｜推薦代碼 ${o.referrer || '無'}`),
    h('p', {}, `收件：${o.recipient.name} ${o.recipient.phone}`), h('p', {}, o.delivery === 'store' ? `超商取貨：${o.store.name}（${o.store.id}）` : `${o.recipient.zip} ${o.recipient.city}${o.recipient.district}${o.recipient.address}`), o.survey.length ? h('ul', {}, o.survey.map((s) => h('li', {}, `${s.q}：${s.a}`))) : null, o.note ? h('p', {}, '備註：' + o.note) : null, h('p', { class: 'small muted' }, `建立 ${dt(o.createdAt)}｜付款 ${dt(o.paidAt)}`)));
  return h('div', {}, h('h1', {}, '訂單總覽'), h('form', { class: 'filters', on: { submit: (e) => { e.preventDefault(); const n = new URLSearchParams(); n.set('field', field2.value); if (kw.value) n.set('q', kw.value); if (status.value) n.set('status', status.value); go(`/c/${pid}/orders?` + n.toString()); } } }, field2, kw, status, h('button', { class: 'btn' }, '查詢')),
    table(['狀態', '訂單編號', '收件人', '贊助選項', '付款方式', '總金額', '時間', ''], list.map((o) => [badge(o.statusName, o.status), o.token, o.recipient.name, o.items.map((it) => `${it.name}×${it.qty}`).join('、'), o.payName, money(o.total), dt(o.createdAt), h('button', { class: 'btn sm ghost', on: { click: () => detail(o) } }, '明細')]), '找不到訂單'));
}));

// ---------- 退款申請總覽 ----------
route('/c/:pid/refunds', async (x, q) => shell(pidOf(x), 'refunds', async (d) => {
  const pid = d.project.id, sts = (q.status || 'pending').split(','), list = await api(`/api/c/${pid}/refunds?status=${encodeURIComponent(sts.join(','))}${q.q ? '&q=' + encodeURIComponent(q.q) : ''}`);
  const boxes = Object.fromEntries(Object.entries(state.meta.refundStatus).map(([k]) => [k, chk(sts.includes(k))])), kw = inp(q.q || '', { type: 'search', placeholder: '訂單編號、收件人、信箱、電話' });
  const decide = async (r, decision) => { const note = decision === 'reject' ? await ask('駁回退款', '原因（贊助人會收到）', { multiline: true }) : ''; if (decision === 'reject' && !note) return; if (await act(() => api(`/api/c/${pid}/refunds/${r.id}`, { decision, note }), decision === 'approve' ? '已同意並退款' : '已駁回')) go(location.pathname + location.search, true); };
  return h('div', {}, h('h1', {}, '退款申請總覽'), h('form', { class: 'filters', on: { submit: (e) => { e.preventDefault(); const s = Object.keys(boxes).filter((k) => boxes[k].checked).join(','); go(`/c/${pid}/refunds?status=${s}${kw.value ? '&q=' + encodeURIComponent(kw.value) : ''}`); } } }, Object.entries(state.meta.refundStatus).map(([k, n]) => h('label', {}, boxes[k], ' ' + n)), kw, h('button', { class: 'btn' }, '篩選')),
    table(['狀態', '訂單編號', '收件人', '付款方式', '總金額', '原因', '時間', ''], list.map((r) => [badge(r.statusName, r.status), r.order, r.recipient, r.payMethod, money(r.total), r.reason, dt(r.createdAt), r.status === 'pending' ? h('div', { class: 'row' }, h('button', { class: 'btn sm', on: { click: () => decide(r, 'approve') } }, '同意退款'), h('button', { class: 'btn sm danger', on: { click: () => decide(r, 'reject') } }, '駁回')) : r.note]), '沒有退款申請'));
}));

// ---------- 留言管理 ----------
route('/c/:pid/comments', async (x) => shell(pidOf(x), 'comments', async (d) => {
  const pid = d.project.id, list = await api(`/api/c/${pid}/comments`);
  return h('div', {}, h('h1', {}, '留言管理'), table(['留言者', '內容', '時間', '狀態', ''], list.map((c) => [c.name, c.body, dt(c.createdAt), c.hidden ? '已被平台隱藏' : c.parentId ? '回覆' : '留言', c.parentId ? '' : h('button', { class: 'btn sm', on: { click: async () => { const t = await ask('回覆留言', '回覆內容', { multiline: true }); if (t && await act(() => api(`/api/c/${pid}/comments`, { parentId: c.id, body: t }), '已回覆')) go(`/c/${pid}/comments`, true); } } }, '回覆')]), '還沒有留言'));
}));

// ---------- 商業檔案設定 ----------
route('/c/:pid/business', async (x) => shell(pidOf(x), 'business', async (d) => {
  const pid = d.project.id, b = await api(`/api/c/${pid}/business`), locked = b.status === 'approved' || b.status === 'pending';
  const I = (k, ph = '') => inp(b[k] || '', { placeholder: ph, disabled: locked });
  const F = { kind: sel({ company: '法人', person: '自然人' }, b.kind || 'company', { disabled: locked }), companyName: I('companyName'), ubn: I('ubn', '8 碼'), capital: I('capital'), incorporated: inp(b.incorporated || '', { type: 'date', disabled: locked }),
    fullname: I('fullname', 'E.g. 王大明'), firstnameEn: I('firstnameEn', 'E.g. Da Ming'), lastnameEn: I('lastnameEn', 'E.g. Wang'), birthday: inp(b.birthday || '', { type: 'date', disabled: locked }), mobile: I('mobile', '09 開頭 10 碼'),
    idType: sel({ idcard: '身分證', arc: '居留證' }, b.idType || 'idcard', { disabled: locked }), idNumber: I('idNumber'), idIssued: inp(b.idIssued || '', { type: 'date', disabled: locked }), idIssueKind: sel({ 初發: '初發', 補證: '補證', 換發: '換發' }, b.idIssueKind || '換發', { disabled: locked }), idPhoto: sel({ 有: '有', 無: '無' }, b.idPhoto || '有', { disabled: locked }), idPlace: I('idPlace', '例：北市'), residenceSerial: I('residenceSerial'),
    phone: I('phone'), city: I('city'), district: I('district'), zip: I('zip'), address: I('address', '金山南路二段 86號'), regAddress: I('regAddress'), bankName: I('bankName'), bankCode: I('bankCode', '3 碼'), bankBranch: I('bankBranch', '4 碼'), bankAccount: I('bankAccount') };
  const save = (submit) => act(async () => { const body = Object.fromEntries(Object.entries(F).map(([k, e]) => [k, e.value])); body.submit = submit; await api(`/api/c/${pid}/business`, body); go(`/c/${pid}/business`, true); }, submit ? '已送審' : '已儲存草稿');
  return h('div', {}, h('h1', {}, '商業檔案設定　', badge({ draft: '草稿', pending: '審核中', approved: '審核通過', rejected: '退回修改' }[b.status] || '草稿', b.status)), b.note ? h('p', { class: 'err' }, '平台備註：' + b.note) : null,
    h('section', { class: 'card' }, h('h2', {}, '法人基本資料'), field('申請身分', F.kind), h('div', { class: 'grid3' }, field('法人登記名稱', F.companyName), field('統一編號', F.ubn), field('實收資本額', F.capital), field('法人成立日期', F.incorporated))),
    h('section', { class: 'card' }, h('h2', {}, '負責人基本資料'), h('div', { class: 'grid3' }, field('負責人全名', F.fullname), field('負責人英文(名)', F.firstnameEn), field('負責人英文(姓)', F.lastnameEn), field('負責人出生年月日', F.birthday), field('負責人手機號碼', F.mobile))),
    h('section', { class: 'card' }, h('h2', {}, '負責人身分文件'), h('div', { class: 'grid3' }, field('負責人證號類型', F.idType), field('負責人證號', F.idNumber), field('身分證發行日期', F.idIssued), field('身分證發放狀態', F.idIssueKind), field('身分證是否含照片', F.idPhoto), field('身分證發放地點', F.idPlace), field('居留證背面序號', F.residenceSerial))),
    h('section', { class: 'card' }, h('h2', {}, '聯絡資訊'), h('div', { class: 'grid3' }, field('連絡電話號碼', F.phone), field('縣市', F.city), field('鄉鎮市區', F.district), field('郵遞區號', F.zip)), field('街道與門牌', F.address), field('法人登記地址（個人申請時，請填戶籍地址）', F.regAddress)),
    h('section', { class: 'card' }, h('h2', {}, '銀行帳戶資訊'), h('div', { class: 'grid3' }, field('銀行戶名', F.bankName), field('銀行代碼', F.bankCode), field('銀行分行代碼', F.bankBranch), field('銀行帳號', F.bankAccount))),
    locked ? h('p', { class: 'muted' }, b.status === 'pending' ? '審核中，不能修改' : '已審核通過；要修改請聯繫專案經理') : h('div', { class: 'row' }, h('button', { class: 'btn ghost', on: { click: () => save(false) } }, '儲存草稿'), h('button', { class: 'btn', on: { click: () => save(true) } }, '送出審核')),
    h('p', { class: 'small muted' }, '這些資料只有你的團隊和平台人員看得到。商業檔案和金流帳號都送出後，才會進入「商業檔案與金流帳號初審」。'));
}));

// ---------- 金流帳號申請 ----------
route('/c/:pid/payment', async (x) => shell(pidOf(x), 'payment', async (d) => {
  const pid = d.project.id, a = await api(`/api/c/${pid}/payment`);
  const m = { credit: chk(a.methods.credit, { disabled: a.submitted }), atm: chk(a.methods.atm, { disabled: a.submitted }), aftee: chk(a.methods.aftee, { disabled: a.submitted }) };
  const save = (submit) => act(async () => { await api(`/api/c/${pid}/payment`, { methods: { credit: m.credit.checked, atm: m.atm.checked, aftee: m.aftee.checked }, submit }); go(`/c/${pid}/payment`, true); }, submit ? '已送出申請' : '已儲存');
  return h('div', {}, h('h1', {}, '合作金流商店'), h('section', { class: 'card' }, h('h3', {}, '結帳方式'), field('信用卡', m.credit), field('ATM 轉帳', m.atm), field('AFTEE', m.aftee), a.submitted ? h('p', { class: 'muted' }, '已送出申請（信用卡分期期數在「計畫回饋」每個選項設定）') : h('div', { class: 'row' }, h('button', { class: 'btn ghost', on: { click: () => save(false) } }, '儲存'), h('button', { class: 'btn', on: { click: () => save(true) } }, '送出申請'))),
    table(['金流商', '支援結帳方式', '申請狀態'], a.providers.map((p) => [p.name, p.methods, badge({ draft: '未申請', pending: '審核中', approved: '已通過', rejected: '未通過' }[p.status], p.status)])));
}));
