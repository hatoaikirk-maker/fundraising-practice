/** 規則（純計算）測試：時程、手續費、撥款日、ATM 期限、運費、折扣碼、自然人上限、遮罩。跑法：node test/rules_test.mjs */
import * as R from '../lib/rules.js';
let pass = 0, fail = 0; const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
const TW = (s) => Date.parse(s + '+08:00');
// 時程
ok(R.checkSchedule({ type: 'crowd', startAt: TW('2026-12-01T10:00'), endAt: TW('2026-12-01T09:00') }).includes('最短'), '結束早於開始：擋下');
ok(R.checkSchedule({ type: 'crowd', startAt: TW('2026-12-01T10:00'), endAt: TW('2026-12-02T10:00') }) === '', '剛好 1 天：OK');
ok(R.checkSchedule({ type: 'crowd', startAt: TW('2026-12-01T10:00'), endAt: TW('2027-06-01T10:00') }).includes('最長'), '超過 5 個月：擋下');
ok(R.checkSchedule({ type: 'subscription', startAt: TW('2026-12-01T10:00'), endAt: 0 }) === '', '訂閱式：不用結束時間');
// 成敗
ok(R.finalOutcome({ type: 'crowd', goal: 100 }, 99) === 'failed' && R.finalOutcome({ type: 'crowd', goal: 100 }, 100) === 'success', '群眾集資：差 1 元就失敗、剛好達標成功');
ok(R.finalOutcome({ type: 'subscription', goal: 100 }, 0) === 'success', '訂閱式：沒有全有全無');
// 手續費（預設 5.5% + 2.5%）
const pc = R.payoutCalc([{ total: 10000, payMethod: 'credit' }, { total: 5000, payMethod: 'atm' }]);
ok(pc.gross === 15000 && pc.paymentFee === 375 && pc.platformFee === 825 && pc.net === 13800, `撥款：15,000 − 375 − 825 ＝ ${pc.net}（合計 8%）`);
// 撥款日：28 個工作日（週末不算）
const end = TW('2026-12-04T23:59'); const due = R.addWorkdays(end, 28); const wd = new Date(due + 8 * 3600e3).getUTCDay();
ok(wd !== 0 && wd !== 6 && Math.round((due - end) / R.DAY) === 40, '週五結束：28 個工作日＝40 天後（跳過週末）');
ok(new Date(R.nextMonthDay(TW('2026-12-20T10:00'), 15) + 8 * 3600e3).toISOString().startsWith('2027-01-15'), '訂閱撥款：次月 15 日（跨年也對）');
// ATM：隔天 23:59:59
const d0 = TW('2026-11-26T22:30'), dl = R.atmDeadline(d0);
ok(new Date(dl + 8 * 3600e3).toISOString().startsWith('2026-11-27T23:59:59'), 'ATM 期限：隔天 23:59:59（台灣時間）');
// 運費、超商
const o1 = { shipping: { TW: 0, JP: 300, US: '' }, stores: ['711', 'family'] }, o2 = { shipping: { TW: 80, JP: 200 }, stores: ['711'] };
ok(R.shippingFee([o1, o2], 'TW') === 80 && R.shippingFee([o1, o2], 'JP') === 300 && R.shippingFee([o1], 'US') === null && R.shippingFee([o1], 'FR') === null, '運費：一張訂單取最高；沒設或留空＝不寄');
ok(R.storeAllowed([o1, o2], '711', 'TW') && !R.storeAllowed([o1, o2], 'family', 'TW') && !R.storeAllowed([o1], '711', 'JP'), '超商：每個回饋都要開這家、只寄台灣');
// 折扣碼
const now = TW('2026-11-26T12:00');
ok(R.couponCheck(null, [o1], now).includes('找不到') && R.couponCheck({ from: now + 1 }, [{ coupon: true }], now).includes('還沒開始') && R.couponCheck({ until: now - 1 }, [{ coupon: true }], now).includes('過期') && R.couponCheck({}, [{ coupon: false }], now).includes('不能使用') && R.couponCheck({}, [{ coupon: true }], now) === '', '折扣碼：不存在、未開始、過期、回饋不允許、OK');
ok(R.orderAmount([{ option: { price: 100 }, qty: 1 }], { discount: 500, ship: 60, bonus: 10 }).total === 70, '折扣最多折到回饋小計（運費、加碼不折）');
// 限量
const orders = [{ status: 'paid', items: [{ optionId: 1, qty: 2 }] }, { status: 'pending', items: [{ optionId: 1, qty: 1 }] }, { status: 'refunded', items: [{ optionId: 1, qty: 5 }] }];
ok(R.optionTaken(1, orders) === 3 && R.optionLeft({ id: 1, limit: 5 }, orders) === 2 && R.optionLeft({ id: 1, limit: 0 }, orders) === Infinity, '限量：付款＋待付款都算、退款不算');
ok(R.visibleOptions([{ id: 1 }, { id: 2, addonOnly: true }, { id: 3, code: 'X' }], '').length === 1 && R.visibleOptions([{ id: 3, code: 'X' }], 'X').length === 1, '計畫頁選項：加購、隱藏的不顯示；密碼對才顯示');
// 自然人上限
ok(R.personLimitOk([{ total: 900000, paidAt: now - 10 * R.DAY }], 100000, now) && !R.personLimitOk([{ total: 900000, paidAt: now - 10 * R.DAY }], 100001, now) && R.personLimitOk([{ total: 900000, paidAt: now - 31 * R.DAY }], 1000000, now), '自然人：30 天內 100 萬（31 天前的不算）');
ok(R.maskName('王小明') === '王○明' && R.maskName('李四') === '李○' && R.maskName('') === '匿名', '贊助人名字遮罩');
ok(R.timeLocked({ plan: 'ok' }) && !R.timeLocked({ plan: 'pending' }) && R.currentStep({ biz: 'ok', plan: 'pending' }) === 'plan', '時間鎖、目前階段');
console.log(`規則：通過 ${pass}、失敗 ${fail}`); process.exit(fail ? 1 : 0);
