/**
 * 人生地圖募資：伺服器的所有 API（前台、提案者後台、平台管理後台）
 * demo 模式（環境變數 DEMO=1，測試用）：多 6 個測試計畫、測試帳號、假金流、模擬時鐘；正式模式只有真實計畫，線上付款關閉
 * ------------------------------------------------------------
 * 三種角色：
 *   - 會員（member）：逛計畫、贊助、留言、追蹤、站內訊息、發起計畫（自己的計畫就是提案人）
 *   - 提案人與團隊：管理自己（或所屬團隊）的計畫——內容、回饋、FAQ、折扣碼、推薦連結、EDM、更新、訂單、退款、商業檔案、金流、送審
 *   - 平台人員：staff（專案經理：審核、計畫、訂單、退款、檢舉、留言）、admin（再加會員權限、平台設定、撥款、時鐘、重置、操作紀錄）
 * 資安原則（每一支 API 都一樣）：
 *   - 會改資料的請求一律要登入狀態的 CSRF 標頭；所有輸入都用 security.js 清洗、限長度
 *   - 權限在伺服器判斷，畫面上藏按鈕不算數；查不到或沒權限一律回同樣的錯，不洩漏資料存不存在
 *   - 個資（收件人、電話、地址）只有那筆訂單的贊助人、計畫團隊、平台人員看得到；前台贊助人名單只顯示遮罩後的名字
 *   - 金流全部是模擬的：沒有真的卡號、帳號；信用卡只收卡號末四碼做示範
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createDb, token } from './db.js';
import { seed, DEMO_PASSWORD } from './seed.js';
import * as S from './security.js';
import * as R from './rules.js';

const SESSION_TTL = 14 * R.DAY;
const ROLE_RANK = { viewer: 1, support: 2, editor: 3, admin: 4 };   // 團隊角色的權限高低

export function createApp({ dataDir, publicDir, isProd = false, secureCookie = false, trustProxy = false, demo = false, adminEmail = '', adminPassword = '' }) {
  // 建立資料：正式模式的管理員帳號來自環境變數 ADMIN_EMAIL／ADMIN_PASSWORD；沒設密碼就產生一組亂數，只印在伺服器啟動畫面（登入後請馬上改）
  const makeSeed = () => {
    if (demo) return seed(Date.now(), { demo: true });
    let pw = adminPassword, gen = false;
    if (!S.passwordOk(pw)) { pw = crypto.randomBytes(9).toString('base64url') + '9a'; gen = true; }
    const em = S.email(adminEmail) || 'admin@lifemap.local';
    if (gen) console.log(`[人生地圖募資] 管理員帳號 ${em} 的初始密碼：${pw}（只會顯示這一次；登入後到「帳號設定」改掉，或在主機設定 ADMIN_PASSWORD）`);
    return seed(Date.now(), { demo: false, adminEmail: em, adminPassword: pw });
  };
  const db = createDb({ dir: dataDir, seed: makeSeed });
  const D = () => db.data;
  const uploadDir = path.join(dataDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  const limiter = S.createLimiter();
  const sessions = new Map();   // 雜湊後的 session → { userId, csrf, at }
  for (const s of D().sessions) if (s && s.hash && s.at > Date.now() - SESSION_TTL) sessions.set(s.hash, { userId: s.userId, csrf: s.csrf, at: s.at });

  /** 平台時間（admin 可以快轉，練習「募資結束」「ATM 逾期」「撥款」這些要等很久的事） */
  const now = () => Date.now() + (D().meta.clockOffset || 0);
  const settings = () => ({ ...R.DEFAULT_SETTINGS, ...(D().settings || {}) });

  // =============================================================
  // 共用：寄信（模擬）、操作紀錄、權限
  // =============================================================
  /** 模擬寄信：不真的寄，存進「寄信紀錄」（admin 看得到、收件人在站內信箱也看得到） */
  function mail(userId, subject, body, kind = 'system') {
    const u = db.byId('users', userId); if (!u) return;
    db.insert('emails', { userId, to: u.email, subject: S.str(subject, 120), body: S.str(body, 2000, { multiline: true }), kind, at: now() }, now());
    if (D().emails.length > 5000) D().emails.splice(0, D().emails.length - 5000);
  }
  function audit(actor, action, target, detail = '') {
    db.insert('audit', { at: now(), actorId: actor ? actor.id : 0, action, target: String(target).slice(0, 60), detail: S.str(String(detail), 300) }, now());
    if (D().audit.length > 10000) D().audit.splice(0, D().audit.length - 10000);
  }
  const isStaff = (u) => !!u && (u.role === 'admin' || u.role === 'staff');
  const isAdmin = (u) => !!u && u.role === 'admin';
  /** 這個人在這個計畫的團隊角色：owner／admin／editor／support／viewer；沒有回 ''（平台人員當 admin） */
  function teamRole(u, p) {
    if (!u || !p) return '';
    if (p.ownerId === u.id) return 'owner';
    if (isStaff(u)) return 'admin';
    const m = D().memberships.find((x) => x.ownerId === p.ownerId && x.userId === u.id && x.status === 'active');
    return m ? m.role : '';
  }
  /** 有沒有至少某個團隊權限 */
  const can = (u, p, need = 'viewer') => { const r = teamRole(u, p); return r === 'owner' || (r && ROLE_RANK[r] >= ROLE_RANK[need]); };

  // =============================================================
  // 計畫的對外樣子
  // =============================================================
  const ordersOf = (pid) => D().orders.filter((o) => o.projectId === pid);
  const optionsOf = (pid) => D().options.filter((o) => o.projectId === pid);
  const isPublic = (p) => ['live', 'success', 'failed', 'ended'].includes(p.status);
  /** 卡片（列表用） */
  function card(p) {
    const st = R.projectStats(ordersOf(p.id)), owner = db.byId('users', p.ownerId);
    return { id: p.id, slug: p.slug, title: p.title, description: p.description, cover: p.cover, type: p.type, typeName: R.PROJECT_TYPES[p.type], category: p.category, status: p.status, statusName: R.PROJECT_STATUS[p.status],
      owner: owner ? owner.name : '', goal: p.goal, raised: st.raised, backers: st.backers, percent: R.percentOf(st.raised, p.goal), startAt: p.startAt, endAt: p.endAt, left: p.type === 'subscription' ? '長期訂閱' : R.timeLeft(p.endAt, now()), featured: !!p.featured, staffPick: !!p.staffPick, monthly: p.type === 'subscription' ? monthlyOf(p) : 0 };
  }
  /** 訂閱式：這個月的贊助總額 */
  function monthlyOf(p) { const m = new Date(now() + R.TW_OFFSET).toISOString().slice(0, 7); return R.countedOrders(ordersOf(p.id)).filter((o) => new Date(o.paidAt + R.TW_OFFSET).toISOString().slice(0, 7) === m).reduce((s, o) => s + o.total, 0); }
  /** 回饋選項對外的樣子（不含隱藏密碼） */
  function optView(o, orders) {
    const left = R.optionLeft(o, orders);
    return { id: o.id, name: o.name, price: o.price, retail: o.retail, limit: o.limit, left: left === Infinity ? null : left, taken: R.optionTaken(o.id, orders), addonOnly: !!o.addonOnly, atm: !!o.atm, installment: o.installment, coupon: !!o.coupon,
      media: o.media || [], description: o.description, shipMonth: o.shipMonth, hasNote: !!o.hasNote, noteRequired: !!o.noteRequired, hidden: !!o.code, survey: o.survey || [], shipping: o.shipping || {}, stores: o.stores || [] };
  }

  // =============================================================
  // 巡檢（每個請求進來前跑一次，最多每秒一次）：上線、結束、退款、逾期、訂閱扣款、撥款、EDM
  // =============================================================
  let lastTick = 0;
  function tick(force = false) {
    const t = now();
    if (!force && Date.now() - lastTick < 1000) return;
    lastTick = Date.now();
    const st = settings();
    let changed = false;
    for (const p of D().projects) {
      // 審核都通過、時間到 → 上線（通知追蹤的人）
      if (p.status === 'scheduled' && t >= p.startAt) {
        p.status = 'live'; changed = true; audit(null, 'project_live', p.id, p.title);
        for (const f of D().follows.filter((x) => x.projectId === p.id)) mail(f.userId, `你追蹤的計畫上線了：${p.title}`, `「${p.title}」已經開始募資。`, 'project');
      }
      // 一次性計畫：時間到 → 成功或失敗
      if (p.status === 'live' && p.type !== 'subscription' && p.endAt && t >= p.endAt) {
        const orders = ordersOf(p.id), stats = R.projectStats(orders), out = R.finalOutcome(p, stats.raised, st);
        p.status = out; changed = true; audit(null, 'project_end', p.id, `${R.PROJECT_STATUS[out]}：${stats.raised}／${p.goal}`);
        for (const o of orders) if (o.status === 'pending') { o.status = 'cancelled'; }
        if (out === 'failed') for (const o of orders) if (o.status === 'paid') refundOrder(o, null, '募資未達標，系統自動退款');
        mail(p.ownerId, `計畫結束：${p.title}`, `結果：${R.PROJECT_STATUS[out]}，累計 NT$ ${stats.raised.toLocaleString()}。`, 'project');
        for (const uid of new Set(orders.filter((o) => o.status === 'paid' || o.status === 'refunded').map((o) => o.userId))) mail(uid, `你贊助的計畫結束了：${p.title}`, out === 'success' ? '計畫募資成功！回饋會依預計出貨時間寄出。' : '計畫沒有達標，你的贊助已退款。', 'project');
      }
      // 成功的一次性計畫：排撥款（還沒排過才排）
      if (p.status === 'success' && p.type !== 'subscription' && !D().payouts.some((x) => x.projectId === p.id && !x.period)) {
        const calc = R.payoutCalc(R.countedOrders(ordersOf(p.id)), st);
        db.insert('payouts', { projectId: p.id, period: '', ...calc, dueAt: R.addWorkdays(p.endAt, st.payoutWorkdays), status: 'scheduled', paidAt: 0 }, t); changed = true;
      }
      // 訂閱式：每個完整的月份排一筆撥款（次月 15 日）
      if (p.type === 'subscription' && (p.status === 'live' || p.status === 'ended')) {
        const curM = new Date(t + R.TW_OFFSET).toISOString().slice(0, 7), byM = {};
        for (const o of R.countedOrders(ordersOf(p.id))) { const m = new Date(o.paidAt + R.TW_OFFSET).toISOString().slice(0, 7); if (m < curM) (byM[m] = byM[m] || []).push(o); }
        for (const [m, list] of Object.entries(byM)) if (!D().payouts.some((x) => x.projectId === p.id && x.period === m)) {
          const end = Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1) - R.TW_OFFSET - 1;
          db.insert('payouts', { projectId: p.id, period: m, ...R.payoutCalc(list, st), dueAt: R.nextMonthDay(end, st.subscriptionPayoutDay), status: 'scheduled', paidAt: 0 }, t); changed = true;
        }
        if (p.status === 'live' && p.endAt && t >= p.endAt) { p.status = 'ended'; changed = true; }
      }
    }
    for (const o of D().orders) {
      // ATM 逾期沒付 → 逾期（名額放回去）
      if (o.status === 'pending' && o.payMethod === 'atm' && o.atmDeadline && t > o.atmDeadline) { o.status = 'expired'; changed = true; mail(o.userId, `訂單 ${o.token} 逾期未付款`, 'ATM 繳費期限已過，訂單已取消。', 'order'); }
      // 訂閱：時間到就扣下一期（模擬一定成功）
      if (o.sub && o.sub.active && o.status === 'paid' && o.sub.nextAt <= t) {
        const p = db.byId('projects', o.projectId);
        if (!p || p.status !== 'live') { o.sub.active = false; changed = true; continue; }
        let guard = 0;
        while (o.sub.nextAt <= t && guard++ < 24) {
          const copy = JSON.parse(JSON.stringify(o)); delete copy.id;   // 下一期＝複製一張新訂單（新的編號、付款時間）
          db.insert('orders', { ...copy, token: token(), sub: null, subOf: o.id, period: o.sub.period + 1, createdAt: o.sub.nextAt, paidAt: o.sub.nextAt, status: 'paid' }, o.sub.nextAt);
          o.sub.period += 1; o.sub.nextAt += 30 * R.DAY;
          mail(o.userId, `訂閱扣款成功：${p.title}`, `第 ${o.sub.period} 期 NT$ ${o.total.toLocaleString()} 已扣款。`, 'order');
        }
        changed = true;
      }
    }
    // EDM 再行銷：進了結帳頁沒買的，1 小時後寄一次提醒（計畫要開啟「每日自動寄送」）
    for (const c of D().checkouts) {
      if (c.converted || c.remindedAt || t - c.at < 3_600_000) continue;
      const p = db.byId('projects', c.projectId); if (!p || p.status !== 'live' || !p.abandon || !p.abandon.enabled) continue;
      const cp = p.abandon.couponId ? D().coupons.find((x) => x.id === p.abandon.couponId && x.promotional) : null;
      mail(c.userId, p.abandon.subject || `你還沒完成「${p.title}」的贊助`, [p.abandon.title, p.abandon.subtitle, ...(p.abandon.features || []).filter(Boolean).map((f) => '・' + f), cp ? `折扣碼：${cp.code}（折 NT$ ${cp.amount}）` : '', `${p.abandon.cta || '回去看看'} → /p/${p.slug}`].filter(Boolean).join('\n'), 'edm');
      c.remindedAt = t; changed = true;
    }
    if (changed) db.save();
  }
  /** 退款一張訂單（失敗自動退、取消、退款審核通過都走這裡）；ATM 扣轉帳手續費 */
  function refundOrder(o, actor, reason) {
    if (o.status !== 'paid') return false;
    o.status = 'refunded'; o.refundedAt = now(); o.refundFee = o.payMethod === 'atm' ? settings().atmRefundFee : 0; o.refundReason = S.str(reason, 200);
    if (o.sub) o.sub.active = false;
    mail(o.userId, `訂單 ${o.token} 已退款`, `退款金額 NT$ ${(o.total - o.refundFee).toLocaleString()}${o.refundFee ? `（已扣轉帳手續費 ${o.refundFee}）` : ''}。原因：${reason}`, 'order');
    audit(actor, 'refund', o.token, reason);
    db.save();
    return true;
  }

  // =============================================================
  // 路由
  // =============================================================
  const routes = [];
  /** 註冊一支 API。opt：auth＝要登入；staff／admin＝平台人員；write＝會改資料（要 CSRF） */
  const on = (method, pattern, opt, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), opt, fn });
  class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
  const bad = (msg = '資料不正確') => { throw new HttpError(400, msg); };
  const nope = () => { throw new HttpError(404, '找不到，或你沒有權限'); };
  /** 用 id 或 slug 找計畫，順便檢查團隊權限 */
  function myProject(ctx, need = 'viewer') {
    const id = S.int(ctx.params.pid, 1, 1e9);
    const p = id ? db.byId('projects', id) : null;
    if (!p || !can(ctx.user, p, need)) nope();
    return p;
  }

  // ---------- 帳號 ----------
  on('GET', '/api/me', {}, (ctx) => {
    const u = ctx.user;
    const unread = u ? D().messages.filter((m) => m.toId === u.id && !m.read).length : 0;
    return { csrf: ctx.session.csrf, now: now(), user: u ? { id: u.id, name: u.name, email: u.email, role: u.role, slug: u.slug, avatar: u.avatar } : null, unread,
      meta: { types: R.PROJECT_TYPES, categories: settings().categories || R.CATEGORIES, countries: R.COUNTRIES, stores: R.STORES, payMethods: R.PAY_METHODS, steps: R.REVIEW_STEPS, stepStates: R.STEP_STATES, projectStatus: R.PROJECT_STATUS, orderStatus: R.ORDER_STATUS, refundStatus: R.REFUND_STATUS, invoiceFormats: R.INVOICE_FORMATS, origins: R.ORIGINS, updateCategories: R.UPDATE_CATEGORIES, teamRoles: R.TEAM_ROLES },
      notices: D().notices.slice(-3).reverse(), demo };
  });
  on('POST', '/api/register', { write: true, rate: ['reg', 60, 3_600_000] }, (ctx) => {   // 一間教室的人一起註冊：同一個 IP 一小時 60 個
    const b = ctx.body, em = S.email(b.email), name = S.str(b.name, 20);
    if (!em) bad('Email 格式不對');
    if (!name) bad('請填名稱');
    if (!S.passwordOk(b.password)) bad('密碼 8～64 字，要有英文和數字');
    if (D().users.some((u) => u.email === em)) bad('這個 Email 已經註冊過了');
    let sl = em.split('@')[0].toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'user';
    while (sl.length < 3 || D().users.some((u) => u.slug === sl)) sl += crypto.randomInt(10);
    const u = db.insert('users', { email: em, name, realName: '', pass: S.hashPassword(b.password), role: 'member', banned: false, slug: sl, avatar: '', gender: '', birthday: '', from: '', fb: '', ig: '', yt: '', web: '', bio: '', notify: true, newsletter: !!b.newsletter }, now());
    login(ctx, u);
    mail(u.id, '歡迎加入人生地圖募資', '註冊成功！歡迎一起護持在地的廟宇與文化。', 'account');
    return { ok: true };
  });
  // 登入限流：同一個帳號 10 分鐘最多錯 8 次（防猜密碼）；同一個 IP 10 分鐘最多 200 次（教室共用 IP 也夠用）
  on('POST', '/api/login', { write: true, rate: ['login', 200, 600_000] }, (ctx) => {
    const em = S.email(ctx.body.email), u = em ? D().users.find((x) => x.email === em) : null;
    if (!limiter(`fail|${em || ctx.ip}`, 8, 600_000, true)) throw new HttpError(429, '這個帳號錯太多次了，請 10 分鐘後再試');
    if (!u || !S.checkPassword(ctx.body.password, u.pass)) { limiter(`fail|${em || ctx.ip}`, 8, 600_000); bad('Email 或密碼不對'); }
    if (u.banned) bad('這個帳號已被停權，請聯繫平台');
    login(ctx, u);
    return { ok: true };
  });
  on('POST', '/api/logout', { write: true }, (ctx) => { logout(ctx); return { ok: true }; });
  /** 登入：換一組新的 session（防 session fixation），存雜湊 */
  function login(ctx, u) {
    logout(ctx);
    const sid = S.newSessionId(), h = S.sha(sid), csrf = S.newCsrf();
    sessions.set(h, { userId: u.id, csrf, at: Date.now() });
    D().sessions = D().sessions.filter((s) => s.at > Date.now() - SESSION_TTL);
    D().sessions.push({ hash: h, userId: u.id, csrf, at: Date.now() }); db.save();
    ctx.setCookie(sid); ctx.session = sessions.get(h); ctx.user = u;
  }
  function logout(ctx) {
    if (ctx.sidHash) { sessions.delete(ctx.sidHash); D().sessions = D().sessions.filter((s) => s.hash !== ctx.sidHash); db.save(); }
    const sid = S.newSessionId(), h = S.sha(sid); sessions.set(h, { userId: 0, csrf: S.newCsrf(), at: Date.now() }); ctx.setCookie(sid); ctx.sidHash = h; ctx.session = sessions.get(h); ctx.user = null;
  }
  on('GET', '/api/settings', { auth: true }, (ctx) => { const u = ctx.user; return { email: u.email, name: u.name, realName: u.realName, avatar: u.avatar, gender: u.gender, birthday: u.birthday, from: u.from, slug: u.slug, fb: u.fb, ig: u.ig, yt: u.yt, web: u.web, bio: u.bio, notify: u.notify, newsletter: u.newsletter }; });
  on('POST', '/api/settings', { auth: true, write: true }, (ctx) => {
    const u = ctx.user, b = ctx.body;
    const name = S.str(b.name, 20); if (!name) bad('請填名稱');
    const sl = S.slug(b.slug); if (!sl) bad('網址名稱：3～40 字小寫英數或 -'); if (D().users.some((x) => x.slug === sl && x.id !== u.id)) bad('這個網址名稱有人用了');
    Object.assign(u, { name, realName: S.str(b.realName, 40), avatar: S.mediaUrl(b.avatar), gender: ['', 'male', 'female', 'other'].includes(b.gender) ? b.gender : '', birthday: /^\d{4}-\d{2}-\d{2}$/.test(b.birthday || '') ? b.birthday : '', from: S.str(b.from, 30), slug: sl, fb: S.url(b.fb), ig: S.url(b.ig), yt: S.url(b.yt), web: S.url(b.web), bio: S.str(b.bio, 500, { multiline: true }), notify: S.bool(b.notify), newsletter: S.bool(b.newsletter) });
    db.save(); return { ok: true };
  });
  on('POST', '/api/settings/password', { auth: true, write: true, rate: ['pw', 10, 600_000] }, (ctx) => {
    const u = ctx.user;
    // 練習帳號（@demo.local）大家共用、密碼寫在 README：不准改密碼，不然一個人改掉，全部同事都登不進去
    if (/@demo\.local$/.test(u.email)) bad('測試帳號不能改密碼');
    if (!S.checkPassword(ctx.body.old, u.pass)) bad('舊密碼不對');
    if (!S.passwordOk(ctx.body.password)) bad('新密碼 8～64 字，要有英文和數字');
    u.pass = S.hashPassword(ctx.body.password);
    for (const [h, s] of sessions) if (s.userId === u.id && h !== ctx.sidHash) sessions.delete(h);   // 其他裝置登出
    D().sessions = D().sessions.filter((s) => s.userId !== u.id || s.hash === ctx.sidHash); db.save();
    return { ok: true };
  });

  // ---------- 首頁、探索 ----------
  on('GET', '/api/home', {}, () => {
    const pub = D().projects.filter(isPublic);
    const live = pub.filter((p) => p.status === 'live');
    const byType = (t) => live.filter((p) => p.type === t).map(card);
    const ups = D().updates.filter((x) => x.status === 'published' && !x.private).sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 4).map((x) => { const p = db.byId('projects', x.projectId); return p && isPublic(p) ? { id: x.id, title: x.title, project: p.title, slug: p.slug, at: x.publishedAt } : null; }).filter(Boolean);
    return { featured: live.filter((p) => p.featured).map(card), crowd: byType('crowd'), preorder: byType('preorder'), subscription: byType('subscription'), coop: byType('coop'), updates: ups,
      success: pub.filter((p) => p.status === 'success').sort((a, b) => b.endAt - a.endAt).slice(0, 6).map(card), picks: pub.filter((p) => p.staffPick).map(card), categories: settings().categories || R.CATEGORIES };
  });
  on('GET', '/api/projects', {}, (ctx) => {
    const q = ctx.query, kw = S.str(q.q, 40).toLowerCase(), type = S.str(q.type, 20), cat = S.str(q.category, 20), status = S.str(q.status, 20), sort = S.str(q.sort, 20);
    let list = D().projects.filter(isPublic);
    if (kw) list = list.filter((p) => (p.title + p.description).toLowerCase().includes(kw));
    if (type && R.PROJECT_TYPES[type]) list = list.filter((p) => p.type === type);
    if (cat) list = list.filter((p) => p.category === cat);
    if (status === 'live' || status === 'success' || status === 'failed') list = list.filter((p) => p.status === status);
    const cards = list.map(card);
    if (sort === 'raised') cards.sort((a, b) => b.raised - a.raised); else if (sort === 'ending') cards.sort((a, b) => (a.endAt || 9e15) - (b.endAt || 9e15)); else if (sort === 'percent') cards.sort((a, b) => b.percent - a.percent); else cards.sort((a, b) => b.startAt - a.startAt);
    const page = S.int(q.page, 1, 999, 1), per = 12;
    return { total: cards.length, page, per, list: cards.slice((page - 1) * per, page * per) };
  });
  /** 計畫頁（前台）：草稿／審核中只有團隊和平台人員看得到（預覽） */
  on('GET', '/api/p/:slug', {}, (ctx) => {
    const p = D().projects.find((x) => x.slug === ctx.params.slug);
    if (!p || (!isPublic(p) && !can(ctx.user, p, 'viewer'))) nope();
    const orders = ordersOf(p.id), code = S.str(ctx.query.code, 30);
    const opts = R.sortOptions(optionsOf(p.id), p.optionOrder);
    const u = ctx.user, backed = !!u && orders.some((o) => o.userId === u.id && (o.status === 'paid'));
    const owner = db.byId('users', p.ownerId);
    const comments = D().comments.filter((c) => c.projectId === p.id && !c.hidden).map((c) => { const cu = db.byId('users', c.userId); return { id: c.id, parentId: c.parentId, body: c.body, at: c.createdAt, name: cu ? cu.name : '已刪除', isCreator: cu && cu.id === p.ownerId, backer: !!cu && orders.some((o) => o.userId === cu.id && o.status === 'paid') }; });
    const updates = D().updates.filter((x) => x.projectId === p.id && x.status === 'published').sort((a, b) => b.publishedAt - a.publishedAt).map((x) => {
      const allowed = !x.private || can(u, p, 'viewer') || (backed && (!x.audience.length || orders.some((o) => o.userId === u.id && o.status === 'paid' && o.items.some((it) => x.audience.includes(it.optionId)))));
      return { id: x.id, title: x.title, category: x.category, cover: x.cover, at: x.publishedAt, private: x.private, content: allowed ? x.content : '', locked: !allowed };
    });
    const backerList = R.countedOrders(orders).sort((a, b) => b.paidAt - a.paidAt).slice(0, 100).map((o) => { const bu = db.byId('users', o.userId); return { name: R.maskName(bu ? bu.name : ''), at: o.paidAt, amount: o.total }; });
    return { ...card(p), content: p.content, video: p.video, contact: p.contact, risk: p.risk, returns: p.returns, afteeNote: p.afteeNote, ageLimit: p.ageLimit, origin: p.origin, invoiceFormat: p.invoiceFormat, paymentMethods: p.paymentMethods, ga: p.ga, pixel: p.pixel,
      ownerId: p.ownerId, ownerSlug: owner ? owner.slug : '', ownerBio: owner ? owner.bio : '', preview: !isPublic(p),
      options: R.visibleOptions(opts, code).map((o) => optView(o, orders)), addons: opts.filter((o) => o.addonOnly).map((o) => optView(o, orders)), hasHidden: opts.some((o) => o.code && !o.addonOnly), codeOk: !!code && opts.some((o) => o.code === code),
      faqs: D().faqs.filter((f) => f.projectId === p.id).sort((a, b) => a.priority - b.priority).map((f) => ({ id: f.id, q: f.q, a: f.a })),
      comments, updates, backerList, following: !!u && D().follows.some((f) => f.userId === u.id && f.projectId === p.id), canManage: can(u, p, 'viewer'), backed, monthly: p.type === 'subscription' ? monthlyOf(p) : 0 };
  });
  on('POST', '/api/p/:slug/follow', { auth: true, write: true }, (ctx) => {
    const p = D().projects.find((x) => x.slug === ctx.params.slug && isPublic(x)); if (!p) nope();
    const f = D().follows.find((x) => x.userId === ctx.user.id && x.projectId === p.id);
    if (f) db.remove('follows', (x) => x === f); else db.insert('follows', { userId: ctx.user.id, projectId: p.id }, now());
    return { following: !f };
  });
  on('POST', '/api/p/:slug/comments', { auth: true, write: true, rate: ['cmt', 20, 600_000] }, (ctx) => {
    const p = D().projects.find((x) => x.slug === ctx.params.slug && isPublic(x)); if (!p) nope();
    const body = S.str(ctx.body.body, 1000, { multiline: true }); if (!body) bad('請輸入留言');
    const parentId = S.int(ctx.body.parentId, 0, 1e9, 0);
    if (parentId && !D().comments.some((c) => c.id === parentId && c.projectId === p.id)) bad();
    db.insert('comments', { projectId: p.id, userId: ctx.user.id, body, parentId, hidden: false }, now());
    if (ctx.user.id !== p.ownerId) mail(p.ownerId, `新留言：${p.title}`, body, 'comment');
    return { ok: true };
  });
  on('POST', '/api/reports', { auth: true, write: true, rate: ['rpt', 10, 3_600_000] }, (ctx) => {
    const kind = ['project', 'comment'].includes(ctx.body.kind) ? ctx.body.kind : '', tid = S.int(ctx.body.targetId, 1, 1e9), reason = S.str(ctx.body.reason, 300, { multiline: true });
    if (!kind || !tid || !reason) bad('請填檢舉原因');
    if (!(kind === 'project' ? db.byId('projects', tid) : db.byId('comments', tid))) nope();
    db.insert('reports', { kind, targetId: tid, userId: ctx.user.id, reason, status: 'open', note: '' }, now());
    return { ok: true };
  });
  on('GET', '/api/users/:slug', {}, (ctx) => {
    const u = D().users.find((x) => x.slug === ctx.params.slug && !x.banned); if (!u) nope();
    const backedIds = new Set(D().orders.filter((o) => o.userId === u.id && o.status === 'paid').map((o) => o.projectId));
    return { name: u.name, avatar: u.avatar, bio: u.bio, from: u.from, fb: u.fb, ig: u.ig, yt: u.yt, web: u.web, since: u.createdAt,
      created: D().projects.filter((p) => p.ownerId === u.id && isPublic(p)).map(card), backed: D().projects.filter((p) => backedIds.has(p.id) && isPublic(p)).map(card) };
  });

  // ---------- 結帳 ----------
  /** 檢查並算一張訂單（下單、試算共用）；有問題丟錯誤 */
  function buildOrder(ctx, { quoteOnly = false } = {}) {
    const b = ctx.body;
    const p = D().projects.find((x) => x.slug === S.str(b.slug, 40));
    if (!p) nope();
    const t = now();
    if (p.status !== 'live' || t < p.startAt || (p.endAt && t >= p.endAt)) bad('這個計畫現在不能贊助');
    const orders = ordersOf(p.id), all = optionsOf(p.id), code = S.str(b.code, 30);
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 10) bad('請選擇回饋');
    const picked = [];
    for (const x of b.items) {
      const o = all.find((y) => y.id === S.int(x && x.optionId, 1, 1e9)), qty = S.int(x && x.qty, 1, 99);
      if (!o || !qty) bad('回饋選項不正確');
      if (o.code && o.code !== code) bad('這個回饋需要密碼');
      if (picked.some((y) => y.option.id === o.id)) bad('同一個回饋請改數量');
      const left = R.optionLeft(o, orders); if (left < qty) bad(`「${o.name}」剩下 ${left} 份`);
      picked.push({ option: o, qty });
    }
    if (!picked.some((x) => !x.option.addonOnly)) bad('加購選項要搭配一個主要回饋');
    if (p.type === 'subscription' && (picked.length !== 1 || picked[0].qty !== 1)) bad('訂閱專案一次訂一個方案');
    const opts = picked.map((x) => x.option);
    const region = Object.hasOwn(R.COUNTRIES, b.region) ? b.region : 'TW';
    const delivery = b.delivery === 'store' ? 'store' : 'home';
    let ship = R.shippingFee(opts, region); if (ship === null) bad(`回饋無法寄送到 ${R.COUNTRIES[region]}`);
    const bs = b.store && typeof b.store === 'object' ? b.store : {};   // 超商資料（沒給也不會出錯）
    if (delivery === 'store' && !R.storeAllowed(opts, S.str(bs.brand, 10), region)) bad('這個回饋不能用這家超商取貨');
    const bonus = S.int(b.bonus ?? 0, 0, 1_000_000); if (bonus === null) bad('加碼金額不正確');
    let discount = 0, coupon = null;
    const cc = S.str(b.coupon, 30).toUpperCase();
    if (cc) { coupon = D().coupons.find((c) => c.projectId === p.id && c.code.toUpperCase() === cc); const err = R.couponCheck(coupon, opts, t); if (err) bad(err); discount = coupon.amount; }
    const amt = R.orderAmount(picked, { bonus, discount, ship });
    if (amt.total <= 0) bad('金額要大於 0');
    if (quoteOnly) return { p, amt };
    // ---- 付款方式 ----
    const pay = Object.hasOwn(R.PAY_METHODS, b.payMethod) ? b.payMethod : ''; if (!pay || !(p.paymentMethods || {})[pay]) bad('請選擇付款方式');
    if (pay === 'atm' && !opts.every((o) => o.atm)) bad('這個回饋不能用 ATM 轉帳');
    if (pay === 'atm' && p.type === 'subscription') bad('訂閱專案只能用信用卡');
    const inst = S.int(b.installments ?? 0, 0, 6, 0);
    if (inst && (pay !== 'credit' || ![3, 6].includes(inst) || !opts.every((o) => o.installment >= inst))) bad('這個回饋不能分這麼多期');
    // ---- 收件資料 ----
    const rc = b.recipient || {}, recipient = { name: S.str(rc.name, 30), phone: S.str(rc.phone, 20), email: S.email(rc.email), country: region, zip: S.str(rc.zip, 10), city: S.str(rc.city, 20), district: S.str(rc.district, 20), address: S.str(rc.address, 120) };
    if (!recipient.name || !/^[0-9+\-() ]{6,20}$/.test(recipient.phone) || !recipient.email) bad('請填收件人姓名、電話、Email');
    if (delivery === 'home' && !recipient.address) bad('請填寄送地址');
    const store = delivery === 'store' ? { brand: S.str(bs.brand, 10), id: S.str(bs.id, 20), name: S.str(bs.name, 40) } : null;
    if (store && (!store.id || !store.name)) bad('請填取貨門市');
    // ---- 回饋調查、備註 ----
    const survey = [];
    for (const o of opts) for (const [i, qn] of (o.survey || []).entries()) {
      const a = S.str(b.survey && b.survey[`${o.id}_${i}`], 300);
      if (qn.required && !a) bad(`請回答「${qn.q}」`);
      if (qn.type === 'choice' && a && !qn.choices.includes(a)) bad(`「${qn.q}」的選項不正確`);
      survey.push({ optionId: o.id, q: qn.q, a });
    }
    const note = S.str(b.note, 500, { multiline: true });
    if (opts.some((o) => o.noteRequired) && !note) bad('請填寫備註');
    // ---- 發票 ----
    let invoice = { type: 'none' };
    if (p.invoiceFormat === 'cloud') {
      const iv = b.invoice || {}, it = ['member', 'mobile', 'donate', 'company'].includes(iv.type) ? iv.type : 'member';
      invoice = { type: it, carrier: S.str(iv.carrier, 20), ubn: S.str(iv.ubn, 8), title: S.str(iv.title, 60), donate: S.str(iv.donate, 7) };
      if (it === 'mobile' && !/^\/[0-9A-Z.+-]{7}$/.test(invoice.carrier)) bad('手機條碼格式：/ 加 7 碼');
      if (it === 'company' && (!/^\d{8}$/.test(invoice.ubn) || !invoice.title)) bad('請填統一編號（8 碼）和公司抬頭');
      if (it === 'donate' && !/^\d{3,7}$/.test(invoice.donate)) bad('捐贈碼 3～7 碼數字');
    } else if (p.invoiceFormat === 'paper') invoice = { type: 'paper', title: S.str((b.invoice || {}).title, 60), ubn: S.str((b.invoice || {}).ubn, 8) };
    // ---- 年齡、自然人上限 ----
    if (p.ageLimit === 18 && b.age18 !== true) bad('請確認你已年滿 18 歲');
    const bp = D().businessProfiles.find((x) => x.projectId === p.id);
    if (bp && bp.kind === 'person') { const own = D().orders.filter((o) => o.status === 'paid' && D().projects.some((q) => q.id === o.projectId && q.ownerId === p.ownerId)); if (!R.personLimitOk(own, amt.total, t, settings())) bad('提案人（自然人）30 天集資金額已達上限，暫時不能贊助'); }
    const ref = S.str(b.referrer, 20).toLowerCase(), refOk = ref && D().referrers.some((r) => r.projectId === p.id && r.code === ref) ? ref : '';
    return { p, picked, amt, pay, inst, region, delivery, recipient, store, survey, note, invoice, coupon, refOk };
  }
  on('POST', '/api/checkout/quote', { write: true }, (ctx) => { const { amt } = buildOrder(ctx, { quoteOnly: true }); return amt; });
  /** 進到結帳頁就記一筆「開始結帳」（EDM 再行銷用；買了就標成已轉換） */
  on('POST', '/api/checkout/start', { auth: true, write: true, rate: ['chk', 60, 600_000] }, (ctx) => {
    const p = D().projects.find((x) => x.slug === S.str(ctx.body.slug, 40) && x.status === 'live'); if (!p) nope();
    if (!D().checkouts.some((c) => c.userId === ctx.user.id && c.projectId === p.id && !c.converted)) db.insert('checkouts', { userId: ctx.user.id, projectId: p.id, at: now(), converted: false, remindedAt: 0 }, now());
    return { ok: true };
  });
  on('POST', '/api/orders', { auth: true, write: true, rate: ['order', 30, 600_000] }, (ctx) => {
    const o = buildOrder(ctx), t = now();
    const row = db.insert('orders', { token: token(), projectId: o.p.id, userId: ctx.user.id, items: o.picked.map((x) => ({ optionId: x.option.id, name: x.option.name, price: x.option.price, qty: x.qty, addon: !!x.option.addonOnly })),
      bonus: o.amt.bonus, coupon: o.coupon ? o.coupon.code : '', discount: o.amt.discount, region: o.region, delivery: o.delivery, shippingFee: o.amt.shipping, total: o.amt.total,
      payMethod: o.pay, installments: o.inst, status: 'pending', atmAccount: '', atmDeadline: 0, recipient: o.recipient, store: o.store, survey: o.survey, note: o.note, invoice: o.invoice, referrer: o.refOk, paidAt: 0, shipped: null,
      sub: o.p.type === 'subscription' ? { active: false, period: 0, nextAt: 0 } : null }, t);
    if (o.pay === 'atm') { row.atmAccount = '9910' + String(row.id).padStart(10, '0'); row.atmDeadline = R.atmDeadline(t); mail(ctx.user.id, `訂單 ${row.token} 待付款`, `請於 ${new Date(row.atmDeadline + R.TW_OFFSET).toISOString().slice(0, 16).replace('T', ' ')} 前轉帳 NT$ ${row.total.toLocaleString()} 到虛擬帳號 ${row.atmAccount}。`, 'order'); }
    for (const c of D().checkouts) if (c.userId === ctx.user.id && c.projectId === o.p.id) c.converted = true;
    db.save();
    return { token: row.token, payMethod: o.pay, total: row.total, atmAccount: row.atmAccount, atmDeadline: row.atmDeadline };
  });
  /** 標記付款成功（模擬金流回傳） */
  function markPaid(o, actor) {
    if (o.status !== 'pending') return false;
    o.status = 'paid'; o.paidAt = now();
    if (o.sub) { o.sub.active = true; o.sub.period = 1; o.sub.nextAt = o.paidAt + 30 * R.DAY; }
    const p = db.byId('projects', o.projectId), opt = o.items.map((it) => db.byId('options', it.optionId)).find((x) => x && x.noteToBacker);
    mail(o.userId, `贊助成功：${p ? p.title : ''}`, `訂單 ${o.token}，金額 NT$ ${o.total.toLocaleString()}。${opt ? '\n\n提案人的話：' + opt.noteToBacker : ''}`, 'order');
    audit(actor, 'order_paid', o.token, `${o.payMethod} ${o.total}`);
    db.save(); return true;
  }
  /** 信用卡／AFTEE 付款（模擬）：卡號末四碼 0002 會被拒（練習付款失敗的情境） */
  on('POST', '/api/orders/:token/pay', { auth: true, write: true, rate: ['pay', 30, 600_000] }, (ctx) => {
    // 正式模式：還沒串真的金流，一律不收款（不然信眾會以為已經付成功）
    if (!demo) bad('線上付款尚未開放，不會扣款；開放後會通知你');
    const o = D().orders.find((x) => x.token === ctx.params.token && x.userId === ctx.user.id); if (!o) nope();
    if (o.status !== 'pending' || o.payMethod === 'atm') bad('這張訂單不能用這個方式付款');
    const last4 = S.str(ctx.body.last4, 4);
    if (o.payMethod === 'credit' && !/^\d{4}$/.test(last4)) bad('請輸入卡號末四碼');
    if (last4 === '0002') { audit(ctx.user, 'pay_declined', o.token, '測試卡號拒絕'); bad('付款失敗：發卡銀行拒絕交易'); }
    markPaid(o, ctx.user); return { ok: true };
  });
  /** ATM 模擬轉帳（練習用：贊助人自己按「我已轉帳」就算付了） */
  on('POST', '/api/orders/:token/atm-paid', { auth: true, write: true }, (ctx) => {
    if (!demo) bad('線上付款尚未開放，不會扣款；開放後會通知你');
    const o = D().orders.find((x) => x.token === ctx.params.token && (x.userId === ctx.user.id || isStaff(ctx.user))); if (!o) nope();
    if (o.status !== 'pending' || o.payMethod !== 'atm') bad('這張訂單不是待付款的 ATM 訂單');
    if (now() > o.atmDeadline) bad('已超過繳費期限');
    markPaid(o, ctx.user); return { ok: true };
  });

  // ---------- 我的贊助紀錄 ----------
  /** 訂單給贊助人自己看的樣子 */
  function myOrderView(o) {
    const p = db.byId('projects', o.projectId), refund = D().refunds.filter((r) => r.orderId === o.id).pop();
    return { token: o.token, project: p ? { title: p.title, slug: p.slug, status: p.status, type: p.type, endAt: p.endAt } : null, items: o.items, bonus: o.bonus, coupon: o.coupon, discount: o.discount, shippingFee: o.shippingFee, total: o.total, payMethod: o.payMethod, installments: o.installments,
      status: o.status, statusName: R.ORDER_STATUS[o.status], atmAccount: o.atmAccount, atmDeadline: o.atmDeadline, recipient: o.recipient, delivery: o.delivery, store: o.store, survey: o.survey, note: o.note, invoice: o.invoice, createdAt: o.createdAt, paidAt: o.paidAt, shipped: o.shipped, sub: o.sub, period: o.period || 0, refundFee: o.refundFee || 0,
      refund: refund ? { status: refund.status, statusName: R.REFUND_STATUS[refund.status], note: refund.note, reason: refund.reason } : null,
      canCancel: !!p && p.status === 'live' && (o.status === 'pending' || o.status === 'paid') && !o.subOf,
      canEdit: !!p && p.status === 'live' && (o.status === 'pending' || o.status === 'paid'),
      canRefund: !!p && p.status !== 'live' && o.status === 'paid' && (!refund || refund.status === 'rejected') };
  }
  on('GET', '/api/my/orders', { auth: true }, (ctx) => D().orders.filter((o) => o.userId === ctx.user.id).sort((a, b) => b.createdAt - a.createdAt).map(myOrderView));
  on('POST', '/api/my/orders/:token/cancel', { auth: true, write: true }, (ctx) => {
    const o = D().orders.find((x) => x.token === ctx.params.token && x.userId === ctx.user.id); if (!o) nope();
    const v = myOrderView(o); if (!v.canCancel) bad('這張訂單現在不能取消');
    if (o.status === 'pending') { o.status = 'cancelled'; db.save(); } else refundOrder(o, ctx.user, '贊助人在募資期間取消');
    return { ok: true };
  });
  on('POST', '/api/my/orders/:token/edit', { auth: true, write: true }, (ctx) => {
    const o = D().orders.find((x) => x.token === ctx.params.token && x.userId === ctx.user.id); if (!o) nope();
    if (!myOrderView(o).canEdit) bad('募資結束後不能修改');
    const rc = ctx.body.recipient || {};
    if (rc.name !== undefined) { const r2 = { ...o.recipient, name: S.str(rc.name, 30), phone: S.str(rc.phone, 20), zip: S.str(rc.zip, 10), city: S.str(rc.city, 20), district: S.str(rc.district, 20), address: S.str(rc.address, 120) }; if (!r2.name || !/^[0-9+\-() ]{6,20}$/.test(r2.phone)) bad('請填收件人姓名、電話'); o.recipient = r2; }
    if (Array.isArray(ctx.body.survey)) o.survey = o.survey.map((s, i) => ({ ...s, a: ctx.body.survey[i] !== undefined ? S.str(ctx.body.survey[i], 300) : s.a }));
    if (ctx.body.note !== undefined) o.note = S.str(ctx.body.note, 500, { multiline: true });
    db.save(); return { ok: true };
  });
  on('POST', '/api/my/orders/:token/refund', { auth: true, write: true, rate: ['rf', 10, 3_600_000] }, (ctx) => {
    const o = D().orders.find((x) => x.token === ctx.params.token && x.userId === ctx.user.id); if (!o) nope();
    if (!myOrderView(o).canRefund) bad('這張訂單現在不能申請退款');
    const reason = S.str(ctx.body.reason, 500, { multiline: true }); if (!reason) bad('請填退款原因');
    db.insert('refunds', { token: token(), orderId: o.id, reason, status: 'pending', note: '' }, now());
    const p = db.byId('projects', o.projectId); if (p) mail(p.ownerId, `退款申請：訂單 ${o.token}`, reason, 'refund');
    return { ok: true };
  });
  on('POST', '/api/my/orders/:token/unsubscribe', { auth: true, write: true }, (ctx) => {
    const o = D().orders.find((x) => x.token === ctx.params.token && x.userId === ctx.user.id && x.sub); if (!o) nope();
    o.sub.active = false; db.save(); mail(o.userId, '已取消訂閱', '下個月起不再扣款。', 'order'); return { ok: true };
  });
  on('GET', '/api/my/following', { auth: true }, (ctx) => D().follows.filter((f) => f.userId === ctx.user.id).map((f) => db.byId('projects', f.projectId)).filter((p) => p && isPublic(p)).map(card));
  // 提案紀錄：自己提的＋所屬團隊的（平台人員不會因為身分就看到全部，要到 admin 後台看）
  on('GET', '/api/my/projects', { auth: true }, (ctx) => D().projects.filter((p) => p.ownerId === ctx.user.id || D().memberships.some((m) => m.ownerId === p.ownerId && m.userId === ctx.user.id && m.status === 'active')).map((p) => ({ ...card(p), role: teamRole(ctx.user, p), step: R.currentStep(p.steps) })));
  on('GET', '/api/my/emails', { auth: true }, (ctx) => D().emails.filter((e) => e.userId === ctx.user.id).slice(-100).reverse());

  // ---------- 站內訊息 ----------
  on('GET', '/api/inbox', { auth: true }, (ctx) => {
    const me = ctx.user.id, threads = new Map();
    for (const m of D().messages) {
      if (m.fromId !== me && m.toId !== me) continue;
      const other = m.fromId === me ? m.toId : m.fromId, k = `${other}`;
      const t = threads.get(k) || { userId: other, last: null, unread: 0 };
      if (!t.last || m.createdAt > t.last.createdAt) t.last = m;
      if (m.toId === me && !m.read) t.unread++;
      threads.set(k, t);
    }
    return [...threads.values()].sort((a, b) => b.last.createdAt - a.last.createdAt).map((t) => { const u = db.byId('users', t.userId); return { userId: t.userId, name: u ? u.name : '已刪除', last: t.last.body.slice(0, 60), at: t.last.createdAt, unread: t.unread }; });
  });
  on('GET', '/api/inbox/:uid', { auth: true }, (ctx) => {
    const me = ctx.user.id, other = S.int(ctx.params.uid, 1, 1e9); if (!other) nope();
    const list = D().messages.filter((m) => (m.fromId === me && m.toId === other) || (m.fromId === other && m.toId === me)).sort((a, b) => a.createdAt - b.createdAt);
    let ch = false; for (const m of list) if (m.toId === me && !m.read) { m.read = true; ch = true; } if (ch) db.save();
    const u = db.byId('users', other);
    return { name: u ? u.name : '已刪除', list: list.map((m) => ({ mine: m.fromId === me, body: m.body, at: m.createdAt, project: m.projectId ? (db.byId('projects', m.projectId) || {}).title || '' : '' })) };
  });
  on('POST', '/api/inbox', { auth: true, write: true, rate: ['msg', 30, 600_000] }, (ctx) => {
    let to = S.int(ctx.body.toId, 1, 1e9), pid = 0;
    if (ctx.body.slug) { const p = D().projects.find((x) => x.slug === S.str(ctx.body.slug, 40)); if (!p) nope(); to = p.ownerId; pid = p.id; }
    else if (ctx.body.toSlug) { const u2 = D().users.find((x) => x.slug === S.str(ctx.body.toSlug, 40) && !x.banned); if (!u2) nope(); to = u2.id; }
    const u = to ? db.byId('users', to) : null; if (!u || u.id === ctx.user.id) bad('收件人不正確');
    const body = S.str(ctx.body.body, 2000, { multiline: true }); if (!body) bad('請輸入內容');
    db.insert('messages', { fromId: ctx.user.id, toId: u.id, projectId: pid, body, read: false }, now());
    if (u.notify) mail(u.id, `新的站內訊息：${ctx.user.name}`, body.slice(0, 200), 'message');
    return { ok: true, toId: u.id };
  });

  // ---------- 團隊 ----------
  on('GET', '/api/memberships', { auth: true }, (ctx) => {
    const me = ctx.user.id;
    return { members: D().memberships.filter((m) => m.ownerId === me).map((m) => ({ id: m.id, email: m.email, title: m.title, public: m.public, role: m.role, status: m.status, name: (db.byId('users', m.userId) || {}).name || '' })),
      teams: D().memberships.filter((m) => m.userId === me || (m.email === ctx.user.email && m.status === 'invited')).map((m) => ({ id: m.id, owner: (db.byId('users', m.ownerId) || {}).name || '', role: m.role, status: m.status, title: m.title })) };
  });
  on('POST', '/api/memberships', { auth: true, write: true, rate: ['team', 30, 3_600_000] }, (ctx) => {
    const b = ctx.body, me = ctx.user;
    if (b.action === 'invite') {
      const em = S.email(b.email); if (!em || em === me.email) bad('Email 不正確');
      if (!Object.hasOwn(R.TEAM_ROLES, b.role)) bad('請選角色');
      if (D().memberships.some((m) => m.ownerId === me.id && m.email === em)) bad('已經邀請過了');
      const u = D().users.find((x) => x.email === em);
      db.insert('memberships', { ownerId: me.id, email: em, userId: u ? u.id : 0, title: S.str(b.title, 20), public: S.bool(b.public), role: b.role, status: 'invited' }, now());
      if (u) mail(u.id, `${me.name} 邀請你加入團隊`, '到「團隊設定」接受邀請。', 'team');
      return { ok: true };
    }
    const m = db.byId('memberships', S.int(b.id, 1, 1e9)); if (!m) nope();
    if (b.action === 'accept' && m.status === 'invited' && (m.email === me.email || m.userId === me.id)) { m.userId = me.id; m.status = 'active'; db.save(); return { ok: true }; }
    if (b.action === 'leave' && m.userId === me.id) { db.remove('memberships', (x) => x === m); return { ok: true }; }
    if (m.ownerId !== me.id) nope();
    if (b.action === 'remove') { db.remove('memberships', (x) => x === m); return { ok: true }; }
    if (b.action === 'update') { if (b.role && Object.hasOwn(R.TEAM_ROLES, b.role)) m.role = b.role; m.title = S.str(b.title, 20); m.public = S.bool(b.public); db.save(); return { ok: true }; }
    bad();
  });

  // ---------- 上傳（圖片、GIF、影片；合約 PDF）----------
  on('POST', '/api/upload', { auth: true, write: true, raw: true, rate: ['up', 60, 3_600_000] }, (ctx) => {
    const f = S.parseMultipart(ctx.rawBody, ctx.req.headers['content-type']); if (!f || !f.data.length) bad('請選擇檔案');
    let kind = S.sniff(f.data);
    if (!kind && ctx.query.kind === 'contract' && f.data.slice(0, 5).toString('latin1') === '%PDF-') kind = { ext: 'pdf', mime: 'application/pdf', kind: 'pdf' };
    if (!kind) bad('只收 JPG、PNG、GIF、WebP 圖片，MP4、WebM 影片（合約可傳 PDF）');
    const max = kind.kind === 'video' ? 30 * 1024 * 1024 : 8 * 1024 * 1024;
    if (f.data.length > max) bad(kind.kind === 'video' ? '影片最大 30MB' : '檔案最大 8MB');
    const used = D().uploads.filter((x) => x.userId === ctx.user.id).reduce((s, x) => s + x.size, 0);
    if (used + f.data.length > 300 * 1024 * 1024) bad('你的上傳空間（300MB）用完了');
    // 放上網路後任何人都能註冊：全站上傳總量也要設上限（1GB），免得被開一堆帳號灌爆主機硬碟
    const total = D().uploads.reduce((s2, x) => s2 + x.size, 0);
    if (total + f.data.length > 1024 * 1024 * 1024) bad('平台的上傳空間滿了，請聯絡管理員');
    const name = crypto.randomBytes(16).toString('hex') + '.' + kind.ext;
    fs.writeFileSync(path.join(uploadDir, name), f.data, { mode: 0o600 });
    db.insert('uploads', { userId: ctx.user.id, name, size: f.data.length, mime: kind.mime }, now());
    return { url: '/uploads/' + name, type: kind.kind };
  });

  // =============================================================
  // 發起計畫、提案者後台
  // =============================================================
  on('POST', '/api/start', { auth: true, write: true, rate: ['start', 10, 3_600_000] }, (ctx) => {
    const type = Object.hasOwn(R.PROJECT_TYPES, ctx.body.type) ? ctx.body.type : ''; if (!type) bad('請選提案類別');
    const t = now(); let sl = 'project-' + token(6).toLowerCase();
    const p = db.insert('projects', { ownerId: ctx.user.id, managerId: 0, type, slug: sl, title: S.str(ctx.body.title, 60) || '未命名計畫', description: '', content: '', cover: '', video: '', goal: type === 'subscription' ? 0 : 100000, startAt: t + 14 * R.DAY, endAt: type === 'subscription' ? 0 : t + 59 * R.DAY,
      category: (settings().categories || R.CATEGORIES)[0], ageLimit: 0, origin: 'none', contact: '', risk: '', returns: '', afteeNote: '', ga: '', pixel: '', gCat: '', invoiceFormat: 'none', bsmi: '', ncc: '', optionOrder: 'custom', featured: false, staffPick: false, status: 'draft',
      steps: { biz: 'todo', plan: 'todo', contract: 'todo', gateway: 'todo', ready: 'todo' }, stepNotes: {}, paymentMethods: { credit: true, atm: true, aftee: false }, abandon: { subject: '', preheader: '', title: '', subtitle: '', cta: '', features: ['', '', ''], enabled: false, couponId: 0 } }, t);
    audit(ctx.user, 'project_create', p.id, p.title);
    return { id: p.id };
  });
  /** 控制中心 */
  on('GET', '/api/c/:pid', { auth: true }, (ctx) => {
    const p = myProject(ctx), orders = ordersOf(p.id), st = R.projectStats(orders);
    const recent = R.countedOrders(orders).sort((a, b) => b.paidAt - a.paidAt).slice(0, 5).map((o) => ({ name: (db.byId('users', o.userId) || {}).name || '', amount: o.total, at: o.paidAt }));
    const comments = D().comments.filter((c) => c.projectId === p.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 5).map((c) => ({ name: (db.byId('users', c.userId) || {}).name || '', body: c.body, at: c.createdAt }));
    const optCount = optionsOf(p.id).length;
    return { project: { ...p, typeName: R.PROJECT_TYPES[p.type], statusName: R.PROJECT_STATUS[p.status] }, role: teamRole(ctx.user, p), stats: st, percent: R.percentOf(st.raised, p.goal), left: p.type === 'subscription' ? '長期訂閱' : R.timeLeft(p.endAt, now()), recent, comments,
      steps: R.REVIEW_STEPS.map((s) => ({ ...s, state: p.steps[s.key], stateName: R.STEP_STATES[p.steps[s.key]], note: (p.stepNotes || {})[s.key] || '' })), timeLocked: R.timeLocked(p.steps), ready: { options: optCount > 0, content: !!p.content && !!p.title && !!p.description, schedule: !R.checkSchedule(p, settings()) },
      manager: (db.byId('users', p.managerId) || {}).name || '', monthly: p.type === 'subscription' ? monthlyOf(p) : 0 };
  });
  on('POST', '/api/c/:pid/project', { auth: true, write: true }, (ctx) => {
    const p = myProject(ctx, 'editor'), b = ctx.body, locked = R.timeLocked(p.steps);
    const next = { title: S.str(b.title, 60), description: S.str(b.description, 200, { multiline: true }), content: S.str(b.content, 60000, { multiline: true }), cover: S.mediaUrl(b.cover), video: S.url(b.video),
      category: (settings().categories || R.CATEGORIES).includes(b.category) ? b.category : p.category, ageLimit: b.ageLimit === 18 || b.ageLimit === '18' ? 18 : 0, origin: Object.hasOwn(R.ORIGINS, b.origin) ? b.origin : 'none',
      contact: S.str(b.contact, 500, { multiline: true }), risk: S.str(b.risk, 3000, { multiline: true }), returns: S.str(b.returns, 3000, { multiline: true }), afteeNote: S.str(b.afteeNote, 1000, { multiline: true }),
      ga: /^(G|UA)-[A-Z0-9-]{4,20}$/.test(S.str(b.ga, 30)) ? S.str(b.ga, 30) : '', pixel: /^\d{10,20}$/.test(S.str(b.pixel, 20)) ? S.str(b.pixel, 20) : '', gCat: S.str(b.gCat, 80), invoiceFormat: Object.hasOwn(R.INVOICE_FORMATS, b.invoiceFormat) ? b.invoiceFormat : 'none',
      bsmi: S.str(b.bsmi, 10), ncc: S.str(b.ncc, 14), optionOrder: ['custom', 'priceDesc', 'priceAsc'].includes(b.optionOrder) ? b.optionOrder : 'custom' };
    if (!next.title) bad('請填計畫名稱');
    if (next.bsmi && !/^[RDTMQ][A-Z0-9]{5}$/.test(next.bsmi)) bad('BSMI 字號：R、D、T、M、Q 加 5 個英數字');
    if (next.ncc && !/^[A-Z0-9]{14}$/.test(next.ncc)) bad('NCC 字號共 14 碼');
    // 目標、類型、網址、時間：方案與回饋審核通過後就鎖住（要改請找平台）
    if (!locked) {
      const sl = S.slug(b.slug); if (!sl) bad('專案網址：3～40 字小寫英數或 -'); if (D().projects.some((x) => x.slug === sl && x.id !== p.id)) bad('這個專案網址有人用了');
      next.slug = sl; next.type = Object.hasOwn(R.PROJECT_TYPES, b.type) ? b.type : p.type;
      next.goal = S.int(b.goal, next.type === 'subscription' ? 0 : 1000, 100_000_000); if (next.goal === null) bad('計畫目標：1,000～1 億');
      next.startAt = S.time(b.startAt); next.endAt = next.type === 'subscription' ? (S.time(b.endAt) || 0) : S.time(b.endAt);
      const err = R.checkSchedule({ ...p, ...next }, settings()); if (err) bad(err);
    } else if (['slug', 'goal', 'type', 'startAt', 'endAt'].some((k) => b[k] !== undefined && String(b[k]) !== String(p[k]) && !(k.endsWith('At') && S.time(b[k]) === p[k]))) bad('方案與回饋審核通過後，網址、目標、類型、時間已鎖定，要改請聯繫專案經理');
    Object.assign(p, next); audit(ctx.user, 'project_edit', p.id, p.title); db.save(); return { ok: true };
  });
  // FAQ
  on('GET', '/api/c/:pid/faqs', { auth: true }, (ctx) => { const p = myProject(ctx); return D().faqs.filter((f) => f.projectId === p.id).sort((a, b) => a.priority - b.priority); });
  on('POST', '/api/c/:pid/faqs', { auth: true, write: true }, (ctx) => {
    const p = myProject(ctx, 'editor'), b = ctx.body;
    if (b.action === 'reorder') { const ids = Array.isArray(b.ids) ? b.ids.map((x) => S.int(x, 1, 1e9)) : []; ids.forEach((id, i) => { const f = D().faqs.find((x) => x.id === id && x.projectId === p.id); if (f) f.priority = i + 1; }); db.save(); return { ok: true }; }
    if (b.action === 'delete') { db.remove('faqs', (f) => f.id === S.int(b.id, 1, 1e9) && f.projectId === p.id); return { ok: true }; }
    const q = S.str(b.q, 200), a = S.str(b.a, 3000, { multiline: true }); if (!q || !a) bad('請填問題和答案');
    if (b.id) { const f = D().faqs.find((x) => x.id === S.int(b.id, 1, 1e9) && x.projectId === p.id); if (!f) nope(); f.q = q; f.a = a; db.save(); }
    else db.insert('faqs', { projectId: p.id, q, a, priority: D().faqs.filter((f) => f.projectId === p.id).length + 1 }, now());
    return { ok: true };
  });
  // 回饋選項
  on('GET', '/api/c/:pid/options', { auth: true }, (ctx) => { const p = myProject(ctx), orders = ordersOf(p.id); return R.sortOptions(optionsOf(p.id), 'custom').map((o) => ({ ...o, taken: R.optionTaken(o.id, orders) })); });
  on('POST', '/api/c/:pid/options', { auth: true, write: true }, (ctx) => {
    const p = myProject(ctx, 'editor'), b = ctx.body;
    if (b.action === 'reorder') { const ids = Array.isArray(b.ids) ? b.ids.map((x) => S.int(x, 1, 1e9)) : []; ids.forEach((id, i) => { const o = D().options.find((x) => x.id === id && x.projectId === p.id); if (o) o.sort = i + 1; }); db.save(); return { ok: true }; }
    const ex = b.id ? D().options.find((x) => x.id === S.int(b.id, 1, 1e9) && x.projectId === p.id) : null;
    if (b.id && !ex) nope();
    const sold = ex ? R.optionTaken(ex.id, ordersOf(p.id)) : 0;
    if (b.action === 'delete') { if (sold) bad('已經有人贊助的回饋不能刪除'); db.remove('options', (o) => o === ex); return { ok: true }; }
    const name = S.str(b.name, 60); if (!name) bad('請填回饋方案名稱');
    const price = S.int(b.price, 1, 10_000_000); if (!price) bad('價格要大於 0');
    if (sold && price !== ex.price) bad('已經有人贊助，價格不能改');
    const limit = S.int(b.limit ?? 0, 0, 1_000_000, 0); if (sold && limit && limit < sold) bad(`限量不能少於已贊助的 ${sold} 份`);
    const media = (Array.isArray(b.media) ? b.media : []).slice(0, 8).map((m) => ({ url: S.mediaUrl(m && m.url), type: m && m.type === 'video' ? 'video' : 'image' })).filter((m) => m.url);
    // 回饋調查最多 20 題（真實的福興宮方案有 15 題，10 題不夠）
    const survey = (Array.isArray(b.survey) ? b.survey : []).slice(0, 20).map((s) => ({ q: S.str(s && s.q, 100), type: s && s.type === 'choice' ? 'choice' : 'text', required: S.bool(s && s.required), choices: (Array.isArray(s && s.choices) ? s.choices : []).slice(0, 20).map((c) => S.str(c, 40)).filter(Boolean) })).filter((s) => s.q && (s.type === 'text' || s.choices.length >= 2));
    const shipping = {}; for (const k of Object.keys(R.COUNTRIES)) { const v = b.shipping && b.shipping[k]; shipping[k] = v === '' || v === null || v === undefined ? '' : S.int(Number(v), 0, 100000, ''); }
    const row = { name, seoName: S.str(b.seoName, 80), price, retail: S.int(b.retail ?? 0, 0, 10_000_000, 0), limit, addonOnly: S.bool(b.addonOnly), atm: S.bool(b.atm), installment: [0, 3, 6].includes(Number(b.installment)) ? Number(b.installment) : 0, coupon: S.bool(b.coupon),
      media, seoImage: S.mediaUrl(b.seoImage), description: S.str(b.description, 3000, { multiline: true }), shipMonth: /^\d{4}-\d{2}$/.test(b.shipMonth || '') ? b.shipMonth : '', hasNote: S.bool(b.hasNote), noteRequired: S.bool(b.noteRequired) && S.bool(b.hasNote),
      code: S.str(b.code, 30), survey, shipping, stores: (Array.isArray(b.stores) ? b.stores : []).filter((s) => Object.hasOwn(R.STORES, s)), noteToBacker: S.str(b.noteToBacker, 2000, { multiline: true }) };
    if (ex) Object.assign(ex, row); else db.insert('options', { projectId: p.id, sort: optionsOf(p.id).length + 1, ...row }, now());
    audit(ctx.user, ex ? 'option_edit' : 'option_create', p.id, name); db.save(); return { ok: true };
  });
  // 折扣碼
  on('GET', '/api/c/:pid/coupons', { auth: true }, (ctx) => { const p = myProject(ctx); return D().coupons.filter((c) => c.projectId === p.id).map((c) => ({ ...c, used: D().orders.filter((o) => o.projectId === p.id && o.status === 'paid' && o.coupon.toUpperCase() === c.code.toUpperCase()).length })); });
  on('POST', '/api/c/:pid/coupons', { auth: true, write: true }, (ctx) => {
    const p = myProject(ctx, 'editor'), b = ctx.body;
    if (b.action === 'delete') { db.remove('coupons', (c) => c.id === S.int(b.id, 1, 1e9) && c.projectId === p.id); return { ok: true }; }
    const code = S.str(b.code, 30).toUpperCase(); if (!/^[A-Z0-9_-]{3,30}$/.test(code)) bad('折扣碼：3～30 字英數');
    if (D().coupons.some((c) => c.projectId === p.id && c.code.toUpperCase() === code)) bad('這個折扣碼已經有了');
    const amount = S.int(b.amount, 1, 1_000_000); if (!amount) bad('請填折扣金額');
    const from = S.time(b.from) || 0, until = S.time(b.until) || 0; if (from && until && until <= from) bad('結束時間要在開始之後');
    db.insert('coupons', { projectId: p.id, code, amount, from, until, note: S.str(b.note, 100), promotional: S.bool(b.promotional) }, now()); return { ok: true };
  });
  // 推薦連結
  on('GET', '/api/c/:pid/referrers', { auth: true }, (ctx) => {
    const p = myProject(ctx), paid = R.countedOrders(ordersOf(p.id));
    return D().referrers.filter((r) => r.projectId === p.id).map((r) => { const os = paid.filter((o) => o.referrer === r.code); return { ...r, orders: os.length, amount: os.reduce((s, o) => s + o.total, 0) }; });
  });
  on('POST', '/api/c/:pid/referrers', { auth: true, write: true }, (ctx) => {
    const p = myProject(ctx, 'editor'), b = ctx.body;
    if (b.action === 'delete') { db.remove('referrers', (r) => r.id === S.int(b.id, 1, 1e9) && r.projectId === p.id); return { ok: true }; }
    const name = S.str(b.name, 40); if (!name) bad('請填推播名稱');
    if (b.id) { const r = D().referrers.find((x) => x.id === S.int(b.id, 1, 1e9) && x.projectId === p.id); if (!r) nope(); Object.assign(r, { name, partner: S.str(b.partner, 40), audience: S.int(b.audience ?? 0, 0, 1e9, 0) }); db.save(); return { ok: true }; }
    db.insert('referrers', { projectId: p.id, code: crypto.randomBytes(5).toString('hex'), name, partner: S.str(b.partner, 40), audience: S.int(b.audience ?? 0, 0, 1e9, 0) }, now()); return { ok: true };
  });
  // EDM 再行銷
  on('GET', '/api/c/:pid/abandon', { auth: true }, (ctx) => { const p = myProject(ctx); const cs = D().checkouts.filter((c) => c.projectId === p.id); return { ...p.abandon, coupons: D().coupons.filter((c) => c.projectId === p.id && c.promotional).map((c) => ({ id: c.id, code: c.code, amount: c.amount })), stats: { started: cs.length, converted: cs.filter((c) => c.converted).length, reminded: cs.filter((c) => c.remindedAt).length } }; });
  on('POST', '/api/c/:pid/abandon', { auth: true, write: true }, (ctx) => {
    const p = myProject(ctx, 'editor'), b = ctx.body;
    const cid = S.int(b.couponId ?? 0, 0, 1e9, 0); if (cid && !D().coupons.some((c) => c.id === cid && c.projectId === p.id && c.promotional)) bad('折扣碼要勾選「可用於未結帳 EDM」');
    p.abandon = { subject: S.str(b.subject, 60), preheader: S.str(b.preheader, 80), title: S.str(b.title, 30), subtitle: S.str(b.subtitle, 25), cta: S.str(b.cta, 8), features: (Array.isArray(b.features) ? b.features : []).slice(0, 3).map((f) => S.str(f, 40)), enabled: S.bool(b.enabled), couponId: cid };
    if (p.abandon.enabled && (!p.abandon.subject || !p.abandon.title)) bad('開啟自動寄送前，請填信件標題和主標題');
    db.save(); return { ok: true };
  });
  // 計畫更新
  on('GET', '/api/c/:pid/updates', { auth: true }, (ctx) => { const p = myProject(ctx); return D().updates.filter((u) => u.projectId === p.id).sort((a, b) => b.createdAt - a.createdAt); });
  on('POST', '/api/c/:pid/updates', { auth: true, write: true }, (ctx) => {
    const p = myProject(ctx, 'editor'), b = ctx.body;
    if (b.action === 'delete') { db.remove('updates', (u) => u.id === S.int(b.id, 1, 1e9) && u.projectId === p.id); return { ok: true }; }
    const title = S.str(b.title, 80), content = S.str(b.content, 30000, { multiline: true }); if (!title || !content) bad('請填標題和內容');
    const status = b.status === 'published' ? 'published' : 'draft';
    const optIds = new Set(optionsOf(p.id).map((o) => o.id));
    const row = { title, content, category: R.UPDATE_CATEGORIES.includes(b.category) ? b.category : '其他', cover: S.mediaUrl(b.cover), notify: S.bool(b.notify), private: S.bool(b.private), audience: (Array.isArray(b.audience) ? b.audience : []).map((x) => S.int(x, 1, 1e9)).filter((x) => optIds.has(x)), status };
    let u = b.id ? D().updates.find((x) => x.id === S.int(b.id, 1, 1e9) && x.projectId === p.id) : null; if (b.id && !u) nope();
    const wasPub = u && u.status === 'published';
    if (u) Object.assign(u, row); else u = db.insert('updates', { projectId: p.id, publishedAt: 0, ...row }, now());
    if (status === 'published' && !wasPub) {
      u.publishedAt = now();
      if (u.notify) {
        const paid = R.countedOrders(ordersOf(p.id)), to = new Set();
        for (const o of paid) if (!u.private || !u.audience.length || o.items.some((it) => u.audience.includes(it.optionId))) to.add(o.userId);
        if (!u.private) for (const f of D().follows.filter((x) => x.projectId === p.id)) to.add(f.userId);
        for (const uid of to) mail(uid, `計畫更新：${p.title}`, `${u.title}\n\n${u.content.slice(0, 300)}`, 'update');
      }
    }
    db.save(); return { ok: true, id: u.id };
  });
  // 留言（提案人回覆）
  on('GET', '/api/c/:pid/comments', { auth: true }, (ctx) => { const p = myProject(ctx); return D().comments.filter((c) => c.projectId === p.id).sort((a, b) => b.createdAt - a.createdAt).map((c) => ({ ...c, name: (db.byId('users', c.userId) || {}).name || '' })); });
  on('POST', '/api/c/:pid/comments', { auth: true, write: true }, (ctx) => {
    const p = myProject(ctx, 'support'), body = S.str(ctx.body.body, 1000, { multiline: true }), parentId = S.int(ctx.body.parentId, 1, 1e9);
    if (!body || !parentId || !D().comments.some((c) => c.id === parentId && c.projectId === p.id)) bad('請輸入回覆');
    db.insert('comments', { projectId: p.id, userId: ctx.user.id, body, parentId, hidden: false }, now()); return { ok: true };
  });
  // 數據分析
  on('GET', '/api/c/:pid/metrics', { auth: true }, (ctx) => {
    const p = myProject(ctx), orders = ordersOf(p.id), paid = R.countedOrders(orders), byDay = {};
    for (const o of paid) { const d = new Date(o.paidAt + R.TW_OFFSET).toISOString().slice(0, 10); byDay[d] = byDay[d] || { amount: 0, orders: 0 }; byDay[d].amount += o.total; byDay[d].orders++; }
    let cum = 0; const growth = Object.keys(byDay).sort().map((d) => { cum += byDay[d].amount; return { day: d, amount: byDay[d].amount, orders: byDay[d].orders, cum }; });
    const optDist = optionsOf(p.id).map((o) => ({ name: o.name, n: paid.reduce((s, x) => s + x.items.filter((it) => it.optionId === o.id).reduce((a, it) => a + it.qty, 0), 0) }));
    const payDist = Object.keys(R.PAY_METHODS).map((k) => ({ name: R.PAY_METHODS[k], n: paid.filter((o) => o.payMethod === k).length }));
    const backedCount = {}; for (const uid of new Set(paid.map((o) => o.userId))) { const n = new Set(D().orders.filter((o) => o.userId === uid && o.status === 'paid').map((o) => o.projectId)).size; const k = n >= 5 ? '5 個以上' : `${n} 個`; backedCount[k] = (backedCount[k] || 0) + 1; }
    return { growth, optDist, payDist, referred: [{ name: '一般', n: paid.filter((o) => !o.referrer).length }, { name: '被推薦', n: paid.filter((o) => o.referrer).length }], coupon: [{ name: '沒用折扣碼', n: paid.filter((o) => !o.coupon).length }, { name: '有用折扣碼', n: paid.filter((o) => o.coupon).length }], backedCount: Object.entries(backedCount).map(([name, n]) => ({ name, n })) };
  });
  // 訂單（提案人）
  /** 訂單給團隊看的樣子（含收件資料） */
  const teamOrderView = (o) => ({ id: o.id, token: o.token, status: o.status, statusName: R.ORDER_STATUS[o.status], backer: (db.byId('users', o.userId) || {}).name || '', email: o.recipient.email, items: o.items, total: o.total, bonus: o.bonus, coupon: o.coupon, payMethod: o.payMethod, payName: R.PAY_METHODS[o.payMethod], installments: o.installments, recipient: o.recipient, delivery: o.delivery, store: o.store, survey: o.survey, note: o.note, invoice: o.invoice, referrer: o.referrer, createdAt: o.createdAt, paidAt: o.paidAt, shipped: o.shipped, period: o.period || 0 });
  function searchOrders(list, q) {
    const f = S.str(q.field, 20), v = S.str(q.q, 60);
    if (!v) return list;
    return list.filter((o) => (f === 'token' ? o.token === v.toUpperCase() : f === 'recipient' ? o.recipient.name === v : f === 'email' ? o.recipient.email === v.toLowerCase() : f === 'phone' ? o.recipient.phone === v : f === 'backer' ? ((db.byId('users', o.userId) || {}).name || '') === v : (o.token + o.recipient.name + o.recipient.email).includes(v)));
  }
  on('GET', '/api/c/:pid/orders', { auth: true }, (ctx) => {
    const p = myProject(ctx, 'support');
    let list = searchOrders(ordersOf(p.id), ctx.query); const st = S.str(ctx.query.status, 20); if (st && R.ORDER_STATUS[st]) list = list.filter((o) => o.status === st);
    return list.sort((a, b) => b.createdAt - a.createdAt).map(teamOrderView);
  });
  on('POST', '/api/c/:pid/orders/ship', { auth: true, write: true }, (ctx) => {
    const p = myProject(ctx, 'support'), ids = Array.isArray(ctx.body.ids) ? ctx.body.ids.map((x) => S.int(x, 1, 1e9)) : [];
    let n = 0; for (const o of ordersOf(p.id)) if (ids.includes(o.id) && o.status === 'paid') { o.shipped = ctx.body.undo ? null : { at: now(), carrier: S.str(ctx.body.carrier, 20), trackNo: S.str(ctx.body.trackNo, 40) }; n++; if (!ctx.body.undo) mail(o.userId, `回饋已出貨：${p.title}`, `物流：${o.shipped.carrier} ${o.shipped.trackNo}`, 'order'); }
    db.save(); return { ok: true, n };
  });
  /** 匯出 CSV（贊助人列表／出貨列表）；儲存格開頭是 = + - @ 的加一個 '，防止 Excel 公式注入 */
  on('GET', '/api/c/:pid/export', { auth: true, csv: true }, (ctx) => {
    const p = myProject(ctx, 'support'), kind = ctx.query.kind === 'shipping' ? 'shipping' : 'backers';
    const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const rows = R.countedOrders(ordersOf(p.id)).sort((a, b) => a.paidAt - b.paidAt);
    const head = kind === 'shipping' ? ['訂單編號', '收件人', '電話', '取貨方式', '地址或門市', '回饋', '數量', '已出貨', '物流單號'] : ['訂單編號', '贊助人', 'Email', '回饋', '加碼', '總金額', '付款方式', '回饋調查', '備註', '推薦代碼', '付款時間'];
    const lines = [head.map(cell).join(',')];
    for (const o of rows) {
      const items = o.items.map((it) => `${it.name}×${it.qty}`).join('、'), bu = db.byId('users', o.userId);
      lines.push((kind === 'shipping'
        ? [o.token, o.recipient.name, o.recipient.phone, o.delivery === 'store' ? `超商（${R.STORES[o.store.brand] || ''}）` : '宅配', o.delivery === 'store' ? `${o.store.name}（${o.store.id}）` : `${o.recipient.zip} ${o.recipient.city}${o.recipient.district}${o.recipient.address}`, items, o.items.reduce((s, it) => s + it.qty, 0), o.shipped ? '是' : '否', o.shipped ? o.shipped.trackNo : '']
        : [o.token, bu ? bu.name : '', o.recipient.email, items, o.bonus, o.total, R.PAY_METHODS[o.payMethod], o.survey.map((s) => `${s.q}:${s.a}`).join('；'), o.note, o.referrer, new Date(o.paidAt + R.TW_OFFSET).toISOString().slice(0, 16).replace('T', ' ')]).map(cell).join(','));
    }
    audit(ctx.user, 'export', p.id, kind);
    return { csv: '﻿' + lines.join('\r\n'), filename: `${p.slug}_${kind}.csv` };
  });
  // 退款申請（提案人審）
  const refundView = (r) => { const o = db.byId('orders', r.orderId) || {}; return { id: r.id, token: r.token, order: o.token, status: r.status, statusName: R.REFUND_STATUS[r.status], reason: r.reason, note: r.note, recipient: (o.recipient || {}).name, payMethod: R.PAY_METHODS[o.payMethod], total: o.total, createdAt: r.createdAt, projectId: o.projectId }; };
  on('GET', '/api/c/:pid/refunds', { auth: true }, (ctx) => {
    const p = myProject(ctx, 'support'), sts = String(ctx.query.status || '').split(',').filter((s) => R.REFUND_STATUS[s]);
    const oids = new Set(ordersOf(p.id).map((o) => o.id));
    let list = D().refunds.filter((r) => oids.has(r.orderId)); if (sts.length) list = list.filter((r) => sts.includes(r.status));
    const q = S.str(ctx.query.q, 60); if (q) list = list.filter((r) => { const o = db.byId('orders', r.orderId); return o && (o.token === q.toUpperCase() || o.recipient.name === q || o.recipient.email === q || o.recipient.phone === q); });
    return list.sort((a, b) => b.createdAt - a.createdAt).map(refundView);
  });
  function decideRefund(r, decision, note, actor) {
    if (r.status !== 'pending') bad('這筆已經處理過了');
    r.status = decision === 'approve' ? 'approved' : 'rejected'; r.note = S.str(note, 300); r.decidedBy = actor.id; r.decidedAt = now();
    const o = db.byId('orders', r.orderId);
    if (r.status === 'approved') refundOrder(o, actor, r.reason); else mail(o.userId, `退款申請未通過：訂單 ${o.token}`, r.note || '如有疑問請聯繫提案人。', 'refund');
    audit(actor, 'refund_' + r.status, o.token, r.note); db.save();
  }
  on('POST', '/api/c/:pid/refunds/:rid', { auth: true, write: true }, (ctx) => {
    const p = myProject(ctx, 'support'), r = db.byId('refunds', S.int(ctx.params.rid, 1, 1e9)), o = r && db.byId('orders', r.orderId);
    if (!r || !o || o.projectId !== p.id) nope();
    if (!['approve', 'reject'].includes(ctx.body.decision)) bad();
    if (ctx.body.decision === 'reject' && !S.str(ctx.body.note, 300)) bad('駁回請寫原因');
    decideRefund(r, ctx.body.decision, ctx.body.note, ctx.user); return { ok: true };
  });
  // 商業檔案
  const BP_FIELDS = { companyName: 60, ubn: 8, capital: 15, incorporated: 10, fullname: 30, firstnameEn: 40, lastnameEn: 40, birthday: 10, mobile: 15, idType: 10, idNumber: 20, idIssued: 10, idIssueKind: 4, idPhoto: 2, idPlace: 10, residenceSerial: 20, phone: 20, city: 10, district: 10, zip: 6, address: 120, regAddress: 120, bankName: 60, bankCode: 3, bankBranch: 4, bankAccount: 20 };
  on('GET', '/api/c/:pid/business', { auth: true }, (ctx) => { const p = myProject(ctx, 'admin'); return D().businessProfiles.find((x) => x.projectId === p.id) || { status: 'draft', kind: 'company' }; });
  on('POST', '/api/c/:pid/business', { auth: true, write: true }, (ctx) => {
    const p = myProject(ctx, 'admin'), b = ctx.body;
    let bp = D().businessProfiles.find((x) => x.projectId === p.id);
    if (bp && bp.status === 'approved') bad('商業檔案已審核通過，要修改請聯繫專案經理');
    const row = { kind: b.kind === 'person' ? 'person' : 'company' };
    for (const [k, n] of Object.entries(BP_FIELDS)) row[k] = S.str(b[k], n);
    if (row.kind === 'company' && !/^\d{8}$/.test(row.ubn)) bad('統一編號 8 碼');
    if (!row.fullname || !/^09\d{8}$/.test(row.mobile)) bad('請填負責人全名、手機（09 開頭 10 碼）');
    if (!/^[A-Z][12]\d{8}$/.test(row.idNumber) && row.idType === 'idcard') bad('身分證字號格式不對');
    if (!/^\d{3}$/.test(row.bankCode) || !/^\d{6,16}$/.test(row.bankAccount) || !row.bankName) bad('請填銀行戶名、代碼（3 碼）、帳號');
    row.status = b.submit ? 'pending' : 'draft'; row.note = '';
    if (bp) Object.assign(bp, row); else bp = db.insert('businessProfiles', { projectId: p.id, ...row }, now());
    if (b.submit) submitBiz(p, ctx.user);
    db.save(); return { ok: true };
  });
  /** 商業檔案、金流帳號都送出了 → 第一階段「審核中」 */
  function submitBiz(p, actor) {
    const bp = D().businessProfiles.find((x) => x.projectId === p.id), pa = D().paymentApps.find((x) => x.projectId === p.id);
    if (bp && bp.status === 'pending' && pa && pa.submitted) { p.steps.biz = 'pending'; if (p.status === 'draft') p.status = 'reviewing'; audit(actor, 'submit_biz', p.id, ''); }
  }
  on('GET', '/api/c/:pid/payment', { auth: true }, (ctx) => { const p = myProject(ctx, 'admin'); return D().paymentApps.find((x) => x.projectId === p.id) || { methods: { credit: true, atm: true, aftee: false }, providers: [{ name: '藍新金流', methods: '信用卡', status: 'draft' }, { name: '統一金流', methods: 'ATM 轉帳', status: 'draft' }, { name: 'AFTEE', methods: '先享後付', status: 'draft' }], submitted: false }; });
  on('POST', '/api/c/:pid/payment', { auth: true, write: true }, (ctx) => {
    const p = myProject(ctx, 'admin'), b = ctx.body, m = b.methods || {};
    const methods = { credit: S.bool(m.credit), atm: S.bool(m.atm), aftee: S.bool(m.aftee) }; if (!methods.credit && !methods.atm && !methods.aftee) bad('至少開一種付款方式');
    let pa = D().paymentApps.find((x) => x.projectId === p.id);
    if (!pa) pa = db.insert('paymentApps', { projectId: p.id, methods, providers: [{ name: '藍新金流', methods: '信用卡', status: 'draft' }, { name: '統一金流', methods: 'ATM 轉帳', status: 'draft' }, { name: 'AFTEE', methods: '先享後付', status: 'draft' }], submitted: false }, now());
    pa.methods = methods; p.paymentMethods = { ...methods };
    if (b.submit) { pa.submitted = true; for (const pv of pa.providers) if (pv.status === 'draft') pv.status = 'pending'; submitBiz(p, ctx.user); }
    db.save(); return { ok: true };
  });
  // 送審：方案與回饋、合約
  on('POST', '/api/c/:pid/submit', { auth: true, write: true }, (ctx) => {
    const p = myProject(ctx, 'admin'), step = ctx.body.step;
    if (step === 'plan') {
      if (p.steps.biz !== 'ok') bad('請先通過「商業檔案與金流帳號初審」');
      if (!optionsOf(p.id).length) bad('請至少新增一個回饋方案');
      if (!p.title || !p.description || !p.content) bad('請填計畫名稱、簡介、內容');
      const err = R.checkSchedule(p, settings()); if (err) bad(err);
      p.steps.plan = 'pending'; mail(p.managerId || p.ownerId, `方案與回饋送審：${p.title}`, '提案人已完成方案與回饋。', 'review');
    } else if (step === 'contract') {
      if (p.steps.plan !== 'ok') bad('請先通過「方案與回饋」');
      const file = S.mediaUrl(ctx.body.file) || (/^\/uploads\/[a-f0-9]{32}\.pdf$/.test(S.str(ctx.body.file, 60)) ? S.str(ctx.body.file, 60) : '');
      if (!file) bad('請上傳已簽署的合約（PDF 或圖片）');
      const c = D().contracts.find((x) => x.projectId === p.id); if (c) { c.file = file; c.status = 'pending'; } else db.insert('contracts', { projectId: p.id, file, status: 'pending' }, now());
      p.steps.contract = 'pending';
    } else bad();
    if (p.status === 'draft') p.status = 'reviewing';
    audit(ctx.user, 'submit_' + step, p.id, ''); db.save(); return { ok: true };
  });

  // =============================================================
  // 平台 admin
  // =============================================================
  on('GET', '/api/admin/overview', { staff: true }, () => {
    const t = now(), day = R.twDay(t), paid = D().orders.filter((o) => o.status === 'paid');
    return { users: D().users.length, projects: Object.fromEntries(Object.keys(R.PROJECT_STATUS).map((k) => [k, D().projects.filter((p) => p.status === k).length])),
      todayAmount: paid.filter((o) => R.twDay(o.paidAt) === day).reduce((s, o) => s + o.total, 0), todayOrders: paid.filter((o) => R.twDay(o.paidAt) === day).length, totalAmount: paid.reduce((s, o) => s + o.total, 0),
      reviewQueue: D().projects.filter((p) => Object.values(p.steps || {}).includes('pending')).length, refunds: D().refunds.filter((r) => r.status === 'pending').length, reports: D().reports.filter((r) => r.status === 'open').length,
      payoutsDue: D().payouts.filter((p) => p.status === 'scheduled' && p.dueAt <= t + 7 * R.DAY).length, clockOffset: D().meta.clockOffset || 0, now: t };
  });
  /** 審核佇列：有任何一階段「審核中」的計畫 */
  on('GET', '/api/admin/review', { staff: true }, () => D().projects.filter((p) => Object.values(p.steps || {}).includes('pending') || p.status === 'reviewing' || p.status === 'draft').map((p) => ({ ...card(p), steps: p.steps, stepNotes: p.stepNotes, manager: (db.byId('users', p.managerId) || {}).name || '', owner: (db.byId('users', p.ownerId) || {}).name || '',
    business: D().businessProfiles.find((x) => x.projectId === p.id) || null, payment: D().paymentApps.find((x) => x.projectId === p.id) || null, contract: D().contracts.find((x) => x.projectId === p.id) || null, options: optionsOf(p.id).length })));
  /** 審核一階段：ok／rejected（退回要寫原因） */
  on('POST', '/api/admin/projects/:pid/step', { staff: true, write: true }, (ctx) => {
    const p = db.byId('projects', S.int(ctx.params.pid, 1, 1e9)); if (!p) nope();
    const step = ctx.body.step, dec = ctx.body.decision, note = S.str(ctx.body.note, 500, { multiline: true });
    if (!R.REVIEW_STEPS.some((s) => s.key === step) || !['ok', 'rejected'].includes(dec)) bad();
    if (dec === 'rejected' && !note) bad('退回請寫原因');
    const idx = R.REVIEW_STEPS.findIndex((s) => s.key === step);
    if (dec === 'ok' && R.REVIEW_STEPS.slice(0, idx).some((s) => p.steps[s.key] !== 'ok')) bad('前一個階段還沒通過');
    if (dec === 'ok' && ['biz', 'plan', 'contract'].includes(step) && p.steps[step] !== 'pending') bad('提案人還沒送出這個階段');
    p.steps[step] = dec; p.stepNotes = { ...(p.stepNotes || {}), [step]: note };
    if (step === 'biz') { const bp = D().businessProfiles.find((x) => x.projectId === p.id); if (bp) { bp.status = dec === 'ok' ? 'approved' : 'rejected'; bp.note = note; } const pa = D().paymentApps.find((x) => x.projectId === p.id); if (pa && dec === 'rejected') pa.submitted = false; }
    if (step === 'contract') { const c = D().contracts.find((x) => x.projectId === p.id); if (c) c.status = dec === 'ok' ? 'approved' : 'rejected'; if (dec === 'ok') p.steps.gateway = 'pending'; }
    if (step === 'gateway') { const pa = D().paymentApps.find((x) => x.projectId === p.id); if (pa) for (const pv of pa.providers) if (pv.status === 'pending') pv.status = dec === 'ok' ? 'approved' : 'rejected'; if (dec === 'ok') p.steps.ready = 'pending'; }
    if (step === 'ready' && dec === 'ok') { const s2 = S.time(ctx.body.startAt); if (s2) { p.startAt = s2; } const err = R.checkSchedule(p, settings()); if (err) bad(err); p.status = 'scheduled'; }
    if (p.status === 'draft') p.status = 'reviewing';
    mail(p.ownerId, `審核${dec === 'ok' ? '通過' : '退回'}：${R.REVIEW_STEPS[idx].name}`, `${p.title}${note ? '\n\n' + note : ''}`, 'review');
    audit(ctx.user, `step_${step}_${dec}`, p.id, note); db.save(); tick(true); return { ok: true };
  });
  on('GET', '/api/admin/projects', { staff: true }, (ctx) => {
    const kw = S.str(ctx.query.q, 40), st = S.str(ctx.query.status, 20);
    let list = D().projects; if (kw) list = list.filter((p) => p.title.includes(kw) || p.slug.includes(kw)); if (st && R.PROJECT_STATUS[st]) list = list.filter((p) => p.status === st);
    return list.map((p) => ({ ...card(p), manager: (db.byId('users', p.managerId) || {}).name || '', owner: (db.byId('users', p.ownerId) || {}).name || '', managerId: p.managerId, steps: p.steps }));
  });
  on('POST', '/api/admin/projects/:pid', { staff: true, write: true }, (ctx) => {
    const p = db.byId('projects', S.int(ctx.params.pid, 1, 1e9)); if (!p) nope();
    const a = ctx.body.action, note = S.str(ctx.body.note, 300);
    if (a === 'feature') p.featured = !p.featured;
    else if (a === 'pick') p.staffPick = !p.staffPick;
    else if (a === 'suspend') { if (!note) bad('下架請寫原因'); p.suspendedFrom = p.status; p.status = 'suspended'; mail(p.ownerId, `計畫已被下架：${p.title}`, note, 'project'); }
    else if (a === 'restore') { if (p.status !== 'suspended') bad(); p.status = p.suspendedFrom || 'live'; }
    else if (a === 'schedule') { const s2 = S.time(ctx.body.startAt), e2 = p.type === 'subscription' ? (S.time(ctx.body.endAt) || 0) : S.time(ctx.body.endAt); const next = { ...p, startAt: s2 || p.startAt, endAt: e2 ?? p.endAt }; const err = R.checkSchedule(next, settings()); if (err) bad(err); if (['success', 'failed'].includes(p.status)) bad('已經結束的計畫不能改時間'); p.startAt = next.startAt; p.endAt = next.endAt; }
    else if (a === 'manager') { const m = db.byId('users', S.int(ctx.body.managerId, 1, 1e9)); if (!m || !isStaff(m)) bad('請選平台人員'); p.managerId = m.id; }
    else if (a === 'unlock') { if (!isAdmin(ctx.user)) nope(); p.steps.plan = 'pending'; }
    else bad();
    audit(ctx.user, 'admin_project_' + a, p.id, note); db.save(); return { ok: true };
  });
  on('GET', '/api/admin/users', { admin: true }, (ctx) => {
    const kw = S.str(ctx.query.q, 60).toLowerCase();
    // 範例資料有 700 多個虛構贊助人：先數好每個人的訂單（一次掃完，不要每個人都掃一遍），清單最多回 300 筆，其他用搜尋找
    const paidBy = new Map(); for (const o of D().orders) if (o.status === 'paid') paidBy.set(o.userId, (paidBy.get(o.userId) || 0) + 1);
    const ownBy = new Map(); for (const p of D().projects) ownBy.set(p.ownerId, (ownBy.get(p.ownerId) || 0) + 1);
    return D().users.filter((u) => !kw || u.email.includes(kw) || u.name.toLowerCase().includes(kw)).slice(0, 300).map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, banned: u.banned, createdAt: u.createdAt, orders: paidBy.get(u.id) || 0, projects: ownBy.get(u.id) || 0 }));
  });
  on('POST', '/api/admin/users/:uid', { admin: true, write: true }, (ctx) => {
    const u = db.byId('users', S.int(ctx.params.uid, 1, 1e9)); if (!u) nope();
    if (u.id === ctx.user.id) bad('不能改自己的權限');
    // 放在網路上時任何人都能用 admin 練習帳號登入：admin／pm 這兩個練習帳號不能被降權、停權、改密碼，免得整個平台沒人能管、沒人能按重置
    if (demo && ['admin@demo.local', 'pm@demo.local'].includes(u.email)) bad('測試用的管理員帳號不能修改');
    const a = ctx.body.action;
    if (a === 'role') { if (!['member', 'staff', 'admin'].includes(ctx.body.role)) bad(); u.role = ctx.body.role; }
    else if (a === 'ban') { u.banned = !u.banned; if (u.banned) { for (const [h, s] of sessions) if (s.userId === u.id) sessions.delete(h); D().sessions = D().sessions.filter((s) => s.userId !== u.id); } }
    else if (a === 'resetpw') {
      // 重設密碼：產生一組臨時密碼，只回給按的這位管理員看一次（伺服器只存雜湊）；該帳號其他裝置全部登出
      const temp = demo ? DEMO_PASSWORD : crypto.randomBytes(6).toString('base64url') + '7k';
      u.pass = S.hashPassword(temp);
      for (const [h, s] of sessions) if (s.userId === u.id) sessions.delete(h); D().sessions = D().sessions.filter((s) => s.userId !== u.id);
      audit(ctx.user, 'admin_user_resetpw', u.id, ''); db.save(); return { ok: true, tempPassword: temp };
    }
    else bad();
    audit(ctx.user, 'admin_user_' + a, u.id, ctx.body.role || ''); db.save(); return { ok: true };
  });
  /** 新增平台人員（管理員／一般人員）：Email＋名稱＋角色，系統產生臨時密碼，只顯示給管理員一次 */
  on('POST', '/api/admin/users', { admin: true, write: true, rate: ['adduser', 30, 3_600_000] }, (ctx) => {
    const b = ctx.body, em = S.email(b.email), name = S.str(b.name, 20), role = ['staff', 'admin'].includes(b.role) ? b.role : '';
    if (!em) bad('Email 格式不對'); if (!name) bad('請填名稱'); if (!role) bad('請選角色');
    if (D().users.some((u) => u.email === em)) bad('這個 Email 已經有帳號了；請在列表裡直接改他的角色');
    let sl = em.split('@')[0].toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'user';
    while (sl.length < 3 || D().users.some((u) => u.slug === sl)) sl += crypto.randomInt(10);
    const temp = crypto.randomBytes(6).toString('base64url') + '7k';
    const u = db.insert('users', { email: em, name, realName: '', pass: S.hashPassword(temp), role, banned: false, slug: sl, avatar: '', gender: '', birthday: '', from: '', fb: '', ig: '', yt: '', web: '', bio: '', notify: true, newsletter: false }, now());
    audit(ctx.user, 'admin_user_create', u.id, role); return { ok: true, id: u.id, tempPassword: temp };
  });
  on('GET', '/api/admin/orders', { staff: true }, (ctx) => {
    let list = searchOrders(D().orders, ctx.query); const st = S.str(ctx.query.status, 20); if (st && R.ORDER_STATUS[st]) list = list.filter((o) => o.status === st);
    return list.sort((a, b) => b.createdAt - a.createdAt).slice(0, 300).map((o) => ({ ...teamOrderView(o), project: (db.byId('projects', o.projectId) || {}).title || '' }));
  });
  on('POST', '/api/admin/orders/:token', { staff: true, write: true }, (ctx) => {
    const o = D().orders.find((x) => x.token === ctx.params.token); if (!o) nope();
    const a = ctx.body.action, note = S.str(ctx.body.note, 300);
    if (a === 'paid') { if (!markPaid(o, ctx.user)) bad('只有待付款的訂單可以標記付款'); }
    else if (a === 'refund') { if (!note) bad('請寫退款原因'); if (!refundOrder(o, ctx.user, note)) bad('只有付款成功的訂單可以退款'); }
    else if (a === 'cancel') { if (o.status !== 'pending') bad('只有待付款的訂單可以取消'); o.status = 'cancelled'; audit(ctx.user, 'order_cancel', o.token, note); db.save(); }
    else bad();
    return { ok: true };
  });
  on('GET', '/api/admin/refunds', { staff: true }, (ctx) => { const st = S.str(ctx.query.status, 20); return D().refunds.filter((r) => !st || r.status === st).sort((a, b) => b.createdAt - a.createdAt).map((r) => ({ ...refundView(r), project: (db.byId('projects', (db.byId('orders', r.orderId) || {}).projectId) || {}).title || '' })); });
  on('POST', '/api/admin/refunds/:rid', { staff: true, write: true }, (ctx) => {
    const r = db.byId('refunds', S.int(ctx.params.rid, 1, 1e9)); if (!r) nope();
    if (!['approve', 'reject'].includes(ctx.body.decision)) bad();
    if (ctx.body.decision === 'reject' && !S.str(ctx.body.note, 300)) bad('駁回請寫原因');
    decideRefund(r, ctx.body.decision, ctx.body.note, ctx.user); return { ok: true };
  });
  on('GET', '/api/admin/payouts', { admin: true }, () => D().payouts.slice().sort((a, b) => a.dueAt - b.dueAt).map((x) => { const p = db.byId('projects', x.projectId) || {}; const bp = D().businessProfiles.find((b) => b.projectId === x.projectId) || {}; return { ...x, project: p.title, bank: bp.bankCode ? `${bp.bankCode}-${bp.bankBranch} ****${String(bp.bankAccount || '').slice(-4)}` : '尚未填寫' }; }));
  on('POST', '/api/admin/payouts/:id', { admin: true, write: true }, (ctx) => {
    const x = db.byId('payouts', S.int(ctx.params.id, 1, 1e9)); if (!x) nope();
    if (x.status !== 'scheduled') bad('這筆已經撥過了');
    x.status = 'paid'; x.paidAt = now(); const p = db.byId('projects', x.projectId);
    if (p) mail(p.ownerId, `撥款完成：${p.title}`, `撥款金額 NT$ ${x.net.toLocaleString()}（集資 ${x.gross.toLocaleString()} − 金流 ${x.paymentFee.toLocaleString()} − 平台 ${x.platformFee.toLocaleString()}）`, 'payout');
    audit(ctx.user, 'payout_paid', x.id, String(x.net)); db.save(); return { ok: true };
  });
  on('GET', '/api/admin/reports', { staff: true }, () => D().reports.slice().sort((a, b) => b.createdAt - a.createdAt).map((r) => { const t = r.kind === 'project' ? db.byId('projects', r.targetId) : db.byId('comments', r.targetId); return { ...r, by: (db.byId('users', r.userId) || {}).name || '', target: t ? (r.kind === 'project' ? t.title : t.body) : '（已刪除）', targetHidden: r.kind === 'comment' && t ? t.hidden : false }; }));
  on('POST', '/api/admin/reports/:id', { staff: true, write: true }, (ctx) => {
    const r = db.byId('reports', S.int(ctx.params.id, 1, 1e9)); if (!r) nope();
    const a = ctx.body.action; if (!['resolve', 'dismiss'].includes(a)) bad();
    r.status = a === 'resolve' ? 'resolved' : 'dismissed'; r.note = S.str(ctx.body.note, 300);
    if (a === 'resolve' && r.kind === 'comment' && ctx.body.hide) { const c = db.byId('comments', r.targetId); if (c) c.hidden = true; }
    audit(ctx.user, 'report_' + r.status, r.id, r.note); db.save(); return { ok: true };
  });
  on('GET', '/api/admin/comments', { staff: true }, () => D().comments.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 200).map((c) => ({ ...c, name: (db.byId('users', c.userId) || {}).name || '', project: (db.byId('projects', c.projectId) || {}).title || '' })));
  on('POST', '/api/admin/comments/:id', { staff: true, write: true }, (ctx) => { const c = db.byId('comments', S.int(ctx.params.id, 1, 1e9)); if (!c) nope(); c.hidden = !c.hidden; audit(ctx.user, c.hidden ? 'comment_hide' : 'comment_show', c.id, ''); db.save(); return { hidden: c.hidden }; });
  on('GET', '/api/admin/settings', { admin: true }, () => ({ ...settings(), categories: settings().categories || R.CATEGORIES }));
  on('POST', '/api/admin/settings', { admin: true, write: true }, (ctx) => {
    const b = ctx.body, num = (v, lo, hi) => { const n = Number(v); if (!Number.isFinite(n) || n < lo || n > hi) bad('數字超出範圍'); return n; };
    const st = D().settings = D().settings || {};
    st.platformFee = num(b.platformFee, 0, 0.3); st.paymentFee = { credit: num(b.paymentFee.credit, 0, 0.1), atm: num(b.paymentFee.atm, 0, 0.1), aftee: num(b.paymentFee.aftee, 0, 0.1) };
    st.personLimit30d = Math.round(num(b.personLimit30d, 0, 1e9)); st.companyLimit = Math.round(num(b.companyLimit, 0, 1e10)); st.payoutWorkdays = Math.round(num(b.payoutWorkdays, 0, 120)); st.subscriptionPayoutDay = Math.round(num(b.subscriptionPayoutDay, 1, 28));
    st.minDays = Math.round(num(b.minDays, 1, 30)); st.maxDays = Math.round(num(b.maxDays, st.minDays, 400)); st.atmRefundFee = Math.round(num(b.atmRefundFee, 0, 100));
    st.allOrNothing = { crowd: S.bool(b.allOrNothing.crowd), preorder: S.bool(b.allOrNothing.preorder), coop: S.bool(b.allOrNothing.coop) };
    const cats = (Array.isArray(b.categories) ? b.categories : []).map((c) => S.str(c, 12)).filter(Boolean).slice(0, 40); if (cats.length < 3) bad('分類至少 3 個'); st.categories = [...new Set(cats)];
    audit(ctx.user, 'settings', 'platform', ''); db.save(); return { ok: true };
  });
  on('GET', '/api/admin/notices', { staff: true }, () => D().notices.slice().reverse());
  on('POST', '/api/admin/notices', { admin: true, write: true }, (ctx) => { if (ctx.body.action === 'delete') { db.remove('notices', (n) => n.id === S.int(ctx.body.id, 1, 1e9)); return { ok: true }; } const title = S.str(ctx.body.title, 60), body = S.str(ctx.body.body, 500, { multiline: true }); if (!title) bad('請填標題'); db.insert('notices', { title, body }, now()); audit(ctx.user, 'notice', title, ''); return { ok: true }; });
  on('GET', '/api/admin/audit', { admin: true }, () => D().audit.slice(-300).reverse().map((a) => ({ ...a, actor: a.actorId ? (db.byId('users', a.actorId) || {}).name || '' : '系統' })));
  on('GET', '/api/admin/emails', { admin: true }, () => D().emails.slice(-300).reverse());
  on('GET', '/api/admin/staff', { staff: true }, () => D().users.filter(isStaff).map((u) => ({ id: u.id, name: u.name })));
  /** 模擬時鐘：快轉 N 小時（練習結束、逾期、撥款）；reset＝回到真實時間 */
  on('POST', '/api/admin/clock', { admin: true, write: true }, (ctx) => {
    if (!demo) nope();   // 正式模式沒有時鐘快轉
    if (ctx.body.reset) D().meta.clockOffset = 0; else { const h = S.int(ctx.body.hours, -24 * 400, 24 * 400); if (h === null) bad(); D().meta.clockOffset = (D().meta.clockOffset || 0) + h * 3_600_000; }
    audit(ctx.user, 'clock', String(D().meta.clockOffset), ''); db.save(); tick(true); return { offset: D().meta.clockOffset, now: now() };
  });
  /** 重置練習資料（整份回到範例；上傳的檔案留著） */
  on('POST', '/api/admin/reset', { admin: true, write: true }, (ctx) => {
    if (!demo) nope();   // 正式模式不准一鍵清空
    if (ctx.body.confirm !== 'RESET') bad('請輸入 RESET 確認');
    db.replaceAll(makeSeed()); sessions.clear(); db.flush(); return { ok: true };
  });

  // =============================================================
  // HTTP 處理
  // =============================================================
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
  const UP_MIME = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', pdf: 'application/pdf' };
  function secHeaders(res) {
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; media-src 'self' https:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()'); res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  }
  function json(res, code, obj) { const s = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(s); }
  function readBody(req, max) {
    return new Promise((resolve, reject) => {
      const chunks = []; let n = 0;
      req.on('data', (c) => { n += c.length; if (n > max) { reject(new HttpError(413, '檔案或資料太大')); req.destroy(); return; } chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject);
    });
  }
  function serveFile(res, file, mime, extra = {}) {
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('找不到'); return; }
      res.writeHead(200, { 'Content-Type': mime, 'Content-Length': st.size, 'Cache-Control': 'no-cache', ...extra });
      fs.createReadStream(file).pipe(res);
    });
  }

  async function handle(req, res) {
    secHeaders(res);
    const u = new URL(req.url, 'http://x');
    const p = decodeURIComponent(u.pathname);
    // 放在雲端主機（Render）後面時，連進來的都是主機的代理伺服器，真正的使用者 IP 在 X-Forwarded-For。
    // 只有設了 TRUST_PROXY=1 才看這個標頭（不然任何人都能自己填假的 IP 來躲限流）；取「最後一個」＝代理伺服器親眼看到的來源
    const fwd = trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean).pop() : '';
    const ip = (fwd || req.socket.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 64);
    // ---- 上傳的檔案 ----
    if (req.method === 'GET' && p.startsWith('/uploads/')) {
      const m = /^\/uploads\/([a-f0-9]{32})\.(jpg|png|gif|webp|mp4|webm|pdf)$/.exec(p);
      if (!m) { res.writeHead(404); res.end(); return; }
      return serveFile(res, path.join(uploadDir, m[1] + '.' + m[2]), UP_MIME[m[2]], m[2] === 'pdf' ? { 'Content-Disposition': 'attachment' } : {});
    }
    // ---- 靜態檔、前端頁面（單頁應用：不是 /api 的一律給 index.html）----
    if (!p.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
      const rel = path.normalize(p).replace(/^([/\\])+/, '');
      const f = path.join(publicDir, rel);
      if (rel && f.startsWith(publicDir + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile()) return serveFile(res, f, MIME[path.extname(f)] || 'application/octet-stream');
      return serveFile(res, path.join(publicDir, 'index.html'), MIME['.html']);
    }
    // ---- API ----
    tick();
    const cookies = S.parseCookies(req.headers.cookie);
    const ctx = { req, res, ip, query: Object.fromEntries(u.searchParams), params: {}, body: {}, user: null, session: null, sidHash: '', setCookie: (sid) => res.setHeader('Set-Cookie', `sid=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL / 1000}${secureCookie ? '; Secure' : ''}`) };
    if (cookies.sid && /^[A-Za-z0-9_-]{43}$/.test(cookies.sid)) { const h = S.sha(cookies.sid), s = sessions.get(h); if (s && Date.now() - s.at < SESSION_TTL) { ctx.sidHash = h; ctx.session = s; const usr = s.userId ? db.byId('users', s.userId) : null; ctx.user = usr && !usr.banned ? usr : null; } }
    if (!ctx.session) { const sid = S.newSessionId(), h = S.sha(sid); sessions.set(h, { userId: 0, csrf: S.newCsrf(), at: Date.now() }); ctx.setCookie(sid); ctx.sidHash = h; ctx.session = sessions.get(h); if (sessions.size > 100_000) for (const [k, v] of sessions) if (!v.userId && Date.now() - v.at > 3_600_000) sessions.delete(k); }
    let route = null;
    for (const r of routes) { if (r.method !== req.method) continue; const m = r.re.exec(p); if (m) { route = r; ctx.params = m.groups || {}; break; } }
    try {
      if (!route) throw new HttpError(404, '找不到');
      const o = route.opt;
      if ((o.auth || o.staff || o.admin) && !ctx.user) throw new HttpError(401, '請先登入');
      if (o.staff && !isStaff(ctx.user)) throw new HttpError(404, '找不到');
      if (o.admin && !isAdmin(ctx.user)) throw new HttpError(404, '找不到');
      if (route.method !== 'GET') {
        if (!S.safeEq(String(req.headers['x-csrf'] || ''), ctx.session.csrf)) throw new HttpError(403, '頁面過期，請重新整理');
        const ct = String(req.headers['content-type'] || '');
        if (o.raw) { ctx.rawBody = await readBody(req, 31 * 1024 * 1024); }
        else { if (!ct.startsWith('application/json')) throw new HttpError(415, '格式不對'); const buf = await readBody(req, 300 * 1024); try { ctx.body = buf.length ? JSON.parse(buf.toString('utf8')) : {}; } catch { throw new HttpError(400, '格式不對'); } if (!ctx.body || typeof ctx.body !== 'object' || Array.isArray(ctx.body)) throw new HttpError(400, '格式不對'); }
      }
      // 限流：登入後用帳號算（同一間辦公室的同事共用一個 IP，不會互相卡到）；沒登入用 IP 算
      if (o.rate && !limiter(`${ctx.user ? 'u' + ctx.user.id : ip}|${o.rate[0]}`, o.rate[1], o.rate[2])) throw new HttpError(429, '太頻繁了，請稍後再試');
      ctx.session.at = Date.now();
      const out = await route.fn(ctx);
      json(res, 200, out === undefined ? { ok: true } : out);
    } catch (e) {
      if (e instanceof HttpError) return json(res, e.code, { error: e.message });
      console.error('[錯誤]', req.method, p, e && e.stack || e);
      json(res, 500, { error: '伺服器發生錯誤' });
    }
  }
  return { handle, db, tick, now, sessions };
}
