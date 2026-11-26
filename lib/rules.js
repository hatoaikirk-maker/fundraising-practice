/**
 * 募資練習平台：所有「規則」都在這裡（純計算，不碰檔案、不碰網路），前後端、測試共用同一份邏輯。
 * ------------------------------------------------------------
 * 規則來源（2026/11/26 查證）：
 *   - 嘖嘖提案頁「常見問答」（公開）：
 *       ・自然人任意連續 30 天集資上限 100 萬；法人第一階段 1,500 萬
 *       ・一次性計畫最短 1 天、最長 5 個月；訂閱專案沒有天期限制
 *       ・發起免費；成功才收：金流基本服務費 2.5%＋平台手續費 5.5%（合計 8%，依付款方式可能不同）
 *       ・群眾集資／預購式：專案完結後 28 個工作日內撥款；訂閱專案：次月 15 日撥款
 *       ・計畫失敗：贊助金額退回（虛擬帳號轉帳手續費不退）
 *   - 提案者後台（KIRK 帳號、只讀）：審核五階段、回饋選項欄位、ATM「訂單成立隔天 23:59:59 前付款」、
 *     信用卡分期 3／6 期、超商取貨 7-11／全家／萊爾富、運費依國家、折扣碼、推薦連結、EDM 再行銷…
 * 練習平台不是嘖嘖官方系統：沒有公開的細節（例如 AFTEE 費率、退款手續費）都做成「平台設定」可以改，畫面上會標示。
 */

// ---------- 小工具 ----------
export const DAY = 86_400_000;
export const TW_OFFSET = 8 * 3_600_000;                     // 台灣時間 UTC+8
/** 台灣時間的「第幾天」（1970/1/1 起算），用來判斷同一天 */
export const twDay = (t) => Math.floor((t + TW_OFFSET) / DAY);
/** 某個時間點所在那天的台灣 23:59:59.999 */
export const twEndOfDay = (t) => (twDay(t) + 1) * DAY - TW_OFFSET - 1;
/** 是不是安全整數，而且在範圍內 */
export const isInt = (v, lo = 0, hi = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= lo && v <= hi;
/** 四捨五入到整數元 */
export const round = (n) => Math.round(n);

// ---------- 預設平台設定（admin 可以在「平台設定」改）----------
export const DEFAULT_SETTINGS = {
  platformFee: 0.055,                                         // 平台手續費 5.5%
  paymentFee: { credit: 0.025, atm: 0.025, aftee: 0.025 },    // 金流基本服務費（依付款方式；AFTEE 實際費率依契約，這裡先同 2.5%）
  personLimit30d: 1_000_000,                                  // 自然人：任意連續 30 天上限
  companyLimit: 15_000_000,                                   // 法人：第一階段上限
  payoutWorkdays: 28,                                         // 一次性專案：完結後幾個工作日內撥款
  subscriptionPayoutDay: 15,                                  // 訂閱專案：次月幾號撥款
  minDays: 1, maxDays: 150,                                   // 一次性計畫：最短 1 天、最長 5 個月（以 150 天計）
  atmRefundFee: 15,                                           // 失敗退款時虛擬帳號的轉帳手續費（示意值，依實際金流）
  allOrNothing: { crowd: true, preorder: true, coop: true },  // 沒達標就全部退款（訂閱式沒有這個規則）
};

// ---------- 列舉（跟嘖嘖後台同一組選項）----------
export const PROJECT_TYPES = { crowd: '群眾集資', preorder: '預購式專案', subscription: '訂閱式專案', coop: '合作式專案' };
export const CATEGORIES = ['音樂', '攝影', '出版', '時尚', '設計', '表演', '藝術', '科技', '教育', '遊戲', '飲食', '空間', '社會', '插畫漫畫', '電影動畫', '地方創生', '挺好店', '新春賀喜', '線上課程'];
export const ORIGINS = { none: '不指定專案發源地', tw: '台灣', abroad: '海外' };
export const INVOICE_FORMATS = { none: '不適用', cloud: '電子發票 (共通性載具)', paper: '傳統發票' };
export const PAY_METHODS = { credit: '信用卡', atm: 'ATM 虛擬帳號', aftee: 'AFTEE 先享後付' };
export const STORES = { '711': '7-11', family: '全家', hilife: '萊爾富' };
/** 運費國家（嘖嘖回饋設定的 25 個；TWI＝台灣離島、ETC＝其他地區） */
export const COUNTRIES = { TW: '台灣本島', TWI: '台灣離島', HK: '香港', MO: '澳門', US: '美國', AU: '澳洲', JP: '日本', CA: '加拿大', CN: '中國', FR: '法國', DE: '德國', IN: '印度', ID: '印尼', IT: '義大利', KR: '韓國', MY: '馬來西亞', NL: '荷蘭', NZ: '紐西蘭', PH: '菲律賓', SG: '新加坡', ES: '西班牙', TH: '泰國', GB: '英國', VN: '越南', ETC: '其他地區' };
export const UPDATE_CATEGORIES = ['進度報告', '出貨通知', '活動公告', '感謝贊助', '其他'];
export const TEAM_ROLES = { admin: '管理者（全部功能）', editor: '編輯（內容、回饋、更新）', support: '客服（訂單、留言、退款）', viewer: '檢視（只能看）' };

/** 審核五階段（嘖嘖控制中心「提案審核」的順序） */
export const REVIEW_STEPS = [
  { key: 'biz', name: '商業檔案與金流帳號初審', desc: '填寫基本資料與金流資訊後，送至平台內部審查。' },
  { key: 'plan', name: '方案與回饋', desc: '完成專案內容與方案價格後，通知平台工作人員。' },
  { key: 'contract', name: '合約簽署與上傳', desc: '上傳已簽署的合約給平台以啟用專案公開。' },
  { key: 'gateway', name: '第三方金流單位審核', desc: '將商店帳戶資訊提交外部金流進行商店申請。' },
  { key: 'ready', name: '準備上線', desc: '平台排定上線時間，時間到自動公開。' },
];
/** 每一階段的狀態：todo 還沒送、pending 審核中、ok 通過、rejected 退回 */
export const STEP_STATES = { todo: '未送出', pending: '審核中', ok: '通過', rejected: '退回修改' };
/** 計畫狀態 */
export const PROJECT_STATUS = { draft: '草稿', reviewing: '審核中', scheduled: '準備上線', live: '募資中', success: '募資成功', failed: '募資未達標', ended: '已結束', suspended: '已下架' };
export const ORDER_STATUS = { pending: '待付款', paid: '付款成功', cancelled: '已取消', refunded: '已退款', expired: '逾期未付款', refunding: '退款處理中' };
export const REFUND_STATUS = { pending: '申請中', approved: '申請通過', rejected: '申請駁回' };

// ---------- 計畫 ----------
/** 這個計畫算進「已集資」的訂單：付款成功的（退款、取消、逾期都不算） */
export const countedOrders = (orders) => orders.filter((o) => o.status === 'paid');
/** 累計集資、訂單數、平均、加碼、退款 */
export function projectStats(orders) {
  const paid = countedOrders(orders);
  const raised = paid.reduce((s, o) => s + o.total, 0);
  const bonus = paid.reduce((s, o) => s + (o.bonus || 0), 0);
  const refunded = orders.filter((o) => o.status === 'refunded').reduce((s, o) => s + o.total, 0);
  const backers = new Set(paid.map((o) => o.userId)).size;
  return { raised, orders: paid.length, backers, avg: paid.length ? round(raised / paid.length) : 0, bonus, refunded };
}
/** 進度百分比（四捨五入到整數；目標 0 的訂閱式回 0） */
export const percentOf = (raised, goal) => (goal > 0 ? Math.floor((raised / goal) * 100) : 0);
/** 剩下多少時間（給畫面顯示）：「剩下 3 天」「剩下 5 小時」「已結束」 */
export function timeLeft(endAt, now) {
  const ms = endAt - now;
  if (!(ms > 0)) return '已結束';
  if (ms >= DAY) return `剩下 ${Math.floor(ms / DAY)} 天`;
  if (ms >= 3_600_000) return `剩下 ${Math.floor(ms / 3_600_000)} 小時`;
  return `剩下 ${Math.max(1, Math.floor(ms / 60_000))} 分鐘`;
}
/**
 * 檢查計畫的時程：一次性 1 天～5 個月；開始要在結束之前。訂閱式只檢查有開始時間。
 * 回傳錯誤訊息（空字串＝OK）
 */
export function checkSchedule(p, settings = DEFAULT_SETTINGS) {
  if (!isInt(p.startAt, 1) ) return '請填預計開始時間';
  if (p.type === 'subscription') return p.endAt && p.endAt <= p.startAt ? '結束時間要在開始之後' : '';
  if (!isInt(p.endAt, 1)) return '請填預計結束時間';
  const days = (p.endAt - p.startAt) / DAY;
  if (days < settings.minDays) return `計畫最短 ${settings.minDays} 天`;
  if (days > settings.maxDays) return `計畫最長 ${settings.maxDays} 天（5 個月）`;
  return '';
}
/** 計畫是不是「全有或全無」（沒達標全部退款） */
export const allOrNothing = (p, settings = DEFAULT_SETTINGS) => p.type !== 'subscription' && !!(settings.allOrNothing || {})[p.type];
/** 計畫結束時的結果：success／failed（訂閱式、非全有全無的一律 success） */
export function finalOutcome(p, raised, settings = DEFAULT_SETTINGS) {
  if (!allOrNothing(p, settings)) return 'success';
  return raised >= p.goal ? 'success' : 'failed';
}
/** 審核五階段都通過了沒 */
export const allStepsOk = (steps) => REVIEW_STEPS.every((s) => steps && steps[s.key] === 'ok');
/** 目前卡在哪一階段（第一個不是 ok 的）；都過了回 '' */
export const currentStep = (steps) => (REVIEW_STEPS.find((s) => !steps || steps[s.key] !== 'ok') || { key: '' }).key;
/** 方案與回饋送審（plan）通過後，開始／結束時間就鎖住，只有平台可以改（KIRK 在嘖嘖遇過「欄位已鎖」） */
export const timeLocked = (steps) => !!steps && steps.plan === 'ok';

// ---------- 回饋選項 ----------
/** 這個選項已經被訂走幾份（付款成功＋還在等付款的都算，限量才不會超賣） */
export function optionTaken(optionId, orders) {
  let n = 0;
  for (const o of orders) {
    if (o.status !== 'paid' && o.status !== 'pending') continue;
    for (const it of o.items) if (it.optionId === optionId) n += it.qty;
  }
  return n;
}
/** 剩下幾份；不限量回 Infinity */
export const optionLeft = (opt, orders) => (opt.limit > 0 ? Math.max(0, opt.limit - optionTaken(opt.id, orders)) : Infinity);
/** 回饋排序：自訂（sort 小的在前）／價格高到低／價格低到高 */
export function sortOptions(list, order = 'custom') {
  const a = list.slice();
  if (order === 'priceDesc') a.sort((x, y) => y.price - x.price || x.sort - y.sort);
  else if (order === 'priceAsc') a.sort((x, y) => x.price - y.price || x.sort - y.sort);
  else a.sort((x, y) => x.sort - y.sort || x.price - y.price);
  return a;
}
/** 計畫頁看得到的選項：不是「加購」、不是「隱藏（有密碼）」；有輸入正確密碼才看得到隱藏的 */
export const visibleOptions = (list, code = '') => list.filter((o) => !o.addonOnly && (!o.code || (code && o.code === code)));

// ---------- 結帳 ----------
/** 運費：選項有設這個地區才寄得到（沒設＝不寄）；多個選項取最高的那一個運費（一張訂單一個包裹） */
export function shippingFee(options, region) {
  let fee = 0;
  for (const o of options) {
    const v = o.shipping && Object.hasOwn(o.shipping, region) ? o.shipping[region] : null;
    if (v === null || v === undefined || v === '') return null;
    fee = Math.max(fee, Number(v) || 0);
  }
  return fee;
}
/** 超商取貨：每個選項都要有開這家超商，而且只寄台灣（本島、離島） */
export const storeAllowed = (options, brand, region) => (region === 'TW' || region === 'TWI') && options.every((o) => Array.isArray(o.stores) && o.stores.includes(brand));
/** 折扣碼能不能用：碼對、在期間內、選項都允許折扣碼 */
export function couponCheck(coupon, options, now) {
  if (!coupon) return '找不到這個折扣碼';
  if (coupon.from && now < coupon.from) return '折扣碼還沒開始';
  if (coupon.until && now > coupon.until) return '折扣碼已過期';
  if (!options.every((o) => o.coupon)) return '這個回饋不能使用折扣碼';
  return '';
}
/** ATM 虛擬帳號繳費期限：訂單成立「隔天」的 23:59:59（台灣時間） */
export const atmDeadline = (createdAt) => twEndOfDay(createdAt + DAY);
/**
 * 算一張訂單的金額。items＝[{ option, qty }]（加購也在裡面）；bonus＝加碼；discount＝折扣碼金額；ship＝運費
 * 回 { subtotal, discount, shipping, bonus, total }；折扣最多折到 0（運費、加碼不折）
 */
export function orderAmount(items, { bonus = 0, discount = 0, ship = 0 } = {}) {
  const subtotal = items.reduce((s, it) => s + it.option.price * it.qty, 0);
  const d = Math.min(subtotal, Math.max(0, discount));
  return { subtotal, discount: d, shipping: ship, bonus, total: subtotal - d + ship + bonus };
}
/** 自然人 30 天上限：這筆下去之後，提案人「任意連續 30 天」的總額會不會超過 */
export function personLimitOk(paidOrdersOfOwner, newTotal, now, settings = DEFAULT_SETTINGS) {
  const since = now - 30 * DAY;
  const sum = paidOrdersOfOwner.filter((o) => (o.paidAt || o.createdAt) >= since).reduce((s, o) => s + o.total, 0);
  return sum + newTotal <= settings.personLimit30d;
}

// ---------- 撥款 ----------
/** 從某天起算第 n 個工作日（週六日不算；國定假日沒有公開清單，練習平台不算） */
export function addWorkdays(t, n) {
  let d = t, left = n;
  while (left > 0) {
    d += DAY;
    const wd = new Date(d + TW_OFFSET).getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}
/** 次月某一天（台灣時間 10:00） */
export function nextMonthDay(t, day) {
  const d = new Date(t + TW_OFFSET);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  return Date.UTC(y + (m > 11 ? 1 : 0), m % 12, day, 10) - TW_OFFSET;
}
/**
 * 撥款試算：每筆付款成功的訂單依付款方式扣金流費、再扣平台手續費
 * 回 { gross, paymentFee, platformFee, net }
 */
export function payoutCalc(paidOrders, settings = DEFAULT_SETTINGS) {
  let gross = 0, pay = 0;
  for (const o of paidOrders) { gross += o.total; pay += o.total * ((settings.paymentFee || {})[o.payMethod] ?? 0.025); }
  const paymentFee = round(pay), platformFee = round(gross * settings.platformFee);
  return { gross, paymentFee, platformFee, net: gross - paymentFee - platformFee };
}

// ---------- 個資遮罩（贊助人列表在前台顯示用）----------
export const maskName = (s) => { const a = [...String(s || '')]; if (a.length <= 1) return a.join('') || '匿名'; if (a.length === 2) return a[0] + '○'; return a[0] + '○'.repeat(a.length - 2) + a[a.length - 1]; };
