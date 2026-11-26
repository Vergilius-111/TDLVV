'use strict';
// 验证局域网广播发现：本机同时扮演主机和加入方（发现 ≠ 自动加入）
const dgram = require('dgram');
const store = require('../src/store');
const { startHost, BEACON_PORT } = require('../src/server');
const { discover, discoverAll } = require('../src/client');

async function main() {
  const state = store.createBoard({ name: '发现测试', ownerName: '主机甲' });
  const host = await new Promise((resolve) => {
    const h = startHost({ state, port: 0, onListen: () => resolve(h) });
  });
  const port = host.port;
  console.log('host port', port, 'code', state.inviteCode);

  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.bind(() => {
    try { sock.setBroadcast(true); } catch (e) { /* ignore */ }
  });
  const msg = Buffer.from(
    JSON.stringify({ app: 'tdlvv', code: state.inviteCode, port, board: '发现测试', owner: '主机甲' })
  );
  const timer = setInterval(() => {
    sock.send(msg, BEACON_PORT, '255.255.255.255', () => {});
    sock.send(msg, BEACON_PORT, '127.0.0.1', () => {});
  }, 800);

  await new Promise((r) => setTimeout(r, 1200));
  const found = await discover(state.inviteCode, 4000);
  const list = await discoverAll(3000);
  clearInterval(timer);
  sock.close();
  host.close();

  if (found) {
    console.log('✓ 按邀请码发现主机：', found.host, found.port, found.board);
  } else {
    console.log('✗ 未发现主机（可能被防火墙拦截 UDP 41234）');
    process.exitCode = 2;
  }
  const listed = (list || []).find((x) => x.code === state.inviteCode);
  if (listed) {
    console.log('✓ 附近团队列表（只展示，加入仍需审批）：', listed.board, listed.owner, listed.addr + ':' + listed.port);
  } else {
    console.log('✗ 附近团队列表没有拿到广播');
    process.exitCode = 2;
  }
}

main();
