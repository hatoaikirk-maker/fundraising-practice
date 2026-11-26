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
      h('div', { class: 'pmeta' }, `${p.typeName}・${p.executor || p.owner}`),
      link('/p/' + p.slug, p.title, 'ptitle'), h('p', { class: 'pdesc' }, p.description),
      p.type === 'subscription' ? h('div', { class: 'pnum' }, h('b', {}, money(p.monthly) + ' / 每月'), h('span', {}, '長期訂閱')) : [p.stage && p.stage.total > 1 ? h('div', { class: 'small muted' }, `第${p.stage.n}階段：${p.stage.name}`) : null, bar, h('div', { class: 'pnum' }, h('b', {}, money(p.raised)), h('span', {}, p.status === 'live' ? p.left : p.statusName), h('span', { class: 'pct' }, (p.stage ? p.stage.percent : p.percent) + '%'))]));
}
const grid = (list, empty = '目前沒有計畫') => (list.length ? h('div', { class: 'grid' }, list.map(projectCard)) : h('p', { class: 'muted' }, empty));

// ---------- 首頁 ----------
route('/', async () => {
  const d = await api('/api/home');
  // 公司自己經營的護持平台（KIRK：「像是手手公益那種形式」）：品牌主視覺 → 焦點專案 → 護持進行中（一列一個，大圖＋說明＋階段）→ 歷年專案 → 回饋牆 → 初心
  const focus = d.featured.length ? d.featured : d.live.slice(0, 3);
  return h('div', { class: 'home' },
    h('section', { class: 'banner' }, h('div', { class: 'banner-in' }, h('p', { class: 'banner-kicker' }, '人生地圖募資'), h('h1', {}, '陪在地廟宇，', h('br'), '把香火與文化傳下去'), h('p', {}, '每一份護持，都會回到廟裡。我們和廟方一起規劃、一起執行，進度與款項用途全部公開。'),
      h('div', { class: 'row' }, link('/explore', '看所有護持專案', 'btn big'), link('/#story', '人生地圖初心', 'btn big ghost-w')))),
    focus.length ? h('section', { class: 'sec' }, h('div', { class: 'sec-h' }, h('h2', {}, '焦點專案')), h('div', { class: 'focus' }, focus.map((p) => link('/p/' + p.slug, [p.cover ? media({ url: p.cover }, 'cover') : h('div', { class: 'cover ph' }, p.title.slice(0, 2)), h('div', { class: 'focus-t' }, h('b', {}, p.title), h('span', {}, '瞭解更多 ›'))], 'focus-card')))) : null,
    h('section', { class: 'sec' }, h('div', { class: 'sec-h' }, h('h2', {}, '護持進行中'), link('/explore', '觀看所有專案 ›')), d.live.length ? h('div', { class: 'rows' }, d.live.map(projectRow)) : h('p', { class: 'muted' }, '目前沒有進行中的專案')),
    d.updates.length ? h('section', { class: 'sec' }, h('div', { class: 'sec-h' }, h('h2', {}, '最新進度')), h('ul', { class: 'updates-list' }, d.updates.map((u) => h('li', {}, link('/p/' + u.slug + '?tab=updates', `${u.project}｜${u.title}`), h('span', { class: 'muted small' }, ago(u.at)))))) : null,
    d.archive.length ? h('section', { class: 'sec', id: 'archive' }, h('div', { class: 'sec-h' }, h('h2', {}, '歷年專案'), link('/explore?status=success', '觀看所有歷年專案 ›')), grid(d.archive)) : null,
    d.wall.length ? h('section', { class: 'sec', id: 'wall' }, h('div', { class: 'sec-h' }, h('h2', {}, '愛心回饋牆')), h('div', { class: 'wall' }, d.wall.map((w) => h('figure', { class: 'wall-card' }, w.tag ? h('span', { class: 'pill' }, w.tag) : null, h('blockquote', {}, w.text), h('figcaption', {}, '— ' + w.who))))) : null,
    h('section', { class: 'sec story', id: 'story' }, h('div', { class: 'sec-h' }, h('h2', {}, '人生地圖初心')), h('div', { class: 'story-in' }, markup(d.about || '人生地圖由麥睿資訊經營，陪著台灣各地的廟宇，把香火、信仰與在地文化，帶到更多人面前。\n\n我們相信，**每一份護持都應該被看見**：款項用在哪裡、工程做到哪裡、回饋何時寄出，都會在專案頁持續更新。\n\n想替你熟悉的廟宇發起專案？歡迎填寫[宮廟合作申請](/inquiry)，我們會主動與你聯繫。'))));
});
/** 「護持進行中」的一列：大圖、標題、說明、階段目標、倒數、馬上護持（手手公益的排法） */
function projectRow(p) {
  const st = p.stage, sub = p.type === 'subscription';
  return h('article', { class: 'prow' },
    link('/p/' + p.slug, p.cover ? media({ url: p.cover }, 'cover') : h('div', { class: 'cover ph' }, p.title.slice(0, 2)), 'prow-img'),
    h('div', { class: 'prow-txt' }, h('div', { class: 'pmeta' }, `${p.typeName}・執行：${p.executor || p.owner}`), link('/p/' + p.slug, p.title, 'prow-title'), h('p', { class: 'pdesc' }, p.description),
      sub ? h('div', { class: 'stage' }, h('b', {}, money(p.monthly)), h('span', {}, '本月護持・長期訂閱'))
        : st ? [h('div', { class: 'stage' }, h('span', { class: 'stage-pct' }, st.percent + '%'), h('span', {}, st.total > 1 ? `第${st.n}階段：${st.name}` : '達成率'), h('span', { class: 'muted' }, p.left)), h('div', { class: 'progress' }, h('i', { style: { width: Math.min(100, st.percent) + '%' } }))] : null,
      link('/p/' + p.slug, '馬上護持 ›', 'btn')));
}

// ---------- 探索 ----------
route('/explore', async (_, q) => {
  const qs = new URLSearchParams(q); const d = await api('/api/projects?' + qs.toString());
  const kw = inp(q.q || '', { placeholder: '搜尋計畫', type: 'search' });
  const type = sel({ '': '全部類型', ...state.meta.types }, q.type || ''), cat = sel({ '': '全部分類', ...Object.fromEntries(state.meta.categories.map((c) => [c, c])) }, q.category || '');
  const status = sel({ '': '全部狀態', live: '募資中', success: '已成功', failed: '未達標' }, q.status || ''), sort = sel({ '': '最新上線', raised: '集資金額', percent: '達成率', ending: '即將結束' }, q.sort || '');
  const apply = (page = 1) => { const n = new URLSearchParams(); if (kw.value) n.set('q', kw.value); if (type.value) n.set('type', type.value); if (cat.value) n.set('category', cat.value); if (status.value) n.set('status', status.value); if (sort.value) n.set('sort', sort.value); if (page > 1) n.set('page', page); go('/explore?' + n.toString()); };
  for (const e of [type, cat, status, sort]) e.addEventListener('change', () => apply());
  const pages = Math.ceil(d.total / d.per);
  return h('div', {}, h('h1', {}, '護持專案'), h('form', { class: 'filters', on: { submit: (e) => { e.preventDefault(); apply(); } } }, kw, type, cat, status, sort, h('button', { class: 'btn' }, '搜尋')),
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
  const share = h('button', { class: 'btn ghost', on: { click: async () => { try { await navigator.clipboard.writeText(location.origin + '/p/' + slug); toast('已複製網址'); } catch { toast('複製失敗', 'err'); } } } }, '複製網址');
  const pageUrl = encodeURIComponent(location.origin + '/p/' + slug);
  const shareFb = h('a', { href: 'https://www.facebook.com/sharer/sharer.php?u=' + pageUrl, target: '_blank', rel: 'noopener noreferrer', class: 'btn ghost' }, 'Facebook');
  const shareLine = h('a', { href: 'https://social-plugins.line.me/lineit/share?url=' + pageUrl, target: '_blank', rel: 'noopener noreferrer', class: 'btn ghost' }, 'LINE');
  const contact = h('button', { class: 'linkbtn', on: { click: () => contactCreator(p, slug) } }, '聯繫我們');
  const report = state.demo ? h('button', { class: 'linkbtn', on: { click: () => reportBox('project', p.id) } }, '檢舉計畫') : null;
  let body;
  const follow = p.updates.filter((u) => u.category === '結案追蹤'), normal = p.updates.filter((u) => u.category !== '結案追蹤');
  const upList = (list, empty) => list.length ? list.map((u) => h('article', { class: 'card' }, h('div', { class: 'muted' }, `${u.category}｜${dt(u.at)}${u.private ? '｜贊助人限定' : ''}`), h('h3', {}, u.title), u.cover ? media({ url: u.cover }) : null, u.locked ? h('p', { class: 'lock' }, '🔒 這則更新只有特定回饋的贊助人看得到') : markup(u.content))) : h('p', { class: 'muted' }, empty);
  if (tab === 'followups') body = upList(follow, '專案結束後，款項用途、工程與回饋寄送的成果會在這裡公開');
  else if (tab === 'updates') body = normal.length ? upList(normal, '') : h('p', { class: 'muted' }, '還沒有專案更新');
  else if (tab === 'comments') body = comments(p, slug);
  else if (tab === 'faqs') body = p.faqs.length ? h('div', {}, p.faqs.map((f) => h('details', { class: 'faq' }, h('summary', {}, f.q), h('p', {}, f.a)))) : h('p', { class: 'muted' }, '還沒有常見問答');
  else if (tab === 'backers') body = table(['贊助人', '金額', '時間'], p.backerList.map((b) => [b.name, money(b.amount), ago(b.at)]), '還沒有贊助人');
  else body = h('div', {}, p.video ? videoEmbed(p.video) : null, markup(p.content), p.risk ? h('section', { class: 'info-box' }, h('h3', {}, '風險與挑戰'), h('p', { class: 'pre muted' }, p.risk)) : null, p.returns ? h('section', { class: 'info-box' }, h('h3', {}, '退換貨規則'), h('p', { class: 'pre muted' }, p.returns)) : null, p.contact ? h('section', { class: 'info-box' }, h('h3', {}, '客服聯絡方式'), h('p', { class: 'pre muted' }, p.contact)) : null, p.afteeNote ? h('section', { class: 'info-box' }, h('h3', {}, 'AFTEE 支付相關宣告'), h('p', { class: 'pre muted' }, p.afteeNote)) : null);
  const codeBox = p.hasHidden && !p.codeOk ? h('form', { class: 'card', on: { submit: (e) => { e.preventDefault(); go(`/p/${slug}?code=${encodeURIComponent(e.target.code.value.trim())}`); } } }, h('p', { class: 'muted' }, '有隱藏的回饋選項？輸入密碼看看'), h('input', { name: 'code', placeholder: '隱藏選項密碼' }), h('button', { class: 'btn ghost' }, '確定')) : null;
  const opts = p.options.map((o) => optionCard(p, o, slug, q.code));
  const sub = p.type === 'subscription';
  const backBtn = h('button', { class: 'btn big full', on: { click: () => { const el = document.querySelector('.p-right'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } } }, sub ? '訂閱護持' : '幫助支持');
  const st = p.stage;
  return h('div', { class: 'project' },
    p.preview ? h('div', { class: 'warn' }, '預覽模式：這個計畫還沒公開，只有團隊和平台人員看得到') : null,
    p.ageLimit === 18 ? h('div', { class: 'warn' }, '本計畫含限制級內容，未滿 18 歲請勿瀏覽與贊助') : null,
    h('header', { class: 'p-head' }, h('div', { class: 'pmeta' }, `${p.typeName}・${p.category}`), h('h1', {}, p.title), h('p', {}, p.description)),
    h('div', { class: 'p-top' },
      h('div', { class: 'p-media' }, p.cover ? media({ url: p.cover }, 'cover') : h('div', { class: 'cover ph big' }, p.title.slice(0, 4))),
      h('div', { class: 'p-info' },
        sub ? [h('div', { class: 'big-num' }, money(p.monthly), h('small', {}, ' / 本月')), h('div', { class: 'p-goal' }, '每月定期護持')]
          : st ? [h('div', { class: 'stage-box' }, h('div', { class: 'small muted' }, st.total > 1 ? `第${st.n}階段目標` : '募資進度'), st.total > 1 ? h('div', { class: 'stage-name' }, st.name) : null, h('div', { class: 'stage-big' }, st.percent + '%'), h('div', { class: 'progress' }, h('i', { style: { width: Math.min(100, st.percent) + '%' } })), h('div', { class: 'small muted' }, `已護持 ${money(p.raised)}・${st.total > 1 ? '本階段' : ''}目標 ${money(st.goal)}`)),
            st.total > 1 ? h('ol', { class: 'stage-list' }, st.list.map((x) => h('li', { class: x.done ? 'done' : x.n === st.n ? 'now' : '' }, `第${x.n}階段：${x.name}`, h('span', {}, money(x.goal))))) : null] : null,
        h('div', { class: 'p-stats' }, h('span', {}, '贊助人數', h('b', {}, num(p.backers))), h('span', {}, sub ? '狀態' : '剩餘時間', h('b', {}, sub ? '長期訂閱' : p.status === 'live' ? p.left : p.statusName))),
        h('div', { class: 'p-period' }, sub ? `專案時間 ${dt(p.startAt, false)} 起・長期訂閱` : `專案時間 ${dt(p.startAt, false)} ~ ${dt(p.endAt, false)}`),
        p.executor ? h('div', { class: 'p-exec' }, '執行人　', p.executorUrl ? h('a', { href: p.executorUrl, target: '_blank', rel: 'noopener noreferrer nofollow' }, p.executor) : h('b', {}, p.executor)) : null,
        p.status === 'live' ? backBtn : null,
        h('div', { class: 'p-actions' }, followBtn, shareFb, shareLine),
        h('div', { class: 'row small' }, share, contact),
        p.canManage ? link(`/c/${p.id}`, '管理計畫後台', 'btn dark full') : null)),
    h('div', { class: 'tabs-bar' }, h('nav', { class: 'tabs' }, T('story', '專案內容'), T('updates', `專案更新 ${normal.length}`), T('comments', `留言 ${p.comments.length}`), T('faqs', `常見問答 ${p.faqs.length}`), T('followups', '結案追蹤'), T('backers', `贊助人 ${num(p.backers)}`))),
    h('div', { class: 'p-main' },
      h('div', { class: 'p-left' }, body, h('div', { class: 'tr' }, report)),
      h('aside', { class: 'p-right' }, h('h3', {}, sub ? '選擇訂閱方案' : '選擇護持方案'), codeBox, opts.length ? opts : h('p', { class: 'muted' }, '提案人還沒設定回饋'))));
});
function optionCard(p, o, slug, code) {
  const soldOut = o.left === 0, canBack = p.status === 'live' && !soldOut;
  const go2 = () => { if (!state.me) return go(`/login?next=${encodeURIComponent(`/p/${slug}/checkout?option=${o.id}${code ? '&code=' + code : ''}`)}`); go(`/p/${slug}/checkout?option=${o.id}${code ? '&code=' + encodeURIComponent(code) : ''}`); };
  return h('div', { class: 'ocard' + (canBack ? ' can' : ''), on: { click: () => { if (canBack) go2(); } } },
    o.media.length ? h('div', { class: 'omedia' }, o.media.map((m) => media(m))) : null,
    h('div', { class: 'oprice' }, o.custom ? '自訂金額' : money(o.price), !o.custom && o.retail > o.price ? h('s', { class: 'muted' }, money(o.retail)) : null, p.type === 'subscription' ? h('small', {}, ' / 每月') : null, o.custom && o.price ? h('small', {}, `（${money(o.price)} 起）`) : null),
    h('h4', {}, o.name, o.hidden ? badge('隱藏選項', 'gold') : null),
    h('div', { class: 'ometa' }, h('span', {}, h('b', {}, num(o.taken)), ' 人已支持'), o.left !== null ? h('span', {}, `剩餘 ${num(o.left)} 份`) : null),
    markup(o.description),
    h('div', { class: 'small muted' }, [o.atm ? '可 ATM 轉帳' : '', o.installment ? `信用卡可分 ${o.installment} 期` : '', o.stores.length ? '可超商取貨' : ''].filter(Boolean).join('・')),
    o.shipMonth ? h('div', { class: 'small muted' }, `預計於 ${o.shipMonth.replace('-', ' 年 ')} 月實現`) : null,
    soldOut ? badge('已額滿', 'gray') : p.status === 'live' ? h('button', { class: 'btn full' }, '幫助支持') : badge(p.statusName || '未開放', 'gray'));
}
function comments(p, slug) {
  const top = p.comments.filter((c) => !c.parentId), kids = (id) => p.comments.filter((c) => c.parentId === id);
  const one = (c) => h('div', { class: 'cmt' }, h('div', { class: 'cmt-h' }, h('b', {}, c.name), c.isCreator ? badge('提案人', 'gold') : null, c.backer ? badge('贊助人') : null, h('span', { class: 'muted' }, ' ' + ago(c.at))), h('p', { class: 'pre' }, c.body),
    h('div', { class: 'row small' }, state.me ? h('button', { class: 'linkbtn', on: { click: async () => { const t = await ask('回覆留言', '回覆內容', { multiline: true }); if (t && await act(() => api(`/api/p/${slug}/comments`, { body: t, parentId: c.id }), '已回覆')) go(`/p/${slug}?tab=comments`, true); } } }, '回覆') : null, state.me && state.demo ? h('button', { class: 'linkbtn', on: { click: () => reportBox('comment', c.id) } }, '檢舉') : null),
    h('div', { class: 'cmt-kids' }, kids(c.id).map(one)));
  const box = area('', 3, { placeholder: state.me ? '留言給提案人和大家…' : '登入後才能留言', disabled: !state.me });
  return h('div', {}, state.me ? h('form', { class: 'card', on: { submit: async (e) => { e.preventDefault(); if (await act(() => api(`/api/p/${slug}/comments`, { body: box.value }), '已留言')) go(`/p/${slug}?tab=comments`, true); } } }, box, h('button', { class: 'btn' }, '送出留言')) : link('/login?next=/p/' + slug, '登入後留言', 'btn ghost'), top.length ? top.map(one) : h('p', { class: 'muted' }, '還沒有留言'));
}
function contactCreator(p, slug) {
  if (!state.me) return go('/login?next=/p/' + slug);
  const t = area('', 5); modal('聯繫我們：' + p.title, field('訊息內容', t), [{ text: '送出', fn: async () => !!(await act(() => api('/api/inbox', { slug, body: t.value }), '已送出，可以在站內訊息看回覆')) }]);
}
async function reportBox(kind, id) {
  if (!state.me) return go('/login');
  const r = await ask(kind === 'project' ? '檢舉計畫' : '檢舉留言', '原因（例如：詐騙、侵權、廣告、不雅內容）', { multiline: true });
  if (r) await act(() => api('/api/reports', { kind, targetId: id, reason: r }), '已送出檢舉，平台會盡快處理');
}

// ---------- 結帳 ----------
route('/p/:slug/checkout', async ({ slug }, q) => {
  // 免註冊結帳：沒登入也可以直接填資料下單（KIRK：「消費者剛進來不需要填寫資料」）
  const me = state.me || { name: '', email: '' };
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
  // 自由樂捐：金額＝方案最低金額＋加碼（伺服器照一般加碼算，不用另外一套）
  const freeIn = inp(String(main.price || 100), { type: 'number', min: main.price || 1, on: { change: () => { const v = Math.max(main.price || 1, Math.floor(Number(freeIn.value) || 0)); freeIn.value = v; S.bonus = v - main.price; quote(); } } });
  const couponIn = inp('', { placeholder: '折扣碼' });
  // 2. 寄送
  const region = sel(state.meta.countries, 'TW', { on: { change: () => { S.region = region.value; quote(); renderDelivery(); } } });
  const deliveryBox = h('div');
  const R = { name: inp(me.name, { autocomplete: 'name' }), phone: inp('', { inputmode: 'tel', autocomplete: 'tel' }), email: inp(me.email, { type: 'email', autocomplete: 'email' }), zip: inp(''), city: inp(''), district: inp(''), address: inp('') };
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
  // 收據（正式模式）：一律由廟方開立收據，只問抬頭
  const receiptTitle = inp('', { placeholder: '空白＝收件人姓名' });
  const receiptBox = h('section', { class: 'card' }, h('h3', {}, '5. 收據'), h('p', { class: 'small muted' }, '一律由廟方開立收據，隨回饋寄出（無實體回饋的方案另外寄送）。'), field('收據抬頭（選填）', receiptTitle));
  // 個資告知與同意（個資法第 8、20 條）：隱私權必勾；建立會員、收活動消息各自勾選，預設不勾
  const privacyOk = chk(!!state.me), register = chk(false), news = chk(false);
  const consentBox = state.me ? null : h('section', { class: 'card consent' }, h('h3', {}, '6. 確認'),
    h('label', { class: 'field check' }, privacyOk, h('span', {}, '我已閱讀並同意', link('/help/privacy', '隱私權政策'), '：你填的資料只用來處理這筆訂單、寄送回饋與廟方祈福登錄。')),
    h('label', { class: 'field check' }, register, h('span', {}, '同時用這組資料建立人生地圖會員（之後可以直接看贊助紀錄、隨時刪除帳號），並同意', link('/help/terms', '會員條款'))),
    h('label', { class: 'field check' }, news, h('span', {}, '我願意收到人生地圖的法會與活動消息（可隨時取消）')));
  const submit = h('button', { class: 'btn big full', on: { click: async () => {
    if (!S.pay) return toast('請選擇付款方式', 'err');
    const survey = Object.fromEntries(Object.entries(surveyIn).map(([k, e]) => [k, e.value]));
    const body = { ...payload(), payMethod: S.pay, installments: S.pay === 'credit' ? Number(inst.value) : 0, recipient: Object.fromEntries(Object.entries(R).map(([k, e]) => [k, e.value])), store: { brand: store.brand.value, id: store.id.value, name: store.name.value }, survey, note: note.value,
      invoice: state.demo ? { type: inv.type.value, carrier: inv.carrier.value, ubn: inv.ubn.value, title: inv.title.value, donate: inv.donate.value } : { title: receiptTitle.value }, referrer: sessionStorage.getItem('ref:' + slug) || '', age18: age.checked,
      privacyOk: privacyOk.checked, register: register.checked, newsletter: news.checked };
    if (!state.me && !privacyOk.checked) return toast('請先勾選同意隱私權政策', 'err');
    submit.disabled = true;
    let r = null;
    try { r = await api('/api/orders', body); } catch (e) {
      submit.disabled = false;
      // 這個 Email 已經是會員：請他登入（填好的資料不會消失：登入用彈窗，不換頁）
      if (e.status === 409) return loginBox(R.email.value, () => submit.click());
      return toast(e.message, 'err');
    }
    submit.disabled = false;
    // 把訂單資訊（含訪客的 Email、設定密碼連結）放在這個分頁，付款頁、完成頁要用；關掉分頁就沒了
    sessionStorage.setItem('done:' + r.token, JSON.stringify({ ...r.order, setPassword: r.setPassword, guest: r.guest, email: R.email.value }));
    await loadMe(); go(`/orders/${r.token}/pay`);
  } } }, state.demo ? '確認並前往付款' : '確認並保留訂單');
  quote();
  return h('div', { class: 'checkout' }, h('h1', {}, '贊助：' + p.title),
    h('div', { class: 'co-grid' },
      h('div', {},
        h('section', { class: 'card' }, h('h3', {}, '1. 護持方案'), main.custom ? [h('div', { class: 'co-item' }, h('b', {}, main.name)), field(`護持金額（${money(main.price)} 起）`, freeIn)] : h('div', { class: 'co-item' }, h('b', {}, main.name), ' ', money(main.price), ' × ', qtyIn(main)),
          p.addons.length ? h('div', {}, h('h4', {}, '加購'), p.addons.map((a) => h('div', { class: 'co-item' }, a.name, ' ', money(a.price), ' × ', qtyIn(a)))) : null,
          p.type === 'subscription' || main.custom ? null : field('加碼護持（選填，不另外寄回饋）', bonusIn),
          main.coupon ? h('div', { class: 'row' }, couponIn, h('button', { class: 'btn ghost', on: { click: async () => { S.coupon = couponIn.value.trim(); const a = await quote(); if (a && a.discount) toast('折扣碼可以用'); } } }, '套用')) : null),
        h('section', { class: 'card' }, h('h3', {}, '2. 收件資料'), field('寄送地區', region), deliveryBox, h('div', { class: 'grid3' }, field('收件人姓名', R.name), field('電話', R.phone), field('Email', R.email))),
        h('section', { class: 'card' }, h('h3', {}, '3. 回饋調查與備註'), surveyBox, main.hasNote ? field('備註' + (main.noteRequired ? '（必填）' : ''), note) : null),
        h('section', { class: 'card' }, h('h3', {}, '4. 付款方式'), payBox, instBox, h('p', { class: 'small muted' }, state.demo ? 'ATM 轉帳：訂單成立隔天 23:59:59 前付款。' : '線上付款尚未開放：送出後訂單會先保留，不會扣款；開放後會通知你。')),
        state.demo ? invBox : receiptBox, consentBox,
        p.ageLimit === 18 ? field('我已年滿 18 歲', age) : null),
      h('aside', { class: 'card sticky' }, h('h3', {}, '金額'), sumBox, err, submit, h('p', { class: 'small muted' }, state.me ? '按下確認代表你同意本計畫的退換貨規則與使用條款。' : '不用先註冊，填好資料就能送出。按下確認代表你同意本計畫的退換貨規則與使用條款。'))));
});

// ---------- 付款（測試金流頁：長得像第三方金流的付款頁，但不會扣款）----------
const saved = (token) => { try { return JSON.parse(sessionStorage.getItem('done:' + token) || 'null'); } catch { return null; } };
async function loadOrder(token) {
  const s = saved(token);
  if (state.me) { const list = await api('/api/my/orders'); const o = list.find((x) => x.token === token); if (o) return o; }
  if (s && s.email) return api(`/api/orders/${token}/view`, { email: s.email });
  throw new Error('找不到這張訂單：請用「訂單查詢」輸入 Email 和訂單編號');
}
route('/orders/:token/pay', async ({ token }) => {
  const o = await loadOrder(token), s = saved(token) || {};
  if (o.status !== 'pending') return go(`/orders/${token}/done`, true) || h('div');
  const mode = state.payMode || (state.demo ? 'demo' : 'closed');
  if (mode === 'closed') return h('div', { class: 'card closed narrow' }, h('h2', {}, '線上付款尚未開放'), h('p', { class: 'muted' }, `訂單 ${o.token} 已保留`), h('div', { class: 'big-num' }, money(o.total)),
    h('p', {}, '目前還不會扣款。線上付款開放後，我們會通知你回來完成付款。'), h('div', { class: 'row', style: { justifyContent: 'center' } }, link(`/orders/${token}/done`, '查看訂單', 'btn')));
  const body = (extra = {}) => ({ email: s.email || '', ...extra });
  const paid = () => go(`/orders/${token}/done`, true);
  // 付款頁的版型照一般第三方金流：上面商店與金額，左邊付款方式，右邊訂單明細
  const head = h('div', { class: 'gw-head' }, h('div', {}, h('b', {}, '人生地圖募資'), h('span', { class: 'muted small' }, '　安全付款')), h('span', { class: 'gw-lock' }, '🔒 SSL 加密連線'));
  const test = h('div', { class: 'gw-test' }, '測試金流：所有付款都不會真的扣款，請勿輸入真實卡號');
  const summary = h('aside', { class: 'gw-sum' }, h('div', { class: 'small muted' }, '訂單編號'), h('div', { class: 'mono' }, o.token), h('div', { class: 'small muted' }, '專案'), h('div', {}, o.project ? o.project.title : ''),
    h('ul', { class: 'small' }, o.items.map((it) => h('li', {}, `${it.name} × ${it.qty}`)), o.bonus ? h('li', {}, '加碼 ' + money(o.bonus)) : null), h('div', { class: 'gw-total' }, h('span', {}, '應付金額'), h('b', {}, money(o.total))));
  let main;
  if (o.payMethod === 'atm') {
    main = h('div', {}, h('h3', {}, 'ATM 虛擬帳號'), h('table', { class: 'gw-tbl' }, h('tr', {}, h('th', {}, '銀行代碼'), h('td', {}, '999（測試銀行）')), h('tr', {}, h('th', {}, '虛擬帳號'), h('td', { class: 'mono big' }, o.atmAccount)), h('tr', {}, h('th', {}, '繳費金額'), h('td', {}, money(o.total))), h('tr', {}, h('th', {}, '繳費期限'), h('td', {}, dt(o.atmDeadline)))),
      h('p', { class: 'small muted' }, '轉帳完成後，系統約 10 分鐘內入帳。測試金流可以直接按下面的按鈕模擬銀行入帳。'),
      h('button', { class: 'btn big full', on: { click: async () => { if (await act(() => api(`/api/orders/${token}/atm-paid`, body()), '已收到轉帳')) paid(); } } }, '模擬轉帳完成'));
  } else {
    // 卡號只在畫面上排版；送到伺服器的只有末四碼（完整卡號絕不離開這台裝置）
    const card = inp('', { inputmode: 'numeric', autocomplete: 'off', placeholder: '4242 4242 4242 4242', maxlength: 19, on: { input: () => { const d = card.value.replace(/\D/g, '').slice(0, 16); card.value = d.replace(/(\d{4})(?=\d)/g, '$1 '); } } });
    const exp = inp('', { inputmode: 'numeric', autocomplete: 'off', placeholder: 'MM / YY', maxlength: 7, on: { input: () => { const d = exp.value.replace(/\D/g, '').slice(0, 4); exp.value = d.length > 2 ? d.slice(0, 2) + ' / ' + d.slice(2) : d; } } });
    const cvc = inp('', { inputmode: 'numeric', autocomplete: 'off', placeholder: '3 碼', maxlength: 3, type: 'password' });
    const btn = h('button', { class: 'btn big full', on: { click: async () => {
      const d = card.value.replace(/\D/g, '');
      if (o.payMethod === 'credit' && (d.length !== 16 || !/^\d{2} \/ \d{2}$/.test(exp.value) || !/^\d{3}$/.test(cvc.value))) return toast('請填完整的卡號、有效期限、安全碼（測試金流可用 4242 4242 4242 4242）', 'err');
      btn.disabled = true; btn.textContent = '處理中…';
      const ok = await act(() => api(`/api/orders/${token}/pay`, body({ last4: d.slice(-4) })), '付款成功');
      card.value = ''; cvc.value = '';
      if (ok) paid(); else { btn.disabled = false; btn.textContent = `確認付款 ${money(o.total)}`; }
    } } }, `確認付款 ${money(o.total)}`);
    main = o.payMethod === 'credit' ? h('div', {}, h('h3', {}, '信用卡付款'), o.installments ? h('p', { class: 'small' }, `分 ${o.installments} 期，每期約 ${money(Math.ceil(o.total / o.installments))}`) : null,
      field('信用卡卡號', card), h('div', { class: 'grid2' }, field('有效期限', exp), field('背面末三碼', cvc)), h('p', { class: 'small muted' }, '測試卡號：4242 4242 4242 4242（成功）、4000 0000 0000 0002（模擬銀行拒絕）'), btn)
      : h('div', {}, h('h3', {}, 'AFTEE 先享後付'), h('p', { class: 'small muted' }, '測試金流：按下去就算付款完成。'), btn);
  }
  return h('div', { class: 'gw' }, test, h('div', { class: 'gw-box' }, head, h('div', { class: 'gw-body' }, h('div', { class: 'gw-main' }, main), summary)), h('p', { class: 'tc small muted' }, link('/me/orders', '稍後再付款')));
});
function orderDone(o) {
  return h('div', { class: 'card center' }, h('h2', {}, o.status === 'paid' ? '🎉 贊助成功' : o.statusName), h('p', {}, `訂單編號 ${o.token}`), h('div', { class: 'big-num' }, money(o.total)), o.project ? link('/p/' + o.project.slug, '回計畫頁', 'btn ghost') : null, ' ', link('/me/orders', '查看贊助紀錄', 'btn'));
}

/** 結帳時發現這個 Email 已經是會員：彈窗登入，登入成功就幫他重新送出（填好的資料都還在） */
function loginBox(email, then) {
  const em = inp(email, { type: 'email', autocomplete: 'username' }), pw = inp('', { type: 'password', autocomplete: 'current-password' });
  modal('這個 Email 已經是會員', h('div', {}, h('p', { class: 'muted' }, '請登入後送出，填好的資料都會保留。'), field('Email', em), field('密碼', pw)),
    [{ text: '登入並送出', fn: async () => { const ok = await act(() => api('/api/login', { email: em.value, password: pw.value }), '登入成功'); if (!ok) return false; await loadMe(); then(); return true; } }]);
}
// ---------- 訪客下單完成：顯示訂單；有勾建立會員就請他設定密碼 ----------
route('/orders/:token/done', async ({ token }) => {
  const s = saved(token);
  let o = null; try { o = await loadOrder(token); } catch { o = null; }
  if (!o) return go('/lookup', true) || h('div');
  o = { ...o, setPassword: s && s.setPassword, email: (s && s.email) || (state.me && state.me.email) || '' };
  const pw = inp('', { type: 'password', autocomplete: 'new-password' }), pw2 = inp('', { type: 'password', autocomplete: 'new-password' });
  const setBox = o.setPassword ? h('section', { class: 'card' }, h('h3', {}, '最後一步：設定密碼'), h('p', { class: 'small muted' }, `你的會員帳號是 ${o.email}，已經幫你登入。設定密碼後，下次就能直接登入看贊助紀錄（24 小時內有效）。`),
    field('密碼（8～64 字，要有英文和數字）', pw), field('再輸入一次', pw2),
    h('button', { class: 'btn', on: { click: async () => { if (pw.value !== pw2.value) return toast('兩次密碼不一樣', 'err'); if (await act(() => api('/api/password/set', { token: o.setPassword, password: pw.value }), '密碼已設定')) { sessionStorage.removeItem('done:' + token); await loadMe(); go('/me/orders'); } } } }, '設定密碼')) : null;
  const paidOk = o.status === 'paid';
  return h('div', { class: 'narrow' }, h('div', { class: 'card closed' }, h('h2', {}, paidOk ? '🎉 護持成功，謝謝你' : o.status === 'pending' ? '訂單已保留' : o.statusName), h('p', { class: 'muted' }, `訂單編號 ${o.token}`), h('div', { class: 'big-num' }, money(o.total)),
    paidOk ? h('p', {}, '廟方會依你填的資料進行祈福登錄，回饋寄出時會再通知你。') : o.status === 'pending' ? h('p', {}, (state.payMode === 'closed' ? '線上付款尚未開放，目前不會扣款；開放後會通知你。' : '還沒完成付款。'), state.payMode !== 'closed' ? link(`/orders/${o.token}/pay`, '前往付款') : null) : null,
    h('p', { class: 'small muted' }, '請記下訂單編號，之後用「Email＋訂單編號」就能在「訂單查詢」看進度。')), setBox,
    h('div', { class: 'row', style: { justifyContent: 'center' } }, o.project ? link('/p/' + o.project.slug, '回專案頁', 'btn ghost') : null, link('/lookup', '訂單查詢', 'btn ghost')));
});
route('/lookup', async () => {
  const em = inp('', { type: 'email', autocomplete: 'email' }), tk = inp('', { placeholder: '例：A1B2C3D4E5', autocapitalize: 'characters' });
  const out = h('div');
  const show = (o) => out.replaceChildren(h('article', { class: 'card order' }, h('div', { class: 'row between' }, h('b', {}, o.project ? o.project.title : ''), badge(o.statusName, o.status)), h('div', { class: 'muted small' }, `訂單 ${o.token}・${dt(o.createdAt)}`),
    h('ul', { class: 'small' }, o.items.map((it) => h('li', {}, `${it.name} × ${it.qty}　${money(it.price * it.qty)}`)), o.bonus ? h('li', {}, '加碼 ' + money(o.bonus)) : null), h('b', {}, '總金額 ' + money(o.total)),
    o.shipped ? h('p', { class: 'ok' }, `已寄出：${o.shipped.carrier} ${o.shipped.trackNo}`) : null));
  return h('div', { class: 'card auth' }, h('h1', {}, '訂單查詢'), h('p', { class: 'muted small' }, '不用登入：輸入下單時填的 Email 和訂單編號。'), field('Email', em), field('訂單編號', tk),
    h('button', { class: 'btn full', on: { click: async () => { const o = await act(() => api('/api/lookup', { email: em.value, token: tk.value }), ''); if (o) show(o); } } }, '查詢'), out,
    h('p', { class: 'small muted' }, '是會員嗎？', link('/login?next=/me/orders', '登入看全部贊助紀錄')));
});

// ---------- 我的贊助紀錄 ----------
route('/me/orders', async () => {
  const list = await api('/api/my/orders');
  return h('div', {}, h('h1', {}, '贊助紀錄'), list.length ? list.map((o) => h('article', { class: 'card order' },
    h('div', { class: 'row between' }, h('div', {}, o.project ? link('/p/' + o.project.slug, o.project.title, 'b') : '（計畫已刪除）', h('div', { class: 'muted small' }, `訂單 ${o.token}・${dt(o.createdAt)}${o.period ? `・第 ${o.period} 期` : ''}`)), badge(o.statusName, o.status)),
    h('ul', { class: 'small' }, o.items.map((it) => h('li', {}, `${it.name} × ${it.qty}　${money(it.price * it.qty)}`)), o.bonus ? h('li', {}, '加碼 ' + money(o.bonus)) : null, o.discount ? h('li', {}, `折扣碼 ${o.coupon} −${money(o.discount)}`) : null, h('li', {}, '運費 ' + money(o.shippingFee))),
    h('div', { class: 'row between' }, h('b', {}, '總金額 ' + money(o.total)), h('span', { class: 'muted small' }, state.meta.payMethods[o.payMethod] + (o.installments ? ` 分 ${o.installments} 期` : ''))),
    o.status === 'pending' && o.payMethod === 'atm' ? h('p', { class: 'warn' }, `請在 ${dt(o.atmDeadline)} 前轉帳到 ${o.atmAccount}`) : null,
    o.status === 'pending' ? (state.payMode !== 'closed' ? link(`/orders/${o.token}/pay`, '前往付款', 'btn') : h('p', { class: 'warn' }, '線上付款尚未開放，訂單已保留，開放後會通知你。')) : null,
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
    h('section', { class: 'card' }, h('h3', {}, '修改密碼'), field('舊密碼', pwOld), field('新密碼（8～64 字，要有英文和數字）', pwNew), h('button', { class: 'btn ghost', on: { click: () => act(() => api('/api/settings/password', { old: pwOld.value, password: pwNew.value }), '密碼已更新，其他裝置已登出') } }, '更新密碼')),
    h('section', { class: 'card' }, h('h3', {}, '刪除帳號'), h('p', { class: 'small muted' }, '刪除後會清掉你的個人資料、收件資料，所有裝置登出；訂單金額等交易紀錄依法保留。還有待付款或訂閱中的訂單要先取消。'),
      h('button', { class: 'btn danger', on: { click: () => { const pw = inp('', { type: 'password' }), cf = inp('', { placeholder: '刪除帳號' }); modal('刪除帳號', h('div', {}, field('密碼', pw), field('請輸入「刪除帳號」確認', cf)), [{ text: '刪除', cls: 'danger', fn: async () => { const ok = await act(() => api('/api/settings/delete', { password: pw.value, confirm: cf.value }), '帳號已刪除'); if (ok) { await loadMe(); go('/'); } return !!ok; } }]); } } }, '刪除我的帳號')));
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

// ---------- 宮廟合作申請（公司自己經營：外面的人不能直接提案，填表後由我們聯繫）----------
route('/start', async () => { go('/inquiry', true); return h('div'); });
route('/inquiry', async () => {
  const F = { org: inp('', { placeholder: '例：○○宮' }), name: inp(''), phone: inp('', { inputmode: 'tel' }), email: inp('', { type: 'email' }), line: inp(''), content: area('', 6, { placeholder: '想募資的項目（修廟、法會、文物…）、大概的金額與時間、目前的狀況' }) };
  const done = h('div', { class: 'card closed hidden' }, h('h2', {}, '已收到你的申請'), h('p', {}, '我們會在 3 個工作天內與你聯繫，謝謝你。'), link('/', '回首頁', 'btn'));
  const form = h('form', { class: 'card', on: { submit: async (e) => { e.preventDefault(); const b = Object.fromEntries(Object.entries(F).map(([k, x]) => [k, x.value])); if (await act(() => api('/api/inquiry', b), '已送出')) { form.classList.add('hidden'); done.classList.remove('hidden'); } } } },
    h('div', { class: 'grid2' }, field('宮廟（單位）名稱', F.org), field('聯絡人', F.name), field('電話', F.phone), field('Email', F.email), field('LINE ID（選填）', F.line)), field('想合作的內容', F.content), h('button', { class: 'btn big' }, '送出申請'));
  return h('div', { class: 'narrow-l' }, h('section', { class: 'hero plain' }, h('h1', {}, '宮廟合作申請'), h('p', {}, '人生地圖募資由我們和廟方一起規劃、執行。想替廟宇發起護持專案，請留下聯絡方式，專人會跟你聯繫。')), form, done,
    h('section', { class: 'card' }, h('h2', {}, '合作怎麼進行'), h('ol', { class: 'list' }, h('li', {}, '專人聯繫、了解需求與廟方狀況'), h('li', {}, '一起規劃專案內容、階段目標與護持方案'), h('li', {}, '平台上架、宣傳，募資期間定期更新進度'), h('li', {}, '專案結束後，款項用途與成果在「結案追蹤」公開'))));
});

// ---------- 登入、註冊 ----------
route('/login', async (_, q) => {
  const em = inp('', { type: 'email', autocomplete: 'username' }), pw = inp('', { type: 'password', autocomplete: 'current-password' });
  const next = q.next && q.next.startsWith('/') && !q.next.startsWith('//') ? q.next : '/';
  const submit = async (e) => { e.preventDefault(); if (await act(() => api('/api/login', { email: em.value, password: pw.value }), '登入成功')) { await loadMe(); go(next); } };
  return h('form', { class: 'card auth', on: { submit } }, h('h1', {}, '登入'), field('Email', em), field('密碼', pw), h('button', { class: 'btn full' }, '登入'), h('p', {}, '還沒有帳號？', link('/register?next=' + encodeURIComponent(next), '註冊')), h('p', { class: 'small muted' }, '沒有註冊也下過單？', link('/lookup', '用 Email＋訂單編號查詢')),
    state.demo ? h('div', { class: 'demo' }, h('b', {}, '測試帳號（密碼都是 Demo1234）'), h('ul', {}, [['admin@demo.local', '平台管理員'], ['pm@demo.local', '專案經理'], ['creator@demo.local', '提案人'], ['backer1@demo.local', '贊助人']].map(([e, n]) => h('li', {}, h('button', { type: 'button', class: 'linkbtn', on: { click: () => { em.value = e; pw.value = 'Demo1234'; } } }, e), '　' + n)))) : null);
});
route('/register', async (_, q) => {
  const em = inp('', { type: 'email', autocomplete: 'username' }), name = inp(''), pw = inp('', { type: 'password', autocomplete: 'new-password' }), nl = chk(false);
  const next = q.next && q.next.startsWith('/') && !q.next.startsWith('//') ? q.next : '/';
  const submit = async (e) => { e.preventDefault(); if (await act(() => api('/api/register', { email: em.value, name: name.value, password: pw.value, newsletter: nl.checked }), '註冊成功')) { await loadMe(); go(next); } };
  return h('form', { class: 'card auth', on: { submit } }, h('h1', {}, '註冊'), field('Email', em), field('名稱', name), field('密碼（8～64 字，要有英文和數字）', pw), field('訂閱電子報', nl), h('button', { class: 'btn full' }, '註冊'), h('p', {}, '已經有帳號？', link('/login?next=' + encodeURIComponent(next), '登入')));
});
