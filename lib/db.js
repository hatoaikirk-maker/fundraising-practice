/**
 * 資料庫（練習用）：整份資料放在 DATA_DIR/db.json，讀進記憶體操作，變動後 1 秒內合併寫回硬碟。
 * ------------------------------------------------------------
 * - 寫檔：先寫 .tmp 再改名（寫到一半當機也不會壞掉）；權限 600（只有自己讀得到）
 * - 編號：每種資料各自流水號，id 是正整數；對外的訂單編號（token）另外用亂數產生，猜不到
 * - 讀檔失敗（第一次、或檔案壞了）：用範例資料重建（seed.js），壞掉的檔案另存 .broken 方便查
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** 所有資料表的名字（新增表要加在這裡，舊檔案讀進來會自動補空陣列） */
export const TABLES = ['users', 'sessions', 'memberships', 'projects', 'options', 'faqs', 'coupons', 'referrers', 'updates', 'comments', 'orders', 'refunds', 'follows', 'messages', 'reports', 'businessProfiles', 'paymentApps', 'contracts', 'payouts', 'emails', 'checkouts', 'audit', 'uploads', 'notices'];

export function createDb({ dir, seed }) {
  const file = path.join(dir, 'db.json');
  fs.mkdirSync(dir, { recursive: true });
  let data = null;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object' || !data.meta) throw new Error('格式不對');
  } catch (e) {
    if (fs.existsSync(file)) { try { fs.copyFileSync(file, file + '.broken'); } catch { /* 略過 */ } console.warn('[資料庫] 讀不到 db.json，改用範例資料重建：', e.message); }
    data = seed();
  }
  for (const t of TABLES) if (!Array.isArray(data[t])) data[t] = [];
  data.meta = data.meta || {};
  data.meta.seq = data.meta.seq || {};

  let timer = null;
  /** 有變動：1 秒內合併成一次寫入 */
  function save() {
    if (timer) return;
    timer = setTimeout(flush, 1000);
    timer.unref?.();
  }
  /** 馬上寫（關機、測試用） */
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }
  /** 新的流水號 */
  function nextId(table) { data.meta.seq[table] = (data.meta.seq[table] || 0) + 1; return data.meta.seq[table]; }
  /** 新增一筆（自動給 id、建立時間） */
  function insert(table, row, now = Date.now()) { const r = { id: nextId(table), createdAt: now, ...row }; data[table].push(r); save(); return r; }
  /** 用 id 找一筆 */
  const byId = (table, id) => data[table].find((r) => r.id === id) || null;
  /** 刪掉符合條件的 */
  function remove(table, fn) { const before = data[table].length; data[table] = data[table].filter((r) => !fn(r)); if (data[table].length !== before) save(); }
  /** 整份換掉（重置練習資料） */
  function replaceAll(next) { data = next; for (const t of TABLES) if (!Array.isArray(data[t])) data[t] = []; data.meta.seq = data.meta.seq || {}; save(); }
  return { get data() { return data; }, save, flush, nextId, insert, byId, remove, replaceAll, file };
}

/** 對外的亂數編號（訂單編號、退款編號…）：只用大寫英數，好念也好打 */
export function token(n = 10) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += A[b[i] % A.length];
  return s;
}
