/**
 * 前台（贊助者看到的）：首頁、探索、計畫頁、結帳、付款、我的贊助紀錄、追蹤、提案紀錄、個人頁、帳號設定、團隊、站內訊息、信箱、發起計畫、登入註冊
 */
import { h, link, go, api, state, loadMe, toast, act, modal, ask, money, num, dt, ago, field, inp, area, sel, chk, markup, media, videoEmbed, table, badge, mediaInput, serverNow, route } from './core.js';

// ---------- 共用：計畫卡片 ----------
export function projectCard(p) {
  const bar = h('div', { class: 'progress' }, h('i', { style: { width: Math.min(100, p.percent) + '%' } }));
  return h('article', { class: 'pcard' },
    link('/p/' + p.slug, [p.cover ? media({ url: p.cover }, 'cover') : h('div', { class: 'cover ph' }, p.title.slice(0, 2)), h('span', { class: 'ptype' }, p.typeName)], 'pcover'),
    h('div', { class: 'pbody' },
      h('div', { class: 'pmeta' }, `${p.category}・${p.owner}`),
      link('/p/' + p.slug, p.title, 'ptitle'), h('p', { class: 'pdesc' }, p.description),
      p.type === 'subscription' ? h('div', { class: 'pnum' }, h('b', {}, money(p.monthly) + ' / 每月'), h('span', {}, '長期訂閱')) : [bar, h('div', { class: 'pnum' }, h('b', {}, money(p.raised)), h('span', {}, p.status === 'live' ? p.left : p.statusName), h('span', { class: 'pct' }, p.percent + '%'))]));
}
const grid = (list, empty = '目前沒有計畫') => (list.length ? h('div', { class: 'grid' }, list.map(projectCard)) : h('p', { class: 'muted' }, empty));

// ---------- 首頁 ----------
route('/', async () => {
  const d = await api('/api/home');
  const hero = d.featured[0];
  const sec = (title, more, list, empty) => h('section', { class: 'sec' }, h('div', { class: 'sec-h' }, h('h2', {}, title), more ? link(more, '查看更多 ›') : null), grid(list, empty));
  // 主打：大圖＋金額、達成率（其他主打、精選放在下面「熱門計畫」）
  const heroBox = hero ? h('section', { class: 'hero' },
    link('/p/' + hero.slug, hero.cover ? media({ url: hero.cover }, 'cover') : h('div', { class: 'cover ph big' }, hero.title.slice(0, 4)), 'hero-img'),
    h('div', { class: 'hero-txt' }, h('span', { class: 'pill' }, hero.type === 'subscription' ? '長期訂閱' : hero.left), h('h1', {}, hero.title), h('p', {}, hero.description),
      h('div', { class: 'hero-num' }, money(hero.raised)), h('div', { class: 'hero-sub' }, hero.type === 'subscription' ? '本月累計' : `已達成 ${hero.percent}%・目標 ${money(hero.goal)}`),
      link('/p/' + hero.slug, '查看計畫', 'btn big'))) : null;
  const hot = d.featured.slice(1).concat(d.picks.filter((p) => !d.featured.some((f) => f.slug === p.slug))).slice(0, 6);
  return h('div', {}, heroBox,
    hot.length ? sec('熱門計畫', '/explore?sort=raised', hot) : null,
    d.crowd.length ? sec('群眾集資', '/explore?type=crowd', d.crowd) : null,
    d.preorder.length ? sec('預購專案', '/explore?type=preorder', d.preorder) : null,
    d.subscription.length ? sec('訂閱專案', '/explore?type=subscription', d.subscription) : null,
    d.updates.length ? h('section', { class: 'sec' }, h('div', { class: 'sec-h' }, h('h2', {}, '最新計畫動態')), h('ul', { class: 'updates-list' }, d.updates.map((u) => h('li', {}, link('/p/' + u.slug + '?tab=updates', `${u.project}｜${u.title}`), h('span', { class: 'muted small' }, ago(u.at)))))) : null,
    d.success.length ? sec('成功計畫', '/explore?status=success', d.success) : null,
    h('section', { class: 'sec' }, h('div', { class: 'sec-h' }, h('h2', {}, '探索分類')), h('div', { class: 'cats' }, d.categories.map((c) => link('/explore?category=' + encodeURIComponent(c), c, 'chip')))));
});

// ---------- 探索 ----------
route('/explore', async (_, q) => {
  const qs = new URLSearchParams(q); const d = await api('/api/projects?' + qs.toString());
  const kw = inp(q.q || '', { placeholder: '搜尋計畫', type: 'search' });
  const type = sel({ '': '全部類型', ...state.meta.types }, q.type || ''), cat = sel({ '': '全部分類', ...Object.fromEntries(state.meta.categories.map((c) => [c, c])) }, q.category || '');
  const status = sel({ '': '全部狀態', live: '募資中', success: '已成功', failed: '未達標' }, q.status || ''), sort = sel({ '': '最新上線', raised: '集資金額', percent: '達成率', ending: '即將結束' }, q.sort || '');
  const apply = (page = 1) => { const n = new URLSearchParams(); if (kw.value) n.set('q', kw.value); if (type.value) n.set('type', type.value); if (cat.value) n.set('category', cat.value); if (status.value) n.set('status', status.value); if (sort.value) n.set('sort', sort.value); if (page > 1) n.set('page', page); go('/explore?' + n.toString()); };
  for (const e of [type, cat, status, sort]) e.addEventListener('change', () => apply());
  const pages = Math.ceil(d.total / d.per);
  return h('div', {}, h('h1', {}, '探索計畫'), h('form', { class: 'filters', on: { submit: (e) => { e.preventDefault(); apply(); } } }, kw, type, cat, status, sort, h('button', { class: 'btn' }, '搜尋')),
    h('p', { class: 'muted small' }, `共 ${d.total} 個計畫`), grid(d.list, '找不到符合的計畫'),
    pages > 1 ? h('div', { class: 'pager' }, Array.from({ length: pages }, (_, i) => h('button', { class: 'btn ' + (i + 1 === d.page ? '' : 'ghost'), on: { click: () => apply(i + 1) } }, String(i + 1)))) : null);
});

// ---------- 計畫頁 ----------
route('/p/:slug', async ({ slug }, q) => {
  const ref = q.r ? String(q.r).slice(0, 20) : ''; if (ref) sessionStorage.setItem('ref:' + slug, ref);   // 推薦連結：記在這個分頁，結帳時帶上
  const p = await api(`/api/p/${encodeURIComponent(slug)}` + (q.code ? '?code=' + encodeURIComponent(q.code) : ''));
  const tab = q.tab || 'story';
  const T = (k, label) => link(`/p/${slug}?tab=${k}${q.code ? '&code=' + encodeURIComponent(q.code) : ''}`, label, 'tab' + (tab === k ? ' on' : ''));
  const followBtn = h('button', { class: 'btn ghost', on: { click: async () => { if (!state.me) return go('/login?next=/p/' + slug); const r = await act(() => api(`/api/p/${slug}/follow`, {}), ''); if (r) { followBtn.textContent = r.following ? '✓ 追蹤中' : '☆ 追蹤計畫'; toast(r.following ? '已追蹤' : '已取消追蹤'); } } } }, p.following ? '✓ 追蹤中' : '☆ 追蹤計畫');
  const share = h('button', { class: 'btn ghost', on: { click: async () => { try { await navigator.clipboard.writeText(location.origin + '/p/' + slug); toast('已複製網址'); } catch { toast('複製失敗', 'err'); } } } }, '分享');
  const contact = h('button', { class: 'btn ghost', on: { click: () => contactCreator(p, slug) } }, '聯繫提案人');
  const report = h('button', { class: 'linkbtn', on: { click: () => reportBox('project', p.id) } }, '檢舉計畫');
  let body;
  if (tab === 'updates') body = p.updates.length ? p.updates.map((u) => h('article', { class: 'card' }, h('div', { class: 'muted' }, `${u.category}｜${dt(u.at)}${u.private ? '｜贊助人限定' : ''}`), h('h3', {}, u.title), u.cover ? media({ url: u.cover }) : null, u.locked ? h('p', { class: 'lock' }, '🔒 這則更新只有特定回饋的贊助人看得到') : markup(u.content))) : h('p', { class: 'muted' }, '還沒有計畫更新');
  else if (tab === 'comments') body = comments(p, slug);
  else if (tab === 'faqs') body = p.faqs.length ? h('div', {}, p.faqs.map((f) => h('details', { class: 'faq' }, h('summary', {}, f.q), h('p', {}, f.a)))) : h('p', { class: 'muted' }, '還沒有常見問答');
  else if (tab === 'backers') body = table(['贊助人', '金額', '時間'], p.backerList.map((b) => [b.name, money(b.amount), ago(b.at)]), '還沒有贊助人');
  else body = h('div', {}, p.video ? videoEmbed(p.video) : null, markup(p.content), p.risk ? h('section', { class: 'info-box' }, h('h3', {}, '風險與挑戰'), h('p', { class: 'pre muted' }, p.risk)) : null, p.returns ? h('section', { class: 'info-box' }, h('h3', {}, '退換貨規則'), h('p', { class: 'pre muted' }, p.returns)) : null, p.contact ? h('section', { class: 'info-box' }, h('h3', {}, '客服聯絡方式'), h('p', { class: 'pre muted' }, p.contact)) : null, p.afteeNote ? h('section', { class: 'info-box' }, h('h3', {}, 'AFTEE 支付相關宣告'), h('p', { class: 'pre muted' }, p.afteeNote)) : null);
  const codeBox = p.hasHidden && !p.codeOk ? h('form', { class: 'card', on: { submit: (e) => { e.preventDefault(); go(`/p/${slug}?code=${encodeURIComponent(e.target.code.value.trim())}`); } } }, h('p', { class: 'muted' }, '有隱藏的回饋選項？輸入密碼看看'), h('input', { name: 'code', placeholder: '隱藏選項密碼' }), h('button', { class: 'btn ghost' }, '確定')) : null;
  const opts = p.options.map((o) => optionCard(p, o, slug, q.code));
  const sub = p.type === 'subscription';
  const backBtn = h('button', { class: 'btn big full', on: { click: () => { const el = document.querySelector('.p-right'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } } }, sub ? '訂閱支持' : '贊助專案');
  return h('div', { class: 'project' },
    p.preview ? h('div', { class: 'warn' }, '預覽模式：這個計畫還沒公開，只有團隊和平台人員看得到') : null,
    p.ageLimit === 18 ? h('div', { class: 'warn' }, '本計畫含限制級內容，未滿 18 歲請勿瀏覽與贊助') : null,
    h('header', { class: 'p-head' }, h('div', { class: 'pmeta' }, `${p.typeName}・${p.category}・提案人 `, link('/u/' + p.ownerSlug, p.owner)), h('h1', {}, p.title), h('p', {}, p.description)),
    h('div', { class: 'p-top' },
      h('div', { class: 'p-media' }, p.cover ? media({ url: p.cover }, 'cover') : h('div', { class: 'cover ph big' }, p.title.slice(0, 4))),
      h('div', { class: 'p-info' },
        sub ? [h('div', { class: 'big-num' }, money(p.monthly), h('small', {}, ' / 本月')), h('div', { class: 'p-goal' }, '每月定期護持')]
          : [h('div', { class: 'big-num' }, money(p.raised)), h('div', { class: 'p-goal' }, `目標 ${money(p.goal)}`), h('div', { class: 'progress' }, h('i', { style: { width: Math.min(100, p.percent) + '%' } }))],
        h('div', { class: 'p-stats' }, sub ? null : h('span', {}, '達成', h('b', {}, p.percent + '%')), h('span', {}, '贊助人數', h('b', {}, num(p.backers))), h('span', {}, sub ? '狀態' : '剩餘時間', h('b', {}, sub ? '長期訂閱' : p.status === 'live' ? p.left : p.statusName))),
        h('div', { class: 'p-period' }, sub ? `${dt(p.startAt, false)} 開始・長期訂閱` : `募資期間 ${dt(p.startAt)} – ${dt(p.endAt)}`),
        p.status === 'live' ? backBtn : null,
        h('div', { class: 'p-actions' }, followBtn, share, contact),
        p.canManage ? link(`/c/${p.id}`, '管理計畫後台', 'btn dark full') : null)),
    h('div', { class: 'tabs-bar' }, h('nav', { class: 'tabs' }, T('story', '專案內容'), T('updates', `計畫更新 ${p.updates.length}`), T('comments', `留言 ${p.comments.length}`), T('faqs', `常見問答 ${p.faqs.length}`), T('backers', `贊助人 ${num(p.backers)}`))),
    h('div', { class: 'p-main' },
      h('div', { class: 'p-left' }, body, h('div', { class: 'tr' }, report)),
      h('aside', { class: 'p-right' }, h('h3', {}, sub ? '選擇訂閱方案' : '選擇回饋方案'), codeBox, opts.length ? opts : h('p', { class: 'muted' }, '提案人還沒設定回饋'))));
});
function optionCard(p, o, slug, code) {
  const soldOut = o.left === 0, canBack = p.status === 'live' && !soldOut;
  const go2 = () => { if (!state.me) return go(`/login?next=${encodeURIComponent(`/p/${slug}/checkout?option=${o.id}${code ? '&code=' + code : ''}`)}`); go(`/p/${slug}/checkout?option=${o.id}${code ? '&code=' + encodeURIComponent(code) : ''}`); };
  return h('div', { class: 'ocard' + (canBack ? ' can' : ''), on: { click: () => { if (canBack) go2(); } } },
    o.media.length ? h('div', { class: 'omedia' }, o.media.map((m) => media(m))) : null,
    h('div', { class: 'oprice' }, money(o.price), o.retail > o.price ? h('s', { class: 'muted' }, money(o.retail)) : null, p.type === 'subscription' ? h('small', {}, ' / 每月') : null),
    h('h4', {}, o.name, o.hidden ? badge('隱藏選項', 'gold') : null),
    h('div', { class: 'ometa' }, h('span', {}, h('b', {}, num(o.taken)), ' 人已贊助'), o.left !== null ? h('span', {}, `剩 ${num(o.left)} 份`) : null, o.shipMonth ? h('span', {}, `預計 ${o.shipMonth.replace('-', ' 年 ')} 月寄出`) : null),
    markup(o.description),
    h('div', { class: 'small muted' }, [o.atm ? '可 ATM 轉帳' : '', o.installment ? `信用卡可分 ${o.installment} 期` : '', o.stores.length ? '可超商取貨' : ''].filter(Boolean).join('・')),
    soldOut ? badge('已額滿', 'gray') : p.status === 'live' ? h('button', { class: 'btn full' }, p.type === 'subscription' ? '訂閱這個方案' : '贊助這個回饋') : badge(p.statusName || '未開放', 'gray'));
}
function comments(p, slug) {
  const top = p.comments.filter((c) => !c.parentId), kids = (id) => p.comments.filter((c) => c.parentId === id);
  const one = (c) => h('div', { class: 'cmt' }, h('div', { class: 'cmt-h' }, h('b', {}, c.name), c.isCreator ? badge('提案人', 'gold') : null, c.backer ? badge('贊助人') : null, h('span', { class: 'muted' }, ' ' + ago(c.at))), h('p', { class: 'pre' }, c.body),
    h('div', { class: 'row small' }, state.me ? h('button', { class: 'linkbtn', on: { click: async () => { const t = await ask('回覆留言', '回覆內容', { multiline: true }); if (t && await act(() => api(`/api/p/${slug}/comments`, { body: t, parentId: c.id }), '已回覆')) go(`/p/${slug}?tab=comments`, true); } } }, '回覆') : null, state.me ? h('button', { class: 'linkbtn', on: { click: () => reportBox('comment', c.id) } }, '檢舉') : null),
    h('div', { class: 'cmt-kids' }, kids(c.id).map(one)));
  const box = area('', 3, { placeholder: state.me ? '留言給提案人和大家…' : '登入後才能留言', disabled: !state.me });
  return h('div', {}, state.me ? h('form', { class: 'card', on: { submit: async (e) => { e.preventDefault(); if (await act(() => api(`/api/p/${slug}/comments`, { body: box.value }), '已留言')) go(`/p/${slug}?tab=comments`, true); } } }, box, h('button', { class: 'btn' }, '送出留言')) : link('/login?next=/p/' + slug, '登入後留言', 'btn ghost'), top.length ? top.map(one) : h('p', { class: 'muted' }, '還沒有留言'));
}
function contactCreator(p, slug) {
  if (!state.me) return go('/login?next=/p/' + slug);
  const t = area('', 5); modal('聯繫提案人：' + p.owner, field('訊息內容', t), [{ text: '送出', fn: async () => !!(await act(() => api('/api/inbox', { slug, body: t.value }), '已送出，可以在站內訊息看回覆')) }]);
}
async function reportBox(kind, id) {
  if (!state.me) return go('/login');
  const r = await ask(kind === 'project' ? '檢舉計畫' : '檢舉留言', '原因（例如：詐騙、侵權、廣告、不雅內容）', { multiline: true });
  if (r) await act(() => api('/api/reports', { kind, targetId: id, reason: r }), '已送出檢舉，平台會盡快處理');
}

// ---------- 結帳 ----------
route('/p/:slug/checkout', async ({ slug }, q) => {
  if (!state.me) return go('/login?next=' + encodeURIComponent(location.pathname + location.search), true) || h('div');
  const p = await api(`/api/p/${encodeURIComponent(slug)}` + (q.code ? '?code=' + encodeURIComponent(q.code) : ''));
  if (p.status !== 'live') return h('div', { class: 'card center' }, h('h2', {}, '這個計畫現在不能贊助'), link('/p/' + slug, '回計畫頁', 'btn'));
  const main = p.options.find((o) => o.id === Number(q.option)) || p.options[0];
  if (!main) return h('p', {}, '沒有回饋可以選');
  api('/api/checkout/start', { slug }).catch(() => {});   // 記一筆「開始結帳」（EDM 再行銷用）
  const all = [main, ...p.addons];
  const qty = {}; qty[main.id] = 1; for (const a of p.addons) qty[a.id] = 0;
  const S = { bonus: 0, coupon: '', region: 'TW', delivery: 'home', pay: '', inst: 0 };
  const sumBox = h('div', { class: 'sum' }), err = h('p', { class: 'err' });
  const items = () => all.filter((o) => qty[o.id] > 0).map((o) => ({ optionId: o.id, qty: qty[o.id] }));
  const payload = () => ({ slug, code: q.code || '', items: items(), bonus: S.bonus, coupon: S.coupon, region: S.region, delivery: S.delivery });
  async function quote() { try { const a = await api('/api/checkout/quote', payload()); err.textContent = ''; sumBox.replaceChildren(h('div', {}, h('span', {}, '回饋小計'), h('b', {}, money(a.subtotal))), a.discount ? h('div', {}, h('span', {}, '折扣碼'), h('b', {}, '− ' + money(a.discount))) : null, h('div', {}, h('span', {}, '運費'), h('b', {}, money(a.shipping))), a.bonus ? h('div', {}, h('span', {}, '加碼'), h('b', {}, money(a.bonus))) : null, h('div', { class: 'total' }, h('span', {}, '總金額'), h('b', {}, money(a.total)))); return a; } catch (e) { err.textContent = e.message; sumBox.replaceChildren(); return null; } }
  // 1. 回饋與數量
  const qtyIn = (o) => { const e = h('input', { type: 'number', min: o.addonOnly ? 0 : 1, max: o.left ?? 99, value: qty[o.id], class: 'qty', on: { change: () => { qty[o.id] = Math.max(o.addonOnly ? 0 : 1, Math.min(99, Number(e.value) || 0)); e.value = qty[o.id]; quote(); } } }); if (p.type === 'subscription') e.disabled = true; return e; };
  const bonusIn = inp('0', { type: 'number', min: 0, on: { change: () => { S.bonus = Math.max(0, Math.floor(Number(bonusIn.value) || 0)); quote(); } } });
  const couponIn = inp('', { placeholder: '折扣碼' });
  // 2. 寄送
  const region = sel(state.meta.countries, 'TW', { on: { change: () => { S.region = region.value; quote(); renderDelivery(); } } });
  const deliveryBox = h('div');
  const R = { name: inp(state.me.name), phone: inp('', { inputmode: 'tel' }), email: inp(state.me.email, { type: 'email' }), zip: inp(''), city: inp(''), district: inp(''), address: inp('') };
  const store = { brand: sel(Object.fromEntries(Object.entries(state.meta.stores).filter(([k]) => main.stores.includes(k)))), id: inp('', { placeholder: '門市代號' }), name: inp('', { placeholder: '門市名稱' }) };
  function renderDelivery() {
    const canStore = main.stores.length && (S.region === 'TW' || S.region === 'TWI');
    if (!canStore) S.delivery = 'home';
    const radio = (v, label) => h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'dlv', checked: S.delivery === v, on: { change: () => { S.delivery = v; renderDelivery(); quote(); } } }), label);
    deliveryBox.replaceChildren(canStore ? h('div', { class: 'row' }, radio('home', '宅配'), radio('store', '超商取貨')) : null,
      S.delivery === 'store' ? h('div', { class: 'grid3' }, field('超商', store.brand), field('門市代號', store.id), field('門市名稱', store.name)) : h('div', { class: 'grid3' }, field('郵遞區號', R.zip), field('縣市', R.city), field('鄉鎮市區', R.district)), S.delivery === 'store' ? null : field('街道與門牌', R.address));
  }
  renderDelivery();
  // 3. 回饋調查、備註
  const surveyIn = {};
  const surveyBox = h('div', {}, all.map((o) => (o.survey || []).map((s, i) => { const k = `${o.id}_${i}`; surveyIn[k] = s.type === 'choice' ? sel({ '': '請選擇', ...Object.fromEntries(s.choices.map((c) => [c, c])) }, '') : inp(''); return field(`${o.name}｜${s.q}${s.required ? '（必填）' : ''}`, surveyIn[k]); })));
  const note = area('', 3, { placeholder: main.noteRequired ? '必填' : '選填' });
  // 4. 付款
  const payBox = h('div', { class: 'row wrap' });
  for (const [k, v] of Object.entries(state.meta.payMethods)) { if (!p.paymentMethods[k]) continue; if (k === 'atm' && (!main.atm || p.type === 'subscription')) continue; payBox.append(h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'pay', on: { change: () => { S.pay = k; instBox.classList.toggle('hidden', k !== 'credit' || !main.installment); } } }), v)); }
  const inst = sel({ 0: '一次付清', ...(main.installment >= 3 ? { 3: '分 3 期' } : {}), ...(main.installment >= 6 ? { 6: '分 6 期' } : {}) }, '0');
  const instBox = h('div', { class: 'hidden' }, field('信用卡分期', inst));
  // 5. 發票
  const inv = { type: sel({ member: '會員載具', mobile: '手機條碼', donate: '捐贈發票', company: '公司統編' }, 'member'), carrier: inp('', { placeholder: '/ABC1234' }), ubn: inp('', { placeholder: '統一編號 8 碼' }), title: inp('', { placeholder: '公司抬頭' }), donate: inp('', { placeholder: '捐贈碼' }) };
  const invBox = p.invoiceFormat === 'cloud' ? h('section', { class: 'card' }, h('h3', {}, '5. 發票'), field('發票類型', inv.type), field('手機條碼（選手機條碼時填）', inv.carrier), field('統一編號（選公司統編時填）', inv.ubn), field('公司抬頭', inv.title), field('捐贈碼（選捐贈時填）', inv.donate))
    : p.invoiceFormat === 'paper' ? h('section', { class: 'card' }, h('h3', {}, '5. 發票（傳統發票，隨貨寄出）'), field('抬頭（選填）', inv.title), field('統一編號（選填）', inv.ubn)) : null;
  const age = chk(false);
  const submit = h('button', { class: 'btn big full', on: { click: async () => {
    if (!S.pay) return toast('請選擇付款方式', 'err');
    const survey = Object.fromEntries(Object.entries(surveyIn).map(([k, e]) => [k, e.value]));
    const body = { ...payload(), payMethod: S.pay, installments: S.pay === 'credit' ? Number(inst.value) : 0, recipient: Object.fromEntries(Object.entries(R).map(([k, e]) => [k, e.value])), store: { brand: store.brand.value, id: store.id.value, name: store.name.value }, survey, note: note.value,
      invoice: { type: inv.type.value, carrier: inv.carrier.value, ubn: inv.ubn.value, title: inv.title.value, donate: inv.donate.value }, referrer: sessionStorage.getItem('ref:' + slug) || '', age18: age.checked };
    submit.disabled = true; const r = await act(() => api('/api/orders', body), ''); submit.disabled = false;
    if (r) go(`/orders/${r.token}/pay`);
  } } }, state.demo ? '確認並前往付款' : '確認並保留訂單');
  quote();
  return h('div', { class: 'checkout' }, h('h1', {}, '贊助：' + p.title),
    h('div', { class: 'co-grid' },
      h('div', {},
        h('section', { class: 'card' }, h('h3', {}, '1. 回饋與數量'), h('div', { class: 'co-item' }, h('b', {}, main.name), ' ', money(main.price), ' × ', qtyIn(main)),
          p.addons.length ? h('div', {}, h('h4', {}, '加購'), p.addons.map((a) => h('div', { class: 'co-item' }, a.name, ' ', money(a.price), ' × ', qtyIn(a)))) : null,
          p.type === 'subscription' ? null : field('加碼贊助（選填，不另外寄回饋）', bonusIn),
          main.coupon ? h('div', { class: 'row' }, couponIn, h('button', { class: 'btn ghost', on: { click: async () => { S.coupon = couponIn.value.trim(); const a = await quote(); if (a && a.discount) toast('折扣碼可以用'); } } }, '套用')) : null),
        h('section', { class: 'card' }, h('h3', {}, '2. 收件資料'), field('寄送地區', region), deliveryBox, h('div', { class: 'grid3' }, field('收件人姓名', R.name), field('電話', R.phone), field('Email', R.email))),
        h('section', { class: 'card' }, h('h3', {}, '3. 回饋調查與備註'), surveyBox, main.hasNote ? field('備註' + (main.noteRequired ? '（必填）' : ''), note) : null),
        h('section', { class: 'card' }, h('h3', {}, '4. 付款方式'), payBox, instBox, h('p', { class: 'small muted' }, state.demo ? 'ATM 轉帳：訂單成立隔天 23:59:59 前付款。' : '線上付款尚未開放：送出後訂單會先保留，不會扣款；開放後會通知你。')),
        invBox,
        p.ageLimit === 18 ? field('我已年滿 18 歲', age) : null),
      h('aside', { class: 'card sticky' }, h('h3', {}, '金額'), sumBox, err, submit, h('p', { class: 'small muted' }, '按下確認代表你同意本計畫的退換貨規則與平台使用條款。'))));
});

// ---------- 付款 ----------
// 正式模式還沒串真的金流：只顯示「尚未開放」，不讓人以為付成功（KIRK 選的做法）；測試模式（DEMO=1）才有測試用的付款按鈕
route('/orders/:token/pay', async ({ token }) => {
  const list = await api('/api/my/orders'); const o = list.find((x) => x.token === token); if (!o) throw new Error('找不到這張訂單');
  if (o.status !== 'pending') return orderDone(o);
  if (!state.demo) return h('div', { class: 'card closed narrow' }, h('h2', {}, '線上付款尚未開放'), h('p', { class: 'muted' }, `訂單 ${o.token} 已保留`), h('div', { class: 'big-num' }, money(o.total)),
    h('p', {}, '目前還不會扣款。線上付款開放後，我們會通知你回來完成付款。'), h('div', { class: 'row', style: { justifyContent: 'center' } }, o.project ? link('/p/' + o.project.slug, '回計畫頁', 'btn ghost') : null, link('/me/orders', '查看贊助紀錄', 'btn')));
  if (o.payMethod === 'atm') return h('div', { class: 'card center' }, h('h2', {}, 'ATM 虛擬帳號（測試）'), h('p', {}, '請在期限內轉帳：'), h('div', { class: 'big-num' }, money(o.total)), h('p', {}, '銀行代碼 999'), h('p', { class: 'mono big' }, o.atmAccount), h('p', {}, '繳費期限：' + dt(o.atmDeadline)),
    h('button', { class: 'btn', on: { click: async () => { if (await act(() => api(`/api/orders/${token}/atm-paid`, {}), '已收到轉帳')) go(`/orders/${token}/pay`, true); } } }, '我已轉帳（測試）'), ' ', link('/me/orders', '稍後再付', 'btn ghost'));
  const last4 = inp('', { maxlength: 4, inputmode: 'numeric', placeholder: '例如 4242' });
  return h('div', { class: 'card center narrow' }, h('h2', {}, o.payMethod === 'aftee' ? 'AFTEE 先享後付（測試）' : '信用卡付款（測試）'), h('div', { class: 'big-num' }, money(o.total)), o.installments ? h('p', {}, `分 ${o.installments} 期，每期約 ${money(Math.ceil(o.total / o.installments))}`) : null,
    o.payMethod === 'credit' ? field('卡號末四碼（測試：0002 會被拒絕）', last4) : h('p', {}, '按下付款就算成功（測試）'),
    h('button', { class: 'btn big', on: { click: async () => { if (await act(() => api(`/api/orders/${token}/pay`, { last4: last4.value }), '付款成功')) go(`/orders/${token}/pay`, true); } } }, '付款'));
});
function orderDone(o) {
  return h('div', { class: 'card center' }, h('h2', {}, o.status === 'paid' ? '🎉 贊助成功' : o.statusName), h('p', {}, `訂單編號 ${o.token}`), h('div', { class: 'big-num' }, money(o.total)), o.project ? link('/p/' + o.project.slug, '回計畫頁', 'btn ghost') : null, ' ', link('/me/orders', '查看贊助紀錄', 'btn'));
}

// ---------- 我的贊助紀錄 ----------
route('/me/orders', async () => {
  const list = await api('/api/my/orders');
  return h('div', {}, h('h1', {}, '贊助紀錄'), list.length ? list.map((o) => h('article', { class: 'card order' },
    h('div', { class: 'row between' }, h('div', {}, o.project ? link('/p/' + o.project.slug, o.project.title, 'b') : '（計畫已刪除）', h('div', { class: 'muted small' }, `訂單 ${o.token}・${dt(o.createdAt)}${o.period ? `・第 ${o.period} 期` : ''}`)), badge(o.statusName, o.status)),
    h('ul', { class: 'small' }, o.items.map((it) => h('li', {}, `${it.name} × ${it.qty}　${money(it.price * it.qty)}`)), o.bonus ? h('li', {}, '加碼 ' + money(o.bonus)) : null, o.discount ? h('li', {}, `折扣碼 ${o.coupon} −${money(o.discount)}`) : null, h('li', {}, '運費 ' + money(o.shippingFee))),
    h('div', { class: 'row between' }, h('b', {}, '總金額 ' + money(o.total)), h('span', { class: 'muted small' }, state.meta.payMethods[o.payMethod] + (o.installments ? ` 分 ${o.installments} 期` : ''))),
    o.status === 'pending' && o.payMethod === 'atm' ? h('p', { class: 'warn' }, `請在 ${dt(o.atmDeadline)} 前轉帳到 ${o.atmAccount}`) : null,
    o.status === 'pending' ? (state.demo ? link(`/orders/${o.token}/pay`, '前往付款', 'btn') : h('p', { class: 'warn' }, '線上付款尚未開放，訂單已保留，開放後會通知你。')) : null,
    o.shipped ? h('p', { class: 'ok' }, `已出貨：${o.shipped.carrier} ${o.shipped.trackNo}（${dt(o.shipped.at)}）`) : null,
    o.status === 'refunded' && o.refundFee ? h('p', { class: 'small muted' }, `退款已扣轉帳手續費 ${money(o.refundFee)}`) : null,
    o.refund ? h('p', { class: 'small' }, `退款申請：${o.refund.statusName}${o.refund.note ? '（' + o.refund.note + '）' : ''}`) : null,
    o.sub ? h('p', { class: 'small' }, o.sub.active ? `訂閱中・下次扣款 ${dt(o.sub.nextAt, false)}` : '訂閱已取消') : null,
    h('div', { class: 'row' },
      o.canEdit ? h('button', { class: 'btn ghost', on: { click: () => editOrder(o) } }, '修改收件資料／回饋調查') : null,
      o.canCancel ? h('button', { class: 'btn ghost', on: { click: async () => { if (await act(() => api(`/api/my/orders/${o.token}/cancel`, {}), '已取消')) go('/me/orders', true); } } }, o.status === 'paid' ? '取消並退款' : '取消訂單') : null,
      o.canRefund ? h('button', { class: 'btn ghost', on: { click: async () => { const r = await ask('申請退款', '退款原因', { multiline: true }); if (r && await act(() => api(`/api/my/orders/${o.token}/refund`, { reason: r }), '已送出退款申請')) go('/me/orders', true); } } }, '申請退款') : null,
      o.sub && o.sub.active ? h('button', { class: 'btn ghost', on: { click: async () => { if (await act(() => api(`/api/my/orders/${o.token}/unsubscribe`, {}), '已取消訂閱')) go('/me/orders', true); } } }, '取消訂閱') : null))) : h('p', { class: 'muted' }, '還沒有贊助紀錄'));
});
function editOrder(o) {
  const r = o.recipient, F = { name: inp(r.name), phone: inp(r.phone), zip: inp(r.zip), city: inp(r.city), district: inp(r.district), address: inp(r.address) };
  const sv = o.survey.map((s) => inp(s.a));
  const note = area(o.note, 3);
  modal('修改訂單 ' + o.token, h('div', {}, h('div', { class: 'grid3' }, field('收件人', F.name), field('電話', F.phone), field('郵遞區號', F.zip), field('縣市', F.city), field('鄉鎮市區', F.district)), field('地址', F.address), o.survey.map((s, i) => field(s.q, sv[i])), field('備註', note)),
    [{ text: '儲存', fn: async () => { const ok = await act(() => api(`/api/my/orders/${o.token}/edit`, { recipient: Object.fromEntries(Object.entries(F).map(([k, e]) => [k, e.value])), survey: sv.map((e) => e.value), note: note.value })); if (ok) go('/me/orders', true); return !!ok; } }]);
}
route('/me/following', async () => h('div', {}, h('h1', {}, '追蹤計畫'), grid(await api('/api/my/following'), '還沒有追蹤的計畫')));
route('/me/projects', async () => {
  const list = await api('/api/my/projects');
  return h('div', {}, h('div', { class: 'row between' }, h('h1', {}, '提案紀錄'), link('/start', '＋ 發起計畫', 'btn')),
    table(['計畫', '類型', '狀態', '目前階段', '你的角色', ''], list.map((p) => [link('/p/' + p.slug, p.title), p.typeName, badge(p.statusName, p.status), p.step ? state.meta.steps.find((s) => s.key === p.step).name : '已全部通過', p.role === 'owner' ? '提案人' : state.meta.teamRoles[p.role] || p.role, link(`/c/${p.id}`, '管理計畫後台', 'btn sm')]), '還沒有提案'));
});
route('/me/mail', async () => {
  const list = await api('/api/my/emails');
  return h('div', {}, h('h1', {}, '通知信箱'), h('p', { class: 'muted' }, '平台寄給你的通知（訂單、計畫更新、訊息）都在這裡。'), list.length ? list.map((m) => h('details', { class: 'card' }, h('summary', {}, h('b', {}, m.subject), h('span', { class: 'muted small' }, '　' + dt(m.at))), h('p', { class: 'pre' }, m.body))) : h('p', { class: 'muted' }, '沒有信'));
});

// ---------- 個人頁 ----------
route('/u/:slug', async ({ slug }) => {
  const u = await api('/api/users/' + encodeURIComponent(slug));
  return h('div', {}, h('div', { class: 'profile' }, u.avatar ? h('img', { src: u.avatar, class: 'avatar big', alt: '' }) : h('div', { class: 'avatar big ph' }, u.name.slice(0, 1)), h('div', {}, h('h1', {}, u.name), h('p', { class: 'muted' }, `${u.from || ''}・${dt(u.since, false)} 加入`), h('p', { class: 'pre' }, u.bio), h('div', { class: 'row' }, ...[['Facebook', u.fb], ['Instagram', u.ig], ['YouTube', u.yt], ['網站', u.web]].filter((x) => x[1]).map(([n, l]) => h('a', { href: l, target: '_blank', rel: 'noopener noreferrer nofollow' }, n))))),
    state.me && state.me.slug !== slug ? h('button', { class: 'btn ghost', on: { click: async () => { const t = await ask('傳訊息給 ' + u.name, '內容', { multiline: true }); if (t) await act(() => api('/api/inbox', { toSlug: slug, body: t }), '已送出'); } } }, '傳訊息') : null,
    h('h2', {}, '發起的計畫'), grid(u.created, '還沒有發起計畫'), h('h2', {}, '贊助過的計畫'), grid(u.backed, '還沒有贊助'));
});

// ---------- 帳號設定 ----------
route('/me/settings', async () => {
  const s = await api('/api/settings');
  const F = { name: inp(s.name), realName: inp(s.realName), avatar: mediaInput(s.avatar), gender: sel({ '': '不公開', male: '男', female: '女', other: '其他' }, s.gender), birthday: inp(s.birthday, { type: 'date' }), from: inp(s.from), slug: inp(s.slug), fb: inp(s.fb), ig: inp(s.ig), yt: inp(s.yt), web: inp(s.web), bio: area(s.bio, 4), notify: chk(s.notify), newsletter: chk(s.newsletter) };
  const pwOld = inp('', { type: 'password', autocomplete: 'current-password' }), pwNew = inp('', { type: 'password', autocomplete: 'new-password' });
  return h('div', { class: 'narrow' }, h('h1', {}, '帳號設定'),
    h('section', { class: 'card' }, field('顯示圖片', F.avatar), field('名稱', F.name), field('真實身分／名稱', F.realName), field('電子信箱', inp(s.email, { disabled: true })), field('允許訊息通知 - 如：計畫更新、站內訊息', F.notify), field('訂閱電子報', F.newsletter),
      field('性別', F.gender), field('生日', F.birthday), field('來自', F.from), field('網址名稱', F.slug, '個人頁網址 /u/這個名字'), field('Facebook 網址', F.fb), field('Instagram 網址', F.ig), field('YouTube 網址', F.yt), field('網站網址', F.web), field('個人介紹', F.bio),
      h('button', { class: 'btn', on: { click: async () => { const b = Object.fromEntries(Object.entries(F).map(([k, e]) => [k, e.getValue ? e.getValue() : e.type === 'checkbox' ? e.checked : e.value])); if (await act(() => api('/api/settings', b))) loadMe(); } } }, '儲存')),
    h('section', { class: 'card' }, h('h3', {}, '修改密碼'), field('舊密碼', pwOld), field('新密碼（8～64 字，要有英文和數字）', pwNew), h('button', { class: 'btn ghost', on: { click: () => act(() => api('/api/settings/password', { old: pwOld.value, password: pwNew.value }), '密碼已更新，其他裝置已登出') } }, '更新密碼')));
});

// ---------- 團隊設定 ----------
route('/me/team', async () => {
  const d = await api('/api/memberships');
  const em = inp('', { type: 'email' }), title = inp(''), pub = chk(true), role = sel(state.meta.teamRoles, 'editor');
  const refresh = () => go('/me/team', true);
  return h('div', {}, h('h1', {}, '團隊設定'), h('p', { class: 'muted' }, '邀請同事一起管理你發起的所有計畫；角色決定他能做什麼。'),
    h('section', { class: 'card' }, h('h3', {}, '邀請成員'), h('div', { class: 'grid3' }, field('邀請成員 Email', em), field('稱謂', title), field('角色', role)), field('公開（顯示在計畫頁團隊成員）', pub), h('button', { class: 'btn', on: { click: async () => { if (await act(() => api('/api/memberships', { action: 'invite', email: em.value, title: title.value, public: pub.checked, role: role.value }), '已邀請')) refresh(); } } }, '邀請')),
    h('h2', {}, '團隊成員'), table(['Email', '名稱', '稱謂', '角色', '狀態', ''], d.members.map((m) => [m.email, m.name, m.title, state.meta.teamRoles[m.role], m.status === 'active' ? '已加入' : '邀請中', h('button', { class: 'btn sm ghost', on: { click: async () => { if (await act(() => api('/api/memberships', { action: 'remove', id: m.id }), '已移除')) refresh(); } } }, '移除')])),
    h('h2', {}, '所屬團隊'), table(['團隊', '角色', '狀態', ''], d.teams.map((m) => [m.owner, state.meta.teamRoles[m.role], m.status === 'active' ? '已加入' : '邀請中', m.status === 'invited' ? h('button', { class: 'btn sm', on: { click: async () => { if (await act(() => api('/api/memberships', { action: 'accept', id: m.id }), '已加入')) refresh(); } } }, '接受邀請') : h('button', { class: 'btn sm ghost', on: { click: async () => { if (await act(() => api('/api/memberships', { action: 'leave', id: m.id }), '已離開')) refresh(); } } }, '離開')])));
});

// ---------- 站內訊息 ----------
route('/me/inbox', async () => {
  const list = await api('/api/inbox');
  return h('div', {}, h('h1', {}, '站內訊息'), list.length ? h('ul', { class: 'list' }, list.map((t) => h('li', {}, link('/me/inbox/' + t.userId, t.name, 'b'), t.unread ? badge(`${t.unread} 則未讀`, 'red') : null, h('div', { class: 'muted small' }, `${t.last}・${ago(t.at)}`)))) : h('p', { class: 'muted' }, '沒有訊息'));
});
route('/me/inbox/:uid', async ({ uid }) => {
  const d = await api('/api/inbox/' + Number(uid)); loadMe();
  const t = area('', 3);
  return h('div', { class: 'narrow' }, link('/me/inbox', '← 全部訊息'), h('h1', {}, d.name), h('div', { class: 'chat' }, d.list.map((m) => h('div', { class: 'msg ' + (m.mine ? 'mine' : '') }, m.project ? h('div', { class: 'small muted' }, '關於：' + m.project) : null, h('p', { class: 'pre' }, m.body), h('div', { class: 'small muted' }, dt(m.at))))),
    h('div', { class: 'card' }, t, h('button', { class: 'btn', on: { click: async () => { if (await act(() => api('/api/inbox', { toId: Number(uid), body: t.value }), '已送出')) go('/me/inbox/' + uid, true); } } }, '送出')));
});

// ---------- 發起計畫 ----------
route('/start', async () => {
  const pick = async (type) => { if (!state.me) return go('/login?next=/start'); const title = await ask('發起計畫', '計畫名稱（之後可以改）'); if (title === undefined) return; const r = await act(() => api('/api/start', { type, title }), '已建立草稿'); if (r) go(`/c/${r.id}`); };
  const card3 = (type, name, sub, points) => h('div', { class: 'card start-card' }, h('h3', {}, name), h('p', {}, sub), h('ul', {}, points.map((x) => h('li', {}, '✓ ' + x))), h('button', { class: 'btn full', on: { click: () => pick(type) } }, '開始提案'));
  return h('div', {}, h('section', { class: 'hero plain' }, h('h1', {}, '替你熟悉的廟宇發起計畫'), h('p', {}, '選一種計畫類型開始。建立草稿不用錢，我們的專案人員會陪你把內容、回饋、審核一步步完成。')),
    h('div', { class: 'grid3' }, card3('crowd', '群眾集資', '在一定期限內，募集完成計畫所需的資金', ['一次型專案', '建議集資 35～45 天', '專案達成後，一次性回饋贊助者']), card3('preorder', '預購專案', '讓新產品在上市前進行集客預購', ['一次型專案', '平均集資 45～60 天', '專案達成後，一次性回饋贊助者']), card3('subscription', '訂閱專案', '用持續性的計畫，累積每月的贊助', ['長期型專案', '可持續集資到專案結束', '專案進行期間，持續回饋贊助者'])),
    h('section', { class: 'card' }, h('h2', {}, '常見問答'), [
      ['發起募資有什麼身分限制？', '提案人須為本國自然人，或在臺灣註冊的法人、機關團體。'],
      ['集資目標有限制嗎？', '自然人：任意連續 30 天內上限 100 萬；法人：第一階段上限 1,500 萬。'],
      ['集資時間有限制嗎？', '一次性計畫最短 1 天、最長 5 個月，建議 35～45 天；訂閱專案沒有天期限制。'],
      ['為什麼要經過審核？', '提案後依序經過：商業檔案與金流帳號初審 → 方案與回饋 → 合約簽署與上傳 → 第三方金流單位審核 → 準備上線。審核通過不代表背書，提案人仍須負擔專案責任。'],
      ['發起計畫要付錢嗎？', '不用。集資成功才收：平台手續費 5.5%＋金流基本服務費 2.5%（依付款方式可能不同）。'],
      ['什麼時候拿到款項？', '群眾集資、預購式：專案完結後 28 個工作日內撥款；訂閱專案：次月 15 日撥款。'],
    ].map(([q, a]) => h('details', { class: 'faq' }, h('summary', {}, q), h('p', {}, a)))));
});

// ---------- 登入、註冊 ----------
route('/login', async (_, q) => {
  const em = inp('', { type: 'email', autocomplete: 'username' }), pw = inp('', { type: 'password', autocomplete: 'current-password' });
  const next = q.next && q.next.startsWith('/') && !q.next.startsWith('//') ? q.next : '/';
  const submit = async (e) => { e.preventDefault(); if (await act(() => api('/api/login', { email: em.value, password: pw.value }), '登入成功')) { await loadMe(); go(next); } };
  return h('form', { class: 'card auth', on: { submit } }, h('h1', {}, '登入'), field('Email', em), field('密碼', pw), h('button', { class: 'btn full' }, '登入'), h('p', {}, '還沒有帳號？', link('/register?next=' + encodeURIComponent(next), '註冊')),
    state.demo ? h('div', { class: 'demo' }, h('b', {}, '測試帳號（密碼都是 Demo1234）'), h('ul', {}, [['admin@demo.local', '平台管理員'], ['pm@demo.local', '專案經理'], ['creator@demo.local', '提案人'], ['backer1@demo.local', '贊助人']].map(([e, n]) => h('li', {}, h('button', { type: 'button', class: 'linkbtn', on: { click: () => { em.value = e; pw.value = 'Demo1234'; } } }, e), '　' + n)))) : null);
});
route('/register', async (_, q) => {
  const em = inp('', { type: 'email', autocomplete: 'username' }), name = inp(''), pw = inp('', { type: 'password', autocomplete: 'new-password' }), nl = chk(false);
  const next = q.next && q.next.startsWith('/') && !q.next.startsWith('//') ? q.next : '/';
  const submit = async (e) => { e.preventDefault(); if (await act(() => api('/api/register', { email: em.value, name: name.value, password: pw.value, newsletter: nl.checked }), '註冊成功')) { await loadMe(); go(next); } };
  return h('form', { class: 'card auth', on: { submit } }, h('h1', {}, '註冊'), field('Email', em), field('名稱', name), field('密碼（8～64 字，要有英文和數字）', pw), field('訂閱電子報', nl), h('button', { class: 'btn full' }, '註冊'), h('p', {}, '已經有帳號？', link('/login?next=' + encodeURIComponent(next), '登入')));
});
