'use strict';
const assert = require('assert');
const http = require('http');
const dgram = require('dgram');

let pass = 0;
function ok(name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { pass++; console.log('ok - ' + name); })
    .catch((e) => { console.error('FAIL - ' + name + ': ' + (e && e.stack || e)); process.exitCode = 1; });
}

(async () => {
  // 假公网映射：指向一个公网地址（本测试里不可达），确保 resolveHost 若走公网会失败
  const relay = {};
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    res.setHeader('Content-Type', 'application/json');
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (u.pathname === '/map' && req.method === 'POST') {
        const d = JSON.parse(body); relay[d.code] = d; return res.end('{"ok":true}');
      }
      if (u.pathname === '/map' && req.method === 'GET') {
        const rec = relay[u.searchParams.get('code')];
        if (!rec) { res.statusCode = 404; return res.end('{"error":"not found"}'); }
        return res.end(JSON.stringify(rec));
      }
      res.statusCode = 404; res.end('{}');
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  process.env.TDLVV_NTFY_BASE = base;
  const mapping = require('../src/mapping');
  mapping.setRelayUrl(base);
  const { resolveHost } = require('../src/client');

  await mapping.publish(['board-lan-1', 'OLDCODE'], { u: 'http://127.0.0.1:1', n: '团队A', o: '创建者' });

  // 起一个本机 HTTP 服务假装"同网段主机"，只认带 x-token 的请求返回 401（probeHost 判活）
  const hostSrv = http.createServer((req, res) => { res.statusCode = 401; res.end('{}'); });
  // UDP 广播的源地址是本机局域网 IP，所以 HTTP 服务要监听 0.0.0.0，probeHost 才连得上
  await new Promise((r) => hostSrv.listen(0, '0.0.0.0', r));
  const lanPort = hostSrv.address().port;

  // 起一个 UDP beacon 发送端，广播 boardId=board-lan-1（邀请码是轮换后的新码 NEWCODE）
  // 注意：接收端由 discover 内部绑定 41234，这里只做发送，先 bind 再 setBroadcast
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  await new Promise((r) => sock.bind(r));
  sock.setBroadcast(true);
  const beaconTimer = setInterval(() => {
    const payload = Buffer.from(JSON.stringify({
      app: 'tdlvv', code: 'NEWCODE', bid: 'board-lan-1', port: lanPort, board: '团队A', owner: '创建者'
    }));
    sock.send(payload, 41234, '255.255.255.255', () => {});
  }, 300);

  await new Promise((r) => setTimeout(r, 400));

  await ok('同网段按轮换后新邀请码仍可用 boardId 发现，并优先直连而不是公网映射', async () => {
    // 本地存的旧码 OLDCODE 已失效；用 boardId 发现
    const found = await resolveHost('OLDCODE', '', 'board-lan-1', 'board-lan-1');
    assert.ok(found, '应找到主机');
    assert.strictEqual(found.via, 'lan', '应走局域网直连');
    assert.ok(found.baseUrl.endsWith(':' + lanPort), '应使用广播里的本机地址');
    assert.ok(!found.baseUrl.includes('127.0.0.1:1/'), '不能是公网映射里的死地址');
  });

  clearInterval(beaconTimer);
  try { sock.close(); } catch (e) {}
  await new Promise((r) => hostSrv.close(r));
  await new Promise((r) => srv.close(r));
  console.log(`\nlan-first.test.js: ${pass} passed`);
})();
