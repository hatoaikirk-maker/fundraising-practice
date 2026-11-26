/**
 * 資安工具：密碼、登入狀態、CSRF、限流、輸入清洗、上傳檔案檢查
 * ------------------------------------------------------------
 * - 密碼：scrypt（加鹽、慢雜湊），比對用 timingSafeEqual（防時間差攻擊）
 * - 登入：亂數 32 bytes 的 session，只存在 HttpOnly＋SameSite=Strict 的 cookie；伺服器只存雜湊（db 外流也冒用不了）
 * - CSRF：每個 session 一組亂數，所有會改資料的請求都要在標頭 X-CSRF 帶回來
 * - 限流：同一個 IP＋同一種動作，固定時間內最多幾次（登入、註冊、留言、下單…）
 * - 上傳：只收圖片（jpg／png／gif／webp）和影片（mp4／webm），用檔案開頭的「魔術數字」判斷，不信副檔名
 */
import crypto from 'node:crypto';

// ---------- 密碼 ----------
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 });
  return `s1$${salt.toString('base64')}$${h.toString('base64')}`;
}
export function checkPassword(pw, stored) {
  if (typeof pw !== 'string' || typeof stored !== 'string') return false;
  const [v, s, h] = stored.split('$');
  if (v !== 's1' || !s || !h) return false;
  const want = Buffer.from(h, 'base64');
  const got = crypto.scryptSync(pw, Buffer.from(s, 'base64'), want.length, { N: 16384, r: 8, p: 1 });
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
/** 密碼規則：8～64 字，要有英文和數字 */
export const passwordOk = (pw) => typeof pw === 'string' && pw.length >= 8 && pw.length <= 64 && /[A-Za-z]/.test(pw) && /\d/.test(pw);

// ---------- session ----------
export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const newSessionId = () => crypto.randomBytes(32).toString('base64url');
export const newCsrf = () => crypto.randomBytes(24).toString('base64url');
/** 安全比對兩個字串（長度不同直接 false） */
export function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
/** 讀 cookie（只取第一個同名的） */
export function parseCookies(h) {
  const out = Object.create(null);
  for (const part of String(h || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k && !(k in out)) { try { out[k] = decodeURIComponent(v); } catch { out[k] = v; } }
  }
  return out;
}

// ---------- 限流 ----------
export function createLimiter() {
  const hits = new Map();   // 'ip|動作' → [時間…]
  /** peek＝只看還有沒有額度、不記一次（登入：只有「錯了」才記） */
  return function allow(key, limit, windowMs, peek = false) {
    const now = Date.now(), arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= limit) { hits.set(key, arr); return false; }
    if (peek) { hits.set(key, arr); return true; }
    arr.push(now); hits.set(key, arr);
    if (hits.size > 50_000) hits.clear();   // 防記憶體被灌爆
    return true;
  };
}

// ---------- 輸入清洗 ----------
/** 字串：轉成正常字（NFKC）、去掉控制字元、去頭尾空白、限制長度；不是字串回空字串 */
export function str(v, max = 200, { multiline = false } = {}) {
  if (typeof v !== 'string') return '';
  let s = v.normalize('NFKC');
  s = multiline ? s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '') : s.replace(/[\u0000-\u001f\u007f]/g, ' ');
  return s.trim().slice(0, max);
}
/** 整數（範圍外回 def） */
export const int = (v, lo, hi, def = null) => { const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return Number.isSafeInteger(n) && n >= lo && n <= hi ? n : def; };
export const bool = (v) => v === true || v === 'true' || v === 1 || v === '1' || v === 'on';
/** Email（只收常見格式，最長 120） */
export const email = (v) => { const s = str(v, 120).toLowerCase(); return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : ''; };
/** 網址：只收 http／https，其他（javascript: 之類）一律不要 */
export function url(v, max = 500) {
  const s = str(v, max); if (!s) return '';
  try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; }
}
/** 本站上傳的檔案網址（/uploads/xxxx.ext）或 http(s) 網址 */
export const mediaUrl = (v) => { const s = str(v, 300); if (/^\/uploads\/[a-f0-9]{32}\.(jpg|png|gif|webp|mp4|webm)$/.test(s)) return s; return url(s); };
/** 網址代稱（slug）：小寫英數和 -，3～40 字 */
export const slug = (v) => { const s = str(v, 40).toLowerCase(); return /^[a-z0-9][a-z0-9-]{2,39}$/.test(s) ? s : ''; };
/** 時間：毫秒數、或 'YYYY-MM-DD HH:mm'（台灣時間） */
export function time(v) {
  if (Number.isSafeInteger(v) && v > 0) return v;
  const s = str(v, 30); const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 8 * 3_600_000;
  return Number.isFinite(t) ? t : null;
}

// ---------- 上傳檔案 ----------
/** 用檔案開頭判斷類型（魔術數字）；不認得回 null */
export function sniff(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg', kind: 'image' };
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png', kind: 'image' };
  if (buf.slice(0, 6).toString('latin1') === 'GIF87a' || buf.slice(0, 6).toString('latin1') === 'GIF89a') return { ext: 'gif', mime: 'image/gif', kind: 'image' };
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', mime: 'image/webp', kind: 'image' };
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') return { ext: 'mp4', mime: 'video/mp4', kind: 'video' };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { ext: 'webm', mime: 'video/webm', kind: 'video' };
  return null;
}
/**
 * 解析 multipart/form-data（只取第一個檔案欄位 file）。body＝整個請求的 Buffer。
 * 回 { filename, data } 或 null
 */
export function parseMultipart(body, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return null;
  const boundary = Buffer.from('--' + (m[1] || m[2]).trim());
  let pos = body.indexOf(boundary);
  while (pos >= 0) {
    const next = body.indexOf(boundary, pos + boundary.length);
    if (next < 0) break;
    const part = body.slice(pos + boundary.length + 2, next - 2);   // 去掉 \r\n
    const sep = part.indexOf('\r\n\r\n');
    if (sep > 0) {
      const head = part.slice(0, sep).toString('utf8');
      if (/name="file"/.test(head)) {
        const fn = /filename="([^"]*)"/.exec(head);
        return { filename: fn ? fn[1].slice(0, 120) : '', data: part.slice(sep + 4) };
      }
    }
    pos = next;
  }
  return null;
}
