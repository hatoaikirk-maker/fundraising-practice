/**
 * 人生地圖募資：啟動伺服器
 * ------------------------------------------------------------
 * 不需要安裝任何套件（只用 Node 內建功能），Node 20 以上就能跑：
 *   node server.js            → http://localhost:3000
 * 環境變數（都可以不設）：
 *   PORT＝埠號（預設 3000）；HOST＝綁定位址（預設 127.0.0.1，只有這台電腦連得到；要給同網路的同事用改成 0.0.0.0）
 *   DATA_DIR＝資料放哪（預設 ./data）；SECURE_COOKIE=1＝走 https 時 cookie 加 Secure
 *   DEMO=1＝測試模式（測試帳號、測試計畫、假金流、模擬時鐘；跑自動測試用）
 *   ADMIN_EMAIL／ADMIN_PASSWORD＝正式模式第一次建立資料時的管理員帳號密碼（沒設密碼會產生一組、印在啟動畫面）
 *   TRUST_PROXY=1＝放在雲端主機的代理伺服器後面（Render 等），用 X-Forwarded-For 認使用者 IP（限流才準）
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './lib/app.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const app = createApp({ dataDir: path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data')), publicDir: path.join(ROOT, 'public'), secureCookie: process.env.SECURE_COOKIE === '1', trustProxy: process.env.TRUST_PROXY === '1',
  demo: process.env.DEMO === '1', adminEmail: process.env.ADMIN_EMAIL || '', adminPassword: process.env.ADMIN_PASSWORD || '' });

const server = http.createServer((req, res) => { app.handle(req, res).catch((e) => { console.error(e); try { res.writeHead(500); res.end(); } catch { /* 已經送出了 */ } }); });
server.headersTimeout = 20_000; server.requestTimeout = 120_000;   // 慢速攻擊：太慢的請求直接斷
server.listen(PORT, HOST, () => console.log(`人生地圖募資已啟動：http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));
// 關機前把資料寫回硬碟
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { app.db.flush(); } catch { /* 略過 */ } process.exit(0); });
