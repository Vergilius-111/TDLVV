'use strict';
// 验证：cloudflared 隧道真的能把本机服务暴露出去 + ntfy 映射能读回来
process.env.NO_PROXY = '';
const https = require('https');
const store = require('../src/store');
const { startHost } = require('../src/server');
const { Tunnel } = require('../src/tunnel');
const mapping = require('../src/mapping');

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000, headers: { 'User-Agent': 'tasknotes-test' } }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try {
          resolve({ code: res.statusCode, data: JSON.parse(raw) });
        } catch (e) {
          resolve({ code: res.statusCode, data: raw.slice(0, 200) });
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function retry(fn, times, gap) {
  let lastErr;
  for (let i = 0; i < times; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, gap));
    }
  }
  throw lastErr;
}

async function main() {
  const state = store.createBoard('隧道测试', '主机甲');
  let port = 0;
  const host = startHost({ state, port: 0, onListen: (p) => (port = p) });
  await new Promise((r) => setTimeout(r, 200));
  console.log('local port', port);

  const tunnel = new Tunnel({ onStatus: (s) => console.log('tunnel:', s.state) });
  const url = await tunnel.start(port);
  if (!url) {
    console.log('✗ 隧道没起来（可能网络限制）');
    tunnel.stop();
    host.close();
    process.exit(2);
  }
  console.log('✓ 公网地址', url);

  const r = await retry(() => getJson(url + '/api/info'), 18, 4000);
  console.log(r.code === 200 ? '✓ 通过公网访问 /api/info 成功：' : '✗ 公网访问失败：', JSON.stringify(r.data));

  // 映射
  await mapping.publish(state.inviteCode, { u: url, n: state.boardName, o: '主机甲' });
  await new Promise((r2) => setTimeout(r2, 800));
  const back = await mapping.read(state.inviteCode);
  console.log(back && back.u === url ? '✓ 邀请码映射读写正常：' : '✗ 映射异常：', JSON.stringify(back));

  tunnel.stop();
  host.close();
}

main().catch((e) => {
  console.error('测试出错：', e.message);
  process.exit(1);
});
