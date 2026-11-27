'use strict';
// 主页设备码：一个码聚合「我」的全部团队，以本人身份查看/操作；换码即踢掉旧登录
const assert = require('assert');
const http = require('http');
const store = require('../src/store');
const { startPortal } = require('../src/portal');

function call(port, path, { method = 'GET', token, body } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['x-token'] = token;
    let payload;
    if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        let data = null;
        try { data = JSON.parse(text); } catch (e) { /* ignore */ }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  // 构造两个团队：个人(local) + 一个 host 团队，各有一条任务
  const local = store.createBoard({ name: '我的任务', kind: 'local' });
  store.apply(local, { type: 'addTask', text: '个人任务', createdId: 'p1' }, 'me');
  const host = store.createBoard({ name: '项目组', ownerName: '主机甲' });
  const hostId = host.members[0].id;
  store.apply(host, { type: 'addTask', text: '团队任务', createdId: 'h1' }, hostId);

  const teams = [
    { id: 'local', kind: 'local', name: '我的任务', meId: 'me', role: 'owner', state: local, online: true },
    { id: 'host', kind: 'host', name: '项目组', meId: hostId, role: 'owner', state: host, online: true }
  ];
  let code = 'ABC234';
  const actions = [];
  let listenPort = 0;
  const srv = startPortal({
    port: 0,
    getCode: () => code,
    getTeams: () => teams,
    applyAction: async (teamId, type, payload) => { actions.push({ teamId, type, payload }); return { ok: true, changed: true }; },
    readFile: async () => ({ ok: false, error: 'no file' }),
    uploadFile: async () => ({ ok: true }),
    onListen: (p) => { listenPort = p; }
  });
  await new Promise((r) => setTimeout(r, 120));
  assert.ok(listenPort > 0, 'portal 服务应监听成功');
  console.log('✓ portal 服务启动');

  // 1. 错误码登录被拒
  const bad = await call(listenPort, '/api/portal/login', { method: 'POST', body: { code: 'WRONG1' } });
  assert.strictEqual(bad.status, 403);
  console.log('✓ 错误设备码被拒绝');

  // 2. 正确码登录
  const login = await call(listenPort, '/api/portal/login', { method: 'POST', body: { code } });
  assert.strictEqual(login.status, 200);
  assert.ok(login.data.token);
  const token = login.data.token;
  console.log('✓ 正确设备码登录成功');

  // 3. 聚合状态：包含两个团队的任务，且个人团队可发布
  const state = await call(listenPort, '/api/portal/state', { token });
  assert.strictEqual(state.status, 200);
  assert.strictEqual(state.data.teams.length, 2);
  const lt = state.data.teams.find((t) => t.id === 'local');
  const ht = state.data.teams.find((t) => t.id === 'host');
  assert.ok(lt.tasks.some((t) => t.text === '个人任务'));
  assert.ok(ht.tasks.some((t) => t.text === '团队任务'));
  assert.strictEqual(lt.canPublish, true);
  console.log('✓ 聚合状态含全部团队任务');

  // 4. 操作转发带 teamId
  const act = await call(listenPort, '/api/portal/action', { method: 'POST', token, body: { teamId: 'host', type: 'togglePersonalDone', id: 'h1' } });
  assert.strictEqual(act.status, 200);
  assert.strictEqual(actions.length, 1);
  assert.strictEqual(actions[0].teamId, 'host');
  assert.strictEqual(actions[0].type, 'togglePersonalDone');
  console.log('✓ 操作按 teamId 正确转发');

  // 5. 未登录访问被拒
  const noAuth = await call(listenPort, '/api/portal/state');
  assert.strictEqual(noAuth.status, 401);
  console.log('✓ 未登录访问被拒绝');

  // 6. 换码后旧 token 立即失效
  srv.invalidate();
  const afterInvalid = await call(listenPort, '/api/portal/state', { token });
  assert.strictEqual(afterInvalid.status, 401, '换码后旧 token 应失效');
  console.log('✓ 换码后旧登录立即失效');

  srv.close();
}

main().then(() => console.log('ALL PASS portal.test.js')).catch((e) => { console.error(e); process.exit(1); });
