'use strict';
const assert = require('assert');
const http = require('http');

let pass = 0;
function ok(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { pass++; console.log('ok - ' + name); })
    .catch((e) => { console.error('FAIL - ' + name + ': ' + (e && e.stack || e)); process.exitCode = 1; });
}

(async () => {
  // 假中继 + 假 ntfy，验证邀请码轮换后仍能按稳定 boardId 找到新地址
  const relay = {};
  const ntfy = {};
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    res.setHeader('Content-Type', 'application/json');
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (u.pathname === '/map' && req.method === 'POST') {
        const d = JSON.parse(body);
        relay[d.code] = d;
        return res.end('{"ok":true}');
      }
      if (u.pathname === '/map' && req.method === 'GET') {
        const rec = relay[u.searchParams.get('code')];
        if (!rec) { res.statusCode = 404; return res.end('{"error":"not found"}'); }
        return res.end(JSON.stringify(rec));
      }
      const m = u.pathname.match(/^\/tnx-([0-9a-z-]+)(?:\/json)?$/i);
      if (m && req.method === 'POST') {
        ntfy[m[1].toLowerCase()] = JSON.parse(body);
        return res.end('{"id":"1"}');
      }
      if (m && req.method === 'GET' && /\/json$/.test(u.pathname)) {
        const msg = ntfy[m[1].toLowerCase()];
        if (!msg) return res.end('');
        return res.end(JSON.stringify({ event: 'message', message: JSON.stringify(msg) }) + '\n');
      }
      res.statusCode = 404;
      res.end('{}');
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;

  // 必须在 require 之前指定假 ntfy 地址
  process.env.TDLVV_NTFY_BASE = base;
  const mapping = require('../src/mapping');
  const { resolveHost } = require('../src/client');
  mapping.setRelayUrl(base);

  await ok('同时发布稳定 boardId 与邀请码', async () => {
    await mapping.publish(['board-001', 'CODE1'], { u: 'https://old.trycloudflare.com', n: '团队A', o: '张三' });
    assert.strictEqual(relay['board-001'].u, 'https://old.trycloudflare.com');
    assert.strictEqual(relay.CODE1.u, 'https://old.trycloudflare.com');
  });

  await ok('邀请码轮换 + 隧道换址后，按 boardId 找到新地址', async () => {
    // 邀请码从 CODE1 变成 CODE2，隧道也从 old 变成 new
    await mapping.publish(['board-001', 'CODE2'], { u: 'https://new.trycloudflare.com', n: '团队A', o: '张三' });
    const found = await resolveHost('board-001', '', 'CODE1');
    assert.ok(found);
    assert.strictEqual(found.baseUrl, 'https://new.trycloudflare.com');
  });

  await ok('老客户端按旧邀请码仍能读到旧映射', async () => {
    const found = await resolveHost('CODE1', '');
    assert.ok(found);
    assert.strictEqual(found.baseUrl, 'https://old.trycloudflare.com');
  });

  await ok('中继不可用时，按 boardId 回退 ntfy 也能找到新地址', async () => {
    mapping.setRelayUrl('');
    const found = await mapping.readAny(['MISSING', 'board-001']);
    assert.ok(found);
    assert.strictEqual(found.u, 'https://new.trycloudflare.com');
    mapping.setRelayUrl(base);
  });

  await new Promise((r) => srv.close(r));
  mapping.setRelayUrl('');
  delete process.env.TDLVV_NTFY_BASE;
  console.log('\n' + pass + ' passed');
})();
