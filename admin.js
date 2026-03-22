'use strict';
/**
 * ZenTech 文章管理後台伺服器
 * 執行：node admin.js
 * 開啟：http://localhost:3001
 * 不需安裝任何套件，使用 Node.js 內建模組。
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3001;
const ROOT = __dirname;
const PICS = path.join(ROOT, 'pic');

/* ── 工具 ─────────────────────────────────────────── */

function readBody(req) {
  return new Promise((ok, fail) => {
    let s = '';
    req.on('data', c => s += c);
    req.on('end', () => { try { ok(JSON.parse(s)); } catch { ok(s); } });
    req.on('error', fail);
  });
}

function send(res, data, code = 200, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(typeof data === 'string' || Buffer.isBuffer(data)
    ? data : JSON.stringify(data));
}

function serveFile(res, fp) {
  const mime = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  };
  fs.readFile(fp, (err, data) => {
    if (err) return send(res, 'Not found', 404, 'text/plain');
    send(res, data, 200, mime[path.extname(fp).toLowerCase()] || 'application/octet-stream');
  });
}

function scanImages(dir = PICS, base = 'pic') {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name), rel = `${base}/${e.name}`;
    if (e.isDirectory()) out.push(...scanImages(fp, rel));
    else if (/\.(jpg|jpeg|png|gif|webp)$/i.test(e.name)) out.push(rel);
  }
  return out;
}

/* ── 伺服器 ───────────────────────────────────────── */

http.createServer(async (req, res) => {
  const { pathname: p } = new URL(req.url, 'http://x');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  try {

    /* GET /api/articles — 讀取文章清單 */
    if (p === '/api/articles' && req.method === 'GET') {
      const data = fs.readFileSync(path.join(ROOT, 'articles.json'), 'utf8');
      return send(res, data, 200, 'application/json; charset=utf-8');
    }

    /* POST /api/articles — 儲存文章清單 */
    if (p === '/api/articles' && req.method === 'POST') {
      const body = await readBody(req);
      fs.writeFileSync(path.join(ROOT, 'articles.json'),
        JSON.stringify(body, null, 2), 'utf8');
      return send(res, { ok: true });
    }

    /* GET /api/pic-files — 列出 pic/ 下所有圖片 */
    if (p === '/api/pic-files' && req.method === 'GET') {
      return send(res, scanImages());
    }

    /* POST /api/upload — 上傳（儲存）圖片 */
    if (p === '/api/upload' && req.method === 'POST') {
      const { filename, data } = await readBody(req);
      const fp = path.resolve(ROOT, filename);
      if (!fp.startsWith(PICS)) return send(res, { ok: false, error: 'Invalid path' }, 403);
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      const b64 = data.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(fp, Buffer.from(b64, 'base64'));
      return send(res, { ok: true });
    }

    /* POST /api/push — git add + commit + push */
    if (p === '/api/push' && req.method === 'POST') {
      const { message } = await readBody(req);
      const msg = message.replace(/"/g, '\\"').replace(/`/g, '\\`');
      exec(
        `cd "${ROOT}" && git add articles.json pic/ && git commit -m "${msg}" && git push`,
        (err, stdout, stderr) => {
          send(res,
            err ? { ok: false, error: stderr || err.message }
                : { ok: true, output: stdout },
            err ? 500 : 200
          );
        }
      );
      return; // async，在 callback 裡回應
    }

    /* 靜態檔案 */
    if (p === '/' || p === '/admin.html')
      return serveFile(res, path.join(ROOT, 'admin.html'));

    if (p.startsWith('/pic/')) {
      const fp = path.resolve(ROOT, p.slice(1));
      if (!fp.startsWith(PICS)) return send(res, 'Forbidden', 403, 'text/plain');
      return serveFile(res, fp);
    }

    send(res, 'Not found', 404, 'text/plain');

  } catch (err) {
    console.error(err);
    send(res, { ok: false, error: err.message }, 500);
  }

}).listen(PORT, () => {
  console.log('');
  console.log('  ┌─────────────────────────────────────┐');
  console.log('  │   ZenTech 文章管理後台               │');
  console.log(`  │   \x1b[36mhttp://localhost:${PORT}\x1b[0m              │`);
  console.log('  └─────────────────────────────────────┘');
  console.log('  Ctrl+C 停止伺服器\n');
});
