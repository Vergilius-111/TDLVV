'use strict';
const assert = require('assert');
const http = require('http');
const mapping = require('../src/mapping');

let pass = 0;
function ok(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { pass++; console.log('ok - ' + name); })
    .catch((e) => { console.error('FAIL - ' + name + ': ' + (e && e.stack || e)); process.exitCode = 1; });
}

(async () => {
  // 起一个假的中继服务
  let store = {};
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    res.setHeader('Content-Type', 'application/json');
    if (u.pathname === '/map' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const d = JSON.parse(body);
        store[d.code] = { u: d.u, n: d.n, o: d.o, ts: d.ts };
        res.end('{"ok":true}');
      });
      return;
    }
    if (u.pathname === '/map' && req.method === 'GET') {
      const code = u.searchParams.get('code');
      const rec = store[code];
      if (!rec) { res.statusCode = 404; return res.end('{"error":"not found"}'); }
      return res.end(JSON.stringify(rec));
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const base = `http://127.0.0.1:${port}`;

  await ok('setRelayUrl 规范化并拒绝非法地址', () => {
    assert.strictEqual(mapping.setRelayUrl(base + '///'), base);
    assert.strictEqual(mapping.setRelayUrl('ftp://bad'), '');
    assert.strictEqual(mapping.setRelayUrl(base), base);
  });

  await ok('publish 写入自有中继', async () => {
    const r = await mapping.publish('ABC123', { u: 'https://tunnel.trycloudflare.com', n: '团队A', o: '张三' });
    assert.strictEqual(r, true);
    assert.strictEqual(store.ABC123.u, 'https://tunnel.trycloudflare.com');
    assert.strictEqual(store.ABC123.n, '团队A');
  });

  await ok('read 优先从自有中继读到地址', async () => {
    const data = await mapping.read('ABC123');
    assert.ok(data);
    assert.strictEqual(data.u, 'https://tunnel.trycloudflare.com');
    assert.strictEqual(data.o, '张三');
  });

  await ok('read 查不到时回退 ntfy 且不抛错', async () => {
    const data = await mapping.read('ZZZZZZ');
    assert.strictEqual(data, null);
  });

  await new Promise((r) => srv.close(r));
  mapping.setRelayUrl('');
  console.log('\n' + pass + ' passed');
})();
