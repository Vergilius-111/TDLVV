'use strict';
// 独立运行的小型「地址簿」中继服务：只存 {邀请码 -> 创建者当前公网地址}，不转发任何业务数据。
// 部署：在有公网 IP / 域名的服务器上 `node relay-server.js`，默认监听 8787，可用 PORT 环境变量改。
// 建议前面挂 HTTPS（Nginx/Caddy），客户端填 https://你的域名。
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8787);
const DATA_FILE = process.env.RELAY_DATA || path.join(__dirname, 'relay-data.json');
const TTL = 24 * 60 * 60 * 1000; // 超过 24 小时未续期的记录自动失效
let maps = {};

try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) maps = raw;
  }
} catch (e) {
  console.error('load relay data failed:', e.message);
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(maps), 'utf8');
    } catch (e) {
      console.error('save relay data failed:', e.message);
    }
  }, 1000);
}

function purge() {
  const now = Date.now();
  let changed = false;
  Object.keys(maps).forEach((code) => {
    const rec = maps[code];
    if (!rec || !Number(rec.ts) || now - Number(rec.ts) > TTL) {
      delete maps[code];
      changed = true;
    }
  });
  if (changed) scheduleSave();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 64 * 1024) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    const u = new URL(req.url, 'http://localhost');

    if (u.pathname === '/' && req.method === 'GET') {
      return send(res, 200, { ok: true, service: 'tdlvv-relay', count: Object.keys(maps).length });
    }

    if (u.pathname === '/map' && req.method === 'GET') {
      purge();
      const code = String(u.searchParams.get('code') || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 10);
      if (!code) return send(res, 400, { error: 'missing code' });
      const rec = maps[code];
      if (!rec) return send(res, 404, { error: 'not found' });
      return send(res, 200, { u: rec.u || '', n: rec.n || '', o: rec.o || '', ts: rec.ts || 0 });
    }

    if (u.pathname === '/map' && req.method === 'POST') {
      const body = await readBody(req);
      const code = String(body.code || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 10);
      const url = String(body.u || '').trim();
      if (!code) return send(res, 400, { error: 'missing code' });
      if (!/^https?:\/\//i.test(url)) return send(res, 400, { error: 'invalid url' });
      maps[code] = {
        u: url,
        n: String(body.n || '').slice(0, 120),
        o: String(body.o || '').slice(0, 120),
        ts: Date.now()
      };
      scheduleSave();
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: 'not found' });
  } catch (e) {
    return send(res, 500, { error: String((e && e.message) || e) });
  }
});

purge();
server.listen(PORT, () => {
  console.log(`TDLVV relay listening on http://0.0.0.0:${PORT} (data: ${DATA_FILE})`);
});

module.exports = { server };
